/* KZ-CRM-018 · Supresión de datos personales — PROCEDIMIENTO PRIVILEGIADO.
   INTERNO: crm-dev/ no se publica.

   POR QUÉ EXISTE (A02, opción 2 aprobada): las reglas ya NO permiten vaciar el
   historial ni borrar notas desde el navegador —el historial es inmutable incluso
   para el administrador—. Suprimir datos personales exige, por tanto, este
   procedimiento, que se ejecuta desde un equipo de confianza con la sesión de
   `firebase login`. Ninguna credencial privilegiada llega al frontend.

   SALVAGUARDAS
     · Proyecto y base FIJADOS en el código; aborta si se intenta otro.
     · SIN --confirmar sólo simula: enseña qué documentos borraría y no toca nada.
     · Exige el identificador exacto del prospecto y una segunda confirmación escrita.
     · Borra las notas de la subcolección ANTES del prospecto.
     · R04: DESASOCIA las cotizaciones y las ventas del prospecto (lead_id →
       "suprimido"). Antes sólo se borraban prospecto, notas y marcador, así que las
       referencias comerciales seguían apuntando a la persona suprimida: el dato no
       estaba realmente suprimido. Se conserva el importe —registro comercial que no
       identifica a nadie— y se corta el enlace personal.
     · Verifica después que todo quedó realmente eliminado Y que no queda ninguna
       referencia viva al prospecto.
     · Escribe un registro mínimo SIN datos personales: no guarda nombre, teléfono
       ni el contenido de las notas, sólo un hash del identificador y los conteos.

   Uso:
     node crm-dev/suprimir-datos.cjs --id <leadId>                    # simulación
     node crm-dev/suprimir-datos.cjs --id <leadId> --confirmar         # ejecuta (pide confirmación)
     node crm-dev/suprimir-datos.cjs --id <leadId> --emulador --confirmar   # pruebas
*/

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const PROYECTO_REAL = "kzfio-crm";
const BASE_REAL = "default";

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] || true) : null;
};
const bandera = (nombre) => process.argv.includes(nombre);

const EMULADOR = bandera("--emulador");
const CONFIRMAR = bandera("--confirmar");
const ID = arg("--id");

if (!ID || ID === true) {
  console.error("Falta el identificador del prospecto.\n  node crm-dev/suprimir-datos.cjs --id <leadId> [--emulador] [--confirmar]");
  process.exit(2);
}

/* Proyecto y base NO se aceptan por parámetro: se fijan aquí. */
const PROYECTO = EMULADOR ? "demo-crm-016" : PROYECTO_REAL;
const BASE = BASE_REAL;
if (!EMULADOR && PROYECTO !== PROYECTO_REAL) {
  console.error("ABORTADO: este script sólo opera sobre " + PROYECTO_REAL);
  process.exit(1);
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROYECTO) {
  console.error("ABORTADO: GCLOUD_PROJECT apunta a otro proyecto (" + process.env.GCLOUD_PROJECT + ")");
  process.exit(1);
}

const DOCS = EMULADOR
  ? (process.env.KZ_FIRESTORE_URL || `http://127.0.0.1:8080/v1/projects/${PROYECTO}/databases/${BASE}/documents`)
  : `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/${BASE}/documents`;

/* R04 · La supresión dejaba VIVAS las cotizaciones y las ventas del prospecto: el
   documento desaparecía pero las referencias seguían apuntando a él. Un dato que sigue
   enlazado a la persona no está suprimido. Aquí se DESASOCIAN: se conserva el importe
   —que es registro contable y no identifica a nadie— y se corta el enlace personal. */
const DESASOCIADO = "suprimido";

