/* Pruebas del CRM en MODO PRIVADO (uso interno), contra Firebase Emulator.
   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm/emulador-produccion.json "node crm/pruebas.cjs"

   Con `--config crm/emulador.json` se ejecuta la misma batería sobre las reglas
   derivadas del emulador (idénticas salvo el alta de rol propio).

   MODO PRIVADO significa: NINGUNA escritura anónima. Los prospectos los registra
   un operador con rol, desde el panel. La captación pública está cerrada y su
   batería vive en crm/pruebas-seguridad.cjs (config crm/emulador-captacion.json). */

const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");
const RAIZ = path.join(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json" };
const AUTH = "http://127.0.0.1:9099", FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner" };
const PUERTO = 8120;
let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const ANIO = 365 * 24 * 60 * 60 * 1000;

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) })).json());
};

/** Siembra de rol: operación privilegiada (en producción: consola / Admin SDK). */
const fsRol = (uid, rol) => fetch(`${FS}/crm_usuarios/${uid}`, {
  method: "PATCH", headers: Object.assign({ "content-type": "application/json" }, OWNER),
  body: JSON.stringify({ fields: { rol: { stringValue: rol }, activo: { booleanValue: true } } }),
}).then((r) => r.status);

const camposLead = (nombre, tel, uid) => ({
  nombre: { stringValue: nombre },
  telefono: { stringValue: tel },
  industria: { stringValue: "restaurantes" },
  servicio_interes: { stringValue: "Mini Web Pro" },
  consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: new Date(Date.now() + ANIO).toISOString() },
  estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: new Date().toISOString() },
  creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [] } },
  origen: { stringValue: "manual" },
});

/* R06: el prospecto nace con UUID v4 y su número se reserva con el marcador crm_dedup en
   el MISMO lote; el teléfono ya no es el identificador del documento. El id de prueba se
   deriva del teléfono para que la batería pueda localizarlo. */
const { idDePrueba } = require("./lib/alta-uuid.cjs");
const PREFIJO = "projects/demo-crm-016/databases/default/documents";
const fsAlta = async (campos, token) => {
  const tel = campos.telefono.stringValue;
  const id = idDePrueba(tel);
  return fetch(`${FS}:commit`, {
    method: "POST",
    headers: Object.assign({ "content-type": "application/json" }, token ? { authorization: "Bearer " + token } : {}),
    body: JSON.stringify({ writes: [
      { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: campos } },
      { update: { name: `${PREFIJO}/crm_dedup/${tel}`, fields: {
        lead_id: { stringValue: id },
        creado_en: campos.creado_en || { timestampValue: new Date().toISOString() },
        creado_por: campos.creado_por || { stringValue: "pruebas" } } } },
    ] }),
  }).then((r) => r.status);
};

const fsList = async (coleccion, token) => fetch(`${FS}/${coleccion}`, { headers: token ? { authorization: "Bearer " + token } : {} }).then((r) => r.json());

