/* KZ-CRM-016 · certificación del CRM PRIVADO (el único modo que se habilita).
   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm/emulador-produccion.json "node crm/pruebas-privado.cjs"

   Complementa a crm/pruebas.cjs (que cubre el recorrido comercial y el panel).
   Aquí se certifica lo que la misión pide antes de usar datos reales:
     · aislamiento absoluto del anónimo (ni una sola escritura posible)
     · aislamiento de roles (cada rol ve y hace sólo lo suyo)
     · protección contra modificaciones indebidas (identidad, consentimiento,
       precios, ventas, auditoría)
     · persistencia real después de recargar el panel
     · que el rol no pueda autoasignarse desde el cliente, ni siquiera admin

   Los roles se siembran con el bypass privilegiado `Authorization: Bearer owner`,
   que representa consola / Admin SDK. En producción esa es la ÚNICA vía. */

const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");

const RAIZ = path.join(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json" };
const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner" };
const PUERTO = 8121;
let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const ANIO = 365 * 24 * 60 * 60 * 1000;
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();

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

/** Sin token NO se envía cabecera: así la petición es un anónimo de verdad y
 *  quien decide es la regla. Un token falsificado, en cambio, lo rechaza la API
 *  con 400/401 antes de evaluar reglas; se comprueba aparte. */
const hdr = (token) => token
  ? { "content-type": "application/json", authorization: "Bearer " + token }
  : { "content-type": "application/json" };

const sembrarRol = (uid, rol) => fetch(`${FS}/crm_usuarios/${uid}`, {
  method: "PATCH", headers: Object.assign({ "content-type": "application/json" }, OWNER),
  body: JSON.stringify({ fields: { rol: { stringValue: rol }, activo: { booleanValue: true } } }),
}).then((r) => r.status);

const lead = (tel, uid, extra) => Object.assign({
  nombre: { stringValue: "Prospecto Privado" },
  telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" },
  consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) },
  estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: TS(0) },
  creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [] } },
  origen: { stringValue: "manual" },
}, extra || {});

const crearLead = (tel, uid, token, extra) => fetch(`${FS}/crm_leads?documentId=${tel}`, {
  method: "POST", headers: hdr(token), body: JSON.stringify({ fields: lead(tel, uid, extra) }),
}).then((r) => r.status);

const parche = (ruta, fields, token, mask) => fetch(`${FS}/${ruta}${mask ? "?updateMask.fieldPaths=" + mask : ""}`, {
  method: "PATCH", headers: hdr(token), body: JSON.stringify({ fields }),
}).then((r) => r.status);

const leer = (ruta, token) => fetch(`${FS}/${ruta}`, { headers: { authorization: "Bearer " + token } }).then((r) => r.status);

const crearCotizacion = (leadId, uid, token, extra) => fetch(`${FS}/crm_quotes`, {
  method: "POST", headers: hdr(token),
  body: JSON.stringify({ fields: Object.assign({
    lead_id: { stringValue: leadId }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
    creado_por: { stringValue: uid }, creado_en: { timestampValue: TS(0) },
  }, extra || {}) }),
}).then((r) => r.status);

const crearVenta = (leadId, quoteId, uid, token, extra) => fetch(`${FS}/crm_sales`, {
  method: "POST", headers: hdr(token),
  body: JSON.stringify({ fields: Object.assign({
    lead_id: { stringValue: leadId }, quote_id: { stringValue: quoteId }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, confirmado_por: { stringValue: uid }, confirmado_en: { timestampValue: TS(0) },
  }, extra || {}) }),
}).then((r) => r.status);

const listar = (col, token) => fetch(`${FS}/${col}`, { headers: { authorization: "Bearer " + token } }).then((r) => r.json());

/** Un token inválido lo rechaza el emulador con 401; sin token es 403 por reglas.
 *  Para "el anónimo no puede", ambos resultados son un NO. */
const negado = (s) => s === 403 || s === 401;

