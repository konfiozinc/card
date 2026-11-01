/* KZ-CRM-018 · PRUEBAS DE CONCURRENCIA — supresión segura y reversión con precondiciones.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   LOS CUATRO ESCENARIOS QUE LA MISIÓN EXIGE DEMOSTRAR
     1. Una nota NO puede crearse mientras existe el testigo crm_supresion/{leadId}
        (y tampoco un cambio de estado, una cotización ni una venta).
     2. Una modificación posterior a la lectura IMPIDE el borrado: la precondición
        updateTime hace que el almacén rechace el borrado en vez de destruir a ciegas.
     3. Dos operaciones que compiten no pierden datos: ni cuando todas prosperan sin
        testigo, ni cuando el testigo rechaza las que llegan tarde.
     4. Una supresión INTERRUMPIDA se reanuda y termina sin destruir información nueva:
        durante la interrupción el testigo sigue bloqueando, y lo que se intentó crear
        en ese hueco nunca llegó a existir.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-concurrencia.cjs"
*/

const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { crearProxy } = require("./lib/proxy-fallos.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const PUERTO_PROXY = 8094;
const SCRIPT_SUP = path.join(__dirname, "suprimir-datos.cjs");

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);
const H = (tok) => ({ authorization: "Bearer " + tok, "content-type": "application/json" });

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
const estadoHTTP = (ruta, tok) => fetch(`${FS}/${ruta}`, { headers: tok ? H(tok) : OWNER }).then((r) => r.status);
const leerDoc = (ruta, tok) => fetch(`${FS}/${ruta}`, { headers: tok ? H(tok) : OWNER })
  .then((r) => r.ok ? r.json() : null);
const commit = (writes, tok) => fetch(`${FS}:commit`, { method: "POST", headers: tok ? H(tok) : OWNER,
  body: JSON.stringify({ writes }) }).then((r) => r.status);

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) }).then((r) => r.json());
};
const sembrarRol = (uid, rol) => commit([{ update: { name: `${PREFIJO}/crm_usuarios/${uid}`, fields: {
  rol: { stringValue: rol }, activo: { booleanValue: true } } } }]).then((s) => s);

const camposLead = (tel, uid) => ({
  nombre: { stringValue: "Concurrencia " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
});

/** Crea prospecto + marcador (como el panel) y devuelve su id. */
const crearLead = async (tel, uid) => {
  const id = crypto.randomUUID();
  const s = await commit([
    { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: camposLead(tel, uid) } },
    { update: { name: `${PREFIJO}/crm_dedup/${tel}`, fields: { lead_id: { stringValue: id },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid } } } },
  ]);
  if (s !== 200) throw new Error("no se pudo sembrar el prospecto: HTTP " + s);
  return id;
};

/* La regla exige autor == request.auth.uid, asi que la nota se firma con el uid real. */
let AUTOR = "";
const nota = (leadId, texto, tok) => fetch(`${FS}/crm_leads/${leadId}/notas`, {
  method: "POST", headers: H(tok), body: JSON.stringify({ fields: {
    texto: { stringValue: texto }, autor: { stringValue: AUTOR },
    fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } } }) }).then((r) => r.status);

const ponerTestigo = (leadId) => commit([{ update: { name: `${PREFIJO}/crm_supresion/${leadId}`, fields: {
  estado: { stringValue: "preparado" }, desde: { timestampValue: TS(0) },
  id_sha256: { stringValue: "prueba" } } } }]);
const quitarTestigo = (leadId) => fetch(`${FS}/crm_supresion/${leadId}`,
  { method: "DELETE", headers: OWNER }).then((r) => r.status);

