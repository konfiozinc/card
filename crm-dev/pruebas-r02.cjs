/* KZ-CRM-018 · R02 — Certificación de la concurrencia del alta con writeBatch.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   POR QUÉ ESTA PRUEBA EXISTE
   La corrección de R02 cambió la transacción por un `writeBatch` SIN lecturas
   (crm/alta-prospecto.js). Esa decisión sólo es segura si el almacén impide de verdad
   dos altas del mismo teléfono. Esta prueba lo comprueba con las REGLAS DE PRODUCCIÓN
   cargadas en el emulador.

   EQUIVALENCIA DE PROTOCOLO (importante para que la prueba valga)
   `lote.set(ref, datos)` del SDK web se envía como una escritura `update` SIN
   precondición de existencia: crea si no existe y ACTUALIZA si existe. Aquí se usa
   exactamente eso: `POST :commit` con escrituras `update`. Por tanto lo que se prueba
   es el mismo camino que ejecuta el panel, no una aproximación.

   QUÉ SE EXIGE
     A. Ocho altas simultáneas del mismo número: sólo una prospera.
     B. No quedan marcadores huérfanos ni prospectos sin marcador.
     C. El marcador correcto permanece intacto y no se puede sobrescribir.
     D. Ningún usuario obtiene acceso indebido.
     E. La regla de no sobrescribir es ATÓMICA: si el marcador se rechaza, el
        prospecto de ese mismo lote tampoco nace.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-r02.cjs"
*/

const crypto = require("node:crypto");
const path = require("node:path");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const H = (t) => ({ authorization: "Bearer " + t, "content-type": "application/json" });
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

