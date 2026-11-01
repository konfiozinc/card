/* KZ-CRM-016 · publica las reglas privadas en el release HEREDADO `cloud.firestore`.

   Por qué existe este script: al desplegar con `crm/desplegable.json` la CLI creó
   `cloud.firestore/default` (con attachment point), pero el release heredado
   `cloud.firestore` siguió apuntando al ruleset antiguo, que ADMITE ALTA ANÓNIMA.
   Si ese release es el que gobierna la base —y la evidencia de esta sesión dice que
   sí— dejar los dos releases con contenidos distintos es un fallo de seguridad, no
   una duplicidad inocente.

   Este script publica EXACTAMENTE el mismo texto de reglas en el release heredado,
   en un ruleset distinto y sin attachment point (cada release con su ruleset).

   Uso:
     node crm/publicar-release-heredado.cjs               # informe, no escribe
     node crm/publicar-release-heredado.cjs --confirmar    # publica
*/

const fs = require("node:fs");
const path = require("node:path");
const { tokenAcceso } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
);

const PROYECTO = "kzfio-crm";
const RELEASE_HEREDADO = "cloud.firestore";
const REGLAS = path.join(__dirname, "firestore.rules");
const confirmar = process.argv.includes("--confirmar");

(async () => {
  const contenido = fs.readFileSync(REGLAS, "utf8");
  const t = await tokenAcceso();
  const H = { authorization: "Bearer " + t, "content-type": "application/json" };

  const relActual = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}/releases`, { headers: H })
    .then((r) => r.json());
  const heredado = (relActual.releases || []).find((r) => r.name.endsWith("/" + RELEASE_HEREDADO));
  const idActual = heredado ? heredado.rulesetName.split("/").pop() : "(no existe)";
  const rsActual = heredado
    ? await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}/` + heredado.rulesetName.split(`projects/${PROYECTO}/`)[1], { headers: H }).then((r) => r.json())
    : null;
  const yaIgual = rsActual && rsActual.source.files[0].content.replace(/\r\n/g, "\n").trim() === contenido.replace(/\r\n/g, "\n").trim();

  console.log("Proyecto          : " + PROYECTO);
  console.log("Release heredado  : " + RELEASE_HEREDADO);
  console.log("Ruleset actual    : " + idActual);
  console.log("¿Ya tiene las reglas privadas?: " + (yaIgual ? "SÍ — nada que hacer" : "NO"));

  if (yaIgual) { console.log("\nInforme terminado. No se ha modificado nada."); process.exit(0); }

  if (!confirmar) {
    console.log("\nMODO INFORME: no se ha publicado nada. Para publicar:");
    console.log("   node crm/publicar-release-heredado.cjs --confirmar");
    process.exit(0);
  }

  const creado = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}/rulesets`, {
    method: "POST", headers: H,
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: contenido }] } }),
  }).then((r) => r.json());
  if (!creado.name) { console.error("ERROR al crear el ruleset:", JSON.stringify(creado).slice(0, 300)); process.exit(1); }
  console.log("Ruleset nuevo     : " + creado.name.split("/").pop());

  const lib = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}/releases/${RELEASE_HEREDADO}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({
      release: { name: `projects/${PROYECTO}/releases/${RELEASE_HEREDADO}`, rulesetName: creado.name },
    }),
  });
  if (!lib.ok) { console.error("ERROR al liberar:", lib.status, (await lib.text()).slice(0, 300)); process.exit(1); }
  const libj = await lib.json();
  console.log("Liberado          : " + libj.name + " → " + (libj.rulesetName || "").split("/").pop());
  console.log("updateTime        : " + libj.updateTime);
  console.log("\nHecho. Verifica con: node crm/verificar-destino-reglas.cjs");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
