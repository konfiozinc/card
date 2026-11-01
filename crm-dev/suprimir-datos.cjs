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
const PREFIJO = `projects/${PROYECTO}/databases/${BASE}/documents`;
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

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
  if (lead.status === 404) {
    /* A.6 · El prospecto ya no existe. Si quedo el testigo de una ejecucion anterior, se
       limpian los residuos y se libera: si no, ese bloqueo quedaria puesto para siempre y
       el trabajo pendiente (referencias) seria imposible de localizar. */
    const testigoResidual = await fetch(`${DOCS}/crm_supresion/${ID}`, { headers: H });
    if (testigoResidual.status === 404) {
      console.error("\nNo existe ese prospecto y no hay testigo pendiente. Nada que hacer.");
      process.exit(2);
    }
    console.error("\nNo existe el prospecto, pero SI hay un testigo pendiente: se revisan residuos.");
    let residuos = 0;
    for (const c of (await listarTodas(H, "crm_quotes", "crm_quotes")).filter((x) => valorDe(x.fields, "lead_id") === ID)) {
      try { await desasociar(H, "crm_quotes", c.id); residuos++; } catch (e) { console.error("  " + e.message); }
    }
    for (const v of (await listarTodas(H, "crm_sales", "crm_sales")).filter((x) => valorDe(x.fields, "lead_id") === ID)) {
      try { await desasociar(H, "crm_sales", v.id); residuos++; } catch (e) { console.error("  " + e.message); }
    }
    const refsVivasRes = (await listarTodas(H, "crm_quotes", "crm_quotes")).filter((x) => valorDe(x.fields, "lead_id") === ID).length
      + (await listarTodas(H, "crm_sales", "crm_sales")).filter((x) => valorDe(x.fields, "lead_id") === ID).length;
    const rlRes = await fetch(`${DOCS}/crm_supresion/${ID}`, { method: "DELETE", headers: H });
    console.log("  referencias desasociadas ... " + residuos + " · referencias vivas " + refsVivasRes +
      " · testigo liberado ... " + (rlRes.ok || rlRes.status === 404 ? "sí" : "NO (HTTP " + rlRes.status + ")"));
    registrar("RESIDUOS_LIMPIADOS · refs=" + residuos + " · vivas=" + refsVivasRes);
    process.exit(refsVivasRes === 0 && (rlRes.ok || rlRes.status === 404) ? 0 : 3);
  }
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

  /* 3a. TESTIGO DE SUPRESIÓN (A.1). Se escribe ANTES de inventariar: mientras exista,
     las reglas candidatas deniegan notas, cambios de estado, cotizaciones y ventas sobre
     este prospecto, así que no pueden entrar datos nuevos a mitad de la supresión. */
  const shaId = sha256(ID);
  const bloqueo = async (estado) => {
    const r = await fetch(`${DOCS}/crm_supresion/${ID}`, {
      method: "PATCH", headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ fields: {
        estado: { stringValue: estado }, desde: { timestampValue: new Date().toISOString() },
        id_sha256: { stringValue: shaId } } }),
    });
    if (!r.ok) throw new Error("No se pudo escribir el testigo de supresión: HTTP " + r.status);
  };
  await bloqueo("preparado");

  /* 3b. RE-INVENTARIO BAJO BLOQUEO (A.2). Si algo cambió entre la simulación y el testigo,
     se aborta sin borrar: el estado ya no es el que se autorizó. */
  const notasAhora = (await listarTodas(H, `crm_leads/${ID}/notas`, "notas de " + ID)).map((n) => n.id);
  const cotAhora = (await listarTodas(H, "crm_quotes", "crm_quotes")).filter((c) => valorDe(c.fields, "lead_id") === ID);
  const venAhora = (await listarTodas(H, "crm_sales", "crm_sales")).filter((v) => valorDe(v.fields, "lead_id") === ID);
  const cambio = notasAhora.length !== notas.length ||
    cotAhora.length !== cotizaciones.length || venAhora.length !== ventas.length;
  if (cambio) {
    console.error("\nABORTADO: el prospecto cambió entre la simulación y el testigo.");
    console.error("  notas " + notas.length + " → " + notasAhora.length +
      " · cotizaciones " + cotizaciones.length + " → " + cotAhora.length +
      " · ventas " + ventas.length + " → " + venAhora.length);
    console.error("  El testigo queda puesto: nadie puede escribir en el prospecto hasta que");
    console.error("  se repita la supresión. No se ha borrado nada.");
    registrar("ABORTADO_POR_CAMBIO · testigo_conservado=true");
    process.exit(3);
  }
  await bloqueo("borrando");

  /* 3c. Desasociación de referencias comerciales (R04). */
  let desasociadas = 0, fallosRefs = 0;
  for (const c of cotAhora) {
    try { await desasociar(H, "crm_quotes", c.id); desasociadas++; }
    catch (e) { fallosRefs++; console.error("  " + e.message); }
  }
  for (const v of venAhora) {
    try { await desasociar(H, "crm_sales", v.id); desasociadas++; }
    catch (e) { fallosRefs++; console.error("  " + e.message); }
  }
  if (fallosRefs) {
    console.error("\nINCOMPLETO: no se pudieron desasociar " + fallosRefs + " referencia(s).");
    console.error("El prospecto NO se ha borrado y el testigo sigue puesto: la supresión puede");
    console.error("repetirse tal cual cuando se resuelva el problema.");
    registrar("INCOMPLETO_REFERENCIAS · refs_fallidas=" + fallosRefs + " · testigo_conservado=true");
    process.exit(3);
  }

  /* 3d. Notas y prospecto, con PRECONDICIÓN de escritura (B.2/B.3 aplicado aquí también):
     se borra sólo si el documento sigue siendo el que se leyó. Si alguien lo tocó entre la
     lectura y el borrado, el almacén rechaza la operación en vez de destruir a ciegas. */
  const borrarSiNoCambio = async (ruta, updateTime, etiqueta) => {
    if (!updateTime) {
      console.error("  ERROR: no se pudo leer updateTime de " + etiqueta + "; NO se borra a ciegas.");
      return false;
    }
    const writes = [{ delete: `${PREFIJO}/${ruta}`, currentDocument: { updateTime } }];
    const r = await fetch(`${DOCS}:commit`, { method: "POST", headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ writes }) });
    if (r.ok) return true;
    if (r.status === 404) return true;              // ya no estaba: el estado deseado
    console.error("  ERROR al borrar " + etiqueta + ": HTTP " + r.status + " " + (await r.text()).slice(0, 120));
    return false;
  };

  let borradas = 0, fallosNotas = 0;
  for (const n of await listarTodas(H, `crm_leads/${ID}/notas`, "notas a borrar")) {
    const doc = await fetch(`${DOCS}/crm_leads/${ID}/notas/${n.id}`, { headers: H });
    const ut = doc.ok ? (await doc.json()).updateTime : null;
    if (await borrarSiNoCambio(`crm_leads/${ID}/notas/${n.id}`, ut, "la nota " + n.id)) borradas++;
    else fallosNotas++;
  }
  if (fallosNotas) {
    console.error("\nINCOMPLETO: quedan " + fallosNotas + " nota(s) sin borrar.");
    console.error("El prospecto NO se ha borrado y el testigo sigue puesto.");
    registrar("INCOMPLETO_NOTAS · fallos_notas=" + fallosNotas + " · testigo_conservado=true");
    process.exit(3);
  }

  /* 3e. Marcador del número. */
  const telefono = doc.fields && doc.fields.telefono && doc.fields.telefono.stringValue;
  let borradoMarcador = "no aplica";
  if (telefono) {
    const marca = await fetch(`${DOCS}/crm_dedup/${telefono}`, { headers: H });
    if (marca.status === 404) borradoMarcador = "sí (ya no estaba)";
    else if (!marca.ok) borradoMarcador = "NO (HTTP " + marca.status + ")";
    else {
      const utMarca = (await marca.json()).updateTime || null;
      borradoMarcador = (await borrarSiNoCambio(`crm_dedup/${telefono}`, utMarca, "el marcador")) ? "sí" : "NO (rechazado)";
    }
  }
  if (telefono && borradoMarcador.startsWith("NO")) {
    console.error("\nINCOMPLETO: el marcador sigue reservando el número. El prospecto NO se ha");
    console.error("borrado y el testigo sigue puesto.");
    registrar("INCOMPLETO_MARCADOR · testigo_conservado=true");
    process.exit(3);
  }

  /* 3f. Prospecto, también con precondición. */
  const docActual = await fetch(`${DOCS}/crm_leads/${ID}`, { headers: H });
  const utLead = docActual.ok ? (await docActual.json()).updateTime : null;
  const borradoLead = await borrarSiNoCambio(`crm_leads/${ID}`, utLead, "el prospecto");
  if (!borradoLead) {
    console.error("\nINCOMPLETO: el prospecto no se pudo borrar (fue modificado o falló la escritura).");
    console.error("El testigo sigue puesto: repetir la supresión retomará el trabajo pendiente.");
    registrar("INCOMPLETO_PROSPECTO · testigo_conservado=true");
    process.exit(3);
  }

  /* Copia HEREDADA del mismo número (modelo anterior: id = teléfono). Es la MISMA
     persona: si se deja viva, la supresión no sirve de nada aunque el UUID desaparezca. */
  let borradoHeredado = "no aplica";
  if (telefono && telefono !== ID) {
    const gemelo = await fetch(`${DOCS}/crm_leads/${telefono}`, { headers: H });
    if (gemelo.status === 404) borradoHeredado = "no existía";
    else if (!gemelo.ok) borradoHeredado = "NO (HTTP " + gemelo.status + ")";
    else {
      const utGemelo = (await gemelo.json()).updateTime || null;
      let fallosGemelo = 0;
      for (const n of await listarTodas(H, `crm_leads/${telefono}/notas`, "notas heredadas")) {
        const d = await fetch(`${DOCS}/crm_leads/${telefono}/notas/${n.id}`, { headers: H });
        const ut = d.ok ? (await d.json()).updateTime : null;
        if (!(await borrarSiNoCambio(`crm_leads/${telefono}/notas/${n.id}`, ut, "nota heredada"))) fallosGemelo++;
      }
      const okGemelo = fallosGemelo === 0 && (await borrarSiNoCambio(`crm_leads/${telefono}`, utGemelo, "el prospecto heredado"));
      borradoHeredado = okGemelo ? "sí" : "NO";
      if (!okGemelo) {
        console.error("\nINCOMPLETO: la copia heredada del mismo número sigue viva. La supresión NO");
        console.error("está completa: esa copia permitiría reconstruir la identidad.");
        registrar("INCOMPLETO_HEREDADO · testigo_conservado=true");
        process.exit(3);
      }
    }
  }
  console.log("  copia heredada del número ... " + borradoHeredado);

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
  console.log("  prospecto borrado ...... " + (borradoLead ? "sí" : "NO"));
  console.log("  verificación: prospecto " + (quedaLead.status === 404 ? "ausente ✓" : "TODAVÍA EXISTE ✗"));
  console.log("  verificación: notas restantes " + restantes + (restantes === 0 ? " ✓" : " ✗"));
  console.log("  verificación: referencias vivas " + refsVivas.length +
    (refsVivas.length === 0 ? " ✓" : " ✗  → " + refsVivas.join(", ")));
  let ok = quedaLead.status === 404 && restantes === 0 && fallosNotas === 0 &&
    fallosRefs === 0 && refsVivas.length === 0 && !falloVerificacion &&
    (!telefono || borradoMarcador.startsWith("sí"));
  /* A.6 · El testigo se libera SOLO si todo quedó verificado. Si no, se queda puesto:
     bloquea escrituras hasta que alguien repita la supresión o decida a mano. */
  let testigoLiberado = false;
  if (ok) {
    const rl = await fetch(`${DOCS}/crm_supresion/${ID}`, { method: "DELETE", headers: H });
    testigoLiberado = rl.ok || rl.status === 404;
    console.log("  testigo de supresión liberado ... " + (testigoLiberado ? "sí" : "NO (HTTP " + rl.status + ")"));
    if (!testigoLiberado) { console.error("  el testigo NO se pudo liberar: el prospecto queda bloqueado."); ok = false; }
  } else {
    console.log("  testigo de supresión CONSERVADO: el prospecto queda bloqueado hasta repetir.");
  }
  registrar((ok ? "COMPLETADO" : "INCOMPLETO") + " · notas_borradas=" + borradas +
    "/" + notas.length + " · refs_desasociadas=" + desasociadas + "/" + (cotizaciones.length + ventas.length) +
    " · lead_eliminado=" + (quedaLead.status === 404) + " · notas_restantes=" + restantes +
    " · refs_vivas=" + refsVivas.length);
  console.log("  registro escrito en crm-dev/supresiones.log (sin datos personales)");

  process.exit(ok ? 0 : 3);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
