/* KZ-CRM-018 · R04/R05 — Supresión administrativa COMPLETA y fallos parciales.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   QUÉ DEMUESTRA
     A. La simulación enseña también las cotizaciones y ventas, y no toca nada.
     B. Sin escribir SUPRIMIR, el procedimiento aborta y no borra nada.
     C. La supresión completa: prospecto, notas, marcador y REFERENCIAS quedan resueltos,
        y el número vuelve a estar disponible.
     D/E/F. Ante un fallo parcial, el procedimiento NO destruye el prospecto: se detiene
        y puede repetirse. Ésa es la diferencia entre «incompleto y reparable» y
        «incompleto e irreparable».

   Ejecutar:
     firebase emulators:exec --only firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-supresion-r04.cjs"
*/

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { crearProxy } = require("./lib/proxy-fallos.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const SCRIPT = path.join(__dirname, "suprimir-datos.cjs");
const REGISTRO = path.join(__dirname, "supresiones.log");
const PUERTO_PROXY = 8097;

const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const DESASOCIADO = "suprimido";

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

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
const existe = async (ruta) => (await fetch(`${FS}/${ruta}`, { headers: OWNER })).status === 200;
const crear = async (ruta, fields, id) => {
  const r = await fetch(`${FS}/${ruta}` + (id ? `?documentId=${encodeURIComponent(id)}` : ""),
    { method: "POST", headers: OWNER, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`POST ${ruta}: HTTP ${r.status}`);
  return (await r.json()).name.split("/").pop();
};
const commit = async (writes) => {
  const r = await fetch(`${FS}:commit`, { method: "POST", headers: OWNER, body: JSON.stringify({ writes }) });
  return r.status;
};
const borrar = async (ruta) => { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); };

/** Ejecuta el procedimiento. `respuesta` va por la entrada estándar de la 2ª confirmación. */
const ejecutar = (args, respuesta = null, url = null) => new Promise((resolve) => {
  const hijo = spawn(process.execPath, [SCRIPT, "--emulador", ...args],
    { env: { ...process.env, ...(url ? { KZ_FIRESTORE_URL: url } : {}) }, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  if (respuesta != null) { try { hijo.stdin.write(respuesta + "\n"); hijo.stdin.end(); } catch { /* ya cerrado */ } }
  hijo.on("exit", (codigo, senal) => resolve({ codigo, senal, salida }));
});

async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) await borrar(`crm_leads/${l.id}/notas/${n.id}`);
    await borrar(`crm_leads/${l.id}`);
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup"]) {
    for (const d of await listar(c)) await borrar(`${c}/${d.id}`);
  }
}

/** Un prospecto con todo lo que la supresión tiene que resolver. */
async function crearCaso(tel) {
  const id = crypto.randomUUID();
  await commit([
    { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: {
      nombre: { stringValue: "Persona " + tel }, telefono: { stringValue: tel },
      industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
      consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: "uid-r04" },
      historial: { arrayValue: { values: [{ stringValue: "dato personal heredado" }] } },
      origen: { stringValue: "manual" } } } },
    { update: { name: `${PREFIJO}/crm_dedup/${tel}`, fields: {
      lead_id: { stringValue: id }, creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: "uid-r04" } } } },
  ]);
  for (const t of ["primera nota personal", "segunda nota personal"]) {
    await crear(`crm_leads/${id}/notas`, {
      texto: { stringValue: t }, autor: { stringValue: "uid-r04" },
      fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } });
  }
  const cot = await crear("crm_quotes", {
    lead_id: { stringValue: id }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
    creado_por: { stringValue: "uid-r04" }, creado_en: { timestampValue: TS(0) } });
  const ven = await crear("crm_sales", {
    lead_id: { stringValue: id }, quote_id: { stringValue: cot }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, confirmado_por: { stringValue: "uid-r04" },
    confirmado_en: { timestampValue: TS(0) } });
  return { id, tel, cot, ven };
}

