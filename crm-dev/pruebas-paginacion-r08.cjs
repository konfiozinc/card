/* KZ-CRM-018 · R08 — Paginación real en inventarios y operaciones administrativas.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   QUÉ SE EXIGE
     A. Más de 300 documentos: el inventario los ve TODOS (antes se cortaba en una
        página de 300 y el resto desaparecía sin aviso).
     B. Varias páginas: se recorren encadenando nextPageToken.
     C. Fallo al leer una página: el procedimiento aborta con código ≠ 0 y NO
        presenta lo leído como inventario completo.
     D. Respuesta vacía: 0 documentos es un resultado válido, no un error.
     E. Error HTTP: código ≠ 0, nunca «no hay datos».
     F. Ausencia de pérdida silenciosa: el recuento del informe coincide con el número
        real de documentos sembrados, y el panel lista la cartera entera.

   También comprueba el PANEL: con más de 300 prospectos, la tabla los muestra todos y
   la bandeja no avisa de cartera incompleta.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-paginacion-r08.cjs"
*/

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");
const { crearProxy } = require("./lib/proxy-fallos.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const DIA = 24 * 60 * 60 * 1000;
const ANIO = 365 * DIA;
const PUERTO_PROXY = 8096;
const PUERTO_HTTP = 8121;
const RAIZ = path.join(__dirname, "..");

const TOTAL = 350;          // > 300: obliga a más de una página
const VENCIDOS = 10;        // con retención ya vencida

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

const listar = async (ruta) => {
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
};
const borrar = async (ruta) => { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); };

/** El script se ejecuta con --emulador; `url` permite desviarlo al proxy y `entorno`
 *  añade variables (por ejemplo el correo administrativo que comprueba la verificación). */
const correrScript = (script, args, url = null, entorno = {}) => new Promise((resolve) => {
  const hijo = spawn(process.execPath, [path.join(__dirname, script), "--emulador", ...args],
    { env: { ...process.env, ...entorno, ...(url ? { KZ_FIRESTORE_URL: url } : {}) },
      stdio: ["ignore", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  hijo.on("exit", (codigo, senal) => resolve({ codigo, senal, salida }));
});

async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) await borrar(`crm_leads/${l.id}/notas/${n.id}`);
    await borrar(`crm_leads/${l.id}`);
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup", "crm_config"]) {
    for (const d of await listar(c)) await borrar(`${c}/${d.id}`);
  }
}

/** Siembra `n` prospectos con UUID y su marcador, en lotes que respetan el límite.
 *  `conVencidos` marca los primeros `VENCIDOS` con la retención ya cumplida. */
async function sembrar(n, uid, conVencidos) {
  const pares = [];
  for (let i = 0; i < n; i++) {
    const tel = "320990" + String(1000 + i).slice(-4);
    const id = crypto.randomUUID();
    const vencido = conVencidos && i < VENCIDOS;
    pares.push({ tel, id, vencido });
  }
  for (let i = 0; i < pares.length; i += 150) {
    const lote = pares.slice(i, i + 150);
    const writes = [];
    for (const p of lote) {
      writes.push({ update: { name: `${PREFIJO}/crm_leads/${p.id}`, fields: {
        nombre: { stringValue: "Prospecto " + p.tel }, telefono: { stringValue: p.tel },
        industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
        consentimiento_version: { stringValue: "v1-2026-11" },
        retencion_hasta: { timestampValue: p.vencido ? TS(-30 * DIA) : TS(ANIO) },
        estado: { stringValue: "nuevo" }, creado_en: { timestampValue: TS(0) },
        creado_por: { stringValue: uid },
        historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" } } } });
      writes.push({ update: { name: `${PREFIJO}/crm_dedup/${p.tel}`, fields: {
        lead_id: { stringValue: p.id }, creado_en: { timestampValue: TS(0) },
        creado_por: { stringValue: uid } } } });
    }
    const r = await fetch(`${FS}:commit`, { method: "POST", headers: OWNER, body: JSON.stringify({ writes }) });
    if (!r.ok) throw new Error("commit de siembra: HTTP " + r.status + " " + (await r.text()).slice(0, 120));
  }
  return pares;
}

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) }).then((r) => r.json());
};

