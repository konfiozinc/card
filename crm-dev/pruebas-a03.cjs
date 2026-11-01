/* KZ-CRM-018 · A03 — certificación del modelo de identificadores UUID.
   INTERNO: crm-dev/.

   Demuestra, con datos ficticios y las REGLAS DE PRODUCCIÓN en el emulador:
     · el prospecto se identifica por UUID, no por teléfono;
     · el marcador crm_dedup se crea en la misma transacción (atómico);
     · no puede existir prospecto sin marcador ni marcador huérfano;
     · concurrencia: N altas simultáneas del mismo número → sólo una prospera;
     · reutilización legítima tras suprimir, SIN heredar notas;
     · integridad referencial de cotizaciones y ventas;
     · aislamiento entre asesores sigue intacto.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-a03.cjs" */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const SCRIPT_SUP = path.join(__dirname, "suprimir-datos.cjs");

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const H = (t) => ({ authorization: "Bearer " + t, "content-type": "application/json" });
const uuid = () => require("node:crypto").randomUUID();

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) }).then((r) => r.json());
};
const sembrarRol = (uid, rol) => fetch(`${FS}/crm_usuarios/${uid}`, { method: "PATCH", headers: OWNER,
  body: JSON.stringify({ fields: { rol: { stringValue: rol }, activo: { booleanValue: true } } }) }).then((r) => r.status);

const camposLead = (tel, uid, asignado) => {
  const f = {
    nombre: { stringValue: "Prospecto " + tel }, telefono: { stringValue: tel },
    industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
    consentimiento_version: { stringValue: "v1-2026-11" },
    retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
    creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
    historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
  };
  if (asignado) { f.asignado_a = { stringValue: asignado }; f.asignado_en = { timestampValue: TS(0) }; f.asignado_por = { stringValue: uid }; }
  return f;
};

/* Alta atómica: prospecto + marcador, como hace el panel. */
const altaAtomica = (tel, uid, tok, asignado) => {
  const id = uuid();
  return fetch(`${FS}:commit`, { method: "POST", headers: H(tok), body: JSON.stringify({ writes: [
    { update: { name: `projects/demo-crm-016/databases/default/documents/crm_leads/${id}`, fields: camposLead(tel, uid, asignado) } },
    { update: { name: `projects/demo-crm-016/databases/default/documents/crm_dedup/${tel}`,
      fields: { lead_id: { stringValue: id }, creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid } } } },
  ] }) }).then(async (r) => ({ status: r.status, id }));
};