(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }
  const proxy = await crearProxy({ puerto: PUERTO_PROXY });

  /* ── A. Simulación: incluye las referencias y no toca nada ─────────────── */
  console.log("=== A · Simulación: enseña también cotizaciones y ventas ===");
  await limpiar();
  const casA = await crearCaso("3209700001");
  const a = await ejecutar(["--id", casA.id]);
  chk("A · la simulación termina bien", a.codigo === 0, "código " + a.codigo);
  chk("A · anuncia la cotización que desasociaría", /1 cotización\(es\)/.test(a.salida));
  chk("A · anuncia la venta que desasociaría", /1 venta\(s\)/.test(a.salida));
  chk("A · avisa de que no ha borrado nada", /SIMULACIÓN\. No se ha borrado nada/.test(a.salida));
  chk("A · el prospecto sigue existiendo", await existe(`crm_leads/${casA.id}`));
  chk("A · las 2 notas siguen existiendo", (await listar(`crm_leads/${casA.id}/notas`)).length === 2);
  chk("A · el marcador sigue existiendo", await existe(`crm_dedup/${casA.tel}`));
  chk("A · la cotización sigue apuntando al prospecto",
    val((await fetch(`${FS}/crm_quotes/${casA.cot}`, { headers: OWNER }).then((r) => r.json())).fields, "lead_id") === casA.id);

  /* ── B. Aborto sin la palabra de confirmación ──────────────────────────── */
  console.log("\n=== B · Aborto: no se escribe SUPRIMIR ===");
  const b = await ejecutar(["--id", casA.id, "--confirmar"], "NO");
  chk("B · aborta con código 1", b.codigo === 1, "código " + b.codigo);
  chk("B · dice que no ha borrado nada", /No se ha borrado nada/.test(b.salida));
  chk("B · el prospecto sigue ahí", await existe(`crm_leads/${casA.id}`));
  chk("B · las notas siguen ahí", (await listar(`crm_leads/${casA.id}/notas`)).length === 2);

  /* ── C. Supresión completa ─────────────────────────────────────────────── */
  console.log("\n=== C · Supresión completa ===");
  const c = await ejecutar(["--id", casA.id, "--confirmar"], "SUPRIMIR");
  chk("C · termina bien", c.codigo === 0, "código " + c.codigo);
  chk("C · informa de que el prospecto quedó ausente", /prospecto ausente ✓/.test(c.salida));
  chk("C · informa de 0 notas restantes", /notas restantes 0 ✓/.test(c.salida));
  chk("C · informa de 0 referencias vivas", /referencias vivas 0 ✓/.test(c.salida));
  chk("C · el prospecto ya no existe", !(await existe(`crm_leads/${casA.id}`)));
  chk("C · las notas ya no existen", (await listar(`crm_leads/${casA.id}/notas`)).length === 0);
  chk("C · el marcador ya no existe", !(await existe(`crm_dedup/${casA.tel}`)));
  chk("C · la cotización sigue existiendo pero DESASOCIADA",
    val((await fetch(`${FS}/crm_quotes/${casA.cot}`, { headers: OWNER }).then((r) => r.json())).fields, "lead_id") === DESASOCIADO);
  chk("C · la venta sigue existiendo pero DESASOCIADA",
    val((await fetch(`${FS}/crm_sales/${casA.ven}`, { headers: OWNER }).then((r) => r.json())).fields, "lead_id") === DESASOCIADO);
  chk("C · el importe de la venta se conserva (registro comercial)",
    val((await fetch(`${FS}/crm_sales/${casA.ven}`, { headers: OWNER }).then((r) => r.json())).fields, "monto") === "99900");
  const refsVivas = (await listar("crm_quotes")).filter((q) => val(q.fields, "lead_id") === casA.id)
    .concat((await listar("crm_sales")).filter((v) => val(v.fields, "lead_id") === casA.id));
  chk("C · ninguna referencia apunta ya al prospecto suprimido", refsVivas.length === 0);
  const nuevo = crypto.randomUUID();
  const reAlta = await commit([
    { update: { name: `${PREFIJO}/crm_leads/${nuevo}`, fields: {
      nombre: { stringValue: "Nueva persona" }, telefono: { stringValue: casA.tel },
      industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
      consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: "uid-r04" },
      historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" } } } },
    { update: { name: `${PREFIJO}/crm_dedup/${casA.tel}`, fields: {
      lead_id: { stringValue: nuevo }, creado_en: { timestampValue: TS(0) },
      creado_por: { stringValue: "uid-r04" } } } },
  ]);
  chk("C · el número vuelve a estar disponible", reAlta === 200, "HTTP " + reAlta);
  chk("C · el registro de supresión no guarda datos personales",
    !fs.existsSync(REGISTRO) || !/Persona|primera nota/.test(fs.readFileSync(REGISTRO, "utf8")));

  /* ── D. Fallo al desasociar: NO se destruye el prospecto ───────────────── */
  console.log("\n=== D · Fallo parcial al desasociar referencias ===");
  await limpiar(); proxy.limpiarReglas();
  const casD = await crearCaso("3209700002");
  proxy.regla({ id: "patch-refs", veces: 1,
    prueba: (i) => i.method === "PATCH" && /\/crm_quotes\//.test(i.url), accion: "500" });
  const d = await ejecutar(["--id", casD.id, "--confirmar"], "SUPRIMIR", proxy.urlBase);
  chk("D · termina con código distinto de cero", d.codigo !== 0, "código " + d.codigo);
  chk("D · se declara INCOMPLETO", /INCOMPLETO/.test(d.salida));
  chk("D · el prospecto NO se ha borrado (queda reparable)", await existe(`crm_leads/${casD.id}`));
  chk("D · las notas NO se han tocado todavía",
    (await listar(`crm_leads/${casD.id}/notas`)).length === 2);
  chk("D · el marcador sigue en su sitio", await existe(`crm_dedup/${casD.tel}`));

  proxy.limpiarReglas();
  const d2 = await ejecutar(["--id", casD.id, "--confirmar"], "SUPRIMIR", proxy.urlBase);
  chk("D · al repetirlo sin el fallo, se completa", d2.codigo === 0, "código " + d2.codigo);
  chk("D · y no queda ninguna referencia viva",
    (await listar("crm_quotes")).filter((q) => val(q.fields, "lead_id") === casD.id).length === 0);
  chk("D · el prospecto queda eliminado", !(await existe(`crm_leads/${casD.id}`)));

  /* ── E. Fallo al borrar una nota ───────────────────────────────────────── */
  console.log("\n=== E · Fallo parcial al borrar una nota ===");
  await limpiar(); proxy.limpiarReglas();
  const casE = await crearCaso("3209700003");
  proxy.regla({ id: "delete-nota", veces: 1,
    prueba: (i) => (i.method === "DELETE" && /\/notas\//.test(i.url)) || (i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && /notas/.test(i.cuerpo || "")), accion: "500" });
  const e = await ejecutar(["--id", casE.id, "--confirmar"], "SUPRIMIR", proxy.urlBase);
  chk("E · termina con código distinto de cero", e.codigo !== 0, "código " + e.codigo);
  chk("E · el prospecto NO se ha borrado", await existe(`crm_leads/${casE.id}`));
  chk("E · el marcador sigue reservando el número", await existe(`crm_dedup/${casE.tel}`));
  proxy.limpiarReglas();
  const e2 = await ejecutar(["--id", casE.id, "--confirmar"], "SUPRIMIR", proxy.urlBase);
  chk("E · la repetición completa la supresión", e2.codigo === 0, "código " + e2.codigo);
  chk("E · no quedan notas", (await listar(`crm_leads/${casE.id}/notas`)).length === 0);
  chk("E · el marcador ya no existe", !(await existe(`crm_dedup/${casE.tel}`)));

  /* ── F. Fallo al borrar el marcador ────────────────────────────────────── */
  console.log("\n=== F · Fallo parcial al borrar el marcador del número ===");
  await limpiar(); proxy.limpiarReglas();
  const casF = await crearCaso("3209700004");
  proxy.regla({ id: "delete-marcador", veces: 1,
    prueba: (i) => (i.method === "DELETE" && /\/crm_dedup\//.test(i.url)) || (i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && /crm_dedup/.test(i.cuerpo || "")), accion: "500" });
  const f = await ejecutar(["--id", casF.id, "--confirmar"], "SUPRIMIR", proxy.urlBase);
  chk("F · termina con código distinto de cero", f.codigo !== 0, "código " + f.codigo);
  chk("F · el prospecto NO se ha borrado (el número seguiría reservado)", await existe(`crm_leads/${casF.id}`));
  proxy.limpiarReglas();
  const f2 = await ejecutar(["--id", casF.id, "--confirmar"], "SUPRIMIR", proxy.urlBase);
  chk("F · la repetición completa la supresión", f2.codigo === 0, "código " + f2.codigo);
  chk("F · el número queda libre", !(await existe(`crm_dedup/${casF.tel}`)));

  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO R04/R05: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