(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }
  const proxy = await crearProxy({ puerto: PUERTO_PROXY });

  /* ── Siembra de más de 300 prospectos ─────────────────────────────────── */
  console.log("=== 0 · Siembra de " + TOTAL + " prospectos (más de una página) ===");
  await limpiar();
  const admin = await altaUsuario("admin-r08@test.local");
  await fetch(`${FS}/crm_usuarios/${admin.localId}`, { method: "PATCH", headers: OWNER,
    body: JSON.stringify({ fields: { rol: { stringValue: "admin" }, activo: { booleanValue: true } } }) });
  await sembrar(TOTAL, admin.localId, true);
  const reales = await listar("crm_leads");
  chk("0 · se sembraron " + TOTAL + " prospectos", reales.length === TOTAL, reales.length + "");
  chk("0 · todos tienen marcador de deduplicación", (await listar("crm_dedup")).length === TOTAL);

  /* ── A/B/F · El informe de retención recorre todas las páginas ────────── */
  console.log("\n=== A · Inventario con más de 300 documentos: informe de retención ===");
  const inf = await correrScript("retencion-vencida.cjs", ["--json"]);
  chk("A · el informe termina bien", inf.codigo === 0, "código " + inf.codigo);
  const lineaTotal = (inf.salida.match(/Documentos en crm_leads: (\d+)/) || [])[1];
  chk("A · informa de los " + TOTAL + " documentos, no de 300", lineaTotal === String(TOTAL), "informó " + lineaTotal);
  const lineaVencidos = (inf.salida.match(/retención vencida[^:]*: (\d+)/) || [])[1];
  chk("A · informa de los " + VENCIDOS + " vencidos", lineaVencidos === String(VENCIDOS), "informó " + lineaVencidos);
  const trozoJson = inf.salida.slice(inf.salida.indexOf("JSON:"));
  const soloJson = trozoJson.slice(trozoJson.indexOf("["), trozoJson.lastIndexOf("]") + 1);
  chk("A · devuelve la lista completa en JSON", JSON.parse(soloJson).length === TOTAL,
    JSON.parse(soloJson).length + " filas");
  chk("A · recorre más de una página", (await listar("crm_leads")).length > 300);

  /* ── E · Error HTTP en la primera página ──────────────────────────────── */
  console.log("\n=== E · Error HTTP al inventariar ===");
  proxy.limpiarReglas();
  proxy.regla({ id: "primera-pagina-caida", veces: 1,
    prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url) && !/pageToken/.test(i.url),
    accion: "503" });
  const err = await correrScript("retencion-vencida.cjs", [], proxy.urlBase);
  chk("E · termina con código distinto de cero", err.codigo !== 0, "código " + err.codigo);
  chk("E · dice qué página falló y cuántos llevaba leídos",
    /página 1/.test(err.salida) && /INCOMPLETO/.test(err.salida), err.salida.split("\n")[0]);
  chk("E · NO presenta el informe como si la base estuviera vacía", !/Documentos en crm_leads: 0/.test(err.salida));

  /* ── C · Fallo al leer la SEGUNDA página ──────────────────────────────── */
  console.log("\n=== C · Fallo de lectura de una página intermedia ===");
  proxy.limpiarReglas();
  proxy.regla({ id: "pagina-dos-caida",
    prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url) && /pageToken/.test(i.url),
    accion: "503" });
  const parcial = await correrScript("retencion-vencida.cjs", [], proxy.urlBase);
  chk("C · termina con código distinto de cero", parcial.codigo !== 0, "código " + parcial.codigo);
  chk("C · NO da por bueno un inventario parcial",
    !/^Documentos en crm_leads: \d+/m.test(parcial.salida), parcial.salida.split("\n")[0]);
  chk("C · avisa de que el informe quedaría incompleto", /INCOMPLETO/.test(parcial.salida));

  /* ── D · Respuesta vacía: cero documentos es válido ───────────────────── */
  console.log("\n=== D · Colección vacía: 0 es un resultado, no un error ===");
  await limpiar(); proxy.limpiarReglas();
  const vacio = await correrScript("retencion-vencida.cjs", []);
  chk("D · termina bien con la colección vacía", vacio.codigo === 0, "código " + vacio.codigo);
  chk("D · informa de 0 documentos", /Documentos en crm_leads: 0/.test(vacio.salida));
  chk("D · dice que no hay nada que retirar", /No hay retenciones vencidas/.test(vacio.salida));

  /* ── Inventario de la verificación de operación ───────────────────────── */
  console.log("\n=== B · La verificación de operación revisa los " + TOTAL + " ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(TOTAL, admin.localId, false);
  const op = await correrScript("verificar-operacion.cjs", [], null,
    { KZ_ADMIN_EMAIL: "admin-r08@test.local" });
  chk("B · la verificación termina bien", op.codigo === 0, "código " + op.codigo);
  chk("B · informa de " + TOTAL + " prospectos revisados",
    new RegExp("prospectos: " + TOTAL).test(op.salida),
    (op.salida.match(/prospectos: \d+/) || [])[0]);
  chk("B · reconoce los " + TOTAL + " con UUID v4 y 0 heredados",
    new RegExp("con UUID v4: " + TOTAL).test(op.salida) && /heredados pendientes de migrar: 0/.test(op.salida),
    (op.salida.match(/con UUID v4: \d+ · heredados pendientes de migrar: \d+/) || [])[0]);
  chk("B · sin fallos en la coherencia de los datos",
    /RESULTADO OPERACIÓN: OK \d+ · FALLA 0/.test(op.salida),
    (op.salida.match(/RESULTADO OPERACIÓN[^\n]*/) || [])[0]);

  /* ── El inventario del panel: cartera completa con más de 300 ─────────── */
  console.log("\n=== F · El panel lista la cartera entera (" + TOTAL + " prospectos) ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(TOTAL, admin.localId, false);

  const ficha = await fetch(`${FS}/crm_usuarios/${admin.localId}`, { headers: OWNER })
    .then((r) => r.ok ? r.json() : null);
  chk("F · la ficha del administrador existe, es admin y está activa",
    !!ficha && val(ficha.fields, "rol") === "admin" && val(ficha.fields, "activo") === true,
    ficha ? JSON.stringify(ficha.fields) : "no encontrada");

  /* El panel NO tiene ruta de emulador a propósito («Aquí NO hay ninguna ruta de
     emulador»): su configuración apunta al proyecto real. Para poder ejercitar su
     inventario contra el emulador, ESTE servidor de pruebas sirve crm/crm.js con el
     proyecto cambiado a demo-crm-016 y dos líneas que conectan con el emulador local.
     Es imprescindible cambiar TAMBIÉN el projectId: el emulador separa los datos por
     proyecto, así que un panel apuntando a `kzfio-crm` no vería nada de lo sembrado en
     `demo-crm-016` (y el login diría «esta cuenta no tiene un rol activo»).
     El código de paginación que se prueba es el real, sin tocar. */
  const JS_PANEL = path.join(RAIZ, "crm", "crm.js");
  const sinInyectar = fs.readFileSync(JS_PANEL, "utf8");
  const inyectarEmulador = (js) => js
    .replace('projectId: "kzfio-crm"', 'projectId: "demo-crm-016"')
    .replace('import { registrarProspectoInterno }',
      'import { connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";\n' +
      'import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";\n' +
      'import { registrarProspectoInterno }')
    .replace('const db = getFirestore(app, ID_BASE);',
      'const db = getFirestore(app, ID_BASE);\n' +
      'try { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });\n' +
      '      connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch (e) { console.error("emulador", e); }');
  /* Autocomprobación: si los anclajes no coinciden, la inyección no se aplica y el panel
     se conectaría al proyecto real. Se verifica en vez de suponerlo. */
  const jsInyectado = inyectarEmulador(sinInyectar);
  chk("F · la inyección del emulador se aplica al servir el panel",
    jsInyectado.includes("connectFirestoreEmulator(db,") &&
    jsInyectado.includes("connectAuthEmulator(auth,") &&
    jsInyectado.length > sinInyectar.length,
    jsInyectado.length + " vs " + sinInyectar.length);

  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css", ".json": "application/json" };
  const srv = http.createServer((q, w) => {
    let u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/favicon.ico") { w.writeHead(204); return w.end(); }
    if (u === "/") u = "/crm/index.html";
    const f = path.join(RAIZ, u);
    if (path.resolve(f) === path.resolve(JS_PANEL)) {
      const js = inyectarEmulador(fs.readFileSync(f, "utf8"));
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
    const peticiones = [];
    pagina.on("pageerror", (e) => errores.push(e.message));
    pagina.on("console", (m) => { if (/emulador/.test(m.text())) errores.push("[consola] " + m.text()); });
    pagina.on("request", (r) => {
      const u = r.url();
      if (u.includes("127.0.0.1:8080") || u.includes("127.0.0.1:9099") ||
          u.includes("googleapis.com") || u.includes("firebaseio")) peticiones.push(u.slice(0, 400));
    });
    pagina.on("response", async (resp) => {
      if (!resp.url().includes("signInWithPassword")) return;
      try {
        const j = await resp.json();
        peticiones.push("uid_que_usa_el_panel=" + j.localId + " · email=" + j.email);
      } catch { /* respuesta sin JSON */ }
    });
    await pagina.goto(`http://127.0.0.1:${PUERTO_HTTP}/crm/index.html`, { waitUntil: "networkidle" });
    await pagina.fill("#l-email", "admin-r08@test.local");
    await pagina.fill("#l-pass", "crm12345");
    await pagina.click('#form-login button[type="submit"]');
    try {
      await pagina.waitForSelector("#vista:not([hidden])", { timeout: 20000 });
    } catch (e) {
      const mensaje = await pagina.evaluate(() =>
        (document.querySelector("#login-error") || {}).textContent || "(sin mensaje)");
      console.log("   depuración login: " + mensaje + " | errores JS: " + JSON.stringify(errores.slice(0, 3)));
      console.log("   peticiones observadas: " + JSON.stringify([...new Set(peticiones)].slice(0, 8)));
      throw e;
    }
    await pagina.waitForTimeout(2500);

    const bandeja = await pagina.evaluate(() => document.querySelector("#bandeja").textContent);
    const filas = await pagina.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length);
    chk("F · la bandeja dice " + TOTAL + " prospectos", new RegExp("· " + TOTAL + " prospectos").test(bandeja),
      bandeja.trim().slice(0, 120));
    chk("F · la tabla muestra la cartera completa", filas === TOTAL, filas + " filas");
    chk("F · la bandeja NO avisa de cartera incompleta", !/INCOMPLETA|tope de/i.test(bandeja));
    chk("F · el panel no lanzó errores de JavaScript", errores.length === 0, errores.slice(0, 2).join(" | "));
  } finally {
    if (pagina) await pagina.close();
    await navegador.close();
    srv.close();
  }

  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO R08: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