const listarTodas = async (H, ruta, etiqueta) => {
  const salida = [];
  let token = null, paginas = 0;
  do {
    const url = `${DOCS}/${ruta}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`No se pudo listar ${etiqueta}: HTTP ${r.status}`);
    const j = await r.json();
    for (const d of (j.documents || [])) salida.push({ id: d.name.split("/").pop(), fields: d.fields || {} });
    token = j.nextPageToken || null;
    if (++paginas > 200) throw new Error("Demasiadas páginas listando " + etiqueta);
  } while (token);
  return salida;
};
const valorDe = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);
const desasociar = async (H, coleccion, id) => {
  const r = await fetch(`${DOCS}/${coleccion}/${id}?updateMask.fieldPaths=lead_id`, {
    method: "PATCH", headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ fields: { lead_id: { stringValue: DESASOCIADO } } }) });
  if (!r.ok) throw new Error(`No se pudo desasociar ${coleccion}/${id}: HTTP ${r.status}`);
};

const REGISTRO = path.join(__dirname, "supresiones.log");

async function cabecera() {
  if (EMULADOR) return { authorization: "Bearer owner" };   // bypass del emulador
  const { tokenAcceso } = require(
    "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
  );
  const t = await tokenAcceso();
  return { authorization: "Bearer " + t };
}

/* Registro sin datos personales: sólo hash del id, conteos y resultado. */
function registrar(linea) {
  const hash = crypto.createHash("sha256").update(String(ID)).digest("hex").slice(0, 16);
  fs.appendFileSync(REGISTRO, new Date().toISOString() + " · id_sha256=" + hash + " · " + linea + "\n", "utf8");
}

function confirmarDoble() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEscribe SUPRIMIR (en mayúsculas) para ejecutar, o cualquier otra cosa para abortar: ', (resp) => {
      rl.close();
      resolve(resp.trim() === "SUPRIMIR");
    });
  });
}

(async () => {
  const H = { ...(await cabecera()), "content-type": "application/json" };

  console.log("Proyecto : " + PROYECTO + (EMULADOR ? "  (EMULADOR)" : "  (PRODUCCIÓN)"));
  console.log("Base     : " + BASE);
  console.log("Prospecto: " + ID);
  console.log("Modo     : " + (CONFIRMAR ? "EJECUCIÓN" : "SIMULACIÓN (no borra nada)"));

  /* 1. Inventario de lo que se va a borrar */
  const lead = await fetch(`${DOCS}/crm_leads/${ID}`, { headers: H });
  if (lead.status === 404) { console.error("\nNo existe ese prospecto. Nada que hacer."); process.exit(2); }
  if (!lead.ok) { console.error("\nNo se pudo leer el prospecto: HTTP " + lead.status); process.exit(2); }
  const doc = await lead.json();

  /* R08 · Las notas también se paginan, y un fallo al listarlas NO se interpreta como
     «no hay notas»: dar por vacía la subcolección dejaría notas personales en pie y la
     supresión se declararía completa sin serlo. */
  const notas = (await listarTodas(H, `crm_leads/${ID}/notas`, "notas de " + ID)).map((n) => n.id);

  /* R04: referencias comerciales que también hay que resolver. */
  const cotizaciones = (await listarTodas(H, "crm_quotes", "crm_quotes"))
    .filter((c) => valorDe(c.fields, "lead_id") === ID);
  const ventas = (await listarTodas(H, "crm_sales", "crm_sales"))
    .filter((v) => valorDe(v.fields, "lead_id") === ID);

  const campos = Object.keys(doc.fields || {});
  console.log("\n--- DOCUMENTOS AFECTADOS ---");
  console.log("  crm_leads/" + ID);
  campos.forEach((c) => console.log("     · campo: " + c + (c === "historial"
    ? "  (" + ((doc.fields.historial.arrayValue && doc.fields.historial.arrayValue.values) || []).length + " entradas)"
    : "")));
  const telSim = doc.fields && doc.fields.telefono && doc.fields.telefono.stringValue;
  console.log("  crm_dedup/" + (telSim || "(sin teléfono)") + "  → marcador que reserva el número  [SE BORRA]");
  console.log("  crm_leads/" + ID + "/notas  → " + notas.length + " documento(s)  [SE BORRAN]");
  notas.forEach((n) => console.log("     · nota: " + n));
  console.log("  crm_quotes  → " + cotizaciones.length + " cotización(es)  [SE DESASOCIAN: lead_id → \"" +
    DESASOCIADO + "\"]");
  cotizaciones.forEach((c) => console.log("     · cotización: " + c.id));
  console.log("  crm_sales   → " + ventas.length + " venta(s)  [SE DESASOCIAN: lead_id → \"" + DESASOCIADO + "\"]");
  ventas.forEach((v) => console.log("     · venta: " + v.id));
  console.log("\n  Los importes se conservan: son registro comercial y no identifican a la persona.");
  console.log("  (No se muestran los VALORES de los campos personales: no hace falta verlos para suprimirlos.)");

  if (!CONFIRMAR) {
    console.log("\nSIMULACIÓN. No se ha borrado nada.");
    console.log("Para ejecutar de verdad: añade --confirmar (pedirá una segunda confirmación).");
    process.exit(0);
  }

  /* 2. Doble confirmación */
  if (!(await confirmarDoble())) {
    console.log("Abortado por el operador. No se ha borrado nada.");
    registrar("ABORTADO por el operador · notas=" + notas.length);
    process.exit(1);
  }

  /* 3a. Desasociación de referencias comerciales (R04).
     ORDEN Y ABORTO: si no se consigue desasociar, NO se borra nada más.
     Antes se seguía adelante y se borraba el prospecto igualmente, dejando una
     cotización apuntando a un documento que ya no existía; y como la reiteración
     empieza leyendo el prospecto, al no existir respondía «nada que hacer»: la
     referencia colgando quedaba IRREPARABLE. Abortando aquí, el procedimiento se puede
     repetir: la desasociación es idempotente y el resto del trabajo sigue pendiente. */
  let desasociadas = 0, fallosRefs = 0;
  for (const c of cotizaciones) {
    try { await desasociar(H, "crm_quotes", c.id); desasociadas++; }
    catch (e) { fallosRefs++; console.error("  " + e.message); }
  }
  for (const v of ventas) {
    try { await desasociar(H, "crm_sales", v.id); desasociadas++; }
    catch (e) { fallosRefs++; console.error("  " + e.message); }
  }
  if (fallosRefs) {
    console.error("\nINCOMPLETO: no se pudieron desasociar " + fallosRefs + " referencia(s).");
    console.error("El prospecto NO se ha borrado: el número queda reservado y el procedimiento");
    console.error("puede repetirse tal cual cuando se resuelva el problema.");
    registrar("INCOMPLETO_REFERENCIAS · refs_fallidas=" + fallosRefs + " · prospecto_conservado=true");
    process.exit(3);
  }

  /* 3b. Notas. Si alguna no se borra, tampoco se borra el prospecto ni el marcador:
     unas notas huérfanas ya no se podrían localizar después ni con este procedimiento. */
  let borradas = 0, fallosNotas = 0;
  for (const n of notas) {
    const r = await fetch(`${DOCS}/crm_leads/${ID}/notas/${n}`, { method: "DELETE", headers: H });
    if (r.ok) borradas++; else { fallosNotas++; console.error("  ERROR al borrar la nota " + n + ": HTTP " + r.status); }
  }
  if (fallosNotas) {
    console.error("\nINCOMPLETO: quedan " + fallosNotas + " nota(s) sin borrar.");
    console.error("El prospecto NO se ha borrado: sus notas siguen siendo alcanzables y el");
    console.error("procedimiento puede repetirse tal cual.");
    registrar("INCOMPLETO_NOTAS · fallos_notas=" + fallosNotas + " · prospecto_conservado=true");
    process.exit(3);
  }

  /* 3c. Marcador. Si sobrevive, el número queda reservado para siempre por un prospecto
     que ya no existe: eso no es una supresión completa. Un 404 significa que ya no
     estaba, que es justo el estado deseado (reanudación tras una ejecución anterior). */
  const telefono = doc.fields && doc.fields.telefono && doc.fields.telefono.stringValue;
  let borradoMarcador = "no aplica";
  if (telefono) {
    const rm = await fetch(`${DOCS}/crm_dedup/${telefono}`, { method: "DELETE", headers: H });
    borradoMarcador = rm.ok ? "sí" : (rm.status === 404 ? "sí (ya no estaba)" : ("NO (HTTP " + rm.status + ")"));
  }
  if (telefono && borradoMarcador.startsWith("NO")) {
    console.error("\nINCOMPLETO: el marcador de deduplicación sigue reservando el número.");
    console.error("El prospecto NO se ha borrado: el número no quedaría libre y el procedimiento");
    console.error("puede repetirse tal cual.");
    registrar("INCOMPLETO_MARCADOR · prospecto_conservado=true");
    process.exit(3);
  }

  /* 3d. Prospecto. Es lo ÚLTIMO: mientras exista, el trabajo pendiente es localizable. */
  const borradoLead = await fetch(`${DOCS}/crm_leads/${ID}`, { method: "DELETE", headers: H });

  /* 4. Verificación posterior */
  const quedaLead = await fetch(`${DOCS}/crm_leads/${ID}`, { headers: H });
  /* R08: recuento paginado; si el listado falla, se marca incompleto en vez de suponer 0. */
  let restantes = 0, falloVerificacion = false;
  try { restantes = (await listarTodas(H, `crm_leads/${ID}/notas`, "notas restantes de " + ID)).length; }
  catch (e) { falloVerificacion = true; console.error("  " + e.message); }

  /* R04: ninguna referencia puede seguir apuntando al prospecto suprimido. */
  const refsVivas = (await listarTodas(H, "crm_quotes", "crm_quotes"))
    .filter((c) => valorDe(c.fields, "lead_id") === ID).map((c) => "cotización " + c.id)
    .concat((await listarTodas(H, "crm_sales", "crm_sales"))
      .filter((v) => valorDe(v.fields, "lead_id") === ID).map((v) => "venta " + v.id));

  console.log("\n--- RESULTADO ---");
  console.log("  referencias desasociadas " + desasociadas + "/" + (cotizaciones.length + ventas.length) +
    (fallosRefs ? "  (fallos: " + fallosRefs + ")" : ""));
  console.log("  notas borradas ......... " + borradas + "/" + notas.length + (fallosNotas ? "  (fallos: " + fallosNotas + ")" : ""));
  console.log("  marcador de deduplicación borrado ... " + borradoMarcador);
  console.log("  prospecto borrado ...... " + (borradoLead.ok ? "sí" : "NO (HTTP " + borradoLead.status + ")"));
  console.log("  verificación: prospecto " + (quedaLead.status === 404 ? "ausente ✓" : "TODAVÍA EXISTE ✗"));
  console.log("  verificación: notas restantes " + restantes + (restantes === 0 ? " ✓" : " ✗"));
  console.log("  verificación: referencias vivas " + refsVivas.length +
    (refsVivas.length === 0 ? " ✓" : " ✗  → " + refsVivas.join(", ")));
  const ok = quedaLead.status === 404 && restantes === 0 && fallosNotas === 0 &&
    fallosRefs === 0 && refsVivas.length === 0 && !falloVerificacion &&
    (!telefono || borradoMarcador.startsWith("sí"));
  registrar((ok ? "COMPLETADO" : "INCOMPLETO") + " · notas_borradas=" + borradas +
    "/" + notas.length + " · refs_desasociadas=" + desasociadas + "/" + (cotizaciones.length + ventas.length) +
    " · lead_eliminado=" + (quedaLead.status === 404) + " · notas_restantes=" + restantes +
    " · refs_vivas=" + refsVivas.length);
  console.log("  registro escrito en crm-dev/supresiones.log (sin datos personales)");

  process.exit(ok ? 0 : 3);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
