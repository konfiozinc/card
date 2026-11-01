/* KZ-CRM-016 · evidencia de aislamiento de Firebase.

   Comprueba, leyendo el código del repositorio, que el CRM:
   · sólo puede hablar con el proyecto `kzfio-crm` (o el emulador `demo-crm-016`);
   · no contiene credenciales administrativas;
   · no puede desplegarse por accidente al proyecto predeterminado de .firebaserc.

   Uso: node crm/verificar-aislamiento.cjs */

const fs = require("node:fs");
const path = require("node:path");

const CRM = fs.existsSync(path.join(__dirname, "crm.js"))
  ? __dirname
  : path.join(__dirname, "..", "crm");   /* el script vive en crm-dev/ y revisa crm/ */
const RAIZ = path.join(CRM, "..");
const PROYECTO = "kzfio-crm";
const PROYECTO_EMU = "demo-crm-016";

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  OK    " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const leer = (f) => fs.readFileSync(f, "utf8");
const archivosCrm = fs.readdirSync(CRM).filter((f) => /\.(js|html|json|cjs|css|rules|emulador)$/.test(f) || f.startsWith("firestore.rules"));

/* Este verificador contiene los patrones prohibidos como texto (los busca), así que
   se excluye a sí mismo: de lo contrario se denuncia solo, que es el falso positivo
   más tonto posible en una herramienta de seguridad. */
const ESCANEAR = archivosCrm.filter((f) => f !== "verificar-aislamiento.cjs");

/* 1. Proyectos de Firebase mencionados en el CRM -------------------------- */
console.log("1. Proyectos de Firebase referenciados por el código del CRM");
const mencionados = new Set();
const detalles = [];
for (const f of archivosCrm) {
  const texto = leer(path.join(CRM, f));
  const re = /\b([a-z][a-z0-9-]{3,40})\b/g;
  for (const m of [
    ...texto.matchAll(/projectId["'\s:]+["']([^"']+)["']/g),
    ...texto.matchAll(/projects\/([a-z][a-z0-9-]+)/g),
    ...texto.matchAll(/authDomain["'\s:]+["']([a-z0-9-]+)\.firebaseapp\.com/g),
    ...texto.matchAll(/([a-z0-9-]+)\.firebasestorage\.app/g),
  ]) {
    mencionados.add(m[1]);
    detalles.push(f + " → " + m[1]);
  }
}
const permitidos = new Set([PROYECTO, PROYECTO_EMU]);
const intrusos = [...mencionados].filter((p) => !permitidos.has(p) && p !== "PENDIENTE");
for (const d of detalles) console.log("   · " + d);
chk("sólo aparecen kzfio-crm y el proyecto de emulador demo-crm-016",
  intrusos.length === 0, "ajenos: " + (intrusos.join(",") || "ninguno"));
chk("no aparece ningún proyecto de otro negocio",
  !mencionados.has("konfio-zinc") && !mencionados.has("el-titi-menu") && !mencionados.has("une-fibra"),
  "konfio-zinc/el-titi-menu/une-fibra ausentes");

/* 2. Credenciales administrativas ---------------------------------------- */
console.log("\n2. Ausencia de credenciales administrativas en el frontend");
const patronesProhibidos = [
  [/private_key/, "clave privada de cuenta de servicio"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "bloque PEM"],
  [/client_email/, "correo de cuenta de servicio"],
  [/GOOGLE_APPLICATION_CREDENTIALS/, "ruta de credenciales"],
  [/serviceAccount/i, "serviceAccount"],
  [/refresh_token/, "refresh token de OAuth"],
];
let sucio = [];
for (const f of ESCANEAR) {
  const texto = leer(path.join(CRM, f));
  for (const [re, etiqueta] of patronesProhibidos) {
    if (re.test(texto)) sucio.push(f + ": " + etiqueta);
  }
}
chk("ningún archivo del CRM contiene credenciales administrativas", sucio.length === 0, sucio.join(" | "));

const configPublica = /apiKey:\s*"AIza[0-9A-Za-z_-]{20,}"/.test(leer(path.join(CRM, "crm.js")));
chk("el panel usa la configuración pública del SDK (apiKey de app web)", configPublica);

const adminSdk = ESCANEAR.map((f) => leer(path.join(CRM, f))).join("\n");
chk("el CRM no importa el Admin SDK en el navegador", !/from\s+["']firebase-admin/.test(adminSdk));

/* 3. Riesgo del proyecto predeterminado ---------------------------------- */
console.log("\n3. Protección frente al proyecto predeterminado de .firebaserc");
const rutaRc = path.join(RAIZ, ".firebaserc");
let rc = null;
try { rc = JSON.parse(leer(rutaRc)); } catch { rc = null; }
console.log("   .firebaserc del repositorio: " + (rc ? JSON.stringify(rc.projects) : "(ilegible)"));
chk("el repositorio mantiene un proyecto predeterminado DISTINTO de kzfio-crm",
  rc && rc.projects && rc.projects.default !== PROYECTO,
  "por eso TODO despliegue del CRM debe pasar --project explícito");

/* Los artefactos de DESPLIEGUE viven junto a este verificador (crm-dev/), igual que los
   procedimientos privilegiados: no forman parte del panel y no se publican. Buscarlos en
   crm/ hacía que estas comprobaciones fallaran siempre por una cuestión de ruta, no de
   seguridad — y un verificador que siempre falla se acaba ignorando. */
const CONF = __dirname;
const confDespliegue = path.join(CONF, "despliegue.json");
chk("existe una configuración de despliegue propia y aislada", fs.existsSync(confDespliegue));
if (fs.existsSync(confDespliegue)) {
  const cfg = JSON.parse(leer(confDespliegue));
  const fs2 = cfg.firestore;
  const esArray = Array.isArray(fs2);
  chk("declara la base con nombre «default» explícitamente",
    (esArray && fs2.length === 1 && fs2[0].database === "default") || (!esArray && fs2.database === "default"),
    JSON.stringify(fs2));
  const reglas = esArray ? fs2[0].rules : fs2.rules;
  chk("apunta al fichero de reglas del modo privado, no al de la raíz del sitio",
    reglas === "firestore.rules", String(reglas));
  chk("NO contiene bloque de hosting ni functions (no publica nada)",
    !cfg.hosting && !cfg.functions);
  const textoCfg = leer(confDespliegue);
  chk("no fija el proyecto por defecto dentro de la configuración",
    !/konfio-zinc/.test(textoCfg));
}

/* 4. El script de despliegue exige el proyecto correcto ------------------ */
console.log("\n4. Script de despliegue");
const script = path.join(CONF, "desplegar-reglas.cjs");
chk("existe el script de despliegue de reglas", fs.existsSync(script));
if (fs.existsSync(script)) {
  const t = leer(script);
  chk("el proyecto está fijado en el script (no se deduce del entorno)",
    /PROYECTO\s*=\s*"kzfio-crm"/.test(t));
  chk("se niega a ejecutar sin confirmación explícita",
    /--confirmar/.test(t) && /process\.exit\(/.test(t));
  chk("comprueba el release de destino cloud.firestore/default",
    /cloud\.firestore\/default/.test(t));
}

console.log("\nRESULTADO AISLAMIENTO: OK " + ok + " · FALLA " + ko);
process.exit(ko ? 3 : 0);
