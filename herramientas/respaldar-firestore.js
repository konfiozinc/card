#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/respaldar-firestore.js
   Backup LOCAL de SOLO LECTURA de Firestore (plan Spark).

   - Exporta documentos y subcolecciones con rutas completas en un manifiesto v2.
   - NO escribe NUNCA en Firestore (solo lecturas).
   - Cada ejecución usa una carpeta nueva en herramientas/backups/ (gitignored).
   - Solo manifiesto.json publicado al final acredita una exportación completa.

   Uso:
     node herramientas/respaldar-firestore.js
     node herramientas/respaldar-firestore.js --service-account <ruta>
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const ARGS = process.argv.slice(2);
function argVal(flag) {
  const i = ARGS.indexOf(flag);
  return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : null;
}
const SERVICE_ACCOUNT = argVal('--service-account') || process.env.KZ_SERVICE_ACCOUNT ||
  'C:/Users/usuario29/Documents/KONFIO_ZINC/14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json';

function loadAdmin() {
  const candidatos = ['firebase-admin', path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin')];
  for (const c of candidatos) {
    try { return require(c); } catch (e) { /* probar el siguiente */ }
  }
  console.error('\n✖ No se pudo cargar firebase-admin.');
  console.error('  cd herramientas && npm install firebase-admin\n');
  process.exit(1);
}

/* Serializa valores de Firestore a JSON legible (Timestamps → ISO). */
function ser(v) {
  if (v === null) return v;
  const t = typeof v;
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new Error('Número no representable sin pérdida en este formato JSON');
    return v;
  }
  if (t === 'string' || t === 'boolean') return v;
  if (t !== 'object') throw new Error('Valor no representable en este formato JSON');
  if (typeof v.toDate === 'function') return v.toDate().toISOString();           // Timestamp
  if (Array.isArray(v)) return v.map(ser);
  if (t === 'object') {
    if (v.path && v.firestore) return { __ref: v.path };                          // DocumentReference
    const o = Object.create(null);
    for (const k of Object.keys(v)) o[k] = ser(v[k]);
    return o;
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** No inicializa Firebase: recibe una interfaz de lectura, simulable en pruebas. */
async function exportarRespaldo(db, backupRoot = path.join(__dirname, 'backups')) {
  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  // mkdtemp nunca reutiliza una ejecución histórica, aunque coincidan minuto y proceso.
  const outDir = fs.mkdtempSync(path.join(backupRoot, 'firestore_' + stamp() + '_'));
  fs.mkdirSync(path.join(outDir, 'documentos'), { mode: 0o700 });
  const resumen = { fecha: new Date().toISOString(), projectId: 'konfio-zinc',
    colecciones: Object.create(null), totalDocumentos: 0 };
  const documentos = [], coleccionesVistas = new Set(), documentosVistos = new Set();

  function escribirJson(archivo, valor) {
    const contenido = Buffer.from(JSON.stringify(valor, null, 2) + '\n', 'utf8');
    const fd = fs.openSync(path.join(outDir, archivo), 'wx', 0o600);
    try {
      fs.writeFileSync(fd, contenido);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return { archivo, bytes: contenido.length, sha256: createHash('sha256').update(contenido).digest('hex') };
  }

  async function volcar(colRef, rutaEsperada) {
    if (colRef.path !== rutaEsperada || coleccionesVistas.has(rutaEsperada)) throw new Error('Ruta de colección inconsistente o duplicada');
    coleccionesVistas.add(rutaEsperada);
    resumen.colecciones[rutaEsperada] = 0;
    // listDocuments incluye padres inexistentes que get() de colección ocultaría.
    // Si uno desaparece/no existe, abortar; no ocultar posibles subcolecciones.
    const refs = await colRef.listDocuments();
    for (const ref of refs) {
      const ruta = ref.path;
      if (typeof ref.id !== 'string' || !ref.id || ref.id.includes('/') || ruta !== rutaEsperada + '/' + ref.id || documentosVistos.has(ruta)) {
        throw new Error('Ruta de documento inconsistente o duplicada');
      }
      documentosVistos.add(ruta);
      const snap = await ref.get();
      if (!snap.exists) throw new Error('Documento ausente durante el recorrido: exportación incompleta');
      const archivo = 'documentos/' + String(documentos.length + 1).padStart(12, '0') + '.json';
      const entrada = escribirJson(archivo, { ruta, datos: ser(snap.data()) });
      documentos.push({ ...entrada, ruta });
      resumen.colecciones[rutaEsperada]++;
      resumen.totalDocumentos++;
      const subs = await ref.listCollections(); // cualquier error aborta, nunca se descarta
      for (const sub of subs) {
        if (typeof sub.id !== 'string' || !sub.id || sub.id.includes('/')) throw new Error('Identificador de colección inválido');
        await volcar(sub, ruta + '/' + sub.id);
      }
    }
  }

  const top = await db.listCollections();
  for (const col of top) {
    if (typeof col.id !== 'string' || !col.id || col.id.includes('/')) throw new Error('Colección raíz inválida');
    await volcar(col, col.id);
  }
  const indiceResumen = escribirJson('resumen.json', resumen);
  const manifiesto = { formato: 'kz-firestore-json', version: 2, estado: 'COMPLETO',
    ...resumen, documentos, resumen: indiceResumen };
  // Mantener el preparado: publicar por enlace es atómico y NO reemplaza destinos.
  // Hasta este último paso, incluso un archivo truncado carece de marca de validez.
  escribirJson('manifiesto.preparado.json', manifiesto);
  fs.linkSync(path.join(outDir, 'manifiesto.preparado.json'), path.join(outDir, 'manifiesto.json'));
  return { outDir, resumen, manifiesto };
}

async function main() {
  console.log('=== BACKUP LOCAL DE FIRESTORE (SOLO LECTURA) ===\n');

  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    console.error(`✖ No se encontró la credencial en:\n  ${SERVICE_ACCOUNT}`);
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  if (sa.project_id !== 'konfio-zinc') {
    console.error(`✖ La credencial no es del proyecto konfio-zinc (es "${sa.project_id}"). Abortando.`);
    process.exit(1);
  }
  console.log('Credencial OK · proyecto:', sa.project_id);

  const admin = loadAdmin();
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
  const db = admin.firestore();

  const { outDir, resumen } = await exportarRespaldo(db);

  console.log('\n✔ Backup completo en:\n  ' + outDir);
  console.log(`\nTOTAL de documentos: ${resumen.totalDocumentos}`);
  return { outDir, resumen };
}

module.exports = { exportarRespaldo };
if (require.main === module) {
  main().then(() => process.exit(0)).catch(() => {
    console.error('\n✖ El backup FALLÓ. No usar ninguna carpeta sin manifiesto.json completo y validado.');
    process.exit(1);
  });
}
