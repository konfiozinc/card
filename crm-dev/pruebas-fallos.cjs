/* KZ-CRM-018 · Inyección de fallos sobre migración y reversión.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   QUÉ SE EXIGE, EN CADA CASO
     1. Código de salida ≠ 0. Ningún fallo puede terminar «en verde».
     2. Si el fallo ocurre DESPUÉS de escrituras parciales: el procedimiento queda en
        estado RECUPERABLE, conserva la información y se reanuda sin duplicar nada.
     3. Los errores de listado NUNCA se interpretan como «colección vacía» (R03/R08).

   LO QUE ESTA PRUEBA NO DECLARA
   No hay atomicidad global en la migración: escribe prospecto a prospecto. Lo que se
   demuestra es que cada corte deja un estado del que se puede salir sin perder datos ni
   duplicarlos. La reversión tampoco es atómica; sí es recuperable.

   Ejecutar:
     firebase emulators:exec --only firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-fallos.cjs"
*/

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { crearProxy } = require("./lib/proxy-fallos.cjs");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const SCRIPT = path.join(__dirname, "migrar-uuid.cjs");
const MAPA = path.join(__dirname, "migracion-uuid.json");
const RESP = path.join(__dirname, "migracion-respaldo.json");
const PUERTO_PROXY = 8099;

const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

/* ── REST ───────────────────────────────────────────────────────────────── */
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
const leerDoc = async (ruta) => {
  const r = await fetch(`${FS}/${ruta}`, { headers: OWNER });
  return r.ok ? r.json() : null;
};
const crear = async (ruta, fields, id) => {
  const r = await fetch(`${FS}/${ruta}` + (id ? `?documentId=${encodeURIComponent(id)}` : ""),
    { method: "POST", headers: OWNER, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`POST ${ruta}: HTTP ${r.status}`);
  return (await r.json()).name.split("/").pop();
};
const borrar = async (ruta) => { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); };

/* ── ejecución del procedimiento, con y sin proxy ───────────────────────── */
const medio = (accion) => accion === "directo" ? `http://127.0.0.1:8080/v1/${PREFIJO}` : null;

/** Ejecuta el procedimiento y devuelve código y salida.
 *  DEBE ser asíncrono: el proxy de fallos vive en ESTE proceso, y una llamada síncrona
 *  bloquearía el bucle de eventos que tiene que atender al hijo. Fue un interbloqueo
 *  real la primera vez que se escribió esta prueba. */
const correr = (args, url = null) => new Promise((resolve) => {
  const hijo = spawn(process.execPath, [SCRIPT, "--emulador", ...args],
    { env: { ...process.env, ...(url ? { KZ_FIRESTORE_URL: url } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  hijo.on("exit", (codigo, senal) => resolve({ codigo, senal, salida }));
});

/** Lanza el procedimiento y devuelve los medios para matarlo y recoger su salida. */
function lanzar(args, url) {
  const hijo = spawn(process.execPath, [SCRIPT, "--emulador", ...args],
    { env: { ...process.env, KZ_FIRESTORE_URL: url }, stdio: ["ignore", "pipe", "pipe"] });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  const terminado = new Promise((resolve) => {
    hijo.on("exit", (codigo, senal) => resolve({ codigo, senal, salida }));
  });
  return { hijo, terminado };
}

/* ── datos de prueba ────────────────────────────────────────────────────── */
const UID = "uid-ficticio-fallos";
const leadAntiguo = (tel) => ({
  nombre: { stringValue: "Antiguo " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "contactado" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: UID },
  historial: { arrayValue: { values: [{ stringValue: "nota heredada" }] } },
  origen: { stringValue: "manual" },
});

async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) await borrar(`crm_leads/${l.id}/notas/${n.id}`);
    await borrar(`crm_leads/${l.id}`);
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup"]) {
    for (const d of await listar(c)) await borrar(`${c}/${d.id}`);
  }
  for (const f of [MAPA, RESP]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

async function sembrar(tels) {
  for (const tel of tels) {
    await crear("crm_leads", leadAntiguo(tel), tel);
    await crear(`crm_leads/${tel}/notas`, {
      texto: { stringValue: "nota vieja de " + tel }, autor: { stringValue: UID },
      fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } });
  }
  const cot = await crear("crm_quotes", {
    lead_id: { stringValue: tels[0] }, plan: { stringValue: "pro" },
    monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
    estado: { stringValue: "enviada" }, creado_por: { stringValue: UID },
    creado_en: { timestampValue: TS(0) } });
  const ven = await crear("crm_sales", {
    lead_id: { stringValue: tels[0] }, quote_id: { stringValue: cot },
    monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
    confirmado_por: { stringValue: UID }, confirmado_en: { timestampValue: TS(0) } });
  return { cot, ven };
}

const esUuid4 = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));

