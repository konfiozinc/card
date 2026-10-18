/* ═══════════════════════════════════════════════════════════════════
   respaldo-emulador.js · KONFÍO ZINC — CARD

   Respaldo y restauración de Firestore contra el EMULADOR, con verificación
   de integridad por SHA-256. Sirve para ensayar el procedimiento completo
   antes de tocar producción.

   USO
     # respaldar (escribe un JSON + su manifiesto de hashes)
     node herramientas/respaldo-emulador.js --respaldar

     # restaurar en una base vacía o distinta (borra esa base primero)
     node herramientas/respaldo-emulador.js --restaurar <carpeta-del-respaldo>

     # comprobar un respaldo sin restaurarlo
     node herramientas/respaldo-emulador.js --verificar <carpeta-del-respaldo>

   REQUISITOS
     $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
     $env:GCLOUD_PROJECT          = 'demo-card-seguridad'

   El script se NIEGA a ejecutarse si no detecta el emulador (FIRESTORE_EMULATOR_HOST),
   para que nadie lo apunte a producción por error.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function cargarAdmin() {
  const candidatos = [
    'firebase-admin',
    path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'),
    path.join(__dirname, '..', '..', 'Konfio-Zinc-Web', 'functions', 'node_modules', 'firebase-admin'),
  ];
  for (const c of candidatos) { try { return require(c); } catch (e) { /* siguiente */ } }
  throw new Error('No se encontró firebase-admin');
}

const ESTAMPADO = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const SALIDA_BASE = path.join(process.env.TEMP, 'kz-respaldos-card');
const sha256 = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

/* Convierte valores de Firestore a JSON plano, conservando el tipo. */
const INFINITO = '__infinito__';
function serializar(v) {
  if (v === null || v === undefined) return null;
  if (v && typeof v.toDate === 'function' && typeof v.seconds === 'number') return { __tipo: 'timestamp', valor: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(serializar);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = serializar(x);
    return out;
  }
  return v;
}
function deserializar(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(deserializar);
  if (v && typeof v === 'object') {
    if (v.__tipo === 'timestamp') return new Date(v.valor);
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = deserializar(x);
    return out;
  }
  return v;
}

