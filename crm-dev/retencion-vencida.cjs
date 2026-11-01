/* KZ-CRM-016 · informe de RETENCIÓN de datos personales (SOLO LECTURA).

   Para qué sirve: el CRM guarda un `retencion_hasta` por prospecto. Este script
   lista los que ya vencieron, para que una persona decida borrarlos o anonimizarlos.
   NO borra nada, NO anonimiza nada y NO escribe en Firestore. Es un informe.

   Por qué no borra solo: en Spark no hay procesos programados (eso sería Blaze). Un
   borrado automático sin servidor exigiría que el navegador de alguien estuviera
   abierto, que es peor que una decisión humana con fecha. Así que el vencimiento es
   una lista de trabajo, no un automatismo silencioso.

   Uso:
     node crm/retencion-vencida.cjs               # informe contra kzfio-crm (lectura)
     node crm/retencion-vencida.cjs --json        # además, salida legible por máquina

   Requiere sesión de `firebase login` (reutiliza la credencial local, no guarda nada). */

const { tokenAcceso } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
);

const PROYECTO = "kzfio-crm";
const URL = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/default/documents/crm_leads`;

const comoJson = process.argv.includes("--json");

(async () => {
  const t = await tokenAcceso();
  const r = await fetch(`${URL}?pageSize=300`, { headers: { authorization: "Bearer " + t } });
  if (r.status !== 200) {
    console.error("No se pudo leer crm_leads (HTTP " + r.status + "). ¿Sesión de firebase login?");
    process.exit(2);
  }
  const datos = await r.json();
  const docs = datos.documents || [];
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
    console.log("\nAcción: entra al panel como admin y anonimiza o borra cada uno.");
  } else {
    console.log("\nNo hay retenciones vencidas. Nada que retirar.");
  }

  if (comoJson) console.log("\nJSON:\n" + JSON.stringify(filas, null, 1));

  console.log("\nEste informe no ha modificado nada.");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
