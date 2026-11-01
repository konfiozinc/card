/* KZ-CRM-017 · certificación del panel PUBLICADO (contra la URL real de GitHub Pages).
   INTERNO: vive en crm-dev/ y no se publica.

   Comprueba lo que sólo se puede comprobar en el sitio real: que la URL responde, que
   el panel apunta al proyecto y a la base correctos, que no hay errores de consola, que
   el formulario se ve y responde bien a credenciales incorrectas, y que los archivos
   internos NO se sirven.

   No inicia sesión: usa una contraseña deliberadamente incorrecta, así que no obtiene
   credenciales ni escribe datos.

   Uso: node crm-dev/pruebas-publicado.cjs */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");

const BASE = "https://konfiozinc.github.io/card";
const URL_PANEL = BASE + "/crm/";
const EMAIL = process.env.KZ_ADMIN_EMAIL || "admin@ejemplo.com";
const SALIDA = path.join(__dirname, "capturas");

const TAMANOS = [
  [375, 812, "publicado-movil-375x812"],
  [768, 1024, "publicado-tablet-768x1024"],
  [1440, 900, "publicado-escritorio-1440x900"],
  [1920, 1080, "publicado-escritorio-1920x1080"],
];

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });

  console.log("=== A. Recursos servidos por GitHub Pages ===");
  for (const ruta of ["/crm/", "/crm/index.html", "/crm/crm.js", "/crm/crm.css", "/crm/alta-prospecto.js", "/assets/css/kz-tokens.css"]) {
    const r = await b.newPage();
    const resp = await r.goto(BASE + ruta, { waitUntil: "domcontentloaded" }).catch(() => null);
    chk("sirve " + ruta, !!resp && resp.status() === 200, resp ? "HTTP " + resp.status() : "sin respuesta");
    await r.close();
  }
  for (const ruta of ["/crm-dev/firestore.rules", "/crm-dev/activar-admin.cjs", "/crm-dev/pruebas.cjs", "/crm/formulario.html"]) {
    const r = await b.newPage();
    const resp = await r.goto(BASE + ruta, { waitUntil: "domcontentloaded" }).catch(() => null);
    const codigo = resp ? resp.status() : 0;
    chk("NO se sirve " + ruta, codigo === 404, "HTTP " + codigo);
    await r.close();
  }

  console.log("\n=== B. El panel publicado apunta a lo correcto ===");
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [], peticiones = [], fallosHttp = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  p.on("response", (r) => { if (r.status() >= 400) fallosHttp.push(r.status() + " " + r.url()); });
  p.on("request", (r) => { if (/firestore\.googleapis\.com|identitytoolkit/.test(r.url())) peticiones.push(r.url()); });

  await p.goto(URL_PANEL, { waitUntil: "networkidle" });
  await p.waitForSelector("#vista-login:not([hidden])", { timeout: 20000 });
  chk("la pantalla de acceso es visible para cualquiera", true);
  chk("el panel NO usa el emulador",
    (await p.evaluate(() => location.search)).includes("emulador") === false);

  const cfg = await p.evaluate(() => ({ base: window.CRM && window.CRM.baseDatos }));
  chk("el cliente declara la base «default»", cfg.base === "default", String(cfg.base));

  const sonda = await p.evaluate(async () => {
    try {
      const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      await m.getDocs(m.collection(window.CRM.db, "crm_audit"));
      return { code: "SIN-ERROR" };
    } catch (e) { return { code: e.code || "(sin código)" }; }
  });
  chk("un visitante sin sesión NO puede leer datos (permission-denied)", sonda.code === "permission-denied", sonda.code);

  const urls = peticiones.join(" ");
  chk("las peticiones declaran databases%2Fdefault",
    /databases%2Fdefault/.test(urls) || /\/databases\/default\//.test(urls));
  chk("ninguna petición usa databases/(default)",
    !/databases%2F\(default\)/.test(urls) && !/\/databases\/\(default\)\//.test(urls));

  console.log("\n=== C. Errores de autenticación comprensibles ===");
  await p.fill("#l-email", EMAIL);
  await p.fill("#l-pass", "contrasena-deliberadamente-incorrecta");
  await p.click('#form-login button[type="submit"]');
  await p.waitForFunction(() => (document.querySelector("#login-error") || {}).textContent.trim().length > 0, null, { timeout: 25000 }).catch(() => {});
  const msg = (await p.evaluate(() => document.querySelector("#login-error").textContent)).trim();
  console.log("    mensaje mostrado: «" + msg + "»");
  chk("muestra un mensaje en español y accionable, no un código crudo",
    /Correo o contraseña incorrectos/i.test(msg), msg || "(vacío)");
  chk("no revela si el correo existe", !/no existe|no registrad|desconocid/i.test(msg));
  chk("no entra con credenciales incorrectas",
    (await p.evaluate(() => document.querySelector("#vista").hidden)) === true);
  /* El intento con contraseña incorrecta produce un 400 controlado de
     accounts:signInWithPassword, y Chrome lo anota en consola. Es el efecto esperado de
     esta prueba, no un defecto del panel: se separa de los errores del propio sitio. */
  const errsPropios = errs.filter((e) => !/Failed to load resource/i.test(e));
  const errsDeAuthEsperados = errs.filter((e) => /Failed to load resource/i.test(e));
  console.log("    errores de consola del sitio: " + errsPropios.length +
    " · respuestas de red anotadas por Chrome: " + errsDeAuthEsperados.length + " (el 400 del acceso fallido)");
  chk("sin errores de JavaScript ni de recursos propios del sitio", errsPropios.length === 0,
    (errsPropios[0] || "limpio").slice(0, 100));
  if (fallosHttp.length) {
    console.log("    respuestas HTTP >= 400 durante la sesión:");
    for (const f of fallosHttp) console.log("      · " + f);
  }
  /* Sólo cuentan los fallos de recursos propios del panel; un 404 del favicon por
     defecto o de una ruta que el navegador prueba y no existe no rompe nada. */
  const fallosPropios = fallosHttp.filter((f) => /\/card\/crm\//.test(f) && !/favicon\.ico/.test(f));
  chk("ningún recurso propio del panel devuelve error", fallosPropios.length === 0,
    fallosPropios.join(" | ") || "ninguno");
  chk("el único 400 de red es el acceso fallido provocado por esta prueba",
    fallosHttp.every((f) => /identitytoolkit.*signInWithPassword/.test(f)),
    fallosHttp.map((f) => f.split("?")[0]).join(" | ") || "ninguno");
  await p.close();

  console.log("\n=== D. Capturas del sitio publicado ===");
  for (const [w, h, nombre] of TAMANOS) {
    const q = await b.newPage({ viewport: { width: w, height: h } });
    await q.goto(URL_PANEL, { waitUntil: "networkidle" });
    await q.waitForSelector("#vista-login:not([hidden])", { timeout: 20000 });
    await q.waitForTimeout(400);
    const desborde = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    chk(w + "×" + h + " sin desbordamiento", desborde <= 0, desborde + "px");
    await q.screenshot({ path: path.join(SALIDA, nombre + ".png"), fullPage: true });
    await q.close();
  }

  await b.close();
  console.log("\nRESULTADO PUBLICADO: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