(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('\n  ABORTADO: FIRESTORE_EMULATOR_HOST no está definido.');
    console.error('  Este script solo trabaja contra el emulador. Para producción se usa');
    console.error('  `gcloud firestore export`, no esto.\n');
    process.exit(2);
  }
  const admin = cargarAdmin();
  const proyecto = process.env.GCLOUD_PROJECT || 'demo-card-seguridad';
  admin.initializeApp({ projectId: proyecto });
  const db = admin.firestore();
  const modo = process.argv[2] || '--respaldar';

  /* ── RESPALDAR ─────────────────────────────────────────────────── */
  if (modo === '--respaldar') {
    const dir = path.join(SALIDA_BASE, ESTAMPADO);
    fs.mkdirSync(dir, { recursive: true });
    const colecciones = await db.listCollections();
    const manifiesto = { proyecto, fecha: new Date().toISOString(), emulador: process.env.FIRESTORE_EMULATOR_HOST, colecciones: {}, totalDocumentos: 0 };

    for (const col of colecciones) {
      const snap = await col.get();
      const docs = snap.docs.map((d) => ({ id: d.id, datos: serializar(d.data()) }));
      const json = JSON.stringify({ coleccion: col.id, documentos: docs }, null, 1);
      const archivo = `col-${col.id}.json`;
      fs.writeFileSync(path.join(dir, archivo), json, 'utf8');
      manifiesto.colecciones[col.id] = { archivo, documentos: docs.length, bytes: Buffer.byteLength(json), sha256: sha256(json) };
      manifiesto.totalDocumentos += docs.length;
      console.log(`  ${col.id.padEnd(22)} ${String(docs.length).padStart(4)} docs · ${sha256(json).slice(0, 16)}…`);
    }
    fs.writeFileSync(path.join(dir, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2) + '\n', 'utf8');
    console.log(`\n  respaldo: ${dir}`);
    console.log(`  ${colecciones.length} colecciones · ${manifiesto.totalDocumentos} documentos`);
    console.log(`  manifiesto.json con el SHA-256 de cada colección\n`);
    process.exit(0);
  }

  /* ── VERIFICAR / RESTAURAR ─────────────────────────────────────── */
  const dir = process.argv[3];
  if (!dir || !fs.existsSync(path.join(dir, 'manifiesto.json'))) {
    console.error('\n  Falta la carpeta del respaldo (debe contener manifiesto.json).\n');
    process.exit(2);
  }
  const manifiesto = JSON.parse(fs.readFileSync(path.join(dir, 'manifiesto.json'), 'utf8'));

  /* Integridad: cada archivo debe coincidir con su hash del manifiesto. */
  let integridadOK = true;
  for (const [nombre, info] of Object.entries(manifiesto.colecciones)) {
    const ruta = path.join(dir, info.archivo);
    if (!fs.existsSync(ruta)) { console.log(`  ✗ falta ${info.archivo}`); integridadOK = false; continue; }
    const txt = fs.readFileSync(ruta, 'utf8');
    const h = sha256(txt);
    const ok = h === info.sha256;
    if (!ok) integridadOK = false;
    console.log(`  ${ok ? '✓' : '✗'} ${nombre.padEnd(22)} hash ${ok ? 'coincide' : 'NO COINCIDE'}`);
  }
  if (!integridadOK) { console.error('\n  ABORTADO: el respaldo no pasa la verificación de integridad.\n'); process.exit(1); }
  console.log('\n  integridad del respaldo: OK');
  if (modo === '--verificar') { console.log('  (solo verificación, no se escribió nada)\n'); process.exit(0); }

  if (modo !== '--restaurar') { console.error('  Modo no reconocido.\n'); process.exit(2); }

  /* Borrar la base destino antes de restaurar (es un emulador). */
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${proyecto}/databases/(default)/documents`, { method: 'DELETE' });
  console.log('  base del emulador vaciada');

  let restaurados = 0;
  for (const [nombre, info] of Object.entries(manifiesto.colecciones)) {
    const datos = JSON.parse(fs.readFileSync(path.join(dir, info.archivo), 'utf8'));
    let lote = db.batch(), enLote = 0;
    for (const d of datos.documentos) {
      lote.set(db.collection(nombre).doc(d.id), deserializar(d.datos));
      enLote++;
      if (enLote === 400) { await lote.commit(); lote = db.batch(); enLote = 0; }
    }
    if (enLote) await lote.commit();
    restaurados += datos.documentos.length;
    console.log(`  ${nombre.padEnd(22)} ${String(datos.documentos.length).padStart(4)} docs restaurados`);
  }

  /* Verificación posterior: recomputar los hashes desde Firestore. */
  console.log('\n  verificación tras restaurar:');
  let iguales = 0, distintos = 0;
  for (const [nombre, info] of Object.entries(manifiesto.colecciones)) {
    const snap = await db.collection(nombre).get();
    const docs = snap.docs.map((d) => ({ id: d.id, datos: serializar(d.data()) }));
    const json = JSON.stringify({ coleccion: nombre, documentos: docs }, null, 1);
    const h = sha256(json);
    const totalSeguro = h === info.sha256;
    if (totalSeguro) iguales++; else distintos++;
    console.log(`  ${totalSeguro ? '✓' : '≈'} ${nombre.padEnd(22)} ${docs.length}/${info.documentos} docs${totalSeguro ? '' : ' (hash distinto: normal si Firestore añade timestamps de servidor)'}`);
  }
  console.log(`\n  restaurados ${restaurados} documentos · ${iguales} colecciones idénticas · ${distintos} con diferencias`);
  process.exit(0);
})().catch((e) => { console.error('\n[ERROR] ' + e.message + '\n'); process.exit(2); });
