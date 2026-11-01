/* KZ-CRM-018 · H03 — certificación de notas inmutables.
   INTERNO: crm-dev/, no se publica.

   Demuestra, con operaciones DIRECTAS contra Firestore (no a través del panel), que:
     · un asesor no puede sustituir, modificar ni borrar notas anteriores;
     · el historial heredado quedó congelado;
     · autor y fecha no se pueden falsificar;
     · sólo escribe quien está autorizado sobre ese prospecto.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-notas.cjs" */

const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const ANIO = 365 * 24 * 60 * 60 * 1000;
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const H = (tok) => ({ authorization: "Bearer " + tok, "content-type": "application/json" });

/* R06: desde el modelo UUID el id del prospecto ya no es el teléfono. El id de prueba se
   deriva del teléfono para no tener que reescribir cada llamada de esta batería. */
const { idDePrueba } = require("./lib/alta-uuid.cjs");

/* A03: alta atómica prospecto + marcador de deduplicación (las reglas lo exigen con
   getAfter). Devuelve el código HTTP. */
const altaConMarcador = (tel, uid, tok, camposLead) => fetch(FS + ":commit", {
  method: "POST", headers: H(tok),
  body: JSON.stringify({ writes: [
    { update: { name: "projects/demo-crm-016/databases/default/documents/crm_leads/" + idDePrueba(tel), fields: camposLead } },
    { update: { name: "projects/demo-crm-016/databases/default/documents/crm_dedup/" + tel,
      fields: { lead_id: { stringValue: idDePrueba(tel) }, creado_en: { timestampValue: TS(0) },
                creado_por: { stringValue: uid } } } },
  ] }),
}).then((r) => r.status);


const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) }).then((r) => r.json());
};

const sembrarRol = (uid, rol, activo) => fetch(`${FS}/crm_usuarios/${uid}`, {
  method: "PATCH", headers: OWNER,
  body: JSON.stringify({ fields: { rol: { stringValue: rol }, activo: { booleanValue: activo !== false } } }),
}).then((r) => r.status);

const crearLead = (tel, uid, tok, asignado) => {
  const f = {
    nombre: { stringValue: "Prospecto " + tel }, telefono: { stringValue: tel },
    industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
    consentimiento_version: { stringValue: "v1-2026-11" },
    retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
    creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
    // historial heredado con dos entradas "antiguas"
    historial: { arrayValue: { values: [] } },
    origen: { stringValue: "manual" },
  };
  if (asignado) { f.asignado_a = { stringValue: asignado }; f.asignado_en = { timestampValue: TS(0) }; f.asignado_por = { stringValue: uid }; }
  return altaConMarcador(tel, uid, tok, f);
};

const nota = (tok, campos) => fetch(`${FS}/crm_leads/${idDePrueba("3200000001")}/notas`, {
  method: "POST", headers: H(tok), body: JSON.stringify({ fields: campos }) }).then((r) => r.status);

const notaOk = (uid, extra) => Object.assign({
  texto: { stringValue: "Llamada de seguimiento: pide propuesta" },
  autor: { stringValue: uid }, fecha: { timestampValue: TS(0) },
  tipo: { stringValue: "nota" },
}, extra || {});

const leerNotas = (tok) => fetch(`${FS}/crm_leads/${idDePrueba("3200000001")}/notas`, { headers: H(tok) }).then((r) => r.status);

