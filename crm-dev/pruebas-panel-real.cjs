/* KZ-CRM-016 · prueba de humo del PANEL REAL contra el proyecto kzfio-crm.

   Comprueba que el panel (servido en local) habla con el Firebase real y no con el
   emulador, y que alcanza el proveedor de correo/contraseña de verdad.

   Importante: esta prueba NO inicia sesión. Usa el correo del administrador con una
   contraseña deliberadamente incorrecta, así que no obtiene ninguna credencial ni
   escribe ningún dato. Lo que demuestra es que la cadena
   panel → SDK → kzfio-crm → Authentication está viva, y que el panel informa del
   error real en lugar de fallar en silencio.

   Uso:
     node crm/servir-panel.cjs &        (o en otra terminal)
     node crm/pruebas-panel-real.cjs
*/

const { chromium } = require("C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");

const URL = "http://127.0.0.1:8321/crm/index.html";
const EMAIL = process.env.KZ_ADMIN_EMAIL || "admin@ejemplo.com";

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [], fallosRed = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("requestfailed", (r) => fallosRed.push((r.url() || "").slice(0, 90)));

  const resp = await p.goto(URL, { waitUntil: "networkidle" });
  chk("el panel se sirve en local", resp && resp.status() === 200, "HTTP " + (resp && resp.status()));

  await p.waitForSelector("#vista-login:not([hidden])", { timeout: 15000 });
  chk("muestra el formulario de acceso", true);
  chk("el panel NO está en modo emulador",
    (await p.evaluate(() => location.search.includes("emulador"))) === false);

  /* ── La comprobación que faltaba, y que costó el primer acceso real ──────────
     El panel debe apuntar a la base con nombre «default». Si apunta a «(default)»
     (el valor por omisión del SDK), la autenticación funciona y el panel se cae en
     la primera lectura con «The database (default) does not exist».
     Se verifica en el cliente REAL, sin credenciales. */
  const baseConfigurada = await p.evaluate(() => window.CRM && window.CRM.baseDatos);
  chk("el cliente usa la base «default»", baseConfigurada === "default", String(baseConfigurada));

  const peticiones = [];
  p.on("request", (r) => { if (/firestore\.googleapis\.com|:8080\/v1\/projects/.test(r.url())) peticiones.push(r.url()); });

  const sonda = await p.evaluate(async () => {
    try {
      const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      await m.getDocs(m.collection(window.CRM.db, "crm_leads"));
      return { code: "SIN-ERROR", msg: "leyó datos sin estar autenticado (¡grave!)" };
    } catch (e) {
      return { code: e.code || "(sin código)", msg: String(e.message || e) };
    }
  });
  console.log("    sonda Firestore → " + sonda.code);
  chk("la base existe: el error es de permisos, no de base inexistente",
    sonda.code === "permission-denied", sonda.code + " · " + sonda.msg.slice(0, 90));
  chk("NO aparece el error de base inexistente",
    !/database .*does not exist|not-found/i.test(sonda.msg));

  /* El SDK usa WebChannel: el nombre de la base viaja codificado en la query
     (`database=projects%2Fkzfio-crm%2Fdatabases%2Fdefault`), no como ruta. */
  const urls = peticiones.join(" ");
  const vaABaseCorrecta = /databases%2Fdefault/.test(urls) || /\/databases\/default\//.test(urls);
  const vaABasePorOmision = /databases%2F\(default\)/.test(urls) || /\/databases\/\(default\)\//.test(urls);
  chk("las peticiones declaran la base «default»", vaABaseCorrecta,
    vaABaseCorrecta ? "" : urls.slice(0, 160));
  chk("NINGUNA petición usa la base por omisión «(default)»", !vaABasePorOmision);

  /* El panel inicializa Firebase con la config de kzfio-crm. Si estuviera apuntando a
     otro proyecto o al emulador, el error sería otro. */
  await p.fill("#l-email", EMAIL);
  await p.fill("#l-pass", "contrasena-deliberadamente-incorrecta");
  await p.click('#form-login button[type="submit"]');

  await p.waitForFunction(
    () => (document.querySelector("#login-error") || {}).textContent && document.querySelector("#login-error").textContent.trim().length > 0,
    null, { timeout: 20000 }
  ).catch(() => {});
  const mensaje = await p.evaluate(() => document.querySelector("#login-error").textContent.trim());

  console.log("    mensaje del panel: «" + mensaje + "»");
  chk("el panel informa del fallo de credenciales (auth/*)",
    /auth\//.test(mensaje), mensaje || "(vacío)");
  chk("NO es un fallo de configuración del proyecto",
    !/configuration-not-found|api-key-not-valid|project-not-found/i.test(mensaje));
  chk("sigue en la pantalla de acceso (no ha entrado)",
    (await p.evaluate(() => document.querySelector("#vista").hidden)) === true);
  chk("sin errores de JavaScript en el panel", errs.length === 0, errs[0] || "limpio");

  await p.close(); await b.close();
  console.log("\nRESULTADO PANEL REAL: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