/** Teléfonos con MÁS DE UN prospecto migrado (id UUID). Lo que nunca debe quedar.
 *  OJO: la migración NO borra el documento heredado —eso es deliberado—, así que cada
 *  teléfono migrado tiene por diseño dos documentos: el heredado (id = teléfono) y el
 *  nuevo (id = UUID). Contarlos todos marcaría un falso duplicado; el duplicado real es
 *  tener DOS documentos UUID para el mismo número. */
async function migracionesDuplicadas() {
  const leads = await listar("crm_leads");
  const cuenta = new Map();
  for (const l of leads) {
    if (!esUuid4(l.id)) continue;
    const t = val(l.fields, "telefono");
    cuenta.set(t, (cuenta.get(t) || 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([t, n]) => `${t}×${n}`);
}

const leerMapa = () => (fs.existsSync(MAPA) ? JSON.parse(fs.readFileSync(MAPA, "utf8")) : null);

/* ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  /* Guardia: sin emulador no se ejecuta nada. */
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }

  const proxy = await crearProxy({ puerto: PUERTO_PROXY });

  /* ── 1. HTTP 503 durante el inventario ─────────────────────────────────── */
  console.log("=== 1 · HTTP 503 al inventariar prospectos ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500001", "3209500002"]);
  proxy.regla({ id: "sin-inventario", veces: 1,
    prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url) && !/pageToken/.test(i.url),
    accion: "503" });
  const f1 = await correr(["--confirmar"], proxy.urlBase);
  chk("1 · termina con código distinto de cero", f1.codigo !== 0, "código " + f1.codigo);
  chk("1 · informa del fallo de listado, no de éxito", /No se pudo listar|ERROR/.test(f1.salida));
  chk("1 · NO interpreta el error como «colección vacía»",
    !/Nada que migrar/.test(f1.salida) && !/prospectos: 0/.test(f1.salida));
  chk("1 · no escribió el mapa ni el respaldo", !fs.existsSync(MAPA) && !fs.existsSync(RESP));
  chk("1 · no creó marcadores", (await listar("crm_dedup")).length === 0);
  chk("1 · no creó prospectos", (await listar("crm_leads")).length === 2);

  /* ── 2. Fallo de paginación: la primera página llega, la segunda falla ─── */
  console.log("\n=== 2 · Fallo de paginación en el inventario ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500003", "3209500004"]);
  proxy.regla({ id: "pagina-rota", prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url),
    accion: "paginar", fallarSegunda: true });
  const f2 = await correr(["--confirmar"], proxy.urlBase);
  chk("2 · termina con código distinto de cero", f2.codigo !== 0, "código " + f2.codigo);
  chk("2 · detecta el fallo de la segunda página",
    /No se pudo listar.*HTTP 503/.test(f2.salida), f2.salida.split("\n").filter((l) => /listar|ERROR/.test(l))[0]);
  chk("2 · no migró nada a medias", (await listar("crm_dedup")).length === 0 && !fs.existsSync(MAPA));

  /* ── 2 bis. Paginación COMPLETA: se recorren todas las páginas ─────────── */
  console.log("\n=== 2 bis · El inventario recorre TODAS las páginas (R08) ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500005", "3209500006", "3209500007", "3209500008"]);
  proxy.regla({ id: "pagina-doble", prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url),
    accion: "paginar", fallarSegunda: false });
  const f2b = await correr(["--confirmar"], proxy.urlBase);
  chk("2 bis · termina bien con la lista repartida en dos páginas", f2b.codigo === 0, "código " + f2b.codigo);
  chk("2 bis · ve los 4 prospectos, no sólo la primera página",
    /Prospectos: 4/.test(f2b.salida), (f2b.salida.match(/Prospectos: \d+/) || [])[0]);
  chk("2 bis · migra los 4", (await listar("crm_dedup")).length === 4);

  /* ── 3. Error de lectura de la subcolección de notas ───────────────────── */
  console.log("\n=== 3 · Error de lectura de las notas ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500009", "3209500010"]);
  proxy.regla({ id: "notas-ilegibles", prueba: (i) => i.method === "GET" && /\/notas(\?|$)/.test(i.url),
    accion: "503", veces: 2 });
  const f3 = await correr(["--confirmar"], proxy.urlBase);
  chk("3 · termina con código distinto de cero", f3.codigo !== 0, "código " + f3.codigo);
  chk("3 · no da por bueno un prospecto cuyas notas no pudo leer",
    /No se pudo listar|ERROR/.test(f3.salida));

  /* ── 4. Error durante el commit ────────────────────────────────────────── */
  console.log("\n=== 4 · Error durante el commit (escritura rechazada) ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500011", "3209500012"]);
  proxy.regla({ id: "commit-roto", prueba: (i) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]),
    accion: "500", veces: 1 });
  const f4 = await correr(["--confirmar"], proxy.urlBase);
  chk("4 · termina con código distinto de cero", f4.codigo !== 0, "código " + f4.codigo);
  chk("4 · informa del fallo de commit", /commit falló|ERROR/.test(f4.salida));
  const mapa4 = leerMapa();
  chk("4 · la entrada queda PENDIENTE, no «hecho»",
    mapa4 && Object.values(mapa4).every((e) => e.estado === "pendiente"),
    mapa4 ? JSON.stringify(Object.values(mapa4).map((e) => e.estado)) : "sin mapa");
  chk("4 · no hay migraciones duplicadas tras el fallo", (await migracionesDuplicadas()).length === 0);
  proxy.limpiarReglas();
  const r4 = await correr(["--confirmar"], proxy.urlBase);
  chk("4 · la reanudación completa sin duplicar", r4.codigo === 0, "código " + r4.codigo);
  chk("4 · no quedan migraciones duplicadas del mismo número", (await migracionesDuplicadas()).length === 0, (await migracionesDuplicadas()).join(","));
  chk("4 · quedan 2 heredados + 2 migrados", (await listar("crm_leads")).length === 4);
  chk("4 · todas las entradas pasan a «hecho»",
    Object.values(leerMapa()).every((e) => e.estado === "hecho"));

  /* ── 5. Error durante el patch de referencias ──────────────────────────── */
  console.log("\n=== 5 · Error al repuntar una cotización ===");
  await limpiar(); proxy.limpiarReglas();
  const { cot: cot5 } = await sembrar(["3209500013", "3209500014"]);
  proxy.regla({ id: "patch-roto", prueba: (i) => i.method === "PATCH" && /\/crm_quotes\//.test(i.url),
    accion: "500", veces: 1 });
  const f5 = await correr(["--confirmar"], proxy.urlBase);
  chk("5 · termina con código distinto de cero", f5.codigo !== 0, "código " + f5.codigo);
  const mapa5 = leerMapa();
  chk("5 · la entrada NO se marca como terminada (repunte incompleto)",
    mapa5 && Object.values(mapa5).some((e) => e.estado === "pendiente"),
    mapa5 ? JSON.stringify(Object.values(mapa5).map((e) => e.estado)) : "sin mapa");
  proxy.limpiarReglas();
  const r5 = await correr(["--confirmar"], proxy.urlBase);
  chk("5 · la reanudación repunta y termina bien", r5.codigo === 0, "código " + r5.codigo);
  const uuid5 = leerMapa()["3209500013"].uuid;
  chk("5 · la cotización acaba apuntando al UUID",
    val((await leerDoc(`crm_quotes/${cot5}`)).fields, "lead_id") === uuid5);
  chk("5 · sin migraciones duplicadas", (await migracionesDuplicadas()).length === 0);

  /* ── 6. INTERRUPCIÓN durante la migración (escritura aplicada, respuesta perdida) ── */
  console.log("\n=== 6 · Interrupción durante la migración ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500015", "3209500016"]);
  proxy.regla({ id: "corte-migracion", veces: 1,
    prueba: (i, c) => i.method === "POST" && /:commit$/.test(i.url.split("?")[0]) && c.commit === 2,
    accion: "colgar-despues" });
  const m6 = lanzar(["--confirmar"], proxy.urlBase);
  await proxy.esperar("corte-migracion");
  m6.hijo.kill();
  const fin6 = await m6.terminado;
  chk("6 · el proceso interrumpido no termina en verde", fin6.codigo !== 0 || fin6.senal != null,
    "código " + fin6.codigo + " · señal " + fin6.senal);
  chk("6 · la intención quedó escrita ANTES del commit (mapa presente)", fs.existsSync(MAPA));
  const mapa6 = leerMapa();
  chk("6 · el mapa guarda el UUID ya elegido", mapa6 && Object.keys(mapa6).length >= 1,
    mapa6 ? Object.keys(mapa6).length + " entradas" : "sin mapa");

  /* Ésta es la comprobación que hace la prueba DISCRIMINANTE. El corte ocurre cuando el
     almacén YA aplicó la segunda escritura y la respuesta no llegó. Si el mapa se
     escribiera DESPUÉS del commit (como antes), en este instante tendría una sola
     entrada y la reanudación inventaría un UUID nuevo para el segundo teléfono: dos
     prospectos migrados del mismo número. Con la intención escrita antes, hay dos. */
  const uuidLeads6 = (await listar("crm_leads")).filter((l) => esUuid4(l.id));
  chk("6 · el commit en vuelo SÍ se había aplicado (2 prospectos con UUID)",
    uuidLeads6.length === 2, uuidLeads6.length + " UUID");
  chk("6 · el mapa ya tenía las DOS intenciones antes del corte",
    Object.keys(mapa6 || {}).length === 2, Object.keys(mapa6 || {}).length + " entradas");

  const uuidElegido6 = mapa6 && Object.values(mapa6).map((e) => e.uuid);
  proxy.limpiarReglas();
  const r6 = await correr(["--confirmar"], proxy.urlBase);
  chk("6 · la reanudación termina bien", r6.codigo === 0, "código " + r6.codigo);
  chk("6 · NO se duplicó ninguna migración del mismo número", (await migracionesDuplicadas()).length === 0,
    (await migracionesDuplicadas()).join(","));
  chk("6 · el UUID elegido antes del corte se reutiliza, no se inventa otro",
    uuidElegido6.every((u) => Object.values(leerMapa()).some((e) => e.uuid === u)));
  chk("6 · quedan 2 heredados + 2 migrados", (await listar("crm_leads")).length === 4);
  chk("6 · tras reanudar siguen siendo 2 UUID, no 3",
    (await listar("crm_leads")).filter((l) => esUuid4(l.id)).length === 2);
  chk("6 · las notas heredadas siguen intactas",
    (await listar("crm_leads/3209500015/notas")).length === 1);

  /* ── 7. INTERRUPCIÓN durante la reversión ──────────────────────────────── */
  console.log("\n=== 7 · Interrupción durante la reversión ===");
  await limpiar(); proxy.limpiarReglas();
  const { cot: cot7 } = await sembrar(["3209500017", "3209500018"]);
  const mig7 = await correr(["--confirmar"]);
  chk("7 · preparación: la migración termina bien", mig7.codigo === 0, "código " + mig7.codigo);
  const uuid7 = leerMapa()["3209500017"].uuid;
  proxy.regla({ id: "corte-reversion", veces: 1,
    prueba: (i) => i.method === "DELETE" && /\/notas\//.test(i.url), accion: "colgar-despues" });
  const m7 = lanzar(["--revertir", "--confirmar"], proxy.urlBase);
  await proxy.esperar("corte-reversion");
  m7.hijo.kill();
  const fin7 = await m7.terminado;
  chk("7 · la reversión interrumpida no termina en verde", fin7.codigo !== 0 || fin7.senal != null,
    "código " + fin7.codigo + " · señal " + fin7.senal);
  chk("7 · el mapa se conserva para poder reanudar", fs.existsSync(MAPA));
  chk("7 · el mapa anota que la reversión de esa entrada ya empezó",
    Object.values(leerMapa()).some((e) => e.reversion === "iniciada"),
    JSON.stringify(Object.values(leerMapa()).map((e) => e.reversion)));
  proxy.limpiarReglas();
  const r7 = await correr(["--revertir", "--confirmar"], proxy.urlBase);
  chk("7 · la reanudación de la reversión termina bien", r7.codigo === 0, "código " + r7.codigo);
  chk("7 · informa de reversión completa", /REVERSIÓN COMPLETA/.test(r7.salida));
  chk("7 · no queda ningún prospecto migrado", !(await leerDoc(`crm_leads/${uuid7}`)));
  chk("7 · los heredados conservan su información", (await listar("crm_leads")).length === 2);
  chk("7 · los marcadores desaparecieron", (await listar("crm_dedup")).length === 0);
  chk("7 · la cotización volvió al identificador heredado",
    val((await leerDoc(`crm_quotes/${cot7}`)).fields, "lead_id") === "3209500017");
  chk("7 · el mapa se elimina al completar", !fs.existsSync(MAPA));

  /* ── 8. Reversión: fallo de lectura del inventario (no debe interpretarse como vacío) ── */
  console.log("\n=== 8 · Reversión con el inventario ilegible ===");
  await limpiar(); proxy.limpiarReglas();
  await sembrar(["3209500019", "3209500020"]);
  const mig8 = await correr(["--confirmar"]);
  chk("8 · preparación: la migración termina bien", mig8.codigo === 0, "código " + mig8.codigo);
  proxy.regla({ id: "inventario-ciego", veces: 1,
    prueba: (i) => i.method === "GET" && /\/crm_leads(\?|$)/.test(i.url), accion: "503" });
  const f8 = await correr(["--revertir", "--confirmar"], proxy.urlBase);
  chk("8 · la reversión se detiene con código distinto de cero", f8.codigo !== 0, "código " + f8.codigo);
  chk("8 · no revierte a ciegas", !/REVERSIÓN COMPLETA/.test(f8.salida));
  chk("8 · no borró nada: el prospecto migrado sigue existiendo",
    (await listar("crm_leads")).length === 4);
  chk("8 · el mapa se conserva", fs.existsSync(MAPA));

  proxy.limpiarReglas();
  await proxy.cerrar();
  console.log("\nRESULTADO FALLOS: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch(async (e) => { console.error("ERROR: " + e.message); process.exit(2); });
