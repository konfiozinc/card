/* KZ-CRM-018 · COMPATIBILIDAD DEL PANEL NUEVO CON EL CONTRATO REALMENTE PUBLICADO.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   POR QUÉ ESTE ARCHIVO EXISTE
   La misión prohíbe usar una copia histórica como evidencia de compatibilidad, y tenía
   razón: las reglas desplegadas en kzfio-crm (release cloud.firestore/default, 222 líneas,
   KZ-CRM-016) NO coinciden ni con crm-dev/firestore.rules.prev ni con las candidatas.
   `crm-dev/firestore.rules.publicado` es una copia EXACTA de lo que hay publicado
   (volcada con la API de reglas y solo-lectura).

   QUÉ HACE
   Carga ese contrato en el emulador, siembra la ficha REAL del administrador
   (rol, activo, creado_en; sin nombre) y mide, operación por operación, qué hace el panel
   NUEVO contra él. No supone nada: mide y publica la matriz.

   Es un diagnóstico: NO falla por encontrar operaciones incompatibles (eso es el
   resultado); sólo falla si la medición no se puede hacer.

   Uso:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-publicado.json "node crm-dev/pruebas-compatibilidad-panel.cjs"
*/

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");
const { inyectarEmulador } = require("./lib/panel-emulador.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const PUERTO = 8123;
const RAIZ = path.join(__dirname, "..");

const matriz = [];
const fila = (operacion, funciona, nota) => {
  matriz.push({ operacion, funciona, nota });
  console.log("  " + (funciona ? "SÍ " : "NO ") + "  " + operacion + (nota ? "  (" + nota + ")" : ""));
};
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) }).then((r) => r.json());
};
const sembrarFicha = (uid, rol) => fetch(`${FS}/crm_usuarios/${uid}`, { method: "PATCH", headers: OWNER,
  body: JSON.stringify({ fields: { rol: { stringValue: rol }, activo: { booleanValue: true },
    creado_en: { timestampValue: TS(0) } } }) }).then((r) => r.status);

