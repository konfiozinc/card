/* KZ-CRM-018 · ¿el administrador ACTUAL conserva acceso a todos sus datos con las
   reglas nuevas?

   Es el requisito que la misión pone como condición para poder desplegar: si la
   ficha real (rol admin, activo true) perdiera acceso a prospectos antiguos —los
   creados ANTES de esta fase, que NO tienen `asignado_a`—, el despliegue rompería
   el CRM en producción.

   Se reproduce aquí el estado real de la cuenta y se comprueba explícitamente el
   caso peligroso: un prospecto heredado SIN campo de asignación.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-admin-actual.cjs" */

const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner" };
const ANIO = 365 * 24 * 60 * 60 * 1000;
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const H = (tok) => ({ authorization: "Bearer " + tok, "content-type": "application/json" });

/* R06: el id del prospecto ya no es el teléfono. El id de prueba se deriva del teléfono
   para conservar el vocabulario de esta batería sin reescribir cada llamada. */
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
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }),
  });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }),
  }).then((r) => r.json());
};

(async () => {
  /* Reproducción exacta de la ficha real del administrador:
     sólo { rol, activo, creado_en } — sin nombre, sin nada más. */
  const admin = await altaUsuario(process.env.KZ_ADMIN_EMAIL || "admin@equipo.test");
  await fetch(`${FS}/crm_usuarios/${admin.localId}`, {
    method: "PATCH", headers: { ...OWNER, "content-type": "application/json" },
    body: JSON.stringify({ fields: {
      rol: { stringValue: "admin" }, activo: { booleanValue: true },
      creado_en: { timestampValue: TS(0) },
    } }),
  });

  const adminH = H(admin.idToken);

  console.log("=== Ficha del administrador tal como está en producción ===");
  const ficha = await fetch(`${FS}/crm_usuarios/${admin.localId}`, { headers: adminH });
  const f = ficha.ok ? (await ficha.json()).fields : {};
  chk("lee su propia ficha", ficha.status === 200);
  chk("su rol es admin", f.rol && f.rol.stringValue === "admin");
  chk("está activo", f.activo && f.activo.booleanValue === true);
  chk("la ficha no tiene campo nombre (como la real)", !f.nombre);

  console.log("\n=== Prospecto HEREDADO: creado antes de esta fase, SIN asignado_a ===");
  const TEL_HEREDADO = "3209990009";
  const altaHeredado = await altaConMarcador(TEL_HEREDADO, admin.localId, admin.idToken, {
      nombre: { stringValue: "Heredado Sin Asignar" },
      telefono: { stringValue: TEL_HEREDADO },
      industria: { stringValue: "tiendas" },
      consentimiento: { booleanValue: true },
      consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) },
      estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: admin.localId },
      historial: { arrayValue: { values: [] } },
      origen: { stringValue: "manual" },
      // OJO: sin asignado_a, asignado_en ni asignado_por
  });
  chk("el admin puede crear un prospecto sin asignación", altaHeredado === 200, "HTTP " + altaHeredado);

  chk("el admin LEE el prospecto heredado sin asignado_a",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}`, { headers: adminH })).status === 200);
  chk("el admin LO LISTA sin filtro (no se rompe por el campo ausente)",
    (await fetch(`${FS}:runQuery`, { method: "POST", headers: adminH,
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "crm_leads" }] } }) })).status === 200);
  chk("el admin LO ACTUALIZA (seguimiento)",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}?updateMask.fieldPaths=estado`, { method: "PATCH", headers: adminH,
      body: JSON.stringify({ fields: { estado: { stringValue: "contactado" } } }) })).status === 200);
  chk("el admin LO ASIGNA después",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}?updateMask.fieldPaths=asignado_a`, { method: "PATCH", headers: adminH,
      body: JSON.stringify({ fields: { asignado_a: { stringValue: admin.localId } } }) })).status === 200);

  /* P1 · El borrado directo se ha RETIRADO para todos los roles, también para admin.
     Antes esta comprobación exigía 200 y borraba el prospecto dejando huérfanas las
     notas, el marcador del número y las referencias comerciales. La aserción no se
     elimina: se invierte, y se demuestra que el dato sigue ahí y que la vía
     privilegiada (Admin SDK) conserva la capacidad. */
  chk("el admin YA NO puede borrarlo desde el navegador",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}`, { method: "DELETE", headers: adminH })).status === 403);
  chk("tras el intento, el prospecto sigue existiendo",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}`, { headers: adminH })).status === 200);
  chk("la vía privilegiada (Admin SDK) conserva la capacidad de borrar",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}`, { method: "DELETE", headers: OWNER })).status === 200);
  chk("y el prospecto ya no está",
    (await fetch(`${FS}/crm_leads/${idDePrueba(TEL_HEREDADO)}`, { headers: OWNER })).status === 404);

  console.log("\n=== El admin conserva además lo que ya tenía ===");
  chk("lee la ficha de cualquier usuario (necesario para asignar)",
    (await (async () => {
      const otro = await altaUsuario("otro@equipo.test");
      await fetch(`${FS}/crm_usuarios/${otro.localId}`, { method: "PATCH", headers: { ...OWNER, "content-type": "application/json" },
        body: JSON.stringify({ fields: { rol: { stringValue: "comercial" }, activo: { booleanValue: true } } }) });
      return fetch(`${FS}/crm_usuarios/${otro.localId}`, { headers: adminH }).then((r) => r.status === 200);
    })()));
  chk("lee la auditoría",
    (await fetch(`${FS}/crm_audit`, { headers: adminH })).status === 200);
  chk("lee las ventas",
    (await fetch(`${FS}/crm_sales`, { headers: adminH })).status === 200);

  console.log("\nRESULTADO ADMIN ACTUAL: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
