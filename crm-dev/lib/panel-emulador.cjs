/* KZ-CRM-018 · Conectar el PANEL al emulador desde las pruebas de navegador.
   INTERNO: crm-dev/lib/. No se publica.

   POR QUÉ HACE FALTA
   El panel publicado NO tiene ruta de emulador —y no debe tenerla—: su configuración
   apunta al proyecto real `kzfio-crm`. Por eso una prueba de navegador que abra
   `crm/index.html` tal cual intenta entrar en producción y falla.

   QUÉ HACE ESTE MÓDULO
   Devuelve el texto de `crm/crm.js` con DOS cambios, y sólo dos:
     1. `projectId` → `demo-crm-016`;
     2. conexión al Auth (9099) y al Firestore (8080) locales.
   El projectId TIENE que cambiar: el emulador separa los datos por proyecto, así que un
   panel apuntando a `kzfio-crm` no ve nada de lo sembrado en `demo-crm-016` y el login
   responde «esta cuenta no tiene un rol activo».

   El resto del archivo se sirve TAL CUAL: lo que se ejercita es el código real del panel.
*/

const REEMPLAZOS = [
  ["projectId: \"kzfio-crm\"", "projectId: \"demo-crm-016\""],
  ["import { registrarProspectoInterno }",
    "import { connectAuthEmulator } from \"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js\";\n" +
    "import { connectFirestoreEmulator } from \"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js\";\n" +
    "import { registrarProspectoInterno }"],
  ["const db = getFirestore(app, ID_BASE);",
    "const db = getFirestore(app, ID_BASE);\n" +
    "try { connectAuthEmulator(auth, \"http://127.0.0.1:9099\", { disableWarnings: true });\n" +
    "      connectFirestoreEmulator(db, \"127.0.0.1\", 8080); } catch (e) { console.error(\"emulador\", e); }"],
];

/** @returns {{js: string, aplicado: boolean}} */
function inyectarEmulador(js) {
  let salida = js;
  let aplicado = true;
  for (const [busca, pon] of REEMPLAZOS) {
    if (!salida.includes(busca)) { aplicado = false; continue; }
    salida = salida.replace(busca, pon);
  }
  /* Autocomprobación: si algún anclaje deja de existir en crm.js, la inyección no se
     aplica y las pruebas de navegador se conectarían al proyecto real. Mejor avisar. */
  if (!salida.includes("connectFirestoreEmulator(db,") || !salida.includes("projectId: \"demo-crm-016\"")) {
    aplicado = false;
  }
  return { js: salida, aplicado };
}

module.exports = { inyectarEmulador };
