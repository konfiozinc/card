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
const fs = require("node:fs");
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
  /* AISLAMIENTO · El mapa y el respaldo de la migración viven en disco, no en el emulador: si
     una corrida anterior se cortó a mitad —o terminó a propósito con el mapa vivo, como T02 y
     T06— la siguiente empezaría con entradas fantasma. Eso producía un fallo intermitente de
     la sección 5 que no tenía nada que ver con una carrera: se borran aquí. */
  for (const f of ["migracion-uuid.json", "migracion-respaldo.json"]) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
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
  chk("5 · la reanudación completa la reversión", rev2.codigo === 0, "código " + rev2.codigo + " · " + String(rev2.salida).replace(/\s+/g, " ").slice(-320));
  chk("5 · el migrado se retiró y el heredado sigue",
    (await estadoHTTP(`crm_leads/${uuidR}`, TOK)) === 404 && (await estadoHTTP(`crm_leads/${TEL_R}`, TOK)) === 200);
  chk("5 · no quedó ningún testigo", (await estadoHTTP(`crm_supresion/${uuidR}`, TOK)) === 404);
  /* ══ 6 · B1-B4: fallo cerrado, precondiciones y recuperación ═════════ */
  console.log("\n=== 6 · B1-B4 · precondiciones obligatorias y recuperación ===");
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
  /* ══ 7 · T01-T10: pruebas discriminantes del modelo de estado validado ══ */
  console.log("\n=== 7 · Pruebas discriminantes (estado validado y política HTTP) ===");
  const snapshot = async () => {
    const leads = await listar("crm_leads"), cots = await listar("crm_quotes"), vens = await listar("crm_sales");
    const notas = [];
    for (const l of leads) notas.push([l.id, (await listar(`crm_leads/${l.id}/notas`)).length]);
    return JSON.stringify({ l: leads.map((x) => x.id).sort(), c: cots.map((x) => x.id + ":" + val(x.fields, "lead_id")).sort(),
      v: vens.map((x) => x.id + ":" + val(x.fields, "lead_id")).sort(), n: notas.sort(), w: (await listar("crm_supresion")).map((x) => x.id).sort() });
  };

  /* T01 · GET que devuelve 404 falso mientras el documento existe */
  await resetMigracion();
  const t1 = await prepararMigrado("3209500011");
  chk("T01 · preparación", t1.fin.codigo === 0 && !!t1.uuid);
  proxy.limpiarReglas();
  proxy.regla({ id: "404-falso-lead", veces: 1,
    prueba: (i) => i.method === "GET" && /\/crm_leads\/[0-9a-f]{8}-/.test(i.url) && !/notas/.test(i.url),
    accion: "404" });
  const antesT01 = await snapshot();
  const rT01 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T01 · un 404 falso hace ABORTAR la reversión", rT01.codigo !== 0, "código " + rT01.codigo);
  chk("T01 · el estado completo no cambió", (await snapshot()) === antesT01);
  chk("T01 · el prospecto existe de verdad", (await estadoHTTP(`crm_leads/${t1.uuid}`, TOK)) === 200);

  /* T02 · :commit que devuelve 404 → nunca se toma como éxito */
  await resetMigracion();
  const t2 = await prepararMigrado("3209500012");
  chk("T02 · preparación", t2.fin.codigo === 0 && !!t2.uuid);
  proxy.limpiarReglas();
  proxy.regla({ id: "404-commit", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && /"delete"/.test(i.cuerpo || ""),
    accion: "404" });
  const rT02 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T02 · el 404 del commit NO se declara éxito", rT02.codigo !== 0, "código " + rT02.codigo);
  chk("T02 · la salida lo reporta como fallo", /404/i.test(rT02.salida), "código " + rT02.codigo);
  chk("T02 · el prospecto no se dio por revertido",
    (await estadoHTTP(`crm_leads/${t2.uuid}`, TOK)) === 200 || (await listar("crm_supresion")).length > 0);

  /* T03 · marcador repuntado: no puede eliminarse en silencio */
  await resetMigracion();
  const t3 = await prepararMigrado("3209500013");
  const otroUuid = crypto.randomUUID();
  await commit([
    { update: { name: `${PREFIJO}/crm_leads/${otroUuid}`, fields: camposLead("3209500014", UID) } },
    { update: { name: `${PREFIJO}/crm_dedup/3209500013`, fields: { lead_id: { stringValue: otroUuid },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: UID } } } },
  ]);
  const antesT03 = await snapshot();
  const rT03 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T03 · un marcador repuntado impide la reversión", rT03.codigo !== 0, "código " + rT03.codigo);
  chk("T03 · el estado completo no cambió", (await snapshot()) === antesT03);
  chk("T03 · el marcador NO se eliminó",
    val((await leerDoc("crm_dedup/3209500013")).fields, "lead_id") === otroUuid);

  /* T06 · HTTP 500 al retirar el testigo final */
  await resetMigracion();
  const t6 = await prepararMigrado("3209500015");
  proxy.limpiarReglas();
  proxy.regla({ id: "500-quitar-testigo", veces: 1,
    prueba: (i) => i.method === "DELETE" && /\/crm_supresion\//.test(i.url), accion: "500" });
  const rT06 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T06 · un 500 al retirar el testigo ABORTA", rT06.codigo !== 0, "código " + rT06.codigo);
  chk("T06 · el testigo sigue puesto (protege el trabajo pendiente)",
    (await listar("crm_supresion")).length >= 1);
  const mapaT06 = JSON.parse(fs.readFileSync(MAPA, "utf8"));
  chk("T06 · la entrada NO se marca como terminada",
    Object.values(mapaT06).every((x) => x.reversion !== "hecha"), JSON.stringify(Object.values(mapaT06).map((x) => x.reversion)));

  /* T09 · simulación sin ninguna escritura (estado byte a byte) */
  await resetMigracion();
  const t9 = await prepararMigrado("3209500016");
  const antesT09 = await snapshot();
  const rT09 = await lanzarScript("migrar-uuid.cjs", ["--revertir"], proxy.urlBase).terminado;
  chk("T09 · la simulación termina bien", rT09.codigo === 0, "código " + rT09.codigo);
  chk("T09 · no escribió absolutamente nada", (await snapshot()) === antesT09);

  /* T10 · reversión completa sin conflictos */
  await resetMigracion();
  const t10 = await prepararMigrado("3209500017");
  const rT10 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T10 · la reversión completa termina bien", rT10.codigo === 0, "código " + rT10.codigo);
  chk("T10 · el migrado se retiró", (await estadoHTTP(`crm_leads/${t10.uuid}`, TOK)) === 404);
  chk("T10 · el heredado conserva su nota",
    (await estadoHTTP("crm_leads/3209500017", TOK)) === 200 && (await listar("crm_leads/3209500017/notas")).length === 1);
  chk("T10 · no quedan testigos ni mapa", (await listar("crm_supresion")).length === 0 && !fs.existsSync(MAPA));

  /* ═══════════════════════════════════════════════════════════════════════════════════
     T04, T05, T07 y T08 · las cuatro pruebas que faltaban de la reversión.
     Cada una mide las seis cosas que la misión exige: resultado del proceso, estado de
     TODOS los documentos afectados, conservación de lo que otro escribió a la vez, estado
     del mapa, estado de los testigos y recuperación con idempotencia.
     ═══════════════════════════════════════════════════════════════════════════════════ */
  const leerMapa = () => JSON.parse(fs.readFileSync(MAPA, "utf8"));
  const crearCotizacion = (leadId) => fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(TOK),
    body: JSON.stringify({ fields: {
      lead_id: { stringValue: leadId }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
      moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
      creado_por: { stringValue: UID }, creado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.ok ? r.json().then((j) => j.name.split("/").pop()) : null);
  const crearVenta = (leadId, cotId) => fetch(`${FS}/crm_sales?documentId=${cotId}`, { method: "POST", headers: H(TOK),
    body: JSON.stringify({ fields: {
      lead_id: { stringValue: leadId }, quote_id: { stringValue: cotId }, monto: { integerValue: 99900 },
      moneda: { stringValue: "COP" }, confirmado_por: { stringValue: UID },
      confirmado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.ok ? r.json().then((j) => j.name.split("/").pop()) : null);
  /** Prospecto heredado (id = teléfono) con nota y, opcionalmente, cotización y venta vivas. */
  const prepararMigradoConRefs = async (tel, opciones = {}) => {
    await fetch(`${FS}/crm_leads?documentId=${tel}`, { method: "POST", headers: OWNER,
      body: JSON.stringify({ fields: camposLead(tel, UID) }) });
    await nota(tel, "nota heredada " + tel, TOK);
    let cot = null, ven = null;
    if (opciones.cotizacion || opciones.venta) cot = await crearCotizacion(tel);
    if (opciones.venta) ven = await crearVenta(tel, cot);
    const fin = await lanzarScript("migrar-uuid.cjs", ["--confirmar"], null).terminado;
    const m = (await listar("crm_leads"))
      .filter((l) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(l.id) && val(l.fields, "telefono") === tel);
    return { fin, uuid: m.length ? m[0].id : null, cot, ven };
  };
  /* Coincide SÓLO con el commit que borra el prospecto migrado: la comilla que sigue al
     identificador excluye los borrados de sus notas (/crm_leads/<uuid>/notas/...). */
  const borradoDeLead = (uuid) => (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) &&
    /"delete"/.test(i.cuerpo || "") && (i.cuerpo || "").includes(`/crm_leads/${uuid}"`);

  /* ── T04 · COTIZACIÓN MODIFICADA DURANTE EL REPUNTE ────────────────────────
     El repunte de la cotización usa updateMask(lead_id) con precondición updateTime. La
     prueba hace una escritura REAL de fuera de banda —no una simulación del proxy— justo
     antes de que se reenvíe ese commit: el almacén sube el updateTime de la cotización y la
     precondición queda obsoleta. Lo que se mide es que la reversión NO pise el cambio. */
  console.log("\n--- T04 · cotización modificada durante el repunte ---");
  await resetMigracion();
  const TEL04 = "3209500018";
  const p04 = await prepararMigradoConRefs(TEL04, { cotizacion: true });
  chk("T04 · preparación: migrado con cotización viva", p04.fin.codigo === 0 && !!p04.uuid && !!p04.cot);
  chk("T04 · la cotización apunta al UUID tras migrar",
    val((await leerDoc(`crm_quotes/${p04.cot}`)).fields, "lead_id") === p04.uuid);

  proxy.limpiarReglas();
  proxy.regla({ id: "cot-modificada", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) &&
      (i.cuerpo || "").includes("/crm_quotes/" + p04.cot) && /"lead_id"/.test(i.cuerpo || ""),
    accion: "inmutar",
    mutar: { method: "PATCH", url: `/v1/${PREFIJO}/crm_quotes/${p04.cot}?updateMask.fieldPaths=estado`,
      fields: { estado: { stringValue: "aceptada" } } } });
  const r04 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T04 · la reversión NO declara éxito", r04.codigo !== 0, "código " + r04.codigo);
  chk("T04 · se reporta como precondición rechazada",
    /precondici[óo]n rechazada \(HTTP (400|409)\)/i.test(r04.salida),
    String(r04.salida).replace(/\s+/g, " ").slice(-160));
  const cot04 = (await leerDoc(`crm_quotes/${p04.cot}`)).fields;
  chk("T04 · la modificación concurrente se conserva", val(cot04, "estado") === "aceptada");
  chk("T04 · el repunte NO se aplicó: sigue apuntando al UUID", val(cot04, "lead_id") === p04.uuid);
  chk("T04 · el prospecto migrado no se borró", (await estadoHTTP(`crm_leads/${p04.uuid}`, TOK)) === 200);
  chk("T04 · la nota del migrado sobrevive", (await listar(`crm_leads/${p04.uuid}/notas`)).length === 1);
  chk("T04 · el heredado no se tocó", (await estadoHTTP(`crm_leads/${TEL04}`, TOK)) === 200);
  chk("T04 · el marcador sigue apuntando al migrado",
    val((await leerDoc(`crm_dedup/${TEL04}`)).fields, "lead_id") === p04.uuid);
  chk("T04 · el testigo queda protegiendo el trabajo pendiente",
    (await estadoHTTP(`crm_supresion/${p04.uuid}`, TOK)) === 200);
  chk("T04 · el mapa marca la entrada como INICIADA, no terminada",
    leerMapa()[TEL04].reversion === "iniciada", String(leerMapa()[TEL04].reversion));

  proxy.limpiarReglas();
  const r04b = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T04 · la reanudación completa la reversión", r04b.codigo === 0, "código " + r04b.codigo);
  const cot04b = (await leerDoc(`crm_quotes/${p04.cot}`)).fields;
  chk("T04 · al reanudar sí se repunta la cotización", val(cot04b, "lead_id") === TEL04);
  chk("T04 · la modificación concurrente SOBREVIVE a la reanudación", val(cot04b, "estado") === "aceptada");
  chk("T04 · el migrado se retiró y el heredado conserva su nota",
    (await estadoHTTP(`crm_leads/${p04.uuid}`, TOK)) === 404 &&
    (await listar(`crm_leads/${TEL04}/notas`)).length === 1);
  chk("T04 · sin testigos, sin marcador y sin mapa",
    (await listar("crm_supresion")).length === 0 &&
    (await estadoHTTP(`crm_dedup/${TEL04}`, TOK)) === 404 && !fs.existsSync(MAPA));
  const lim04 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--limpiar-testigos"], proxy.urlBase).terminado;
  chk("T04 · la limpieza de testigos es idempotente", lim04.codigo === 0, "código " + lim04.codigo);

  /* ── T05 · VENTA MODIFICADA DURANTE EL REPUNTE ─────────────────────────────
     La misma precondición protege el repunte de la venta (B3). Aquí el cambio concurrente
     es de negocio —el importe— y debe sobrevivir intacto. */
  console.log("\n--- T05 · venta modificada durante el repunte ---");
  await resetMigracion();
  const TEL05 = "3209500019";
  const p05 = await prepararMigradoConRefs(TEL05, { venta: true });
  chk("T05 · preparación: migrado con cotización y venta vivas",
    p05.fin.codigo === 0 && !!p05.uuid && !!p05.cot && !!p05.ven);
  chk("T05 · la venta apunta al UUID tras migrar",
    val((await leerDoc(`crm_sales/${p05.ven}`)).fields, "lead_id") === p05.uuid);

  proxy.limpiarReglas();
  proxy.regla({ id: "venta-modificada", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) &&
      (i.cuerpo || "").includes("/crm_sales/" + p05.ven) && /"lead_id"/.test(i.cuerpo || ""),
    accion: "inmutar",
    mutar: { method: "PATCH", url: `/v1/${PREFIJO}/crm_sales/${p05.ven}?updateMask.fieldPaths=monto`,
      fields: { monto: { integerValue: 120000 } } } });
  const r05 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T05 · la reversión NO declara éxito", r05.codigo !== 0, "código " + r05.codigo);
  chk("T05 · se reporta como precondición rechazada",
    /precondici[óo]n rechazada \(HTTP (400|409)\)/i.test(r05.salida),
    String(r05.salida).replace(/\s+/g, " ").slice(-160));
  const ven05 = (await leerDoc(`crm_sales/${p05.ven}`)).fields;
  chk("T05 · el cambio de importe se conserva", String(val(ven05, "monto")) === "120000");
  chk("T05 · el repunte NO se aplicó: sigue apuntando al UUID", val(ven05, "lead_id") === p05.uuid);
  chk("T05 · la cotización hermana sí se repuntó antes del fallo",
    val((await leerDoc(`crm_quotes/${p05.cot}`)).fields, "lead_id") === TEL05);
  chk("T05 · el prospecto migrado no se borró", (await estadoHTTP(`crm_leads/${p05.uuid}`, TOK)) === 200);
  chk("T05 · la nota del migrado sobrevive", (await listar(`crm_leads/${p05.uuid}/notas`)).length === 1);
  chk("T05 · el heredado no se tocó", (await estadoHTTP(`crm_leads/${TEL05}`, TOK)) === 200);
  chk("T05 · el testigo queda protegiendo el trabajo pendiente",
    (await estadoHTTP(`crm_supresion/${p05.uuid}`, TOK)) === 200);
  chk("T05 · el mapa marca la entrada como INICIADA, no terminada",
    leerMapa()[TEL05].reversion === "iniciada", String(leerMapa()[TEL05].reversion));

  proxy.limpiarReglas();
  const r05b = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T05 · la reanudación completa la reversión", r05b.codigo === 0, "código " + r05b.codigo);
  const ven05b = (await leerDoc(`crm_sales/${p05.ven}`)).fields;
  chk("T05 · al reanudar sí se repunta la venta", val(ven05b, "lead_id") === TEL05);
  chk("T05 · el importe concurrente SOBREVIVE a la reanudación", String(val(ven05b, "monto")) === "120000");
  chk("T05 · el migrado se retiró y el heredado conserva su nota",
    (await estadoHTTP(`crm_leads/${p05.uuid}`, TOK)) === 404 &&
    (await listar(`crm_leads/${TEL05}/notas`)).length === 1);
  chk("T05 · sin testigos, sin marcador y sin mapa",
    (await listar("crm_supresion")).length === 0 &&
    (await estadoHTTP(`crm_dedup/${TEL05}`, TOK)) === 404 && !fs.existsSync(MAPA));

  /* ── T07 · UNA ENTRADA TERMINADA Y OTRA PENDIENTE ──────────────────────────
     El mapa guarda el avance por entrada. Al reanudar, la entrada ya terminada no puede
     bloquear a la pendiente ni volver a procesarse (ni volver a poner su testigo). */
  console.log("\n--- T07 · una entrada terminada y otra pendiente ---");
  await resetMigracion();
  const TA07 = "3209500021", TB07 = "3209500022";
  /* Dos migraciones separadas para fijar el orden del mapa: A primero, B después. */
  const pa07 = await prepararMigrado(TA07);
  const pb07 = await prepararMigrado(TB07);
  chk("T07 · preparación: dos entradas en el mapa, en orden",
    pa07.fin.codigo === 0 && pb07.fin.codigo === 0 &&
    Object.keys(leerMapa()).join(",") === [TA07, TB07].join(","));

  proxy.limpiarReglas();
  proxy.regla({ id: "corte-entrada-b", veces: 1, prueba: borradoDeLead(pb07.uuid), accion: "colgar-antes" });
  const rev07 = lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase);
  await proxy.esperar("corte-entrada-b");
  rev07.hijo.kill();
  const fin07 = await rev07.terminado;
  chk("T07 · la reversión interrumpida no termina en verde", fin07.codigo !== 0 || fin07.senal != null);
  const mapa07 = leerMapa();
  chk("T07 · la primera entrada quedó TERMINADA", mapa07[TA07] && mapa07[TA07].reversion === "hecha",
    String(mapa07[TA07] && mapa07[TA07].reversion));
  chk("T07 · la segunda quedó PENDIENTE", mapa07[TB07] && mapa07[TB07].reversion !== "hecha",
    String(mapa07[TB07] && mapa07[TB07].reversion));
  chk("T07 · la entrada terminada ya no tiene testigo",
    (await estadoHTTP(`crm_supresion/${pa07.uuid}`, TOK)) === 404);
  chk("T07 · la entrada pendiente SÍ conserva su testigo",
    (await estadoHTTP(`crm_supresion/${pb07.uuid}`, TOK)) === 200);
  chk("T07 · la terminada se revirtió del todo",
    (await estadoHTTP(`crm_leads/${pa07.uuid}`, TOK)) === 404 &&
    (await estadoHTTP(`crm_leads/${TA07}`, TOK)) === 200 &&
    (await listar(`crm_leads/${TA07}/notas`)).length === 1);
  chk("T07 · la pendiente sigue a medias y sin perder su heredado",
    (await estadoHTTP(`crm_leads/${pb07.uuid}`, TOK)) === 200 &&
    (await estadoHTTP(`crm_leads/${TB07}`, TOK)) === 200 &&
    (await estadoHTTP(`crm_dedup/${TB07}`, TOK)) === 200);

  proxy.limpiarReglas();
  const r07 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T07 · la reanudación completa lo pendiente pese a haber una entrada terminada",
    r07.codigo === 0, "código " + r07.codigo + " · " + String(r07.salida).replace(/\s+/g, " ").slice(-200));
  chk("T07 · la entrada terminada NO se vuelve a procesar",
    !String(r07.salida).includes(TA07 + " ← "), String(r07.salida).replace(/\s+/g, " ").slice(-200));
  chk("T07 · la pendiente sí se procesó", String(r07.salida).includes(TB07 + " ← "));
  chk("T07 · ambas revertidas, ambos heredados con su nota",
    (await estadoHTTP(`crm_leads/${pa07.uuid}`, TOK)) === 404 &&
    (await estadoHTTP(`crm_leads/${pb07.uuid}`, TOK)) === 404 &&
    (await listar(`crm_leads/${TA07}/notas`)).length === 1 &&
    (await listar(`crm_leads/${TB07}/notas`)).length === 1);
  chk("T07 · no queda ningún testigo huérfano de la entrada terminada",
    (await listar("crm_supresion")).length === 0);
  chk("T07 · el mapa se retira al terminar todo", !fs.existsSync(MAPA));
  const r07b = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T07 · reanudar sin mapa es idempotente y termina bien", r07b.codigo === 0, "código " + r07b.codigo);

  /* ── T08 · RESPUESTA PERDIDA DESPUÉS DE APLICAR UNA ESCRITURA ─────────────
     La escritura llega al almacén y la respuesta se pierde: el procedimiento no puede saber
     si se aplicó. Lo que se exige es que (a) no lo dé por hecho, (b) no repita a ciegas, y
     (c) al reanudar reconozca lo ya aplicado y cierre sin duplicar ni perder nada. */
  console.log("\n--- T08 · respuesta perdida después de aplicar una escritura ---");
  await resetMigracion();
  const TEL08 = "3209500023";
  const p08 = await prepararMigradoConRefs(TEL08, { cotizacion: true });
  chk("T08 · preparación: migrado con cotización y nota",
    p08.fin.codigo === 0 && !!p08.uuid && !!p08.cot);

  proxy.limpiarReglas();
  proxy.regla({ id: "respuesta-perdida-lead", veces: 1, prueba: borradoDeLead(p08.uuid), accion: "cortar-despues" });
  const r08 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T08 · la reversión NO declara éxito sin respuesta", r08.codigo !== 0, "código " + r08.codigo);
  chk("T08 · el fallo se reporta como falta de respuesta al almacén",
    /sin respuesta del almac[ée]n/i.test(r08.salida), String(r08.salida).replace(/\s+/g, " ").slice(-160));
  chk("T08 · la escritura SÍ se había aplicado (la ventana es real)",
    (await estadoHTTP(`crm_leads/${p08.uuid}`, TOK)) === 404);
  chk("T08 · el repunte de la cotización sí se aplicó antes del corte",
    val((await leerDoc(`crm_quotes/${p08.cot}`)).fields, "lead_id") === TEL08);
  chk("T08 · el marcador quedó pendiente (no se borró a ciegas)",
    (await estadoHTTP(`crm_dedup/${TEL08}`, TOK)) === 200);
  chk("T08 · el heredado y su nota siguen intactos",
    (await estadoHTTP(`crm_leads/${TEL08}`, TOK)) === 200 &&
    (await listar(`crm_leads/${TEL08}/notas`)).length === 1);
  chk("T08 · el testigo sigue protegiendo el trabajo a medias",
    (await estadoHTTP(`crm_supresion/${p08.uuid}`, TOK)) === 200);
  chk("T08 · el mapa NO da la entrada por terminada",
    leerMapa()[TEL08].reversion === "iniciada", String(leerMapa()[TEL08].reversion));

  const r08b = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T08 · la reanudación reconoce lo ya aplicado y termina", r08b.codigo === 0,
    "código " + r08b.codigo + " · " + String(r08b.salida).replace(/\s+/g, " ").slice(-240));
  chk("T08 · el marcador se retiró al reanudar", (await estadoHTTP(`crm_dedup/${TEL08}`, TOK)) === 404);
  chk("T08 · el testigo se liberó", (await listar("crm_supresion")).length === 0);
  chk("T08 · el mapa se retiró", !fs.existsSync(MAPA));
  chk("T08 · el heredado conserva su nota y la cotización su repunte",
    (await estadoHTTP(`crm_leads/${TEL08}`, TOK)) === 200 &&
    (await listar(`crm_leads/${TEL08}/notas`)).length === 1 &&
    val((await leerDoc(`crm_quotes/${p08.cot}`)).fields, "lead_id") === TEL08);

  /* T08.2 · la respuesta perdida en la ÚLTIMA escritura: no queda nada por hacer y la
     reanudación debe cerrar el expediente sin escribir de más. */
  await resetMigracion();
  const TEL082 = "3209500024";
  const p082 = await prepararMigrado(TEL082);
  chk("T08.2 · preparación: migrado con su nota", p082.fin.codigo === 0 && !!p082.uuid);
  proxy.limpiarReglas();
  proxy.regla({ id: "respuesta-perdida-marcador", veces: 1,
    prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) &&
      /"delete"/.test(i.cuerpo || "") && (i.cuerpo || "").includes(`/crm_dedup/${TEL082}`),
    accion: "cortar-despues" });
  const r082 = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T08.2 · la reversión NO declara éxito sin respuesta", r082.codigo !== 0, "código " + r082.codigo);
  chk("T08.2 · el borrado del marcador sí se había aplicado",
    (await estadoHTTP(`crm_dedup/${TEL082}`, TOK)) === 404);
  chk("T08.2 · el testigo sigue puesto y el mapa sin terminar",
    (await estadoHTTP(`crm_supresion/${p082.uuid}`, TOK)) === 200 &&
    leerMapa()[TEL082].reversion === "iniciada");
  const r082b = await lanzarScript("migrar-uuid.cjs", ["--revertir", "--confirmar"], proxy.urlBase).terminado;
  chk("T08.2 · la reanudación cierra sin nada más que escribir", r082b.codigo === 0,
    "código " + r082b.codigo + " · " + String(r082b.salida).replace(/\s+/g, " ").slice(-240));
  chk("T08.2 · estado final coherente: sin migrado, sin testigo, sin mapa, heredado intacto",
    (await estadoHTTP(`crm_leads/${p082.uuid}`, TOK)) === 404 &&
    (await listar("crm_supresion")).length === 0 && !fs.existsSync(MAPA) &&
    (await listar(`crm_leads/${TEL082}/notas`)).length === 1);

  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO CONCURRENCIA: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
