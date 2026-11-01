/* KZ-CRM-016 · despliegue de reglas del CRM, con el proyecto CLAVADO.

   Problema que resuelve: el .firebaserc de este repositorio tiene como proyecto
   predeterminado `konfio-zinc`, que es OTRO Firebase (el del sitio de la agencia).
   Un `firebase deploy` sin --project iría ahí. Este script:

   · fija PROYECTO = "kzfio-crm" y aborta si alguien lo cambia por variable de entorno;
   · usa crm/despliegue.json, que declara la base con nombre «default»;
   · por defecto NO despliega: sólo informa (modo informe);
   · exige la palabra --confirmar para ejecutar de verdad;
   · al terminar, comprueba el release `cloud.firestore/default` y su attachment point.

   Uso:
     node crm/desplegar-reglas.cjs                 # informe, no toca nada
     node crm/desplegar-reglas.cjs --confirmar     # DESPLIEGA (requiere autorización)

   Reversión: ver docs/KZ-CRM-016-DESPLIEGUE-Y-REVERSION.md */

const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const PROYECTO = "kzfio-crm";
const BASE = "default";
const RELEASE = `cloud.firestore/${BASE}`;
const CONFIG = path.join(__dirname, "despliegue.json");
const REGLAS = path.join(__dirname, "firestore.rules");

const confirmar = process.argv.includes("--confirmar");

function abortar(motivo) {
  console.error("\nABORTADO: " + motivo);
  process.exit(1);
}

/* ── 1. Guardas de seguridad, antes de nada ── */
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROYECTO) {
  abortar("GCLOUD_PROJECT apunta a «" + process.env.GCLOUD_PROJECT + "» y este script sólo opera sobre " + PROYECTO);
}
if (!fs.existsSync(CONFIG)) abortar("no existe " + CONFIG);
if (!fs.existsSync(REGLAS)) abortar("no existe " + REGLAS);

const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const entrada = Array.isArray(cfg.firestore) ? cfg.firestore[0] : cfg.firestore;
if (!entrada || entrada.database !== BASE) abortar("crm/despliegue.json no declara la base «" + BASE + "»");
if (entrada.rules !== "firestore.rules") abortar("crm/despliegue.json no apunta a firestore.rules");
if (cfg.hosting || cfg.functions) abortar("la configuración de despliegue no debe publicar hosting ni functions");

/* Aviso explícito del riesgo del proyecto predeterminado. */
let rcDefault = "(sin .firebaserc)";
try {
  const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".firebaserc"), "utf8"));
  rcDefault = rc.projects && rc.projects.default;
} catch { /* da igual: siempre pasamos --project */ }

console.log("Proyecto de destino : " + PROYECTO + "   (clavado en el script)");
console.log("Proyecto .firebaserc: " + rcDefault + "   (NO se usa: se pasa --project siempre)");
console.log("Base de datos       : " + BASE + "   (con nombre, no «(default)»)");
console.log("Release de destino  : " + RELEASE);
console.log("Archivo de reglas   : crm/" + entrada.rules + "   (modo privado, sin captación anónima)");
console.log("Configuración       : crm/despliegue.json");

const reglasTexto = fs.readFileSync(REGLAS, "utf8");
const tieneAltaAnonima = /allow create:[^\n]*\n?[^\n]*leadId == request\.resource\.data\.telefono/.test(reglasTexto)
  && !/tieneRol\(equipo\(\)\)\s*\n\s*&& leadId/.test(reglasTexto);
console.log("Captación anónima   : " + (tieneAltaAnonima ? "¡ACTIVA! revisar antes de seguir" : "cerrada (ninguna escritura anónima)"));

if (!confirmar) {
  console.log("\nMODO INFORME: no se ha desplegado nada.");
  console.log("Este comando NO se ha ejecutado. Para ejecutarlo hace falta autorización expresa:");
  console.log("");
  console.log("   firebase deploy --only firestore:rules --project " + PROYECTO + " --config crm/despliegue.json");
  console.log("");
  console.log("Después del despliegue, verificar (obligatorio):");
  console.log("   node crm/verificar-destino-reglas.cjs");
  console.log("   → el release debe aparecer como " + RELEASE + " y con attachmentPoint.");
  process.exit(0);
}

/* ── 2. Despliegue real (sólo con --confirmar y autorización) ── */
console.log("\nDESPLEGANDO reglas en " + PROYECTO + " · base «" + BASE + "»…");
const r = spawnSync("firebase", ["deploy", "--only", "firestore:rules", "--project", PROYECTO, "--config", CONFIG], {
  stdio: "inherit",
  shell: true,
});
if (r.status !== 0) abortar("firebase deploy terminó con código " + r.status);

console.log("\nDespliegue terminado. Ahora DOS verificaciones obligatorias:");
console.log("  1) node crm/publicar-release-heredado.cjs --confirmar");
console.log("     (el release heredado debe publicar el MISMO ruleset; si no, quedan permisos antiguos)");
console.log("  2) node crm/verificar-destino-reglas.cjs");
console.log("  3) node crm/certificar-produccion.cjs    → escritura anónima debe dar 403");