const campos = (tel, uid) => ({
  nombre: { stringValue: "Compat " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
});

(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }

  const admin = await altaUsuario("admin-compat@test.local");
  await sembrarFicha(admin.localId, "admin");
  const comercial = await altaUsuario("comercial-compat@test.local");
  await sembrarFicha(comercial.localId, "comercial");

  /* Un prospecto HEREDADO (id = teléfono), que es lo que ese contrato sabe crear. */
  const TEL = "3209300099";
  await fetch(`${FS}/crm_leads?documentId=${TEL}`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: campos(TEL, admin.localId) }) });

  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css", ".json": "application/json" };
  const JS_PANEL = path.join(RAIZ, "crm", "crm.js");
  const srv = http.createServer((q, w) => {
    let u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/favicon.ico") { w.writeHead(204); return w.end(); }
    if (u === "/") u = "/crm/index.html";
    const f = path.join(RAIZ, u);
    if (path.resolve(f) === path.resolve(JS_PANEL)) {
      const { js, aplicado } = inyectarEmulador(fs.readFileSync(f, "utf8"));
      if (!aplicado) console.warn("  AVISO: no se pudo inyectar el emulador");
      w.writeHead(200, { "content-type": MIME[".js"] });
      return w.end(js);
    }
    fs.readFile(f, (e, b) => { if (e) { w.writeHead(404); return w.end("404"); }
      w.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); w.end(b); });
  });
  await new Promise((r) => srv.listen(PUERTO, r));

  const navegador = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });
  console.log("PANEL NUEVO contra las REGLAS ACTUALMENTE PUBLICADAS (kzfio-crm, 222 líneas)\n");
  try {
    const p = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(`http://127.0.0.1:${PUERTO}/crm/index.html`, { waitUntil: "networkidle" });
    await p.fill("#l-email", "admin-compat@test.local");
    await p.fill("#l-pass", "crm12345");
    await p.click('#form-login button[type="submit"]');
    let entra = true;
    try { await p.waitForSelector("#vista:not([hidden])", { timeout: 12000 }); }
    catch { entra = false; }
    fila("inicio de sesión del administrador", entra,
      entra ? "" : await p.evaluate(() => (document.querySelector("#login-error") || {}).textContent || "sin mensaje"));
    if (!entra) throw new Error("sin sesión no se puede medir el resto");

    await p.waitForTimeout(1500);
    const filas = await p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length);
    fila("listar la cartera", filas >= 1, filas + " filas");
    fila("ver un prospecto sin campo asignado_a", filas >= 1);

    await p.click(`#tabla-leads tr[data-id="${TEL}"]`);
    let detalle = true;
    try { await p.waitForSelector("#detalle:not([hidden])", { timeout: 8000 }); } catch { detalle = false; }
    fila("abrir el detalle", detalle);
    if (detalle) {
      await p.waitForTimeout(800);
      await p.selectOption("#d-estado", "contactado");
      await p.click("#btn-estado");
      await p.waitForTimeout(1200);
      const est = await fetch(`${FS}/crm_leads/${TEL}`, { headers: OWNER }).then((r) => r.json());
      fila("cambiar el estado", val(est.fields, "estado") === "contactado");

      let notaOk = false;
      for (let i = 0; i < 2 && !notaOk; i++) {
        await p.fill("#d-nota", "nota de compatibilidad");
        await p.click("#btn-nota");
        await p.waitForTimeout(1200);
        const n = await fetch(`${FS}/crm_leads/${TEL}/notas`, { headers: OWNER }).then((r) => r.json());
        notaOk = ((n.documents || []).length) >= 1;
      }
      fila("añadir una nota (subcolección)", notaOk,
        notaOk ? "" : "las reglas publicadas no declaran crm_leads/{id}/notas");

      await p.selectOption("#q-plan", "pro");
      await p.click("#btn-cotizar");
      await p.waitForTimeout(1200);
      const c = await fetch(`${FS}/crm_quotes`, { headers: OWNER }).then((r) => r.json());
      fila("registrar una cotización", ((c.documents || []).length) >= 1);

      const opciones = await p.evaluate(() => document.querySelectorAll("#a-asesor option").length);
      fila("selector de asesores con el equipo", opciones > 1, opciones + " opciones");

      await p.evaluate(() => { const s = document.querySelector("#a-asesor"); if (s) s.value = ""; });
      const asignarVisible = await p.evaluate(() => {
        const b = document.querySelector("#btn-asignar");
        return !!b && !b.hidden;
      });
      fila("ofrecer la asignación de cartera", asignarVisible,
        asignarVisible ? "" : "el contrato publicado no admite asignado_a");
    }

    /* Alta de prospecto desde el panel (la operación más sensible del cambio). */
    const antes = await fetch(`${FS}/crm_leads`, { headers: OWNER }).then((r) => r.json());
    await p.fill("#n-nombre", "Compat Alta");
    await p.fill("#n-telefono", "+57 300 111 2233");
    await p.selectOption("#n-industria", "tiendas");
    await p.check("#n-consent");
    await p.click("#btn-alta");
    await p.waitForTimeout(1800);
    const despues = await fetch(`${FS}/crm_leads`, { headers: OWNER }).then((r) => r.json());
    fila("registrar un prospecto (alta)", (despues.documents || []).length > (antes.documents || []).length,
      "requiere UUID + marcador crm_dedup");

    await p.close();
  } finally {
    await navegador.close();
    srv.close();
  }

  console.log("\n=== MATRIZ DE COMPATIBILIDAD ===");
  const si = matriz.filter((f) => f.funciona).length;
  console.log("Operaciones que funcionan: " + si + "/" + matriz.length);
  console.log("Operaciones que NO funcionan: " + (matriz.length - si));
  for (const f of matriz.filter((x) => !x.funciona)) console.log("  · " + f.operacion);
  console.log("\nDiagnóstico terminado. No modifica producción.");
  process.exit(0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
