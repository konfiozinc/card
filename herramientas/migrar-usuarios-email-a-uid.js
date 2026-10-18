/* ═══════════════════════════════════════════════════════════════════
   migrar-usuarios-email-a-uid.js · KONFÍO ZINC — CARD

   QUÉ PROBLEMA RESUELVE
   El panel antiguo creaba las fichas de usuario con el CORREO como id:
       usuarios/ana@empresa.com   { rol: "ADMIN", ... }
   El login, en cambio, busca la ficha por el uid de Authentication:
       usuarios/{auth.uid}
   Resultado: ese usuario entra a Firebase Auth pero el panel no encuentra su
   rol y lo trata como si no tuviera permisos.

   QUÉ HACE
   Recorre `usuarios`, detecta las fichas cuyo id es un correo, busca la cuenta
   de Authentication con ese correo y escribe la ficha en `usuarios/{auth.uid}`
   conservando rol y estado. Por defecto SOLO SIMULA; no escribe nada.

   USO
     # 1) simulación (no toca nada, solo informa)
     node herramientas/migrar-usuarios-email-a-uid.js

     # 2) aplicación real
     node herramientas/migrar-usuarios-email-a-uid.js --aplicar

   CONTRA EL EMULADOR (por defecto si están las variables de entorno):
     $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
     $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
     $env:GCLOUD_PROJECT = 'demo-card-seguridad'

   CONTRA PRODUCCIÓN (solo cuando se autorice):
     $env:GOOGLE_APPLICATION_CREDENTIALS = 'ruta/al/serviceAccount.json'
     $env:GCLOUD_PROJECT = 'konfio-zinc'

   GARANTÍAS
   · No borra nada hasta haber escrito correctamente la ficha nueva.
   · Si ya existe una ficha con el uid, NO la sobrescribe: informa y lo deja.
   · Rol por defecto: OPERADOR (el mínimo privilegio) cuando la ficha vieja no
     trae un rol válido.
   · Reejecutable: una segunda pasada no encuentra nada que migrar.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');

/* firebase-admin ya está instalado en functions/node_modules; se reutiliza
   para no instalar nada nuevo. */
function cargarAdmin() {
  const candidatos = [
    'firebase-admin',
    path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'),
    /* Un worktree de git no lleva node_modules; se reutiliza el del clon. */
    path.join(__dirname, '..', '..', 'Konfio-Zinc-Web', 'functions', 'node_modules', 'firebase-admin'),
  ];
  for (const c of candidatos) {
    try { return require(c); } catch (e) { /* siguiente */ }
  }
  throw new Error('No se encontró firebase-admin. Ejecuta este script desde el repo card (functions/node_modules debe existir).');
}

const ROLES_VALIDOS = ['OPERADOR', 'ADMIN', 'SUPERADMIN'];
const ROL_POR_DEFECTO = 'OPERADOR';
const APLICAR = process.argv.includes('--aplicar');

const esCorreo = (id) => /\S+@\S+\.\S+/.test(id);

