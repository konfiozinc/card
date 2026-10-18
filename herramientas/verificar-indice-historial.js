/* ═══════════════════════════════════════════════════════════════════
   verificar-indice-historial.js · KONFÍO ZINC — CARD

   Comprueba que la consulta que usa el panel para el historial del cliente
   funciona contra el proyecto indicado. Sirve como verificación POSTERIOR a
   crear el índice compuesto en Firestore real:

     historial_estados: clienteId ASC, fecha DESC

   Sin ese índice, Firestore responde FAILED_PRECONDITION ("The query requires
   an index"). El emulador NO lo exige, por eso este script es la única forma
   de comprobarlo de verdad.

   USO
     # contra el emulador (debe responder OK siempre: no valida el índice)
     $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
     $env:GCLOUD_PROJECT='demo-card-seguridad'
     node herramientas/verificar-indice-historial.js

     # contra el proyecto real, cuando se autorice (con credenciales)
     $env:GCLOUD_PROJECT='konfio-zinc'
     $env:GOOGLE_APPLICATION_CREDENTIALS='ruta/serviceAccount.json'
     node herramientas/verificar-indice-historial.js

   Salida: código 0 si la consulta se ejecuta; 1 si falta el índice; 2 si hay
   otro error (permisos, red…). Es de SOLO LECTURA.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');

function cargarAdmin() {
  const candidatos = [
    'firebase-admin',
    path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'),
    path.join(__dirname, '..', '..', 'Konfio-Zinc-Web', 'functions', 'node_modules', 'firebase-admin'),
  ];
  for (const c of candidatos) { try { return require(c); } catch (e) { /* siguiente */ } }
  throw new Error('No se encontró firebase-admin');
}

(async () => {
  const proyecto = process.env.GCLOUD_PROJECT || '(sin proyecto)';
  const emulador = !!process.env.FIRESTORE_EMULATOR_HOST;
  console.log('\n═══ VERIFICACIÓN DE LA CONSULTA DEL HISTORIAL ═══');
  console.log(`  proyecto : ${proyecto}`);
  console.log(`  destino  : ${emulador ? 'EMULADOR (no valida índices)' : 'FIRESTORE REAL'}\n`);

  const admin = cargarAdmin();
  admin.initializeApp({ projectId: proyecto === '(sin proyecto)' ? undefined : proyecto });
  const db = admin.firestore();

  try {
    /* La misma forma exacta que historialDe() en assets/js/admin/datos.js */
    const snap = await db.collection('historial_estados')
      .where('clienteId', '==', 'verificacion-indice')
      .orderBy('fecha', 'desc')
      .limit(1)
      .get();
    console.log(`  ✓ la consulta se ejecutó (${snap.size} documentos para el cliente de prueba)`);
    if (emulador) {
      console.log('  ⚠ en el emulador esto NO demuestra que exista el índice:');
      console.log('    solo confirma que la consulta está bien escrita.');
    } else {
      console.log('  ✓ el índice compuesto existe y está listo en este proyecto');
    }
    process.exit(0);
  } catch (e) {
    const msg = String(e && e.message);
    if (/requires an index|FAILED_PRECONDITION|index/i.test(msg)) {
      console.error('  ✗ FALTA EL ÍNDICE. Firestore lo pide explícitamente:');
      console.error('    ' + msg.split('\n')[0]);
      const url = (msg.match(/https:\/\/console\.firebase\.google\.com\/\S+/) || [])[0];
      if (url) console.error('    consola: ' + url);
      process.exit(1);
    }
    console.error('  ✗ error distinto (permisos o red): ' + msg.split('\n')[0]);
    process.exit(2);
  }
})().catch((e) => { console.error('\n[ERROR] ' + e.message + '\n'); process.exit(2); });
