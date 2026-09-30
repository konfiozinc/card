#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/migrar-proyectos.js
   Migra los proyectos de clientes ya publicados en GitHub Pages a la
   colección `clientes` de Firestore.

   - Extrae automáticamente: nombre, servicio, categoría, URL, descripción,
     imagen de portada y fecha del archivo.
   - Deja los campos económicos/manuales en null o "PENDIENTE".
   - IDEMPOTENTE: si ya existe un cliente con la misma urlServicio, lo salta.
   - Por defecto hace DRY-RUN (no escribe nada). Para importar de verdad:
       node herramientas/migrar-proyectos.js --ejecutar
     Para importar sin pedir confirmación:
       node herramientas/migrar-proyectos.js --ejecutar --si

   Uso:
     node migrar-proyectos.js [--root <ruta>] [--ejecutar] [--si]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

/* ── Argumentos ─────────────────────────────────────────────────────── */
const ARGS = process.argv.slice(2);
function argVal(flag) {
  const i = ARGS.indexOf(flag);
  return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : null;
}
const WS_ROOT = argVal('--root') || process.env.KZ_WORKSPACE || 'C:/Users/usuario29/Documents/KONFIO_ZINC';
const EJECUTAR = ARGS.includes('--ejecutar');
const AUTO_SI = ARGS.includes('--si');
const SERVICE_ACCOUNT = argVal('--service-account') || process.env.KZ_SERVICE_ACCOUNT ||
  path.join(WS_ROOT, '14-HERRAMIENTAS-DESARROLLO', '.secrets', 'serviceAccount.json');

const PROJECT_ID = 'konfio-zinc';
const COLECCION = 'clientes';
const ORIGEN_GH = 'https://konfiozinc.github.io';

/* ── Mapeo carpeta de categoría → servicio + categoría ──────────────── */
const CATEGORIAS = {
  '1-TARJETAS-START':   { servicio: 'Tarjetas Digitales', categoria: 'STAR' },
  '2-TARJETAS-PRO':     { servicio: 'Tarjetas Digitales', categoria: 'PRO' },
  '3-TARJETAS-ELITE':   { servicio: 'Tarjetas Digitales', categoria: 'ELITE' },
  '4-TARJETAS-PREMIUM': { servicio: 'Tarjetas Digitales', categoria: null },
  '6-LANDING-PAGES':    { servicio: 'Landing Pages',      categoria: null },
  '7-CATALOGOS':        { servicio: 'Catálogos Digitales', categoria: null },
  '8-MENUS-DIGITALES':  { servicio: 'Menús Digitales',     categoria: null },
  '9-AGENTES-IA':       { servicio: 'Agentes IA',          categoria: null },
  '10-CODIGOS-QR':      { servicio: 'Códigos QR',          categoria: null }
};

/* Carpetas de proyecto que NO son clientes (plantillas / el propio sitio). */
const EXCLUIR = new Set([
  'Konfio-Zinc-Web', 'Plantilla_Base_Multiarchivo', 'Tarjeta_Pre', 'Asistente-IA', 'UneFibra-Agente'
]);