(async () => {
  const admin = cargarAdmin();
  const proyecto = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId || '(sin proyecto)';
  const usandoEmulador = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

  console.log('\n═══ MIGRACIÓN DE FICHAS DE USUARIO: correo → uid ═══');
  console.log(`  proyecto   : ${proyecto}`);
  console.log(`  destino    : ${usandoEmulador ? 'EMULADOR (local)' : '⚠ PROYECTO REAL'}`);
  console.log(`  modo       : ${APLICAR ? 'APLICAR (escribe)' : 'SIMULACIÓN (no escribe nada)'}\n`);

  if (!APLICAR) console.log('  (añade --aplicar para ejecutar los cambios de verdad)\n');

  admin.initializeApp({ projectId: proyecto === '(sin proyecto)' ? undefined : proyecto });
  const db = admin.firestore();
  const auth = admin.auth();

  const snap = await db.collection('usuarios').get();
  const todas = snap.docs.map((d) => ({ id: d.id, datos: d.data() || {} }));
  const viejas = todas.filter((u) => esCorreo(u.id));
  const nuevas = new Set(todas.filter((u) => !esCorreo(u.id)).map((u) => u.id));

  console.log(`  fichas totales            : ${todas.length}`);
  console.log(`  con formato antiguo (email): ${viejas.length}`);
  console.log(`  ya con uid                : ${nuevas.size}\n`);

  if (!viejas.length) {
    console.log('  Nada que migrar. Todas las fichas usan ya el uid.\n');
    process.exit(0);
  }

  const resumen = { migradas: 0, yaExistentes: 0, sinCuentaAuth: 0, sinRol: 0, errores: 0 };

  for (const ficha of viejas) {
    const correo = String(ficha.id).trim().toLowerCase();
    const datos = ficha.datos;

    let cuenta;
    try {
      cuenta = await auth.getUserByEmail(correo);
    } catch (e) {
      if (e && e.code === 'auth/user-not-found') {
        resumen.sinCuentaAuth++;
        console.log(`  ✗ ${correo}`);
        console.log('      no existe una cuenta de Authentication con ese correo: no se puede migrar (ninguna ficha por uid tendría con qué entrar).');
        continue;
      }
      resumen.errores++;
      console.log(`  ✗ ${correo}  error consultando Authentication: ${e && e.message}`);
      continue;
    }

    const uid = cuenta.uid;
    if (nuevas.has(uid)) {
      resumen.yaExistentes++;
      console.log(`  = ${correo}`);
      console.log(`      ya existe usuarios/${uid}; no se sobrescribe. Revisa a mano si la ficha nueva perdió algún dato.`);
      continue;
    }

    const rolCrudo = String(datos.rol || '').trim().toUpperCase();
    const rol = ROLES_VALIDOS.includes(rolCrudo) ? rolCrudo : ROL_POR_DEFECTO;
    if (!ROLES_VALIDOS.includes(rolCrudo)) resumen.sinRol++;

    const nueva = {
      uid,
      nombre: datos.nombre || cuenta.displayName || correo,
      email: correo,
      rol,
      activo: datos.activo === undefined ? true : datos.activo === true,
      createdAt: datos.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      /* Rastro de la migración, para poder auditar qué pasó. */
      migradoDe: ficha.id,
      migradoEn: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!APLICAR) {
      resumen.migradas++;
      console.log(`  → ${correo}`);
      console.log(`      escribiría usuarios/${uid} con rol ${rol}${ROLES_VALIDOS.includes(rolCrudo) ? '' : ' (por defecto: la ficha antigua no traía un rol válido)'} y activo=${nueva.activo}`);
      continue;
    }

    try {
      await db.doc(`usuarios/${uid}`).set(nueva);
      /* Solo después de que la ficha nueva esté escrita se retira la antigua. */
      await db.doc(`usuarios/${ficha.id}`).delete();
      resumen.migradas++;
      console.log(`  ✓ ${correo} → usuarios/${uid}  (rol ${rol}${ROLES_VALIDOS.includes(rolCrudo) ? '' : ', por defecto'})`);
    } catch (e) {
      resumen.errores++;
      console.log(`  ✗ ${correo}  no se pudo migrar: ${e && e.message}`);
    }
  }

  console.log('\n────────────── RESUMEN ──────────────');
  console.log(`  ${APLICAR ? 'migradas' : 'se migrarían'}      : ${resumen.migradas}`);
  console.log(`  ya existían      : ${resumen.yaExistentes}`);
  console.log(`  sin cuenta Auth  : ${resumen.sinCuentaAuth}`);
  console.log(`  con rol por def. : ${resumen.sinRol}`);
  console.log(`  errores          : ${resumen.errores}`);
  if (!APLICAR) console.log('\n  Simulación: no se modificó ningún documento.');
  if (resumen.sinCuentaAuth) console.log('\n  OJO: las fichas marcadas con ✗ necesitan que antes exista la cuenta en Authentication → Users.');
  console.log('');

  process.exit(resumen.errores ? 1 : 0);
})().catch((e) => {
  console.error('\n[ERROR] ' + (e && e.message));
  process.exit(2);
});
