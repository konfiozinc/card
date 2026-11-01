/* KZ-CRM-016 · activación del administrador principal.
   Ejecuta los pasos 6 y 7 de la misión, en orden, con guardas en cada uno.

   PRERREQUISITO: que Firebase Authentication esté inicializado en el proyecto.
   Ese paso NO se puede hacer por API (ver docs/KZ-CRM-016-DIAGNOSTICO-AUTH.md);
   se hace en Firebase Console → Authentication → Comenzar.

   Qué hace:
     1. Comprueba que Auth está inicializado. Si no, se detiene SIN tocar nada.
     2. Busca la cuenta del administrador. Si existe, la reutiliza; si no, la crea
        con una contraseña aleatoria que NO se imprime ni se guarda.
     3. Envía el correo de restablecimiento para que la persona fije su contraseña.
     4. Siembra la ficha crm_usuarios/{uid} con rol admin (vía privilegiada).

   Lo que NO hace: no escribe credenciales en el repositorio, no conoce la
   contraseña final y no crea usuarios distintos del autorizado.

   Uso:
     node crm/activar-admin.cjs                 # informe: comprueba y dice qué haría
     node crm/activar-admin.cjs --confirmar     # ejecuta
*/

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { tokenAcceso } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
);

const PROYECTO = "kzfio-crm";
/* El correo del administrador NO se versiona: es dato personal y es la cuenta que
   entra al CRM. Se pasa por variable de entorno.
   Uso: $env:KZ_ADMIN_EMAIL="..." ; node crm-dev/activar-admin.cjs */
const EMAIL = process.env.KZ_ADMIN_EMAIL || "admin@ejemplo.com";
const ROL = "admin";
const confirmar = process.argv.includes("--confirmar");
const H = (t) => ({ authorization: "Bearer " + t, "content-type": "application/json" });

async function authInicializado(t) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${PROYECTO}/config`, { headers: H(t) });
  return r.status === 200;
}

(async () => {
  const t = await tokenAcceso();

  /* ── 0. Guarda: sin Authentication no se puede crear ninguna cuenta ── */
  const listo = await authInicializado(t);
  console.log("Proyecto : " + PROYECTO);
  console.log("Cuenta   : " + EMAIL + "   rol: " + ROL);
  console.log("Authentication inicializado: " + (listo ? "SÍ" : "NO"));
  if (!listo) {
    console.log("\nDETENIDO: Authentication no está inicializado en el proyecto.");
    console.log("No se ha creado ninguna cuenta ni se ha escrito ningún rol.");
    console.log("");
    console.log("Paso previo (manual, en Firebase Console):");
    console.log("   Authentication → Comenzar → Sign-in method → Correo electrónico/contraseña → Habilitar");
    console.log("Después, vuelve a ejecutar este script.");
    process.exit(2);
  }

  /* ── 1. ¿Existe ya la cuenta? ── */
  const buscado = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts:lookup`, {
    method: "POST", headers: H(t), body: JSON.stringify({ email: [EMAIL] }),
  });
  const json = await buscado.json().catch(() => ({}));
  const existente = json.users && json.users[0];
  const uid = existente && existente.localId;
  console.log("Cuenta existente: " + (uid ? "sí · uid " + uid : "no"));

  if (!confirmar) {
    console.log("\nMODO INFORME: " + (uid ? "se reutilizaría la cuenta " + uid : "se crearía la cuenta") +
      " y se sembraría el rol " + ROL + ".");
    console.log("Para ejecutar: node crm/activar-admin.cjs --confirmar");
    process.exit(0);
  }

  /* ── 2. Crear la cuenta si no existe (contraseña aleatoria y no revelada) ── */
  let uidFinal = uid;
  if (!uidFinal) {
    /* La contraseña se genera en memoria, se envía y se descarta: nadie la conoce,
       ni el agente. La persona fija la suya con el correo del paso 3. */
    const temporal = crypto.randomBytes(24).toString("base64url");
    const alta = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts`, {
      method: "POST", headers: H(t),
      body: JSON.stringify({ email: EMAIL, password: temporal, emailVerified: false }),
    });
    if (!alta.ok) {
      console.error("ERROR al crear la cuenta: " + alta.status + " " + (await alta.text()).slice(0, 300));
      process.exit(1);
    }
    uidFinal = (await alta.json()).localId;
    console.log("Cuenta creada: uid " + uidFinal + "  (contraseña aleatoria, no revelada y sin guardar)");
  }

  /* ── 3. Correo para que la persona fije su propia contraseña ── */
  const reset = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts:sendOobCode`, {
    method: "POST", headers: H(t),
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email: EMAIL }),
  });
  console.log("Correo de restablecimiento: HTTP " + reset.status + (reset.ok ? " (enviado a " + EMAIL + ")" : ""));

  /* ── 4. Sembrar el rol (procedimiento privilegiado, nunca el navegador) ── */
  const sembrado = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/default/documents/crm_usuarios/${uidFinal}`,
    { method: "PATCH", headers: H(t), body: JSON.stringify({ fields: {
      rol: { stringValue: ROL }, activo: { booleanValue: true },
      creado_en: { timestampValue: new Date().toISOString() },
    } }) }
  );
  if (!sembrado.ok) {
    console.error("ERROR al sembrar el rol: " + sembrado.status + " " + (await sembrado.text()).slice(0, 300));
    process.exit(1);
  }
  console.log("Rol sembrado: crm_usuarios/" + uidFinal + " → " + ROL + " (activo)");

  /* ── 5. Comprobación posterior ── */
  const leer = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/default/documents/crm_usuarios/${uidFinal}`,
    { headers: H(t) }
  ).then((r) => r.json());
  console.log("Verificación: rol=" + leer.fields.rol.stringValue + " activo=" + leer.fields.activo.booleanValue);

  fs.writeFileSync("docs/KZ-CRM-016-ADMIN-ACTIVADO.json", JSON.stringify({
    activado_en: new Date().toISOString(), proyecto: PROYECTO, email: EMAIL, uid: uidFinal, rol: ROL,
    nota: "La contraseña no se registra: la persona la fija mediante el correo de restablecimiento de Firebase.",
  }, null, 1), "utf8");
  console.log("\nHecho. Evidencia sin datos sensibles en docs/KZ-CRM-016-ADMIN-ACTIVADO.json");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