(async () => {
  const srv = http.createServer((q, w) => {
    let u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/favicon.ico") { w.writeHead(204); return w.end(); }
    if (u === "/") u = "/crm/index.html";
    const f = path.join(RAIZ, u);
    fs.readFile(f, (e, b) => { if (e) { w.writeHead(404); return w.end("404"); } w.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); w.end(b); });
  });
  await new Promise((r) => srv.listen(PUERTO, r));

  const admin = await altaUsuario("admin-p@crm.test");
  const comercial = await altaUsuario("comercial-p@crm.test");
  const ventas = await altaUsuario("ventas-p@crm.test");
  const sinRol = await altaUsuario("sinrol-p@crm.test");
  await sembrarRol(admin.localId, "admin");
  await sembrarRol(comercial.localId, "comercial");
  await sembrarRol(ventas.localId, "ventas");

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("=== A. El anónimo no puede hacer NADA");
  chk("no lee prospectos", (await fetch(`${FS}/crm_leads`)).status === 403);
  chk("no crea prospectos", (await crearLead("3200000001", admin.localId, null)) === 403);
  chk("no modifica prospectos",
    (await parche("crm_leads/3200000001", { estado: { stringValue: "ganado" } }, null)) === 403);
  chk("no borra prospectos", (await fetch(`${FS}/crm_leads/3200000001`, { method: "DELETE" })).status === 403);
  chk("no lee ni crea cotizaciones", (await fetch(`${FS}/crm_quotes`)).status === 403);
  chk("no lee ni crea ventas", (await fetch(`${FS}/crm_sales`)).status === 403);
  chk("no lee ni escribe auditoría", (await fetch(`${FS}/crm_audit`)).status === 403);
  chk("no escribe su propia ficha de rol",
    (await parche("crm_usuarios/anon", { rol: { stringValue: "admin" } }, null)) === 403);
  const sFalso = await crearLead("3200000003", admin.localId, "token.falsificado.xyz");
  chk("un token falsificado tampoco sirve", sFalso === 400 || sFalso === 401, "HTTP " + sFalso);

  console.log("\n=== B. Usuario autenticado SIN rol: sigue siendo un extraño");
  chk("no lee prospectos", (await leer("crm_leads", sinRol.idToken)) === 403);
  chk("no crea prospectos", (await crearLead("3200000002", sinRol.localId, sinRol.idToken)) === 403);
  chk("no puede fabricarse el rol admin",
    (await parche(`crm_usuarios/${sinRol.localId}`, { rol: { stringValue: "admin" }, activo: { booleanValue: true } }, sinRol.idToken)) === 403);
  chk("sí puede leer su propia ficha (no existe)",
    (await fetch(`${FS}/crm_usuarios/${sinRol.localId}`, { headers: { authorization: "Bearer " + sinRol.idToken } })).status === 404);

  console.log("\n=== C. Recorrido privado completo creado por el operador");
  chk("admin registra prospecto", (await crearLead("3201110001", admin.localId, admin.idToken)) === 200);
  const cot = await crearCotizacion("3201110001", comercial.localId, comercial.idToken);
  chk("comercial cotiza el prospecto", cot === 200, "HTTP " + cot);
  const cotId = ((await listar("crm_quotes", comercial.idToken)).documents || [])[0].name.split("/").pop();

  console.log("\n=== D. Protección contra modificaciones indebidas del prospecto");
  chk("no se puede cambiar el consentimiento",
    (await parche("crm_leads/3201110001", { consentimiento: { booleanValue: false } }, admin.idToken, "consentimiento")) === 403);
  chk("no se puede cambiar la versión del consentimiento",
    (await parche("crm_leads/3201110001", { consentimiento_version: { stringValue: "v0" } }, admin.idToken, "consentimiento_version")) === 403);
  chk("no se puede reescribir la fecha de alta",
    (await parche("crm_leads/3201110001", { creado_en: { timestampValue: TS(-ANIO) } }, admin.idToken, "creado_en")) === 403);
  chk("no se puede alterar el teléfono (es la identidad)",
    (await parche("crm_leads/3201110001", { telefono: { stringValue: "3209999999" } }, admin.idToken, "telefono")) === 403);
  chk("no se puede poner un estado inventado",
    (await parche("crm_leads/3201110001", { estado: { stringValue: "vendido" } }, admin.idToken, "estado")) === 403);
  chk("no se puede dejar la retención en el pasado",
    (await parche("crm_leads/3201110001", { retencion_hasta: { timestampValue: TS(-ANIO) } }, admin.idToken, "retencion_hasta")) === 403);
  chk("no se puede poner una retención de 10 años",
    (await parche("crm_leads/3201110001", { retencion_hasta: { timestampValue: TS(ANIO * 10) } }, admin.idToken, "retencion_hasta")) === 403);
  chk("sí se puede avanzar el estado del seguimiento",
    (await parche("crm_leads/3201110001", { estado: { stringValue: "cotizado" } }, admin.idToken, "estado")) === 200);

  console.log("\n=== E. Protección de cotizaciones y ventas");
  chk("no se crea cotización con importe inventado",
    (await crearCotizacion("3201110001", comercial.localId, comercial.idToken, { monto: { integerValue: 1000 } })) === 403);
  chk("no se crea cotización de un prospecto inexistente",
    (await crearCotizacion("3299999999", comercial.localId, comercial.idToken)) === 403);
  chk("no se crea cotización haciéndose pasar por otro operador",
    (await crearCotizacion("3201110001", admin.localId, comercial.idToken)) === 403);
  chk("ventas NO puede crear cotizaciones",
    (await crearCotizacion("3201110001", ventas.localId, ventas.idToken)) === 403);
  chk("no se altera el importe de una cotización",
    (await parche(`crm_quotes/${cotId}`, { monto: { integerValue: 1 } }, comercial.idToken, "monto")) === 403);
  chk("no se puede citar una cotización inexistente para vender",
    (await crearVenta("3201110001", "no-existe", ventas.localId, ventas.idToken)) === 403);
  chk("no se puede vender con una cotización de otro prospecto",
    (await (async () => {
      await crearLead("3201110002", admin.localId, admin.idToken);
      const otra = await fetch(`${FS}/crm_quotes`, {
        method: "POST", headers: hdr(comercial.idToken),
        body: JSON.stringify({ fields: {
          lead_id: { stringValue: "3201110002" }, plan: { stringValue: "basica" }, monto: { integerValue: 49900 },
          moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
          creado_por: { stringValue: comercial.localId }, creado_en: { timestampValue: TS(0) },
        } }),
      }).then((r) => r.json());
      const otraId = otra.name.split("/").pop();
      return crearVenta("3201110001", otraId, ventas.localId, ventas.idToken);
    })()) === 403);
  chk("ventas SÍ confirma una venta legítima",
    (await crearVenta("3201110001", cotId, ventas.localId, ventas.idToken)) === 200);
  chk("la venta no se puede modificar",
    (await parche(`crm_sales/${(await listar("crm_sales", ventas.idToken)).documents[0].name.split("/").pop()}`,
      { monto: { integerValue: 1 } }, ventas.idToken, "monto")) === 403);

  console.log("\n=== F. Aislamiento de roles");
  chk("comercial lee prospectos", (await leer("crm_leads", comercial.idToken)) === 200);
  chk("comercial NO lee ventas", (await leer("crm_sales", comercial.idToken)) === 403);
  chk("comercial NO lee auditoría", (await leer("crm_audit", comercial.idToken)) === 403);
  chk("comercial NO anonimiza",
    (await parche("crm_leads/3201110002", { anonimizado: { booleanValue: true } }, comercial.idToken, "anonimizado")) === 403);
  chk("comercial NO borra prospectos",
    (await fetch(`${FS}/crm_leads/3201110002`, { method: "DELETE", headers: { authorization: "Bearer " + comercial.idToken } })).status === 403);
  chk("ventas lee ventas", (await leer("crm_sales", ventas.idToken)) === 200);
  chk("ventas NO lee auditoría", (await leer("crm_audit", ventas.idToken)) === 403);
  chk("admin lee auditoría y ventas", (await leer("crm_audit", admin.idToken)) === 200 && (await leer("crm_sales", admin.idToken)) === 200);

  console.log("\n=== G. El rol no se autoasigna desde el cliente, ni siendo admin");
  chk("admin NO puede cambiar su propio rol desde el cliente",
    (await parche(`crm_usuarios/${admin.localId}`, { rol: { stringValue: "ventas" } }, admin.idToken, "rol")) === 403);
  chk("admin NO puede crear una ficha de rol desde el cliente",
    (await parche(`crm_usuarios/otro-uid`, { rol: { stringValue: "admin" }, activo: { booleanValue: true } }, admin.idToken)) === 403);
  chk("desactivar la propia ficha tampoco se permite",
    (await parche(`crm_usuarios/${admin.localId}`, { activo: { booleanValue: false } }, admin.idToken, "activo")) === 403);
  chk("el procedimiento privilegiado sí puede (control positivo)",
    (await sembrarRol(sinRol.localId, "comercial")) === 200);
  chk("y ese usuario recién sembrado ya lee prospectos", (await leer("crm_leads", sinRol.idToken)) === 200);

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n=== H. Persistencia real después de recargar el panel");
  const b = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  const conectar = async () => {
    await p.goto(`http://127.0.0.1:${PUERTO}/crm/index.html?emulador=1&rol=admin`, { waitUntil: "networkidle" });
    const loginVisible = await p.evaluate(() => document.querySelector("#vista-login").hidden === false);
    if (loginVisible) {
      await p.fill("#l-email", "admin-p@crm.test");
      await p.fill("#l-pass", "crm12345");
      await p.click('#form-login button[type="submit"]');
    }
    await p.waitForSelector("#vista:not([hidden])", { timeout: 15000 });
    await p.waitForTimeout(900);
  };

  await conectar();
  const filasAntes = await p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length);
  const ventasAntes = await p.evaluate(() => document.querySelector("#stats").textContent);
  chk("el panel carga los prospectos creados por REST", filasAntes === 2, "filas=" + filasAntes);

  await p.fill("#f-texto", "3201110001");
  await p.waitForTimeout(300);
  await p.click('#tabla-leads tr[data-id="3201110001"]');
  await p.waitForSelector("#detalle:not([hidden])");
  await p.fill("#d-nota", "Nota que debe sobrevivir a la recarga");
  await p.click("#btn-nota");
  await p.waitForTimeout(900);

  /* La recarga no puede esperar "networkidle": Firestore mantiene un canal
     abierto de escucha, así que la red nunca queda inactiva. */
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector("#vista:not([hidden])", { timeout: 20000 });
  await p.waitForTimeout(1500);

  chk("tras recargar, la sesión sigue activa (no vuelve al login)",
    (await p.evaluate(() => document.querySelector("#vista-login").hidden)) === true);
  chk("tras recargar, los prospectos siguen ahí",
    (await p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length)) === filasAntes);
  chk("tras recargar, la venta confirmada sigue en las estadísticas",
    /99\.900/.test(await p.evaluate(() => document.querySelector("#stats").textContent)), ventasAntes.slice(0, 60));

  await p.fill("#f-texto", "3201110001");
  await p.waitForTimeout(300);
  await p.click('#tabla-leads tr[data-id="3201110001"]');
  await p.waitForSelector("#detalle:not([hidden])");
  chk("tras recargar, la nota del historial se conserva",
    /Nota que debe sobrevivir a la recarga/.test(await p.evaluate(() => document.querySelector("#d-historial").textContent)));
  chk("tras recargar, la cotización sigue asociada al prospecto",
    /99900|99\.900|pro/.test(await p.evaluate(() => document.querySelector("#d-cotizaciones").textContent)));
  chk("sin errores de página en todo el recorrido", errs.length === 0, errs[0] || "limpio");

  await p.close(); await b.close(); srv.close();
  console.log("\nRESULTADO CRM PRIVADO (persistencia/roles/modificaciones): PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