(async () => {
  const admin = await altaUsuario("admin@notas.test");
  const asesorA = await altaUsuario("asesorA@notas.test");
  const asesorB = await altaUsuario("asesorB@notas.test");
  const lectura = await altaUsuario("lectura@notas.test");
  await sembrarRol(admin.localId, "admin");
  await sembrarRol(asesorA.localId, "comercial");
  await sembrarRol(asesorB.localId, "comercial");
  await sembrarRol(lectura.localId, "lectura");

  const TEL = "3200000001";
  chk("el admin crea el prospecto (asignado a A)",
    (await crearLead(TEL, admin.localId, admin.idToken, asesorA.localId)) === 200);

  /* Se simula un registro HEREDADO de antes de esta fase: se le pone el historial
     antiguo con la credencial privilegiada (que no pasa por las reglas), que es lo
     mismo que ocurre en producción con los prospectos ya existentes. */
  const legacy = await fetch(FS + "/crm_leads/" + idDePrueba(TEL) + "?updateMask.fieldPaths=historial", {
    method: "PATCH", headers: OWNER,
    body: JSON.stringify({ fields: { historial: { arrayValue: { values: [
      { stringValue: "2026-10-01 · nota antigua del asesor anterior" },
      { stringValue: "2026-10-02 · asignado a otro asesor" },
    ] } } } }),
  }).then((r) => r.status);
  chk("se simula el historial heredado por vía privilegiada", legacy === 200, "HTTP " + legacy);

  console.log("\n=== A. Quién puede crear notas ===");
  chk("el asesor A (asignado) SÍ crea una nota", (await nota(asesorA.idToken, notaOk(asesorA.localId))) === 200);
  chk("el asesor B (NO asignado) recibe permiso denegado", (await nota(asesorB.idToken, notaOk(asesorB.localId))) === 403);
  chk("el rol lectura NO puede crear notas", (await nota(lectura.idToken, notaOk(lectura.localId))) === 403);
  const sAnonNota = await nota(null, notaOk("x"));
  chk("un anónimo NO puede crear notas", sAnonNota >= 400 && sAnonNota < 500, "HTTP " + sAnonNota);
  chk("el admin sí puede añadir una nota", (await nota(admin.idToken, notaOk(admin.localId))) === 200);

  console.log("\n=== B. No se pueden falsificar autor ni fecha ===");
  chk("A no puede firmar como B",
    (await nota(asesorA.idToken, notaOk(asesorB.localId))) === 403);
  chk("A no puede fechar la nota en el pasado",
    (await nota(asesorA.idToken, notaOk(asesorA.localId, { fecha: { timestampValue: "2020-01-01T00:00:00Z" } }))) === 403);
  chk("A no puede fechar la nota en el futuro",
    (await nota(asesorA.idToken, notaOk(asesorA.localId, { fecha: { timestampValue: TS(ANIO) } }))) === 403);
  chk("texto demasiado corto rechazado",
    (await nota(asesorA.idToken, notaOk(asesorA.localId, { texto: { stringValue: "ab" } }))) === 403);
  chk("texto desmedido rechazado",
    (await nota(asesorA.idToken, notaOk(asesorA.localId, { texto: { stringValue: "x".repeat(600) } }))) === 403);
  chk("tipo inventado rechazado",
    (await nota(asesorA.idToken, notaOk(asesorA.localId, { tipo: { stringValue: "borrado" } }))) === 403);
  chk("campo no declarado rechazado",
    (await nota(asesorA.idToken, notaOk(asesorA.localId, { editada: { booleanValue: true } }))) === 403);

  console.log("\n=== C. Las notas son INMUTABLES ===");
  const listado = await fetch(`${FS}/crm_leads/${idDePrueba(TEL)}/notas`, { headers: H(admin.idToken) }).then((r) => r.json());
  const idNota = (listado.documents || [])[0].name.split("/").pop();
  const rutaNota = `${FS}/crm_leads/${idDePrueba(TEL)}/notas/${idNota}`;

  chk("A NO puede modificar su propia nota",
    (await fetch(`${rutaNota}?updateMask.fieldPaths=texto`, { method: "PATCH", headers: H(asesorA.idToken),
      body: JSON.stringify({ fields: { texto: { stringValue: "otra cosa" } } }) })).status === 403);
  chk("A NO puede borrar su propia nota",
    (await fetch(rutaNota, { method: "DELETE", headers: H(asesorA.idToken) })).status === 403);
  chk("el ADMIN tampoco puede modificar una nota",
    (await fetch(`${rutaNota}?updateMask.fieldPaths=texto`, { method: "PATCH", headers: H(admin.idToken),
      body: JSON.stringify({ fields: { texto: { stringValue: "reescrito por admin" } } }) })).status === 403);
  chk("el ADMIN tampoco puede borrar una nota",
    (await fetch(rutaNota, { method: "DELETE", headers: H(admin.idToken) })).status === 403);

  console.log("\n=== D. Lectura de notas por asignación ===");
  chk("A lee las notas de su prospecto", (await leerNotas(asesorA.idToken)) === 200);
  chk("B NO lee las notas del prospecto ajeno", (await leerNotas(asesorB.idToken)) === 403);
  chk("lectura del rol lectura: sin escritura pero sólo de lo asignado",
    (await leerNotas(lectura.idToken)) === 403);
  chk("el admin lee todas las notas", (await leerNotas(admin.idToken)) === 200);

  console.log("\n=== E. H03 sobre el historial HEREDADO (congelado) ===");
  const parche = (campos, tok, mask) => fetch(`${FS}/crm_leads/${idDePrueba(TEL)}?updateMask.fieldPaths=${mask}`, {
    method: "PATCH", headers: H(tok), body: JSON.stringify({ fields: campos }) }).then((r) => r.status);

  chk("A NO puede sustituir el historial por otra lista del mismo tamaño",
    (await parche({ historial: { arrayValue: { values: [
      { stringValue: "nota falsa 1" }, { stringValue: "nota falsa 2" }] } } }, asesorA.idToken, "historial")) === 403);
  chk("A NO puede añadir una entrada al historial",
    (await parche({ historial: { arrayValue: { values: [
      { stringValue: "a" }, { stringValue: "b" }, { stringValue: "c" }] } } }, asesorA.idToken, "historial")) === 403);
  chk("A NO puede vaciar el historial",
    (await parche({ historial: { arrayValue: { values: [] } } }, asesorA.idToken, "historial")) === 403);
  chk("el ADMIN tampoco puede reescribir el historial",
    (await parche({ historial: { arrayValue: { values: [{ stringValue: "x" }, { stringValue: "y" }] } } }, admin.idToken, "historial")) === 403);

  console.log("\n=== F. El historial heredado se conserva intacto ===");
  const doc = await fetch(`${FS}/crm_leads/${idDePrueba(TEL)}`, { headers: H(admin.idToken) }).then((r) => r.json());
  const entradas = (doc.fields.historial.arrayValue.values || []).map((v) => v.stringValue);
  chk("las dos notas heredadas siguen ahí", entradas.length === 2 && /nota antigua/.test(entradas[0]), entradas.length + " entradas");
  chk("el prospecto conserva teléfono e industria", !!doc.fields.telefono && !!doc.fields.industria);
  chk("el prospecto conserva su asignación", doc.fields.asignado_a.stringValue === asesorA.localId);

  console.log("\n=== G. Seguimiento normal sigue funcionando ===");
  chk("A puede cambiar el estado (sin tocar el historial)",
    (await parche({ estado: { stringValue: "contactado" } }, asesorA.idToken, "estado")) === 200);
  chk("y el historial sigue intacto tras el cambio de estado",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL)}`, { headers: H(admin.idToken) }).then((r) => r.json()))
      .fields.historial.arrayValue.values.length === 2);

  console.log("\n=== H. Revocación impide nuevas notas ===");
  await sembrarRol(asesorA.localId, "comercial", false);
  chk("asesor A revocado NO puede añadir notas", (await nota(asesorA.idToken, notaOk(asesorA.localId))) === 403);
  chk("asesor A revocado tampoco lee las notas", (await leerNotas(asesorA.idToken)) === 403);
  chk("las notas anteriores siguen existiendo para el admin",
    (await leerNotas(admin.idToken)) === 200);

  console.log("\n=== I. Hallazgos de la auditoría Codex (A01 y A02) ===");

  /* A01: un prospecto SIN campo historial debe poder actualizarse. Se crea uno por
     vía privilegiada sin ese campo y se prueba el seguimiento como admin y como asesor. */
  const TEL_SIN = "3200000002";
  await fetch(FS + "/crm_leads?documentId=" + idDePrueba(TEL_SIN), { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: {
      nombre: { stringValue: "Sin Historial" }, telefono: { stringValue: TEL_SIN },
      industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
      consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: asesorA.localId },
      origen: { stringValue: "manual" }, asignado_a: { stringValue: asesorA.localId },
    } }) });

  const sSinAdmin = await fetch(FS + "/crm_leads/" + idDePrueba(TEL_SIN) + "?updateMask.fieldPaths=estado", {
    method: "PATCH", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { estado: { stringValue: "contactado" } } }) }).then((r) => r.status);
  chk("A01 · el admin actualiza un prospecto SIN historial", sSinAdmin === 200, "HTTP " + sSinAdmin);

  await sembrarRol(asesorA.localId, "comercial", true);
  const sSinAsesor = await fetch(FS + "/crm_leads/" + idDePrueba(TEL_SIN) + "?updateMask.fieldPaths=estado", {
    method: "PATCH", headers: H(asesorA.idToken),
    body: JSON.stringify({ fields: { estado: { stringValue: "cotizado" } } }) }).then((r) => r.status);
  chk("A01 · el asesor asignado también lo actualiza", sSinAsesor === 200, "HTTP " + sSinAsesor);

  /* A02 · OPCIÓN 2: la supresión de datos personales YA NO se hace desde el cliente.
     El historial es inmutable incluso para el admin; suprimir exige el procedimiento
     privilegiado. Aquí se demuestra que el navegador NO puede hacerlo. */
  const sup = await fetch(FS + "/crm_leads/" + idDePrueba(TEL), { method: "PATCH", headers: H(admin.idToken),
    body: JSON.stringify({ fields: {
      nombre: { stringValue: "[eliminado]" }, servicio_interes: { nullValue: "NULL_VALUE" },
      anonimizado: { booleanValue: true }, historial: { arrayValue: { values: [] } },
    } }) }).then((r) => r.status);
  chk("A02 · el admin NO puede vaciar el historial desde el cliente (va por vía privilegiada)",
    sup === 403, "HTTP " + sup);
  const docSup = await fetch(FS + "/crm_leads/" + idDePrueba(TEL), { headers: H(admin.idToken) }).then((r) => r.json());
  chk("A02 · el historial sigue intacto tras el intento",
    (docSup.fields.historial.arrayValue.values || []).length === 2);

  /* A05: una corrección debe referenciar una nota real del mismo prospecto. */
  const listaN = await fetch(FS + "/crm_leads/" + idDePrueba(TEL) + "/notas", { headers: H(admin.idToken) }).then((r) => r.json());
  const unaNota = (listaN.documents || [])[0].name.split("/").pop();
  chk("A05 · corrección sin referencia rechazada",
    (await nota(admin.idToken, { texto: { stringValue: "corrijo esto" }, autor: { stringValue: admin.localId },
      fecha: { timestampValue: TS(0) }, tipo: { stringValue: "correccion" } })) === 403);
  chk("A05 · corrección con referencia inexistente rechazada",
    (await nota(admin.idToken, { texto: { stringValue: "corrijo esto" }, autor: { stringValue: admin.localId },
      fecha: { timestampValue: TS(0) }, tipo: { stringValue: "correccion" },
      referencia_a: { stringValue: "no-existe" } })) === 403);
  chk("A05 · corrección con referencia válida aceptada",
    (await nota(admin.idToken, { texto: { stringValue: "corrijo esto" }, autor: { stringValue: admin.localId },
      fecha: { timestampValue: TS(0) }, tipo: { stringValue: "correccion" },
      referencia_a: { stringValue: unaNota } })) === 200);

  /* A12: no se pueden crear notas bajo un prospecto inexistente, ni siendo admin. */
  chk("A12 · nota huérfana rechazada (prospecto inexistente)",
    (await fetch(FS + "/crm_leads/9999999999/notas", { method: "POST", headers: H(admin.idToken),
      body: JSON.stringify({ fields: { texto: { stringValue: "huerfana" },
        autor: { stringValue: admin.localId }, fecha: { timestampValue: TS(0) },
        tipo: { stringValue: "nota" } } }) })).status === 403);

  console.log("\nRESULTADO H03: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