/** Lanza el procedimiento de supresión; devuelve medios para matarlo y su salida. */
function lanzarSupresion(id, url) {
  const hijo = spawn(process.execPath, [SCRIPT_SUP, "--emulador", "--id", id, "--confirmar"],
    { env: { ...process.env, KZ_FIRESTORE_URL: url }, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  try { hijo.stdin.write("SUPRIMIR\n"); hijo.stdin.end(); } catch { /* ya cerrado */ }
  const terminado = new Promise((res) => hijo.on("exit", (codigo, senal) => res({ codigo, senal, salida })));
  return { hijo, terminado };
}
const correrSupresion = (id, url) => new Promise((resolve) => {
  const m = lanzarSupresion(id, url);
  m.terminado.then(resolve);
});

async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) {
      await fetch(`${FS}/crm_leads/${l.id}/notas/${n.id}`, { method: "DELETE", headers: OWNER });
    }
    await fetch(`${FS}/crm_leads/${l.id}`, { method: "DELETE", headers: OWNER });
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup", "crm_supresion", "crm_config"]) {
    for (const d of await listar(c)) await fetch(`${FS}/${c}/${d.id}`, { method: "DELETE", headers: OWNER });
  }
}

(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }
  const proxy = await crearProxy({ puerto: PUERTO_PROXY });

  await limpiar();
  const admin = await altaUsuario("admin-conc@test.local");
  await sembrarRol(admin.localId, "admin");
  const UID = admin.localId, TOK = admin.idToken;
  AUTOR = UID;

  /* ══ 1 · El testigo bloquea las cuatro vías de escritura ══════════════ */
  console.log("=== 1 · Una nota no puede crearse mientras existe el testigo ===");
  const L1 = await crearLead("3209500001", UID);
  chk("1 · preparación: se crea una nota sin testigo", (await nota(L1, "nota previa", TOK)) === 200);
  const cotId1 = await fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(TOK), body: JSON.stringify({ fields: {
    lead_id: { stringValue: L1 }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
    creado_por: { stringValue: UID }, creado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.ok ? r.json().then((j) => j.name.split("/").pop()) : null);
  chk("1 · preparación: se crea una cotización sin testigo", !!cotId1);

  chk("1 · se escribe el testigo crm_supresion", (await ponerTestigo(L1)) === 200);
  chk("1 · con testigo, la NOTA se rechaza", (await nota(L1, "nota intrusa", TOK)) === 403);
  chk("1 · con testigo, el CAMBIO DE ESTADO se rechaza",
    (await fetch(`${FS}/crm_leads/${L1}?updateMask.fieldPaths=estado`, { method: "PATCH", headers: H(TOK),
      body: JSON.stringify({ fields: { estado: { stringValue: "contactado" } } }) }).then((r) => r.status)) === 403);
  chk("1 · con testigo, una COTIZACIÓN nueva se rechaza",
    (await fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(TOK), body: JSON.stringify({ fields: {
      lead_id: { stringValue: L1 }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
      moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
      creado_por: { stringValue: UID }, creado_en: { timestampValue: TS(0) } } }) }).then((r) => r.status)) === 403);
  chk("1 · con testigo, una VENTA se rechaza",
    (await fetch(`${FS}/crm_sales?documentId=${cotId1}`, { method: "POST", headers: H(TOK), body: JSON.stringify({ fields: {
      lead_id: { stringValue: L1 }, quote_id: { stringValue: cotId1 }, monto: { integerValue: 99900 },
      moneda: { stringValue: "COP" }, confirmado_por: { stringValue: UID },
      confirmado_en: { timestampValue: TS(0) } } }) }).then((r) => r.status)) === 403);

  chk("1 · no se perdió ni se duplicó ninguna nota", (await listar(`crm_leads/${L1}/notas`)).length === 1);
  chk("1 · el estado del prospecto no cambió",
    val((await leerDoc(`crm_leads/${L1}`)).fields, "estado") === "nuevo");
  chk("1 · no se creó ninguna venta", (await listar("crm_sales")).length === 0);

  chk("1 · al retirar el testigo se libera la escritura", (await quitarTestigo(L1)) === 200);
  chk("1 · control positivo: la nota vuelve a estar permitida", (await nota(L1, "nota posterior", TOK)) === 200);
  chk("1 · ahora hay dos notas", (await listar(`crm_leads/${L1}/notas`)).length === 2);

  /* ══ 2 · updateTime impide borrar lo que cambió tras la lectura ═══════ */
  console.log("\n=== 2 · Una modificación posterior a la lectura impide el borrado ===");
  const L2 = await crearLead("3209500002", UID);
  const ut1 = (await leerDoc(`crm_leads/${L2}`)).updateTime;
  chk("2 · se lee el updateTime inicial", !!ut1);
  chk("2 · se modifica el prospecto después de la lectura",
    (await fetch(`${FS}/crm_leads/${L2}?updateMask.fieldPaths=estado`, { method: "PATCH", headers: OWNER,
      body: JSON.stringify({ fields: { estado: { stringValue: "contactado" } } }) }).then((r) => r.status)) === 200);
  const ut2 = (await leerDoc(`crm_leads/${L2}`)).updateTime;
  chk("2 · el updateTime cambió", ut1 !== ut2);

  const borradoObsoleto = await commit([{ delete: `${PREFIJO}/crm_leads/${L2}`,
    currentDocument: { updateTime: ut1 } }]);
  chk("2 · el borrado con el updateTime OBSOLETO se rechaza",
    borradoObsoleto !== 200 && borradoObsoleto !== 404, "HTTP " + borradoObsoleto);
  chk("2 · el prospecto sigue existiendo tras el intento", (await estadoHTTP(`crm_leads/${L2}`, TOK)) === 200);
  chk("2 · la modificación posterior se conserva",
    val((await leerDoc(`crm_leads/${L2}`)).fields, "estado") === "contactado");
  chk("2 · el borrado con el updateTime VIGENTE se acepta",
    (await commit([{ delete: `${PREFIJO}/crm_leads/${L2}`, currentDocument: { updateTime: ut2 } }])) === 200);
  chk("2 · y el prospecto ya no está", (await estadoHTTP(`crm_leads/${L2}`, TOK)) === 404);

  /* ══ 3 · Dos operaciones que compiten no pierden datos ════════════════ */
  console.log("\n=== 3 · Operaciones que compiten no pierden datos ===");
  const L3 = await crearLead("3209500003", UID);
  const textiles = Array.from({ length: 8 }, (_, i) => "simultánea " + i);
  const res1 = await Promise.all(textiles.map((t) => nota(L3, t, TOK)));
  chk("3 · sin testigo, las 8 notas simultáneas se aceptan", res1.every((s) => s === 200), res1.join(","));
  const guardadas = (await listar(`crm_leads/${L3}/notas`)).map((n) => val(n.fields, "texto")).sort();
  chk("3 · no se pierde ninguna: están las 8, exactamente", guardadas.length === 8, guardadas.length + "");

  await ponerTestigo(L3);
  const res2 = await Promise.all(
    Array.from({ length: 8 }, (_, i) => nota(L3, "tarde " + i, TOK)));
  chk("3 · con testigo, las 8 que llegan tarde se rechazan", res2.every((s) => s === 403), res2.join(","));
  chk("3 · la nota simultánea no se perdió: siguen las 8",
    (await listar(`crm_leads/${L3}/notas`)).length === 8);
  chk("3 · ninguna nota a medias: no hay texto de las rechazadas",
    !(await listar(`crm_leads/${L3}/notas`)).some((n) => /tarde/.test(String(val(n.fields, "texto")))));
  await quitarTestigo(L3);

  /* ══ 4 · Supresión interrumpida: el testigo aguanta y se reanuda ══════ */
  console.log("\n=== 4 · Una supresión interrumpida se reanuda sin destruir nada nuevo ===");
  const L4 = await crearLead("3209500004", UID);
  await nota(L4, "nota uno antes de suprimir", TOK);
  await nota(L4, "nota dos antes de suprimir", TOK);
  const cotId4 = await fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(TOK), body: JSON.stringify({ fields: {
    lead_id: { stringValue: L4 }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
    creado_por: { stringValue: UID }, creado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.ok ? r.json().then((j) => j.name.split("/").pop()) : null);
  chk("4 · preparación: prospecto con 2 notas y 1 cotización", !!cotId4);

  proxy.limpiarReglas();
  proxy.regla({ id: "corte-supresion", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && /notas/.test(i.cuerpo || ""),
    accion: "colgar-despues" });
  const m = lanzarSupresion(L4, proxy.urlBase);
  await proxy.esperar("corte-supresion");
  m.hijo.kill();
  const fin = await m.terminado;
  chk("4 · la supresión interrumpida no termina en verde", fin.codigo !== 0 || fin.senal != null,
    "código " + fin.codigo + " · señal " + fin.senal);
  chk("4 · el testigo sigue puesto tras la interrupción", (await estadoHTTP(`crm_supresion/${L4}`, TOK)) === 200);
  chk("4 · el prospecto NO se borró", (await estadoHTTP(`crm_leads/${L4}`, TOK)) === 200);

  const intrusa = await nota(L4, "nota que intenta colarse en el hueco", TOK);
  chk("4 · durante la interrupción el testigo sigue bloqueando notas", intrusa === 403, "HTTP " + intrusa);
  chk("4 · esa nota nunca llegó a existir",
    !(await listar(`crm_leads/${L4}/notas`)).some((n) => /colarse/.test(String(val(n.fields, "texto")))));

  proxy.limpiarReglas();
  const fin4 = await correrSupresion(L4, proxy.urlBase);
  chk("4 · la reanudación completa la supresión", fin4.codigo === 0, "código " + fin4.codigo);
  chk("4 · el prospecto quedó eliminado", (await estadoHTTP(`crm_leads/${L4}`, TOK)) === 404);
  chk("4 · no quedan notas accesibles", (await listar(`crm_leads/${L4}/notas`)).length === 0);
  chk("4 · el marcador del número se liberó", (await estadoHTTP(`crm_dedup/3209500004`, TOK)) === 404);
  chk("4 · la cotización quedó DESASOCIADA",
    val((await leerDoc(`crm_quotes/${cotId4}`)).fields, "lead_id") === "suprimido");
  chk("4 · el testigo se liberó al completar", (await estadoHTTP(`crm_supresion/${L4}`, TOK)) === 404);

  /* ══ 5 · La ventana lectura→testigo: modificación concurrente al adquirirlo ══ */
  console.log("\n=== 5 · Modificación concurrente durante la adquisición del testigo ===");
  const lanzarScript = (script, args, url) => {
    const hijo = spawn(process.execPath, [path.join(__dirname, script), "--emulador", ...args],
      { env: { ...process.env, ...(url ? { KZ_FIRESTORE_URL: url } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    hijo.stdout.on("data", (d) => { salida += d; });
    hijo.stderr.on("data", (d) => { salida += d; });
    return { hijo, terminado: new Promise((res) => hijo.on("exit", (c, s) => res({ codigo: c, senal: s, salida }))) };
  };

  const TEL_R = "3209500005";
  await fetch(`${FS}/crm_leads?documentId=${TEL_R}`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: camposLead(TEL_R, UID) }) });
  await nota(TEL_R, "nota heredada antes de migrar", TOK);
  const finMig = await lanzarScript("migrar-uuid.cjs", ["--confirmar"], null).terminado;
  chk("5 · preparación: la migración termina bien", finMig.codigo === 0, "código " + finMig.codigo);
  const migradosR = (await listar("crm_leads"))
    .filter((l) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(l.id) && val(l.fields, "telefono") === TEL_R);
  chk("5 · el prospecto migrado existe con UUID", migradosR.length === 1, migradosR.length + "");
  const uuidR = migradosR.length ? migradosR[0].id : null;

  proxy.limpiarReglas();
  proxy.regla({ id: "testigo-en-vuelo", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && /crm_supresion/.test(i.cuerpo || ""),
    accion: "colgar-despues" });
  const rev = lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase);
  await proxy.esperar("testigo-en-vuelo");
  chk("5 · el testigo ya está escrito con la reversión en vuelo",
    (await estadoHTTP(`crm_supresion/${uuidR}`, TOK)) === 200);
  const intrusaR = await nota(uuidR, "nota que llega durante la adquisición", TOK);
  chk("5 · una modificación concurrente durante la adquisición se rechaza", intrusaR === 403, "HTTP " + intrusaR);
  rev.hijo.kill();
  const finRev = await rev.terminado;
  chk("5 · la reversión interrumpida no termina en verde", finRev.codigo !== 0 || finRev.senal != null);
  chk("5 · el prospecto migrado NO se perdió", (await estadoHTTP(`crm_leads/${uuidR}`, TOK)) === 200);
  chk("5 · la nota concurrente nunca existió (sin pérdida silenciosa)",
    !(await listar(`crm_leads/${uuidR}/notas`)).some((n) => /durante la adquisición/.test(String(val(n.fields, "texto")))));
  chk("5 · las notas previas siguen intactas", (await listar(`crm_leads/${uuidR}/notas`)).length === 1);

  proxy.limpiarReglas();
  const rev2 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("5 · la reanudación completa la reversión", rev2.codigo === 0, "código " + rev2.codigo);
  chk("5 · el migrado se retiró y el heredado sigue",
    (await estadoHTTP(`crm_leads/${uuidR}`, TOK)) === 404 && (await estadoHTTP(`crm_leads/${TEL_R}`, TOK)) === 200);
  chk("5 · no quedó ningún testigo", (await estadoHTTP(`crm_supresion/${uuidR}`, TOK)) === 404);
  /* ══ 6 · B1-B4: fallo cerrado, precondiciones y recuperación ═════════ */
  console.log("\n=== 6 · B1-B4 · precondiciones obligatorias y recuperación ===");
  const fs = require("node:fs");
  const MAPA = path.join(__dirname, "migracion-uuid.json");
  const RESP = path.join(__dirname, "migracion-respaldo.json");
  const resetMigracion = async () => {
    await limpiar();
    for (const f of [MAPA, RESP]) if (fs.existsSync(f)) fs.unlinkSync(f);
  };
  const prepararMigrado = async (tel) => {
    await fetch(`${FS}/crm_leads?documentId=${tel}`, { method: "POST", headers: OWNER,
      body: JSON.stringify({ fields: camposLead(tel, UID) }) });
    await nota(tel, "nota heredada " + tel, TOK);
    const fin = await lanzarScript("migrar-uuid.cjs", ["--confirmar"], null).terminado;
    const m = (await listar("crm_leads"))
      .filter((l) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(l.id) && val(l.fields, "telefono") === tel);
    return { fin, uuid: m.length ? m[0].id : null };
  };

  /* 6.1 · La simulación no escribe nada */
  await resetMigracion();
  const p1 = await prepararMigrado("3209500006");
  chk("6.1 · preparación: prospecto migrado con su nota", p1.fin.codigo === 0 && !!p1.uuid);
  const sim = await lanzarScript("migrar-uuid.cjs", ["--revertir"], null).terminado;
  chk("6.1 · la simulación termina sin error", sim.codigo === 0, "código " + sim.codigo);
  chk("6.1 · la simulación NO crea testigos", (await listar("crm_supresion")).length === 0);
  chk("6.1 · la simulación no borra el prospecto", (await estadoHTTP(`crm_leads/${p1.uuid}`, TOK)) === 200);

  /* 6.2 · B1 · GET del updateTime caído: no se borra sin precondición */
  proxy.limpiarReglas();
  proxy.regla({ id: "get-nota-falla", veces: 1,
    prueba: (i) => i.method === "GET" && /\/notas\/[^/?]+/.test(i.url), accion: "500" });
  const r62 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("6.2 · con el GET de updateTime caído, la reversión ABORTA", r62.codigo !== 0, "código " + r62.codigo);
  chk("6.2 · el prospecto migrado sigue existiendo", (await estadoHTTP(`crm_leads/${p1.uuid}`, TOK)) === 200);
  chk("6.2 · la nota no se destruyó", (await listar(`crm_leads/${p1.uuid}/notas`)).length === 1);

  /* 6.3 · B2 · GET del marcador caído: el marcador no se borra a ciegas */
  await resetMigracion();
  const p3 = await prepararMigrado("3209500007");
  proxy.limpiarReglas();
  proxy.regla({ id: "get-marcador-falla", veces: 1,
    prueba: (i) => i.method === "GET" && /\/crm_dedup\//.test(i.url), accion: "500" });
  const r63 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("6.3 · con el GET del marcador caído, ABORTA", r63.codigo !== 0, "código " + r63.codigo);
  chk("6.3 · el marcador sigue intacto", (await estadoHTTP("crm_dedup/3209500007", TOK)) === 200);
  chk("6.3 · el prospecto migrado sigue existiendo", (await estadoHTTP(`crm_leads/${p3.uuid}`, TOK)) === 200);

  /* 6.4 · B4 · interrupción con varios testigos, recuperación y reanudación */
  await resetMigracion();
  const pa = await prepararMigrado("3209500008");
  await fetch(`${FS}/crm_leads?documentId=3209500009`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: camposLead("3209500009", UID) }) });
  await nota("3209500009", "nota heredada 3209500009", TOK);
  const mig2 = await lanzarScript("migrar-uuid.cjs", ["--confirmar"], null).terminado;
  chk("6.4 · preparación: dos prospectos migrados", mig2.codigo === 0, "código " + mig2.codigo);
  chk("6.4 · hay dos testigos posibles y cero antes de revertir", (await listar("crm_supresion")).length === 0);

  proxy.limpiarReglas();
  proxy.regla({ id: "corte-borrado-lead", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && /crm_leads\/[0-9a-f]{8}-/.test(i.cuerpo || "") && /"delete"/.test(i.cuerpo || ""),
    accion: "colgar-antes" });
  const revI = lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase);
  await proxy.esperar("corte-borrado-lead");
  revI.hijo.kill();
  const finI = await revI.terminado;
  chk("6.4 · la reversión interrumpida no termina en verde", finI.codigo !== 0 || finI.senal != null);
  const testigosPend = await listar("crm_supresion");
  chk("6.4 · quedan testigos de reversión tras el corte", testigosPend.length === 2, testigosPend.length + "");

  proxy.limpiarReglas();
  const limpia1 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--limpiar-testigos"], proxy.urlBase).terminado;
  chk("6.4 · con trabajo pendiente, la limpieza NO retira los testigos", limpia1.codigo === 3, "código " + limpia1.codigo);
  chk("6.4 · los dos testigos siguen protegiendo", (await listar("crm_supresion")).length === 2);

  const reanuda = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("6.4 · la reanudación completa la reversión", reanuda.codigo === 0, "código " + reanuda.codigo);
  chk("6.4 · los migrados se retiraron", (await estadoHTTP(`crm_leads/${pa.uuid}`, TOK)) === 404);
  chk("6.4 · los heredados siguen existiendo con su nota",
    (await estadoHTTP("crm_leads/3209500008", TOK)) === 200 &&
    (await listar("crm_leads/3209500008/notas")).length === 1);
  chk("6.4 · no queda ningún testigo tras completar y verificar", (await listar("crm_supresion")).length === 0);

  const limpia2 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--limpiar-testigos"], proxy.urlBase).terminado;
  chk("6.4 · la limpieza es idempotente y termina bien", limpia2.codigo === 0, "código " + limpia2.codigo);
  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO CONCURRENCIA: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
