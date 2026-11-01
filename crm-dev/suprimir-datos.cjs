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
     · Verifica después que todo quedó realmente eliminado.
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
  ? `http://127.0.0.1:8080/v1/projects/${PROYECTO}/databases/${BASE}/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/${BASE}/documents`;

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

  const notasResp = await fetch(`${DOCS}/crm_leads/${ID}/notas?pageSize=300`, { headers: H });
  const notasJson = notasResp.ok ? await notasResp.json() : {};
  const notas = (notasJson.documents || []).map((n) => n.name.split("/").pop());

  const campos = Object.keys(doc.fields || {});
  console.log("\n--- DOCUMENTOS AFECTADOS ---");
  console.log("  crm_leads/" + ID);
  campos.forEach((c) => console.log("     · campo: " + c + (c === "historial"
    ? "  (" + ((doc.fields.historial.arrayValue && doc.fields.historial.arrayValue.values) || []).length + " entradas)"
    : "")));
  const telSim = doc.fields && doc.fields.telefono && doc.fields.telefono.stringValue;
  console.log("  crm_dedup/" + (telSim || "(sin teléfono)") + "  → marcador que reserva el número");
  console.log("  crm_leads/" + ID + "/notas  → " + notas.length + " documento(s)");
  notas.forEach((n) => console.log("     · nota: " + n));
  console.log("\n  (No se muestran los VALORES de los campos personales: no hace falta verlos para suprimirlos.)");

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

  /* 3. Borrado: primero las notas, después el prospecto */
  let borradas = 0, fallosNotas = 0;
  for (const n of notas) {
    const r = await fetch(`${DOCS}/crm_leads/${ID}/notas/${n}`, { method: "DELETE", headers: H });
    if (r.ok) borradas++; else { fallosNotas++; console.error("  ERROR al borrar la nota " + n + ": HTTP " + r.status); }
  }
  /* A03: el marcador crm_dedup/{telefono} impide volver a registrar el número. Si no se
     borra, el teléfono quedaría «reservado» para siempre por un prospecto que ya no
     existe. Se elimina junto con el prospecto. */
  const telefono = doc.fields && doc.fields.telefono && doc.fields.telefono.stringValue;
  let borradoMarcador = "no aplica";
  if (telefono) {
    const rm = await fetch(`${DOCS}/crm_dedup/${telefono}`, { method: "DELETE", headers: H });
    borradoMarcador = rm.ok ? "sí" : ("NO (HTTP " + rm.status + ")");
  }

  const borradoLead = await fetch(`${DOCS}/crm_leads/${ID}`, { method: "DELETE", headers: H });

  /* 4. Verificación posterior */
  const quedaLead = await fetch(`${DOCS}/crm_leads/${ID}`, { headers: H });
  const quedanNotas = await fetch(`${DOCS}/crm_leads/${ID}/notas?pageSize=300`, { headers: H });
  const restantes = quedanNotas.ok ? ((await quedanNotas.json()).documents || []).length : 0;

  console.log("\n--- RESULTADO ---");
  console.log("  notas borradas ......... " + borradas + "/" + notas.length + (fallosNotas ? "  (fallos: " + fallosNotas + ")" : ""));
  console.log("  marcador de deduplicación borrado ... " + borradoMarcador);
  console.log("  prospecto borrado ...... " + (borradoLead.ok ? "sí" : "NO (HTTP " + borradoLead.status + ")"));
  console.log("  verificación: prospecto " + (quedaLead.status === 404 ? "ausente ✓" : "TODAVÍA EXISTE ✗"));
  console.log("  verificación: notas restantes " + restantes + (restantes === 0 ? " ✓" : " ✗"));

  const ok = quedaLead.status === 404 && restantes === 0 && fallosNotas === 0;
  registrar((ok ? "COMPLETADO" : "INCOMPLETO") + " · notas_borradas=" + borradas +
    "/" + notas.length + " · lead_eliminado=" + (quedaLead.status === 404) + " · notas_restantes=" + restantes);
  console.log("  registro escrito en crm-dev/supresiones.log (sin datos personales)");

  process.exit(ok ? 0 : 3);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