/* ── Utilidades ─────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function humanize(folder) {
  return String(folder || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function recortar(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > (max || 80) ? s.slice(0, (max || 80) - 1) + '…' : s;
}
const MARCA_RE = /KONF[IÍ]O\s*ZINC|KONFIO\s*ZINC|KONFIOZINC|KZ\s*SOLUCIONES|SOLUCIONES\s*DIGITALES/i;
/* Del título/h1 saca un nombre y una empresa legibles, sin el sufijo de marca. */
function extraerNombres(title, h1, folder) {
  const raw = stripTags(title || h1) || humanize(folder);
  const partes = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const limpio = partes.filter((p) => !MARCA_RE.test(p));
  const nombre = recortar(limpio[0] || raw || humanize(folder), 60);
  const empresa = recortar(limpio[1] || nombre, 60);
  return { nombre, empresa };
}
function slug(folder) {
  return String(folder || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function leer(ruta) {
  try { return fs.readFileSync(ruta, 'utf8'); } catch (e) { return ''; }
}

/* Extrae el primer match de una regex sobre el HTML. */
function capturar(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

/* Fecha de creación/actualización: primero git, luego mtime del archivo. */
function fechasDe(carpeta, indexHtml) {
  let creacion = null, ultima = null;
  try {
    if (fs.existsSync(path.join(carpeta, '.git'))) {
      const c = execSync('git log --diff-filter=A --format=%cI -- index.html', { cwd: carpeta, stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString().trim().split('\n').pop();
      const u = execSync('git log -1 --format=%cI -- index.html', { cwd: carpeta, stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString().trim();
      if (c) creacion = c;
      if (u) ultima = u;
    }
  } catch (e) { /* sin git o no disponible: se usa mtime */ }
  try {
    const st = fs.statSync(indexHtml);
    if (!creacion) creacion = st.birthtime.toISOString();
    if (!ultima) ultima = st.mtime.toISOString();
  } catch (e) {}
  return { creacion, ultima };
}

/* ── Escaneo de proyectos ───────────────────────────────────────────── */
function escanearProyectos() {
  const proyectos = [];
  for (const [cat, meta] of Object.entries(CATEGORIAS)) {
    const dir = path.join(WS_ROOT, cat);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    const subs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !EXCLUIR.has(e.name));
    for (const sub of subs) {
      const carpeta = path.join(dir, sub.name);
      const indexHtml = path.join(carpeta, 'index.html');
      if (!fs.existsSync(indexHtml)) continue;

      const html = leer(indexHtml);
      const title = capturar(html, /<title>([^<]*)<\/title>/i);
      const h1 = capturar(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const descripcion = capturar(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
        || capturar(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
      const ogImage = capturar(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)
        || capturar(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
      const canonical = capturar(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
      const ogUrl = capturar(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']*)["']/i)
        || capturar(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:url["']/i);

      let url = (canonical || ogUrl || '').trim();
      const urlAproximada = !url;
      if (!url) url = `${ORIGEN_GH}/${slug(sub.name)}/`;
      url = url.replace(/\/+$/, '') + '/';

      const { nombre, empresa } = extraerNombres(title, h1, sub.name);

      const { creacion, ultima } = fechasDe(carpeta, indexHtml);

      proyectos.push({
        carpeta: path.join(cat, sub.name),
        nombre,
        empresa,
        servicio: meta.servicio,
        categoria: meta.categoria,
        urlServicio: url,
        urlAproximada,
        proyectoId: url.replace(/\/+$/, '').split('/').pop(),
        descripcion: descripcion || '',
        imagenPortada: ogImage || null,
        fechaCreacionArchivo: creacion,
        fechaUltimaActualizacion: ultima
      });
    }
  }
  return proyectos;
}

/* ── Firestore ──────────────────────────────────────────────────────── */
let db = null;
let FieldValue = null;
function initFirestore() {
  if (db) return { db };
  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    console.error(`\n✖ No se encontró la credencial de servicio en:\n  ${SERVICE_ACCOUNT}`);
    console.error('  Pásala con --service-account <ruta> o define KZ_SERVICE_ACCOUNT.\n');
    process.exit(1);
  }
  let admin;
  const candidatos = ['firebase-admin', path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin')];
  for (const c of candidatos) {
    try { admin = require(c); break; } catch (e) { /* probar el siguiente */ }
  }
  if (!admin) {
    console.error('\n✖ No se pudo cargar firebase-admin. Instálalo con:\n  cd herramientas && npm install firebase-admin\n');
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || PROJECT_ID });
  db = admin.firestore();
  FieldValue = admin.firestore.FieldValue;
  return { db };
}

async function yaExiste(firestore, urlServicio) {
  const snap = await firestore.collection(COLECCION).where('urlServicio', '==', urlServicio).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function documento(p) {
  return {
    // Campos que el panel usa hoy:
    nombre: p.nombre,
    empresa: p.empresa,
    servicio: p.servicio,
    categoria: p.categoria,
    urlServicio: p.urlServicio,
    proyectoId: p.proyectoId || null,
    telefono: 'PENDIENTE',
    email: 'PENDIENTE',
    ciudad: 'PENDIENTE',
    documento: null,
    whatsapp: null,
    planId: null,
    planNombre: null,
    precio: null,
    metodoPagoPreferido: null,
    fechaActivacion: null,
    fechaVencimiento: null,
    estadoCliente: 'PENDIENTE_CONFIGURACION',
    estadoServicio: 'PENDIENTE_CONFIGURACION',
    activo: true,
    observaciones: 'Importado automáticamente desde GitHub. Revisar y completar datos. ' +
      (p.descripcion ? 'Descripción: ' + p.descripcion : ''),
    // Campos extra (no los usa el panel, sirven de trazabilidad):
    descripcion: p.descripcion || null,
    imagenPortada: p.imagenPortada || null,
    fechaCreacionArchivo: p.fechaCreacionArchivo || null,
    fechaUltimaActualizacion: p.fechaUltimaActualizacion || null,
    origenImportacion: 'github_auto',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

/* ── Reporte ────────────────────────────────────────────────────────── */
function reporte(lista, resultado) {
  const csv = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lineas = ['Nombre;Cliente;Servicio;Categoría;URL;Fecha creación;Estado;Acción'];
  for (const r of resultado) {
    lineas.push([r.nombre, r.empresa, r.servicio, r.categoria || '', r.urlServicio,
      (r.fechaCreacionArchivo || '').slice(0, 10), 'pendiente_configuracion', r.accion]
      .map(csv).join(';'));
  }
  const csvOut = '\uFEFF' + lineas.join('\r\n');
  const base = path.join(__dirname, 'reporte_importacion');
  fs.writeFileSync(base + '.csv', csvOut, 'utf8');
  fs.writeFileSync(base + '.json', JSON.stringify({ generado: new Date().toISOString(), dryRun: !EJECUTAR, proyectos: resultado }, null, 2), 'utf8');
  return base;
}

/* ── Main ───────────────────────────────────────────────────────────── */
async function main() {
  console.log('=== MIGRACIÓN DE PROYECTOS A FIRESTORE (KONFÍO ZINC) ===\n');
  console.log('Workspace:', WS_ROOT);
  console.log('Modo:', EJECUTAR ? 'ESCRITURA' : 'DRY-RUN (no escribe nada)');
  console.log('');

  const proyectos = escanearProyectos();
  console.log(`Se encontraron ${proyectos.length} proyectos con index.html.\n`);

  let resultado;
  if (!EJECUTAR) {
    resultado = proyectos.map((p) => ({
      ...p, accion: p.urlAproximada ? 'Simulado (URL aproximada)' : 'Simulado (dry-run)'
    }));
    for (const r of resultado) {
      console.log(`  • ${r.nombre}  →  ${r.servicio}${r.categoria ? ' · ' + r.categoria : ''}  [${r.urlServicio}]${r.urlAproximada ? '  ⚠ URL aproximada' : ''}`);
    }
    const base = reporte(proyectos, resultado);
    console.log(`\nReporte generado en:\n  ${base}.csv\n  ${base}.json`);
    console.log('\nNo se escribió nada en Firestore. Para importar, ejecuta:\n  node herramientas/migrar-proyectos.js --ejecutar');
    return;
  }

  // Modo escritura: resumen antes de confirmar.
  const { db: firestore } = initFirestore();

  const resumen = { nuevos: [], existentes: [], errores: [] };
  for (const p of proyectos) {
    try {
      const existente = await yaExiste(firestore, p.urlServicio);
      if (existente) resumen.existentes.push({ ...p, accion: 'Ya existía' });
      else resumen.nuevos.push({ ...p, accion: 'Creado' });
    } catch (e) {
      resumen.errores.push({ ...p, accion: 'Error', error: String(e.message || e) });
    }
  }

  console.log(`Resumen:\n  • ${resumen.nuevos.length} nuevos (se crearán)`);
  console.log(`  • ${resumen.existentes.length} ya existentes (no se tocarán)`);
  console.log(`  • ${resumen.errores.length} con errores (revisar)\n`);

  if (!resumen.nuevos.length) {
    console.log('No hay proyectos nuevos que importar.');
    return;
  }

  if (!AUTO_SI) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ok = await new Promise((resolve) => rl.question('¿Continuar con la creación? (s/n): ', (a) => { rl.close(); resolve(a.trim().toLowerCase() === 's'); }));
    if (!ok) { console.log('Cancelado. No se escribió nada.'); return; }
  }

  for (const p of resumen.nuevos) {
    try {
      await firestore.collection(COLECCION).add(documento(p));
    } catch (e) {
      resumen.errores.push({ ...p, accion: 'Error', error: String(e.message || e) });
    }
  }

  const final = [...resumen.nuevos, ...resumen.existentes, ...resumen.errores];
  const base = reporte(proyectos, final);
  console.log('\nListo.');
  console.log(`  Creados: ${resumen.nuevos.length} · Ya existían: ${resumen.existentes.length} · Errores: ${resumen.errores.length}`);
  console.log(`Reporte: ${base}.csv / ${base}.json`);
}

main().catch((e) => { console.error('\nError inesperado:', e); process.exit(1); });
