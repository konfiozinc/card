/* KZ-CRM-016 · verificación del estado de las reglas en kzfio-crm (SOLO LECTURA).

   Responde tres preguntas concretas sobre el proyecto real:
   1. ¿Existe la base con identificador literal «default»?
   2. ¿Qué releases hay y cuál está atado a esa base?
   3. ¿El contenido publicado es EXACTAMENTE crm/firestore.rules (modo privado)?

   No despliega, no escribe y no toca ningún otro proyecto.

   Uso:  node crm/verificar-destino-reglas.cjs */

const fs = require("node:fs");
const path = require("node:path");
const { tokenAcceso, cuentaSesion } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
);

const PROYECTO = "kzfio-crm";
const BASE = "default";
const RELEASE_NOMBRADO = `${"cloud.firestore"}/${BASE}`;
const RELEASE_HEREDADO = "cloud.firestore";
const BASE_API = "https://firebaserules.googleapis.com/v1";
const BASE_FIRESTORE = "https://firestore.googleapis.com/v1";

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  OK    " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

function nombreCuenta() {
  const u = cuentaSesion();
  if (!u) return "(desconocida)";
  return u.email || u.name || "(sin correo)";
}

(async () => {
  const t = await tokenAcceso();
  const get = async (url) => {
    const r = await fetch(url, { headers: { authorization: "Bearer " + t } });
    return { status: r.status, cuerpo: r.ok ? await r.json() : await r.text() };
  };

  console.log("Proyecto: " + PROYECTO + " · cuenta: " + nombreCuenta() + "\n");

  console.log("1. Base de datos");
  const bases = await get(`${BASE_FIRESTORE}/projects/${PROYECTO}/databases`);
  const ids = (bases.cuerpo.databases || []).map((d) => d.name.split("/").pop());
  for (const d of bases.cuerpo.databases || []) {
    console.log("   · " + d.name + "  · " + d.databaseEdition + " · " + d.locationId);
  }
  chk("la base se llama literalmente «" + BASE + "»", ids.length === 1 && ids[0] === BASE, ids.join(","));

  console.log("\n2. Releases");
  const rel = await get(`${BASE_API}/projects/${PROYECTO}/releases`);
  const releases = rel.cuerpo.releases || [];
  const porNombre = {};
  for (const r of releases) {
    const nombre = r.name.split("/releases/")[1];
    porNombre[nombre] = r;
    console.log("   · " + nombre.padEnd(22) + " → " + r.rulesetName.split("/").pop() + "   (" + r.updateTime + ")");
  }
  chk("existe el release nombrado «" + RELEASE_NOMBRADO + "»", !!porNombre[RELEASE_NOMBRADO]);
  chk("existe el release heredado «" + RELEASE_HEREDADO + "»", !!porNombre[RELEASE_HEREDADO]);

  console.log("\n3. Contenido publicado frente a crm/firestore.rules");
  const local = fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8").replace(/\r\n/g, "\n").trim();
  for (const nombre of [RELEASE_NOMBRADO, RELEASE_HEREDADO]) {
    const r = porNombre[nombre];
    if (!r) { chk("release " + nombre + " presente", false); continue; }
    const rs = await get(`${BASE_API}/projects/${PROYECTO}/` + r.rulesetName.split(`projects/${PROYECTO}/`)[1]);
    const cont = (rs.cuerpo.source.files[0].content || "").replace(/\r\n/g, "\n").trim();
    chk("release " + nombre + " publica exactamente crm/firestore.rules", cont === local);
    chk("release " + nombre + " NO admite alta anónima",
      !/allow create:[^\n]*\n[^\n]*tieneRol\(equipo\(\)\)\s*\n\s*&& leadId == request\.resource\.data\.telefono/.test(cont) &&
      /allow create: if tieneRol\(equipo\(\)\)/.test(cont));
    if (nombre === RELEASE_NOMBRADO) {
      chk("el ruleset del release nombrado está atado a la base «" + BASE + "»",
        typeof rs.cuerpo.attachmentPoint === "string" && rs.cuerpo.attachmentPoint.endsWith("/databases/" + BASE),
        rs.cuerpo.attachmentPoint || "(ninguno)");
    }
  }

  console.log("\n4. Conclusión");
  const ambosIguales = [RELEASE_NOMBRADO, RELEASE_HEREDADO].every((n) => !!porNombre[n]);
  if (ambosIguales && ko === 0) {
    console.log("   Los DOS releases publican las mismas reglas privadas. No queda ningún");
    console.log("   release con el contrato antiguo, así que da igual cuál tenga prioridad:");
    console.log("   no existe ruta anónima a los datos comerciales.");
  } else {
    console.log("   Revisar: hay fallos arriba. NO dar la publicación por buena.");
  }

  console.log("\nRESULTADO VERIFICACIÓN: OK " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