(async () => {
  /* El panel se sirve con la conexión al emulador inyectada (ver lib/panel-emulador.cjs):
     el publicado apunta al proyecto real y no tiene —ni debe tener— ruta de emulador. */
  const { inyectarEmulador } = require("./lib/panel-emulador.cjs");
  const JS_PANEL = path.join(RAIZ, "crm", "crm.js");
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
    fs.readFile(f, (e, b) => { if (e) { w.writeHead(404); return w.end("404"); } w.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); w.end(b); });
  });
  await new Promise((r) => srv.listen(PUERTO, r));

  const admin = await altaUsuario("admin@crm.test");
  const comercial = await altaUsuario("comercial@crm.test");
  const ventas = await altaUsuario("ventas@crm.test");
  const r1 = await fsRol(admin.localId, "admin");
  const r2 = await fsRol(comercial.localId, "comercial");
  const r3 = await fsRol(ventas.localId, "ventas");
  chk("roles sembrados por procedimiento privilegiado", r1 === 200 && r2 === 200 && r3 === 200, r1 + "/" + r2 + "/" + r3);

  console.log("=== Modo privado: la captación pública está cerrada");
  chk("anónimo NO puede crear prospecto (403)", (await fsAlta(camposLead("Intruso", "3000000001", "x"))) === 403);
  chk("operador con rol registra el primer prospecto", (await fsAlta(camposLead("Ana Ficticia", "3001112233", admin.localId), admin.idToken)) === 200);
  chk("operador con rol registra el segundo prospecto", (await fsAlta(camposLead("Luis Ficticio", "3004445566", admin.localId), admin.idToken)) === 200);
  chk("prospecto sin consentimiento rechazado", (await (async () => { const c = camposLead("Sin", "3000000000", admin.localId); c.consentimiento = { booleanValue: false }; return fsAlta(c, admin.idToken); })()) !== 200);
  chk("lectura anónima de prospectos denegada", (await fetch(`${FS}/crm_leads`)).status === 403);
  chk("lectura anónima de ventas denegada", (await fetch(`${FS}/crm_sales`)).status === 403);

  const b = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });
  const entrar = async (rol) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PUERTO}/crm/index.html?emulador=1&rol=${rol}`, { waitUntil: "networkidle" });
    await p.fill("#l-email", rol + "@crm.test");
    await p.fill("#l-pass", "crm12345");
    await p.click('#form-login button[type="submit"]');
    try { await p.waitForSelector("#vista:not([hidden])", { timeout: 15000 }); } catch (e) { console.log("   depuración login:", await p.evaluate(() => document.querySelector("#login-error").textContent || "(sin mensaje)"), "| errores:", JSON.stringify(errs.slice(0, 2))); throw e; }
    await p.waitForTimeout(700);
    return { p, errs };
  };

  console.log("\n=== Administrador");
  const A = await entrar("admin");
  chk("login y listado de prospectos", (await A.p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length)) === 2);
  await A.p.click('#tabla-leads tr[data-id]');
  await A.p.waitForSelector("#detalle:not([hidden])");
  await A.p.selectOption("#d-estado", "contactado");
  await A.p.click("#btn-estado");
  await A.p.waitForTimeout(800);
  chk("cambio de estado", /contactado/.test(await A.p.evaluate(() => document.querySelector("#d-estado").value)));
  await A.p.fill("#d-nota", "Llamada de prueba: pide propuesta Pro");
  await A.p.click("#btn-nota"); await A.p.waitForTimeout(800);
  chk("nota en el historial", /Llamada de prueba/.test(await A.p.evaluate(() => document.querySelector("#d-historial").textContent)));
  await A.p.selectOption("#q-plan", "pro");
  await A.p.click("#btn-cotizar"); await A.p.waitForTimeout(900);
  const cot = await fsList("crm_quotes", admin.idToken);
  const quoteId = cot.documents && cot.documents[0] ? cot.documents[0].name.split("/").pop() : "";
  chk("cotización registrada (no es venta)", !!quoteId && (await fsList("crm_sales", admin.idToken)).documents === undefined, "cotización " + quoteId);
  await A.p.fill("#s-quote", quoteId);
  await A.p.fill("#s-monto", "99900");
  await A.p.click("#btn-venta"); await A.p.waitForTimeout(1000);
  const ventasDocs = await fsList("crm_sales", admin.idToken);
  chk("venta confirmada en colección separada", !!ventasDocs.documents && ventasDocs.documents.length === 1);
  chk("estadística de vendido", /99\.900/.test(await A.p.evaluate(() => document.querySelector("#stats").textContent)));
  chk("auditoría registrada", (await A.p.evaluate(() => document.querySelectorAll("#tabla-audit tr").length)) > 0);
  chk("sin errores de página (admin)", A.errs.length === 0, A.errs[0] || "limpio");
  await A.p.close();

  console.log("\n=== Comercial (sin permiso de ventas)");
  const C = await entrar("comercial");
  chk("bloque de venta oculto para comercial", await C.p.evaluate(() => document.querySelector("#bloque-venta").hidden === true));
  chk("comercial puede cotizar", await C.p.evaluate(() => document.querySelector("#bloque-cotizar").hidden === false));
  /* Un comercial NO puede listar cotizaciones ajenas —consulta sin filtro: el servidor no
     puede demostrar que todas sean suyas y la rechaza—, así que el dato que necesita esta
     comprobación se lee con la credencial de administración. */
  const q = await fetch(`${FS}/crm_quotes/${quoteId}`,
    { headers: { authorization: "Bearer " + admin.idToken } }).then((r) => r.json());
  const leadId = q.fields.lead_id.stringValue;
  const intento = await fetch(`${FS}/crm_sales`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + comercial.idToken },
    body: JSON.stringify({ fields: {
      lead_id: { stringValue: leadId }, quote_id: { stringValue: "x" }, monto: { integerValue: 50000 },
      confirmado_por: { stringValue: comercial.localId }, confirmado_en: { timestampValue: new Date().toISOString() },
    } }),
  }).then((r) => r.status);
  chk("comercial NO puede crear ventas (reglas)", intento === 403, "HTTP " + intento);
  await C.p.close();

  console.log("\n=== Responsive");
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    const R = await entrar("ventas");
    await R.p.setViewportSize({ width: w, height: h });
    await R.p.waitForTimeout(400);
    const m = await R.p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, tabla: !!document.querySelector("#tabla-leads"), venta: document.querySelector("#bloque-venta").hidden === false }));
    chk(w + "x" + h + " · sin desbordamiento", m.overflow <= 0, m.overflow + "px");
    chk(w + "x" + h + " · ve el bloque de venta", m.venta);
    await R.p.close();
  }

  console.log("\n=== Alta interna desde el panel (modo privado) y privacidad");
  const A2 = await entrar("admin");
  A2.p.on("dialog", (d) => d.accept());
  await A2.p.fill("#n-nombre", "Camila Panel");
  await A2.p.fill("#n-telefono", "+57 300 999 8877");
  await A2.p.selectOption("#n-industria", "tiendas");
  await A2.p.selectOption("#n-origen", "whatsapp");
  await A2.p.check("#n-consent");
  await A2.p.click("#btn-alta");
  await A2.p.waitForTimeout(1200);
  chk("el panel registra el prospecto (teléfono normalizado a dígitos)",
    (await A2.p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length)) === 3);
  chk("el alta del operador queda auditada",
    /prospecto_creado/.test(await A2.p.evaluate(() => document.querySelector("#tabla-audit").textContent)));

  /* R06: el panel genera un UUID ALEATORIO en cada alta, así que el id del prospecto recién
     creado no se puede calcular: se localiza por su teléfono. */
  const TEL_ALTA = "573009998877";
  const cartera = await fetch(`${FS}/crm_leads`, { headers: { authorization: "Bearer " + admin.idToken } })
    .then((r) => r.json());
  const idNuevo = ((cartera.documents || []).find((d) =>
    d.fields.telefono && d.fields.telefono.stringValue === TEL_ALTA) || { name: "/" }).name.split("/").pop();
  chk("el prospecto del panel se localiza por teléfono y tiene id UUID",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idNuevo), idNuevo);

  await A2.p.fill("#n-nombre", "Camila Otra Vez");
  await A2.p.fill("#n-telefono", "+57 300 999 8877");
  await A2.p.check("#n-consent");
  await A2.p.click("#btn-alta");
  await A2.p.waitForTimeout(900);
  chk("el mismo WhatsApp no se registra dos veces",
    /Ya existe un prospecto/.test(await A2.p.evaluate(() => document.querySelector("#estado-panel").textContent)));
  chk("el duplicado no creó una fila nueva",
    (await A2.p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length)) === 3);

  const TEL = "573009998877";
  await A2.p.fill("#f-texto", TEL);
  await A2.p.waitForTimeout(300);
  await A2.p.click(`#tabla-leads tr[data-id="${idNuevo}"]`);
  await A2.p.waitForSelector("#detalle:not([hidden])");

  const intentoAnon = await fetch(`${FS}/crm_leads/${idNuevo}?updateMask.fieldPaths=anonimizado`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer " + comercial.idToken },
    body: JSON.stringify({ fields: { anonimizado: { booleanValue: true } } }),
  }).then((r) => r.status);
  chk("comercial NO puede anonimizar (reglas)", intentoAnon === 403, "HTTP " + intentoAnon);

  /* R05 · Los recorridos antiguos de supresión y borrado se han RETIRADO del panel.
     Antes el panel ofrecía «Suprimir datos personales» —que escribía `historial: []`,
     algo que las reglas ya no permiten, y que no tocaba notas ni marcador— y «Borrar
     prospecto», que borraba sólo el documento y avisaba falsamente de que el número
     quedaba libre. La supresión es ahora un procedimiento privilegiado. */
  chk("R05: el panel ya NO ofrece «Borrar prospecto»",
    (await A2.p.evaluate(() => !!document.querySelector("#btn-borrar-lead"))) === false);
  chk("R05: el panel ya NO ofrece la supresión parcial antigua",
    (await A2.p.evaluate(() => !!document.querySelector("#btn-anonimizar"))) === false);
  chk("R05: el bloque de privacidad remite al procedimiento privilegiado",
    /procedimiento privilegiado/.test(
      await A2.p.evaluate(() => document.querySelector("#bloque-privacidad").textContent)));
  chk("R05: el prospecto sigue existiendo (el panel ya no puede borrarlo)",
    (await A2.p.evaluate(() => document.querySelectorAll("#tabla-leads tr[data-id]").length)) >= 1);
  await A2.p.close();

  await b.close(); srv.close();
  console.log("\nRESULTADO CRM PRIVADO: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