/* ── utilidades REST (sin bypass de reglas salvo donde se diga) ──────────── */
async function listar(ruta, tok) {
  const salida = [];
  let token = null, paginas = 0;
  do {
    const url = `${FS}/${ruta}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, { headers: tok ? H(tok) : OWNER });
    if (!r.ok) throw new Error(`listar ${ruta}: HTTP ${r.status}`);
    const j = await r.json();
    for (const d of (j.documents || [])) salida.push({ id: d.name.split("/").pop(), fields: d.fields || {} });
    token = j.nextPageToken || null;
    if (++paginas > 100) throw new Error("demasiadas páginas");
  } while (token);
  return salida;
}
const leerCAMPO = async (ruta, tok) => {
  const r = await fetch(`${FS}/${ruta}`, { headers: tok ? H(tok) : OWNER });
  return { status: r.status, doc: r.ok ? await r.json() : null };
};
const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
};

/* ── cuentas ficticias del emulador ─────────────────────────────────────── */
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

/* ── el alta, en la MISMA forma que `writeBatch` ────────────────────────── */
const camposLead = (tel, uid) => ({
  nombre: { stringValue: "Concurrente " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
});
const camposMarcador = (id, uid) => ({
  lead_id: { stringValue: id }, creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid } });

/** Un lote con las DOS escrituras del panel: prospecto + marcador. */
const altaEnLote = (tel, uid, tok, idElegido) => {
  const id = idElegido || uuid();
  return fetch(`${FS}:commit`, { method: "POST", headers: H(tok), body: JSON.stringify({ writes: [
    { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: camposLead(tel, uid) } },
    { update: { name: `${PREFIJO}/crm_dedup/${tel}`, fields: camposMarcador(id, uid) } },
  ] }) }).then(async (r) => ({ status: r.status, id, cuerpo: r.ok ? null : (await r.text()).slice(0, 160) }));
};

(async () => {
  const comerc = await altaUsuario("comercial-r02@test.local");
  await sembrarRol(comerc.localId, "comercial");
  const otro = await altaUsuario("comercial-r02b@test.local");
  await sembrarRol(otro.localId, "comercial");

  /* Control positivo: el camino funciona cuando el número está libre. */
  console.log("=== A · Ocho altas simultáneas del mismo teléfono ===");
  const TEL = "3209400001";
  const control = await altaEnLote("3209400099", comerc.localId, comerc.idToken);
  chk("control positivo: un alta libre prospera (rol comercial, sin ser admin)", control.status === 200, "HTTP " + control.status);

  const intentos = await Promise.all(
    Array.from({ length: 8 }, () => altaEnLote(TEL, comerc.localId, comerc.idToken)));
  const exitos = intentos.filter((i) => i.status === 200);
  const codigos = intentos.map((i) => i.status).join(",");
  chk("de 8 altas simultáneas del mismo número sólo UNA prospera", exitos.length === 1, "200=" + exitos.length + " · " + codigos);
  /* La garantía tiene DOS mecanismos independientes y conviene dejar constancia:
     · 403 — las reglas rechazan el `update` del marcador que ya existe;
     · 409 — escritura concurrente: el lote aborta por conflicto antes de aplicar.
     Ambos son rechazos deterministas; lo prohibido es un 200 o un 5xx. */
  const noGanadores = intentos.filter((i) => i.status !== 200).map((i) => i.status);
  chk("las otras 7 son rechazadas de forma determinista (403 reglas o 409 conflicto)",
    noGanadores.every((c) => c === 403 || c === 409) && noGanadores.length === 7, codigos);
  chk("ningún perdedor falla con error de servidor (5xx)", noGanadores.every((c) => c < 500), codigos);

  const leads = await listar("crm_leads");
  const delNumero = leads.filter((l) => val(l.fields, "telefono") === TEL);
  chk("existe exactamente UN prospecto con ese número", delNumero.length === 1, delNumero.length + " prospectos");

  const ganador = exitos[0];
  chk("el prospecto que existe es el del lote ganador",
    delNumero.length === 1 && delNumero[0].id === ganador.id);
  const perdedores = intentos.filter((i) => i.status !== 200);
  chk("los prospectos de los 7 lotes perdedores NO llegaron a crearse",
    perdedores.every((p) => !leads.some((l) => l.id === p.id)));

  console.log("\n=== B · Sin marcadores huérfanos ===");
  const marcadores = await listar("crm_dedup");
  const idsLeads = new Set(leads.map((l) => l.id));
  const huerfanos = marcadores.filter((m) => !idsLeads.has(val(m.fields, "lead_id")));
  chk("ningún marcador apunta a un prospecto inexistente", huerfanos.length === 0, huerfanos.map((h) => h.id).join(","));
  const desajustados = [];
  for (const m of marcadores) {
    const lead = leads.find((l) => l.id === val(m.fields, "lead_id"));
    if (!lead || val(lead.fields, "telefono") !== m.id) desajustados.push(m.id);
  }
  chk("cada marcador apunta a un prospecto con ESE mismo teléfono", desajustados.length === 0, desajustados.join(","));
  const marcadorTel = marcadores.filter((m) => m.id === TEL);
  chk("hay exactamente un marcador para el número disputado", marcadorTel.length === 1, marcadorTel.length + "");

  console.log("\n=== C · El marcador correcto permanece intacto y no se sobrescribe ===");
  chk("el marcador apunta al prospecto ganador",
    val(marcadorTel[0].fields, "lead_id") === ganador.id, val(marcadorTel[0].fields, "lead_id"));
  const antesMarcador = JSON.stringify(canon(marcadorTel[0].fields));

  /* Intento directo de sobrescribir el marcador existente. */
  const idAjeno = uuid();
  const sobrescritura = await fetch(`${FS}:commit`, { method: "POST", headers: H(comerc.idToken),
    body: JSON.stringify({ writes: [
      { update: { name: `${PREFIJO}/crm_leads/${idAjeno}`, fields: camposLead(TEL, comerc.localId) } },
      { update: { name: `${PREFIJO}/crm_dedup/${TEL}`, fields: camposMarcador(idAjeno, comerc.localId) } },
    ] }) }).then((r) => r.status);
  chk("las reglas NO permiten sobrescribir el marcador existente", sobrescritura === 403, "HTTP " + sobrescritura);

  const despues = await leerCAMPO(`crm_dedup/${TEL}`);
  chk("el marcador sigue intacto byte a byte tras el intento",
    JSON.stringify(canon(despues.doc.fields)) === antesMarcador);
  chk("el marcador sigue apuntando al ganador",
    val(despues.doc.fields, "lead_id") === ganador.id);
  chk("el prospecto del intento de sobrescritura tampoco nació (lote ATÓMICO)",
    (await leerCAMPO(`crm_leads/${idAjeno}`)).status === 404);

  console.log("\n=== E · Atomicidad del lote: prospecto y marcador van juntos ===");
  /* Se intenta crear un prospecto cuyo marcador ya existe: el lote entero debe caer. */
  const TEL2 = "3209400002";
  const primero = await altaEnLote(TEL2, comerc.localId, comerc.idToken);
  chk("primer alta del segundo número prospera", primero.status === 200, "HTTP " + primero.status);
  const segundoId = uuid();
  const segundo = await fetch(`${FS}:commit`, { method: "POST", headers: H(otro.idToken),
    body: JSON.stringify({ writes: [
      { update: { name: `${PREFIJO}/crm_leads/${segundoId}`, fields: camposLead(TEL2, otro.localId) } },
      { update: { name: `${PREFIJO}/crm_dedup/${TEL2}`, fields: camposMarcador(segundoId, otro.localId) } },
    ] }) }).then((r) => r.status);
  chk("un segundo operador con el mismo número es rechazado", segundo === 403, "HTTP " + segundo);
  chk("su prospecto NO se crea: no queda prospecto sin marcador",
    (await leerCAMPO(`crm_leads/${segundoId}`)).status === 404);
  chk("el marcador sigue apuntando al primer prospecto",
    val((await leerCAMPO(`crm_dedup/${TEL2}`)).doc.fields, "lead_id") === primero.id);

  /* Y el caso inverso: prospecto sin marcador en el mismo lote. */
  const terceroId = uuid();
  const sinMarcador = await fetch(`${FS}:commit`, { method: "POST", headers: H(comerc.idToken),
    body: JSON.stringify({ writes: [
      { update: { name: `${PREFIJO}/crm_leads/${terceroId}`, fields: camposLead("3209400003", comerc.localId) } },
    ] }) }).then((r) => r.status);
  chk("un lote con prospecto y SIN marcador es rechazado", sinMarcador === 403, "HTTP " + sinMarcador);
  chk("ese prospecto tampoco existe", (await leerCAMPO(`crm_leads/${terceroId}`)).status === 404);

  console.log("\n=== D · Ningún usuario obtiene acceso indebido ===");
  chk("otro comercial no puede leer el marcador del número disputado",
    (await leerCAMPO(`crm_dedup/${TEL}`, otro.idToken)).status === 403);
  chk("otro comercial no puede leer el prospecto no asignado",
    (await leerCAMPO(`crm_leads/${ganador.id}`, otro.idToken)).status === 403);
  chk("el comercial que dio de alta tampoco lee el prospecto (nace sin asignar)",
    (await leerCAMPO(`crm_leads/${ganador.id}`, comerc.idToken)).status === 403);
  const anonimo = await fetch(`${FS}:commit`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ writes: [
      { update: { name: `${PREFIJO}/crm_leads/${uuid()}`, fields: camposLead("3209400004", "anónimo") } },
      { update: { name: `${PREFIJO}/crm_dedup/3209400004`, fields: camposMarcador(uuid(), "anónimo") } },
    ] }) }).then((r) => r.status);
  chk("un anónimo no puede dar de alta por este camino", anonimo === 401 || anonimo === 403, "HTTP " + anonimo);
  chk("el marcador del número disputado sigue siendo único e intacto",
    (await leerCAMPO(`crm_dedup/${TEL}`)).doc &&
    val((await leerCAMPO(`crm_dedup/${TEL}`)).doc.fields, "lead_id") === ganador.id);

  console.log("\nRESULTADO R02: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
