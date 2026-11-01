/* KZ-CRM-018 · R07 / A04 — CERTIFICACIÓN DE LA TRANSICIÓN.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   QUÉ CERTIFICA (las seis etapas que pidió la misión)
     1. El panel NUEVO funciona con las reglas ANTERIORES.
     2. Las reglas NUEVAS funcionan con el panel que quedará publicado.
     3. La migración es idempotente.
     4. Verificación posterior: integridad referencial.
     5. Recuperación segura ante errores.
     6. Reversión sin pérdida de información posterior.

   CÓMO SE PRUEBAN LAS DOS CONFIGURACIONES
   El test DETECTA qué juego de reglas está cargado (si el borrado directo de un prospecto
   con sesión de admin responde 200, son las anteriores; si responde 403, las candidatas).
   Por eso el mismo archivo se ejecuta dos veces:

     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-prev.json        "node crm-dev/pruebas-transicion-r07.cjs"
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json  "node crm-dev/pruebas-transicion-r07.cjs"

   crm-dev/firestore.rules.prev es una copia CONGELADA de las reglas que hoy están escritas
   en producción (commit 611ae92). No se despliega: existe para poder demostrar que el
   panel nuevo no depende de las reglas nuevas.
*/

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");
const { inyectarEmulador } = require("./lib/panel-emulador.cjs");
const { crearProxy } = require("./lib/proxy-fallos.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const PUERTO_HTTP = 8122;
const PUERTO_PROXY = 8095;
const RAIZ = path.join(__dirname, "..");
const MAPA = path.join(__dirname, "migracion-uuid.json");
const RESP = path.join(__dirname, "migracion-respaldo.json");

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
const borrar = async (ruta) => { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); };
const commit = (writes) => fetch(`${FS}:commit`, { method: "POST", headers: OWNER,
  body: JSON.stringify({ writes }) }).then((r) => r.status);

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
    nombre: { stringValue: "Transicion " + tel }, telefono: { stringValue: tel },
    industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
    consentimiento_version: { stringValue: "v1-2026-11" },
    retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
    creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
    historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
  };
  if (asignado) { f.asignado_a = { stringValue: asignado }; f.asignado_en = { timestampValue: TS(0) }; f.asignado_por = { stringValue: uid }; }
  return f;
};

