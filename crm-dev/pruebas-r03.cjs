/* KZ-CRM-018 · R03 — Certificación de IDEMPOTENCIA y REANUDACIÓN de la migración.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   Las seis propiedades que la misión exige demostrar:
     A. Repetir la migración NO duplica prospectos.
     B. Un registro que ya nació con UUID NO vuelve a migrarse.
     C. Una entrada marcada como pendiente CONSERVA su UUID.
     D. Un repunte incompleto NO queda marcado como terminado.
     E. Un error de listado NO se interpreta como «colección vacía».
     F. La reanudación completa correctamente las operaciones pendientes.

   Ejecutar:
     firebase emulators:exec --only firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-r03.cjs"
*/

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { crearProxy } = require("./lib/proxy-fallos.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const SCRIPT = path.join(__dirname, "migrar-uuid.cjs");
const MAPA = path.join(__dirname, "migracion-uuid.json");
const RESP = path.join(__dirname, "migracion-respaldo.json");
const PUERTO_PROXY = 8098;

const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const crypto = require("node:crypto");

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);
const esUuid4 = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));

async function listar(ruta) {
  const salida = [];
  let token = null, paginas = 0;
  do {
    const url = `${FS}/${ruta}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, { headers: OWNER });
    if (!r.ok) throw new Error(`listar ${ruta}: HTTP ${r.status}`);
    const j = await r.json();
    for (const d of (j.documents || [])) salida.push({ id: d.name.split("/").pop(), fields: d.fields || {} });
    token = j.nextPageToken || null;
    if (++paginas > 100) throw new Error("demasiadas páginas");
  } while (token);
  return salida;
}
const leerDoc = async (ruta) => {
  const r = await fetch(`${FS}/${ruta}`, { headers: OWNER });
  return r.ok ? await r.json() : null;
};
const crear = async (ruta, fields, id) => {
  const r = await fetch(`${FS}/${ruta}` + (id ? `?documentId=${encodeURIComponent(id)}` : ""),
    { method: "POST", headers: OWNER, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`POST ${ruta}: HTTP ${r.status}`);
  return (await r.json()).name.split("/").pop();
};
const commit = async (writes) => {
  const r = await fetch(`${FS}:commit`, { method: "POST", headers: OWNER, body: JSON.stringify({ writes }) });
  if (!r.ok) throw new Error("commit: HTTP " + r.status);
};
const borrar = async (ruta) => { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); };

const correr = (args, url = null) => new Promise((resolve) => {
  const hijo = spawn(process.execPath, [SCRIPT, "--emulador", ...args],
    { env: { ...process.env, ...(url ? { KZ_FIRESTORE_URL: url } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  hijo.on("exit", (codigo, senal) => resolve({ codigo, senal, salida }));
});

/* ── datos ──────────────────────────────────────────────────────────────── */
const UID = "uid-ficticio-r03";
const leadAntiguo = (tel) => ({
  nombre: { stringValue: "Antiguo " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "contactado" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: UID },
  historial: { arrayValue: { values: [{ stringValue: "nota heredada" }] } },
  origen: { stringValue: "manual" },
});
const nota = (texto) => ({
  texto: { stringValue: texto }, autor: { stringValue: UID },
  fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } });

async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) await borrar(`crm_leads/${l.id}/notas/${n.id}`);
    await borrar(`crm_leads/${l.id}`);
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup"]) {
    for (const d of await listar(c)) await borrar(`${c}/${d.id}`);
  }
  for (const f of [MAPA, RESP]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

async function sembrar(tels) {
  for (const tel of tels) {
    await crear("crm_leads", leadAntiguo(tel), tel);
    await crear(`crm_leads/${tel}/notas`, nota("nota vieja de " + tel));
  }
  const cot = await crear("crm_quotes", {
    lead_id: { stringValue: tels[0] }, plan: { stringValue: "pro" },
    monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
    estado: { stringValue: "enviada" }, creado_por: { stringValue: UID }, creado_en: { timestampValue: TS(0) } });
  return { cot };
}

const leerMapa = () => JSON.parse(fs.readFileSync(MAPA, "utf8"));
const guardarMapa = (m) => fs.writeFileSync(MAPA, JSON.stringify(m, null, 1), "utf8");
const uuids = async () => (await listar("crm_leads")).filter((l) => esUuid4(l.id)).map((l) => l.id).sort();

/** Integridad referencial completa: lo que debe cumplirse al final de cualquier reanudación. */
async function integridad() {
  const leads = await listar("crm_leads");
  const ids = new Set(leads.map((l) => l.id));
  const cots = await listar("crm_quotes");
  const vens = await listar("crm_sales");
  const dedup = await listar("crm_dedup");
  const problemas = [];
  for (const c of cots) if (!ids.has(val(c.fields, "lead_id"))) problemas.push("cotización huérfana " + c.id);
  for (const v of vens) if (!ids.has(val(v.fields, "lead_id"))) problemas.push("venta huérfana " + v.id);
  for (const d of dedup) {
    const lead = leads.find((l) => l.id === val(d.fields, "lead_id"));
    if (!lead) problemas.push("marcador huérfano " + d.id);
    else if (val(lead.fields, "telefono") !== d.id) problemas.push("marcador desajustado " + d.id);
  }
  for (const l of leads.filter((x) => esUuid4(x.id))) {
    const tel = val(l.fields, "telefono");
    if (!dedup.some((d) => d.id === tel && val(d.fields, "lead_id") === l.id))
      problemas.push("prospecto migrado sin marcador: " + l.id);
  }
  return problemas;
}

/* ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }
  const proxy = await crearProxy({ puerto: PUERTO_PROXY });

  /* ── A. Idempotencia ───────────────────────────────────────────────────── */
  console.log("=== A · Repetir la migración no duplica prospectos ===");
  await limpiar();
  await sembrar(["3209600001", "3209600002", "3209600003"]);
  const a1 = await correr(["--confirmar"]);
  chk("A · la primera migración termina bien", a1.codigo === 0, "código " + a1.codigo);
  const uuidA = await uuids();
  const notasA = (await listar(`crm_leads/${uuidA[0]}/notas`)).length;
  chk("A · crea 3 prospectos con UUID", uuidA.length === 3, uuidA.length + "");
  chk("A · no duplica las notas al migrar", notasA === 1, notasA + "");

  const a2 = await correr(["--confirmar"]);
  chk("A · la segunda pasada termina sin error", a2.codigo === 0, "código " + a2.codigo);
  chk("A · la segunda pasada no migra nada", /Nada que migrar/.test(a2.salida));
  chk("A · los UUID no cambian", JSON.stringify(await uuids()) === JSON.stringify(uuidA));
  chk("A · el número de prospectos no cambia", (await listar("crm_leads")).length === 6);
  chk("A · sigue habiendo 3 marcadores", (await listar("crm_dedup")).length === 3);
  const a3 = await correr(["--confirmar"]);
  chk("A · una tercera pasada tampoco duplica", a3.codigo === 0 &&
    (await listar("crm_leads")).length === 6 && JSON.stringify(await uuids()) === JSON.stringify(uuidA));

  /* ── B. Un registro nacido con UUID no se vuelve a migrar ──────────────── */
  console.log("\n=== B · Un registro UUID nativo no se vuelve a migrar ===");
  await limpiar();
  const TEL_NATIVO = "3209600010";
  const idNativo = crypto.randomUUID();
  /* Alta tal como la hace el panel: prospecto + marcador en el mismo lote. */
  await commit([
    { update: { name: `${PREFIJO}/crm_leads/${idNativo}`, fields: {
      nombre: { stringValue: "Nativo " + TEL_NATIVO }, telefono: { stringValue: TEL_NATIVO },
      industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
      consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: UID },
      historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" } } } },
    { update: { name: `${PREFIJO}/crm_dedup/${TEL_NATIVO}`, fields: {
      lead_id: { stringValue: idNativo }, creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: UID } } } },
  ]);
  const nativoAntes = JSON.stringify((await leerDoc(`crm_leads/${idNativo}`)).fields);
  await sembrar(["3209600011"]);
  const b = await correr(["--confirmar"]);
  chk("B · la migración termina bien", b.codigo === 0, "código " + b.codigo);
  chk("B · informa de que omite el registro que ya tenía UUID", /Ya con UUID \(se omiten\): 1/.test(b.salida),
    (b.salida.match(/Ya con UUID \(se omiten\): \d+/) || [])[0]);
  chk("B · el registro nativo no se toca", JSON.stringify((await leerDoc(`crm_leads/${idNativo}`)).fields) === nativoAntes);
  chk("B · no se crea un segundo marcador para su teléfono",
    (await listar("crm_dedup")).filter((d) => d.id === TEL_NATIVO).length === 1);
  chk("B · su marcador sigue apuntando al mismo documento",
    val((await leerDoc(`crm_dedup/${TEL_NATIVO}`)).fields, "lead_id") === idNativo);
  chk("B · el heredado sí se migró", (await uuids()).length === 2, (await uuids()).length + " UUID");

  /* ── C. Una entrada pendiente conserva su UUID ─────────────────────────── */
  console.log("\n=== C · Una entrada pendiente conserva su UUID ===");
  await limpiar();
  await sembrar(["3209600020", "3209600021"]);
  const c1 = await correr(["--confirmar"]);
  chk("C · la migración termina bien", c1.codigo === 0, "código " + c1.codigo);
  const mapaC = leerMapa();
  const uuidC = mapaC["3209600020"].uuid;
  /* Se simula el estado que deja una verificación interrumpida: hecho → pendiente. */
  mapaC["3209600020"].estado = "pendiente";
  guardarMapa(mapaC);
  const c2 = await correr(["--confirmar"]);
  chk("C · la reanudación termina bien", c2.codigo === 0, "código " + c2.codigo);
  chk("C · reconoce la entrada pendiente", /pendientes: 1/.test(c2.salida),
    (c2.salida.match(/pendientes: \d+/) || [])[0]);
  chk("C · reutiliza el MISMO UUID", leerMapa()["3209600020"].uuid === uuidC, uuidC);
  chk("C · no crea un prospecto adicional", (await listar("crm_leads")).length === 4);
  chk("C · vuelve a quedar como terminada", leerMapa()["3209600020"].estado === "hecho");

  /* ── D. Un repunte incompleto no queda como terminado ──────────────────── */
  console.log("\n=== D · Un repunte incompleto no queda marcado como terminado ===");
  await limpiar(); proxy.limpiarReglas();
  const { cot: cotD } = await sembrar(["3209600030", "3209600031"]);
  proxy.regla({ id: "patch-falla", veces: 1,
    prueba: (i) => i.method === "PATCH" && /\/crm_quotes\//.test(i.url), accion: "500" });
  const d1 = await correr(["--confirmar"], proxy.urlBase);
  chk("D · termina con código distinto de cero", d1.codigo !== 0, "código " + d1.codigo);
  const mapaD = leerMapa();
  chk("D · la entrada queda pendiente, no «hecho»",
    Object.values(mapaD).some((e) => e.estado === "pendiente"),
    JSON.stringify(Object.values(mapaD).map((e) => e.estado)));
  const uuidD = mapaD["3209600030"].uuid;
  chk("D · la cotización todavía NO apunta al UUID",
    val((await leerDoc(`crm_quotes/${cotD}`)).fields, "lead_id") === "3209600030");

  /* ── F. La reanudación completa lo pendiente ───────────────────────────── */
  console.log("\n=== F · La reanudación completa las operaciones pendientes ===");
  proxy.limpiarReglas();
  const f = await correr(["--confirmar"], proxy.urlBase);
  chk("F · la reanudación termina bien", f.codigo === 0, "código " + f.codigo);
  chk("F · la cotización acaba apuntando al UUID",
    val((await leerDoc(`crm_quotes/${cotD}`)).fields, "lead_id") === uuidD);
  chk("F · todas las entradas quedan «hecho»",
    Object.values(leerMapa()).every((e) => e.estado === "hecho"),
    JSON.stringify(Object.values(leerMapa()).map((e) => e.estado)));
  chk("F · no hay duplicados del mismo número dentro de lo migrado",
    (await uuids()).length === 2, (await uuids()).length + " UUID");
  chk("F · la integridad referencial queda limpia", (await integridad()).length === 0,
    (await integridad()).join(" · "));

  /* ── E. Un error de listado no es una colección vacía ──────────────────── */
  console.log("\n=== E · Un error de listado no se interpreta como colección vacía ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209600040"]);
  proxy.regla({ id: "listado-caido", veces: 1,
    prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url) && !/pageToken/.test(i.url),
    accion: "503" });
  const e1 = await correr(["--confirmar"], proxy.urlBase);
  chk("E · termina con código distinto de cero", e1.codigo !== 0, "código " + e1.codigo);
  chk("E · NO dice «nada que migrar»", !/Nada que migrar/.test(e1.salida));
  chk("E · NO informa de 0 prospectos", !/Prospectos: 0/.test(e1.salida));
  chk("E · no escribe ni el mapa ni el respaldo", !fs.existsSync(MAPA) && !fs.existsSync(RESP));
  chk("E · no crea nada en el almacén", (await listar("crm_dedup")).length === 0);

  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO R03: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
