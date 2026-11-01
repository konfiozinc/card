/* KZ-CRM-016 · informe de RETENCIÓN de datos personales (SOLO LECTURA).

   Para qué sirve: el CRM guarda un `retencion_hasta` por prospecto. Este script
   lista los que ya vencieron, para que una persona decida borrarlos o anonimizarlos.
   NO borra nada, NO anonimiza nada y NO escribe en Firestore. Es un informe.

   Por qué no borra solo: en Spark no hay procesos programados (eso sería Blaze). Un
   borrado automático sin servidor exigiría que el navegador de alguien estuviera
   abierto, que es peor que una decisión humana con fecha. Así que el vencimiento es
   una lista de trabajo, no un automatismo silencioso.

   Uso:
     node crm-dev/retencion-vencida.cjs               # informe contra kzfio-crm (lectura)
     node crm-dev/retencion-vencida.cjs --json        # además, salida legible por máquina
     node crm-dev/retencion-vencida.cjs --emulador    # sólo pruebas: demo-crm-016

   Requiere sesión de `firebase login` (reutiliza la credencial local, no guarda nada).
   En modo --emulador no pide credencial: usa el bypass del emulador. */

const EMULADOR = process.argv.includes("--emulador");

/* Proyecto fijado en el código: NO se acepta por parámetro ni por variable de entorno.
   En modo emulador sólo se admite el proyecto de pruebas. */
const PROYECTO = EMULADOR ? "demo-crm-016" : "kzfio-crm";
/* La BASE sólo se puede desviar EN EL EMULADOR, para las pruebas de inyección de fallos
   (el proxy devuelve 503 en una página concreta). Contra producción no se acepta
   ninguna variable de entorno. */
const BASE = EMULADOR
  ? (process.env.KZ_FIRESTORE_URL ||
     `http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents`)
  : `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/default/documents`;
const URL = `${BASE}/crm_leads`;

const cabecera = async () => {
  if (EMULADOR) return { authorization: "Bearer owner" };
  const { tokenAcceso } = require(
    "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
  );
  return { authorization: "Bearer " + (await tokenAcceso()) };
};

const comoJson = process.argv.includes("--json");

(async () => {
  const H = await cabecera();

  /* R08 · PAGINACIÓN REAL. Antes se pedía una sola página de 300 y se trabajaba con
     ella como si fuera toda la colección: a partir del prospecto 301 el informe de
     retención mentía por omisión —los más antiguos, precisamente los que más importan
     para una retención vencida, quedaban fuera—. Ahora se recorre hasta agotar. */
  const docs = [];
  let token = null, paginas = 0;
  do {
    const url = `${URL}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, { headers: H });
    if (r.status !== 200) {
      console.error("No se pudo leer crm_leads (HTTP " + r.status + ") en la página " + (paginas + 1) +
        ". ¿Sesión de firebase login?");
      console.error("Se leyeron " + docs.length + " prospectos: el informe quedaría INCOMPLETO.");
      process.exit(2);
    }
    const datos = await r.json();
    for (const d of (datos.documents || [])) docs.push(d);
    token = datos.nextPageToken || null;
    if (++paginas > 200) {
      console.error("Demasiadas páginas: se aborta para no dar un informe incompleto por bueno.");
      process.exit(2);
    }
  } while (token);

  const ahora = Date.now();

  const filas = docs.map((d) => {
    const f = d.fields || {};
    const id = d.name.split("/").pop();
    const retencion = f.retencion_hasta && f.retencion_hasta.timestampValue
      ? new Date(f.retencion_hasta.timestampValue).getTime() : null;
    const creado = f.creado_en && f.creado_en.timestampValue
      ? new Date(f.creado_en.timestampValue).getTime() : null;
    const anonimizado = !!(f.anonimizado && f.anonimizado.booleanValue);
    return {
      id,
      // Nunca se imprime nombre ni teléfono: el informe es sobre retención, no una
      // exportación de datos personales (eso ya existe, acotado y auditado, en el panel).
      nombre: f.nombre && f.nombre.stringValue ? "(dato personal)" : "(vacío)",
      anonimizado,
      creado: creado ? new Date(creado).toISOString().slice(0, 10) : "(sin fecha)",
      vence: retencion ? new Date(retencion).toISOString().slice(0, 10) : "(sin retención)",
      vencido: retencion !== null && retencion < ahora,
      diasRestantes: retencion === null ? null : Math.round((retencion - ahora) / 86400000),
    };
  });

  const vencidos = filas.filter((f) => f.vencido);
  const sinRetencion = filas.filter((f) => f.vence === "(sin retención)");
  const anonimizados = filas.filter((f) => f.anonimizado);

  console.log("Informe de retención · proyecto " + PROYECTO + " · base default");
  console.log("Documentos en crm_leads: " + filas.length);
  console.log("  · con retención vencida (candidatos a borrar/anonimizar): " + vencidos.length);
  console.log("  · ya anonimizados: " + anonimizados.length);
  console.log("  · sin campo de retención (revisar a mano): " + sinRetencion.length);

  if (vencidos.length) {
    console.log("\nVencidos (identificador y fecha; sin datos personales):");
    for (const f of vencidos.sort((a, b) => a.diasRestantes - b.diasRestantes)) {
      console.log("  · " + f.id + "  venció " + f.vence + "  (" + Math.abs(f.diasRestantes) + " días de retraso)");
    }
    console.log("\nAcción: suprime cada uno con el procedimiento privilegiado:");
    console.log("  node crm-dev/suprimir-datos.cjs --id <identificador>");
    console.log("El panel ya NO borra ni anonimiza prospectos (R05): ese camino se retiró.");
    console.log("Suprimir desasocia las cotizaciones y ventas, borra las notas y el marcador del");
    console.log("número, y verifica el resultado. Siempre muestra primero la simulación.");
  } else {
    console.log("\nNo hay retenciones vencidas. Nada que retirar.");
  }

  if (comoJson) console.log("\nJSON:\n" + JSON.stringify(filas, null, 1));

  console.log("\nEste informe no ha modificado nada.");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
