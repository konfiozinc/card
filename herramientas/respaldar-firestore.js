#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/respaldar-firestore.js
   Backup LOCAL de SOLO LECTURA de Firestore (plan Spark).

   - Recorre TODAS las colecciones (y subcolecciones) y las exporta a JSON.
   - NO escribe NUNCA en Firestore (solo lecturas).
   - Guarda en herramientas/backups/firestore_<fecha>/ (gitignored).
   - Genera resumen.json con el conteo por colección.

   Uso:
     node herramientas/respaldar-firestore.js
     node herramientas/respaldar-firestore.js --service-account <ruta>
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

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
  if (v == null) return v;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();           // Timestamp
  if (Array.isArray(v)) return v.map(ser);
  if (t === 'object') {
    if (v.path && v.firestore) return { __ref: v.path };                          // DocumentReference
    const o = {};
    for (const k of Object.keys(v)) o[k] = ser(v[k]);
    return o;
  }
  return String(v);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
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

  const outDir = path.join(__dirname, 'backups', 'firestore_' + stamp());
  fs.mkdirSync(outDir, { recursive: true });

  const resumen = { fecha: new Date().toISOString(), projectId: sa.project_id, colecciones: {}, totalDocumentos: 0 };

  async function volcar(colRef, nombre) {
    const snap = await colRef.get();
    const docs = {};
    snap.forEach((d) => { docs[d.id] = ser(d.data()); });
    fs.writeFileSync(path.join(outDir, nombre + '.json'), JSON.stringify(docs, null, 2), 'utf8');
    resumen.colecciones[nombre] = snap.size;
    resumen.totalDocumentos += snap.size;

    // Subcolecciones (ej. clientes/{id}/pagos) → archivos planos con '--'
    for (const d of snap.docs) {
      let subs = [];
      try { subs = await d.ref.listCollections(); } catch (e) { /* sin subcolecciones o sin permiso */ }
      for (const sub of subs) {
        await volcar(sub, nombre + '--' + sub.id);
      }
    }
  }

  const top = await db.listCollections();
  for (const col of top) {
    await volcar(col, col.id);
  }

  fs.writeFileSync(path.join(outDir, 'resumen.json'), JSON.stringify(resumen, null, 2), 'utf8');

  console.log('\n✔ Backup completo en:\n  ' + outDir);
  console.log('\nDocumentos por colección:');
  for (const [k, v] of Object.entries(resumen.colecciones).sort()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`\nTOTAL de documentos: ${resumen.totalDocumentos}`);
  return { outDir, resumen };
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\n✖ El backup FALLÓ:', e);
  process.exit(1);
});