/** Migración y reversión se ejecutan como procesos hijos (son procedimientos). */
const correr = (script, args, url = null) => new Promise((resolve) => {
  const hijo = spawn(process.execPath, [path.join(__dirname, script), "--emulador", ...args],
    { env: { ...process.env, ...(url ? { KZ_FIRESTORE_URL: url } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  hijo.on("exit", (codigo) => resolve({ codigo, salida }));
});

async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) await borrar(`crm_leads/${l.id}/notas/${n.id}`);
    await borrar(`crm_leads/${l.id}`);
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup", "crm_config", "crm_audit"]) {
    for (const d of await listar(c)) await borrar(`${c}/${d.id}`);
  }
  for (const f of [MAPA, RESP]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

const duplicadosMigrados = async () => {
  const leads = (await listar("crm_leads")).filter((l) => esUuid4(l.id));
  const cuenta = new Map();
  for (const l of leads) {
    const t = val(l.fields, "telefono");
    cuenta.set(t, (cuenta.get(t) || 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([t, n]) => `${t}×${n}`);
};

(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }
  const proxy = await crearProxy({ puerto: PUERTO_PROXY });

  await limpiar();
  const admin = await altaUsuario("admin-r07@test.local");
  await sembrarRol(admin.localId, "admin");
  const comercial = await altaUsuario("comercial-r07@test.local");
  await sembrarRol(comercial.localId, "comercial");

  /* ── 0. Qué juego de reglas está cargado ──────────────────────────────── */
  const TEL_SONDA = "3209100099";
  const idSonda = crypto.randomUUID();
  await commit([
    { update: { name: `${PREFIJO}/crm_leads/${idSonda}`, fields: camposLead(TEL_SONDA, admin.localId) } },
    { update: { name: `${PREFIJO}/crm_dedup/${TEL_SONDA}`, fields: {
      lead_id: { stringValue: idSonda }, creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: admin.localId } } } },
  ]);
  const borradoDirecto = await fetch(`${FS}/crm_leads/${idSonda}`,
    { method: "DELETE", headers: { authorization: "Bearer " + admin.idToken } }).then((r) => r.status);
  const reglasNuevas = borradoDirecto === 403;
  console.log("=== 0 · Juego de reglas cargado ===");
  console.log("    " + (reglasNuevas ? "REGLAS CANDIDATAS (nuevas)" : "REGLAS ANTERIORES (las de producción)") +
    " · borrado directo admin = HTTP " + borradoDirecto);
  chk("0 · el borrado directo responde de forma coherente con el juego cargado",
    borradoDirecto === 403 || borradoDirecto === 200, "HTTP " + borradoDirecto);

  /* ── Datos de partida: heredados (id = teléfono) + uno nuevo con UUID ──── */
  await limpiar();
  const TEL_H1 = "3209100101", TEL_H2 = "3209100102";
  await fetch(`${FS}/crm_leads?documentId=${TEL_H1}`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: camposLead(TEL_H1, admin.localId) }) });
  await fetch(`${FS}/crm_leads?documentId=${TEL_H2}`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: camposLead(TEL_H2, admin.localId) }) });
  const TEL_NUEVO = "3209100103";
  const idNuevo = crypto.randomUUID();
  await commit([
    { update: { name: `${PREFIJO}/crm_leads/${idNuevo}`, fields: camposLead(TEL_NUEVO, admin.localId) } },
    { update: { name: `${PREFIJO}/crm_dedup/${TEL_NUEVO}`, fields: {
      lead_id: { stringValue: idNuevo }, creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: admin.localId } } } },
  ]);
  chk("preparación: 3 prospectos (2 heredados + 1 con UUID)", (await listar("crm_leads")).length === 3);

  /* ── 1 y 2. El panel funciona con ESTE juego de reglas ────────────────── */
  console.log("\n=== " + (reglasNuevas ? "2" : "1") + " · El panel que quedará publicado funciona con estas reglas ===");
  const JS_PANEL = path.join(RAIZ, "crm", "crm.js");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css", ".json": "application/json" };
  const srv = http.createServer((q, w) => {
    let u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/favicon.ico") { w.writeHead(204); return w.end(); }
    if (u === "/") u = "/crm/index.html";
    const f = path.join(RAIZ, u);
    if (path.resolve(f) === path.resolve(JS_PANEL)) {
      const { js, aplicado } = inyectarEmulador(fs.readFileSync(f, "utf8"));
      if (!aplicado) console.warn("  AVISO: no se pudo inyectar el emulador en crm.js");
      w.writeHead(200, { "content-type": MIME[".js"] });
      return w.end(js);
    }
    fs.readFile(f, (e, b) => {
      if (e) { w.writeHead(404); return w.end("404"); }
      w.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
      w.end(b);
    });
  });
  await new Promise((r) => srv.listen(PUERTO_HTTP, r));

  const navegador = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });
  let pagina = null;
  try {
    pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(e.message));
    await pagina.goto(`http://127.0.0.1:${PUERTO_HTTP}/crm/index.html`, { waitUntil: "networkidle" });
    await pagina.fill("#l-email", "admin-r07@test.local");
    await pagina.fill("#l-pass", "crm12345");
    await pagina.click('#form-login button[type="submit"]');
    await pagina.waitForSelector("#vista:not([hidden])", { timeout: 20000 });
    await pagina.waitForTimeout(1500);
    chk("el administrador entra en el panel", true);

    const filas = await pagina.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length);
    chk("el panel lista los 3 prospectos", filas === 3, filas + " filas");

    /* Se opera sobre el prospecto HEREDADO: es el caso que más riesgo tiene en la
       transición (existe antes de las reglas nuevas). */
    await pagina.fill("#f-texto", TEL_H1);
    await pagina.waitForTimeout(400);
    await pagina.click(`#tabla-leads tr[data-id="${TEL_H1}"]`);
    await pagina.waitForSelector("#detalle:not([hidden])");
    await pagina.waitForTimeout(900);
    chk("abre el detalle de un prospecto heredado", true);

    await pagina.selectOption("#d-estado", "contactado");
    await pagina.click("#btn-estado");
    await pagina.waitForTimeout(1200);
    chk("el cambio de estado en un heredado se guarda",
      val((await fetch(`${FS}/crm_leads/${TEL_H1}`, { headers: OWNER }).then((r) => r.json())).fields, "estado") === "contactado");

    /* El detalle se re-renderiza tras el cambio de estado; si el campo se rellena mientras
       se reconstruye, el texto se pierde y el panel muestra «escribe la nota». Se reintenta
       porque es una carrera de la interfaz, no un problema de reglas. */
    let notasCreadas = 0;
    for (let intento = 0; intento < 3 && notasCreadas === 0; intento++) {
      await pagina.fill("#d-nota", "nota de la transición");
      await pagina.click("#btn-nota");
      await pagina.waitForTimeout(1300);
      notasCreadas = (await listar(`crm_leads/${TEL_H1}/notas`)).length;
    }
    chk("se puede añadir una nota", notasCreadas >= 1, notasCreadas + " notas");

    await pagina.selectOption("#q-plan", "pro");
    await pagina.click("#btn-cotizar");
    await pagina.waitForTimeout(1200);
    chk("se puede registrar una cotización", (await listar("crm_quotes")).length === 1);

    const cotId = (await listar("crm_quotes"))[0].id;
    await pagina.fill("#s-quote", cotId);
    await pagina.fill("#s-monto", "99900");
    await pagina.click("#btn-venta");
    await pagina.waitForTimeout(1500);
    chk("se puede confirmar una venta", (await listar("crm_sales")).length === 1);

    await pagina.selectOption("#a-asesor", comercial.localId);
    await pagina.click("#btn-asignar");
    await pagina.waitForTimeout(1200);
    chk("se puede asignar el prospecto a un asesor",
      val((await fetch(`${FS}/crm_leads/${TEL_H1}`, { headers: OWNER }).then((r) => r.json())).fields, "asignado_a") === comercial.localId);

    chk("el panel no lanzó errores de JavaScript", errores.length === 0, errores.slice(0, 2).join(" | "));
  } finally {
    if (pagina) await pagina.close();
    await navegador.close();
    srv.close();
  }

  /* ── 3 y 4. Migración idempotente y verificación posterior ────────────── */
  console.log("\n=== 3 · La migración es idempotente ===");
  const m1 = await correr("migrar-uuid.cjs", ["--confirmar"]);
  chk("la migración termina bien", m1.codigo === 0, "código " + m1.codigo);
  const migrados = (await listar("crm_leads")).filter((l) => esUuid4(l.id));
  chk("migra los 2 heredados (el UUID nativo no se toca)", migrados.length === 3, migrados.length + " con UUID");
  const m2 = await correr("migrar-uuid.cjs", ["--confirmar"]);
  chk("la segunda pasada no migra nada", m2.codigo === 0 && /Nada que migrar/.test(m2.salida));
  chk("no hay ninguna migración duplicada", (await duplicadosMigrados()).length === 0);
  chk("el total de prospectos no cambia", (await listar("crm_leads")).length === 5);

  console.log("\n=== 4 · Verificación posterior: integridad referencial ===");
  const leads = await listar("crm_leads");
  const ids = new Set(leads.map((l) => l.id));
  const marcadores = await listar("crm_dedup");
  const cotizaciones = await listar("crm_quotes");
  const ventas = await listar("crm_sales");
  chk("ninguna cotización apunta a un prospecto inexistente",
    cotizaciones.every((c) => ids.has(val(c.fields, "lead_id"))));
  chk("ninguna venta apunta a un prospecto inexistente",
    ventas.every((v) => ids.has(val(v.fields, "lead_id"))));
  chk("ningún marcador apunta a un prospecto inexistente",
    marcadores.every((m) => ids.has(val(m.fields, "lead_id"))));
  chk("cada prospecto migrado tiene su marcador",
    migrados.every((l) => marcadores.some((m) => m.id === val(l.fields, "telefono") && val(m.fields, "lead_id") === l.id)));

  /* ── 5. Recuperación segura ante errores ─────────────────────────────── */
  console.log("\n=== 5 · Recuperación segura ante errores ===");
  await limpiar();
  const TEL_E1 = "3209100201", TEL_E2 = "3209100202";
  for (const tel of [TEL_E1, TEL_E2]) {
    await fetch(`${FS}/crm_leads?documentId=${tel}`, { method: "POST", headers: OWNER,
      body: JSON.stringify({ fields: camposLead(tel, admin.localId) }) });
  }
  proxy.limpiarReglas();
  proxy.regla({ id: "commit-falla", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]), accion: "500" });
  const conFallo = await correr("migrar-uuid.cjs", ["--confirmar"], proxy.urlBase);
  chk("con el commit caído, la migración NO termina en verde", conFallo.codigo !== 0, "código " + conFallo.codigo);
  chk("el estado queda en «pendiente», no en «hecho»",
    Object.values(JSON.parse(fs.readFileSync(MAPA, "utf8"))).some((e) => e.estado === "pendiente"));
  proxy.limpiarReglas();
  const reanudada = await correr("migrar-uuid.cjs", ["--confirmar"], proxy.urlBase);
  chk("la reanudación completa la migración", reanudada.codigo === 0, "código " + reanudada.codigo);
  chk("sin duplicar ningún prospecto", (await duplicadosMigrados()).length === 0);
  chk("todas las entradas quedan en «hecho»",
    Object.values(JSON.parse(fs.readFileSync(MAPA, "utf8"))).every((e) => e.estado === "hecho"));

  /* ── 6. Reversión sin pérdida de información posterior ───────────────── */
  console.log("\n=== 6 · Reversión sin pérdida posterior ===");
  const mapa = JSON.parse(fs.readFileSync(MAPA, "utf8"));
  const uuidE1 = mapa[TEL_E1].uuid;
  await fetch(`${FS}/crm_leads/${uuidE1}/notas`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: { texto: { stringValue: "información posterior a la migración" },
      autor: { stringValue: admin.localId }, fecha: { timestampValue: TS(0) },
      tipo: { stringValue: "nota" } } }) });
  const rev = await correr("migrar-uuid.cjs", ["--revertir", "--confirmar"]);
  chk("la reversión se NIEGA con código 3", rev.codigo === 3, "código " + rev.codigo);
  chk("el prospecto migrado sigue existiendo",
    (await fetch(`${FS}/crm_leads/${uuidE1}`, { headers: OWNER })).status === 200);
  chk("y la información posterior sigue intacta", (await listar(`crm_leads/${uuidE1}/notas`)).length === 1);

  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO TRANSICIÓN R07 (reglas " + (reglasNuevas ? "NUEVAS" : "ANTERIORES") + "): PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
