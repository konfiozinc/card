/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/core.js
   Núcleo de Firebase para el panel (módulo ES).

   Inicializa App/Auth/Firestore/Functions desde la configuración
   centralizada (assets/js/config.js) y expone las instancias al resto
   del panel. Si Firebase todavía no está configurado, NO inicializa
   nada y deja que la interfaz muestre un aviso claro en lugar de
   romperse con un error críptico.

   IMPORTANTE: los módulos ES y Firebase Auth requieren servir el sitio
   por HTTP(S). GitHub Pages ya lo hace; con file:// no funciona.

   Los imports son "desnudos" (firebase/app) y se resuelven con el
   importmap declarado en cada página de /admin/.
   ═══════════════════════════════════════════════════════════════════ */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const CFG = window.KZ_CONFIG || {};

/** ¿El valor es un placeholder sin reemplazar? */
function esPlaceholder(v) {
  return !v || typeof v !== 'string' ||
    v.startsWith('PENDIENTE') || v.indexOf('FIREBASE_') !== -1 || v.indexOf('[TU_') !== -1;
}

/**
 * Indica si Firebase está realmente configurado (sin placeholders).
 * @returns {boolean}
 */
export function isConfigured() {
  const f = CFG.firebase;
  if (!f || !f.habilitado) return false;
  const c = f.config || {};
  return !esPlaceholder(c.apiKey) && !esPlaceholder(c.projectId) && !esPlaceholder(c.appId);
}

/** Aviso honesto cuando Firebase aún no está configurado. */
export const MENSAJE_NO_CONFIGURADO = `
  <div class="nocfg">
    <h1>Firebase todavía no está configurado</h1>
    <p>El panel necesita un proyecto real de Firebase para guardar y leer datos. No hay datos simulados: hasta que se configure, el panel no opera.</p>
    <ol>
      <li>Copia el bloque <code>firebaseConfig</code> desde la consola de Firebase (⚙️ Configuración del proyecto → Tus apps → app web).</li>
      <li>Pega el JSON en <code>firebase-config-temp.json</code> y ejecuta <code>node herramientas/configurar-firebase.js</code>.</li>
      <li>En <code>assets/js/config.js</code> pon <code>firebase.habilitado: true</code>.</li>
      <li>Despliega reglas e índices: <code>firebase deploy --only firestore:rules,firestore:indexes</code>.</li>
      <li>Crea tu usuario en Authentication y su documento en la colección <code>usuarios</code> con <code>rol: "SUPERADMIN"</code>.</li>
    </ol>
    <p class="nocfg__nota">Guía completa: <code>README.md</code> sección 7 y <code>docs/DESPLIEGUE.md</code>.</p>
    <a class="btn btn--ghost" href="../index.html">Volver al sitio público</a>
  </div>`;

let app = null;
let auth = null;
let db = null;
let functions = null;

if (isConfigured()) {
  app = initializeApp(CFG.firebase.config);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, (CFG.firebase && CFG.firebase.region) || 'us-central1');
}

export { app, auth, db, functions };