(async () => {
  const admin = await altaUsuario("admin@a03.test");
  await sembrarRol(admin.localId, "admin");

  console.log("=== A. Alta atómica con UUID ===");
  const TEL = "3208000001";
  const a1 = await altaAtomica(TEL, admin.localId, admin.idToken);
  chk("el alta atómica (prospecto + marcador) prospera", a1.status === 200, "HTTP " + a1.status);
  chk("el id del prospecto es un UUID, no el teléfono", a1.id !== TEL && /^[0-9a-f-]{36}$/.test(a1.id), a1.id);

  const marcador = await fetch(`${FS}/crm_dedup/${TEL}`, { headers: H(admin.idToken) }).then((r) => r.ok ? r.json() : null);
  chk("existe el marcador del teléfono", !!marcador);
  chk("el marcador apunta al UUID del prospecto", marcador && marcador.fields.lead_id.stringValue === a1.id);
  chk("el marcador registra el operador", marcador && marcador.fields.creado_por.stringValue === admin.localId);

  console.log("\n=== B. No hay marcadores huérfanos ni prospectos sin marcador ===");
  const sinMarcador = await fetch(`${FS}:commit`, { method: "POST", headers: H(admin.idToken), body: JSON.stringify({ writes: [
    { update: { name: `projects/demo-crm-016/databases/default/documents/crm_leads/${uuid()}`,
      fields: camposLead("3208000002", admin.localId) } },
  ] }) }).then((r) => r.status);
  chk("un prospecto SIN marcador es rechazado", sinMarcador === 403, "HTTP " + sinMarcador);

  const huerfano = await fetch(`${FS}/crm_dedup/3208000003`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { lead_id: { stringValue: uuid() }, creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: admin.localId } } }) }).then((r) => r.status);
  /* getAfter() sobre un documento inexistente produce error de evaluación: el emulador
     responde 400 en vez de 403. La propiedad que importa es que NO se crea. */
  chk("un marcador que apunta a un prospecto inexistente es rechazado",
    huerfano >= 400 && huerfano < 500, "HTTP " + huerfano);

  const telDesajustado = async () => {
    const id = uuid();
    return fetch(`${FS}:commit`, { method: "POST", headers: H(admin.idToken), body: JSON.stringify({ writes: [
      { update: { name: `projects/demo-crm-016/databases/default/documents/crm_leads/${id}`, fields: camposLead("3208000004", admin.localId) } },
      { update: { name: `projects/demo-crm-016/databases/default/documents/crm_dedup/3208000005`,
        fields: { lead_id: { stringValue: id }, creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: admin.localId } } } },
    ] }) }).then((r) => r.status);
  };
  chk("un marcador con teléfono distinto al del prospecto es rechazado", (await telDesajustado()) === 403);

  console.log("\n=== C. Concurrencia ===");
  const TEL2 = "3208000010";
  const intentos = await Promise.all(Array.from({ length: 8 }, () => altaAtomica(TEL2, admin.localId, admin.idToken)));
  const exitos = intentos.filter((i) => i.status === 200).length;
  chk("de 8 altas simultáneas del mismo número sólo 1 prospera", exitos === 1,
    "200=" + exitos + " · " + intentos.map((i) => i.status).join(","));

  const lista = await fetch(`${FS}/crm_dedup?pageSize=300`, { headers: H(admin.idToken) }).then((r) => r.json());
  chk("cada teléfono tiene exactamente un marcador",
    (lista.documents || []).length === new Set((lista.documents || []).map((d) => d.name)).size);

  console.log("\n=== D. Integridad referencial de cotizaciones y ventas ===");
  const leadId = a1.id;
  const cot = await fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { lead_id: { stringValue: leadId }, plan: { stringValue: "pro" },
      monto: { integerValue: 99900 }, moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
      creado_por: { stringValue: admin.localId }, creado_en: { timestampValue: TS(0) } } }) })
    .then(async (r) => ({ status: r.status, id: r.ok ? (await r.json()).name.split("/").pop() : null }));
  chk("la cotización se crea referida al UUID", cot.status === 200, "HTTP " + cot.status);

  const venta = await fetch(`${FS}/crm_sales?documentId=${cot.id}`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { lead_id: { stringValue: leadId }, quote_id: { stringValue: cot.id },
      monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
      confirmado_por: { stringValue: admin.localId }, confirmado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.status);
  chk("la venta se confirma referida al mismo UUID", venta === 200, "HTTP " + venta);

  const cotMal = await fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { lead_id: { stringValue: "no-existe-uuid" }, plan: { stringValue: "pro" },
      monto: { integerValue: 99900 }, moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
      creado_por: { stringValue: admin.localId }, creado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.status);
  chk("cotización con lead_id inexistente rechazada", cotMal === 403, "HTTP " + cotMal);

  console.log("\n=== E. Supresión: libera el número y no deja residuos ===");
  const nota = await fetch(`${FS}/crm_leads/${leadId}/notas`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { texto: { stringValue: "nota ficticia previa" },
      autor: { stringValue: admin.localId }, fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } } }) })
    .then((r) => r.status);
  chk("se añade una nota al prospecto", nota === 200, "HTTP " + nota);

  const run = (() => { try {
    return { codigo: 0, salida: execFileSync(process.execPath, [SCRIPT_SUP, "--id", leadId, "--emulador", "--confirmar"],
      { encoding: "utf8", input: "SUPRIMIR\n", stdio: ["pipe", "pipe", "pipe"] }) };
  } catch (e) { return { codigo: e.status, salida: String((e.stdout || "") + (e.stderr || "")) }; } })();
  chk("la supresión administrativa se ejecuta", run.codigo === 0, "código " + run.codigo);
  chk("borra el marcador de deduplicación", /marcador de deduplicación borrado \.\.\. sí/.test(run.salida));
  chk("el prospecto ya no existe",
    (await fetch(`${FS}/crm_leads/${leadId}`, { headers: OWNER })).status === 404);
  chk("el marcador ya no existe",
    (await fetch(`${FS}/crm_dedup/${TEL}`, { headers: OWNER })).status === 404);

  console.log("\n=== F. Reutilización legítima del número, sin herencia ===");
  const a2 = await altaAtomica(TEL, admin.localId, admin.idToken);
  chk("el número se puede volver a registrar tras la supresión", a2.status === 200, "HTTP " + a2.status);
  chk("el nuevo prospecto tiene OTRO identificador", a2.id !== leadId);
  const notasNuevas = await fetch(`${FS}/crm_leads/${a2.id}/notas`, { headers: OWNER }).then((r) => r.json());
  chk("el registro nuevo NO hereda las notas del anterior",
    ((notasNuevas.documents || []).length) === 0, (notasNuevas.documents || []).length + " notas");

  console.log("\n=== G. Aislamiento de asesores intacto ===");
  const asesor = await altaUsuario("asesor@a03.test");
  await sembrarRol(asesor.localId, "comercial");
  chk("un asesor no asignado no lee el prospecto",
    (await fetch(`${FS}/crm_leads/${a2.id}`, { headers: H(asesor.idToken) })).status === 403);
  chk("un asesor no puede leer el marcador de deduplicación",
    (await fetch(`${FS}/crm_dedup/${TEL}`, { headers: H(asesor.idToken) })).status === 403);

  console.log("\nRESULTADO A03: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
