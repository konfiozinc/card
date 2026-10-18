#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-respaldo-firestore.js

   Comprueba que una carpeta de respaldo hecha con
   herramientas/respaldar-firestore.js está COMPLETA e ÍNTEGRA, sin abrir
   Firestore: trabaja solo con los archivos locales.

   Verifica, uno por uno:
     · manifiesto.json existe y está marcado como COMPLETO
     · cada documento listado existe, mide lo que dice y su SHA-256 coincide
     · el resumen por colección cuadra con los documentos del manifiesto
     · la huella del resumen.json coincide con la guardada en el manifiesto

   Un respaldo sin manifiesto válido NO cuenta como respaldo: es la regla que
   ya aplica respaldar-firestore.js al escribirlo (el manifiesto se publica
   al final, cuando todo lo demás está en disco).

   Uso:
     node herramientas/verificar-respaldo-firestore.js --dir <carpeta>
   Códigos de salida: 0 íntegro · 1 problemas · 2 uso o carpeta inexistente
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const ARGS = process.argv.slice(2);
const argVal = (f) => { const i = ARGS.indexOf(f); return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : null; };
const DIR = argVal('--dir');
const SILENCIOSO = ARGS.includes('--quiet');

const SALIDA = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  SALIDA.push({ nombre, estado: e, detalle });
  if (SILENCIOSO) return;
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : 'NO VERIF';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(44)} ${detalle || ''}`);
}

function sha256De(archivo) {
  return createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
}

function terminar(codigo) {
  const fallos = SALIDA.filter((x) => x.estado === 'FALLIDO').length;
  if (!SILENCIOSO) {
    console.log('');
    console.log(`  RESULTADO: ${SALIDA.length - fallos} aprobadas · ${fallos} fallidas`);
    console.log(fallos === 0
      ? '  El respaldo está completo e íntegro. Sirve como punto de restauración.'
      : '  El respaldo NO es utilizable. No se despliega ni se migra con este respaldo.');
    console.log('');
  }
  process.exit(codigo);
}

if (!DIR) {
  console.error('\n  ✖ Falta --dir <carpeta del respaldo>.\n');
  process.exit(2);
}
if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error(`\n  ✖ No existe la carpeta: ${DIR}\n`);
  process.exit(2);
}

console.log('');
console.log('═══ VERIFICACIÓN DE UN RESPALDO LOCAL DE FIRESTORE ═══');
console.log(`  carpeta: ${DIR}`);
console.log('');

/* ── 1. Manifiesto ─────────────────────────────────────────────────── */
const rutaManifiesto = path.join(DIR, 'manifiesto.json');
if (!fs.existsSync(rutaManifiesto)) {
  anotar('Existe manifiesto.json', false, 'sin manifiesto no hay respaldo acreditado');
  terminar(1);
}
let m;
try { m = JSON.parse(fs.readFileSync(rutaManifiesto, 'utf8')); }
catch (e) { anotar('El manifiesto es JSON válido', false, e.message); terminar(1); }

anotar('Existe manifiesto.json', true, `${Math.round(fs.statSync(rutaManifiesto).size / 1024)} KB`);
anotar('Formato reconocido', m.formato === 'kz-firestore-json', `formato = ${m.formato}`);
anotar('Versión soportada', m.version === 2, `version = ${m.version}`);
anotar('Marcado como COMPLETO', m.estado === 'COMPLETO', `estado = ${m.estado}`);
if (m.formato !== 'kz-firestore-json' || m.version !== 2 || m.estado !== 'COMPLETO') terminar(1);

/* ── 2. Cada documento: existe, pesa lo que dice y la huella coincide ─ */
const docs = Array.isArray(m.documentos) ? m.documentos : [];
anotar('Lista de documentos presente', docs.length > 0, `${docs.length} documentos`);
if (!docs.length) terminar(1);

let malos = 0;
const porColeccion = {};
for (const d of docs) {
  if (!d || typeof d.archivo !== 'string' || typeof d.ruta !== 'string') { malos++; continue; }
  const abs = path.join(DIR, d.archivo);
  if (!fs.existsSync(abs)) { malos++; continue; }
  const bytes = fs.statSync(abs).size;
  if (bytes !== d.bytes) { malos++; continue; }
  if (sha256De(abs) !== d.sha256) { malos++; continue; }
  const col = d.ruta.includes('/') ? d.ruta.slice(0, d.ruta.lastIndexOf('/')) : d.ruta;
  porColeccion[col] = (porColeccion[col] || 0) + 1;
}
anotar('Documentos íntegros (existen · tamaño · SHA-256)', malos === 0, `${docs.length - malos} de ${docs.length}`);

/* ── 3. El resumen tiene que cuadrar con lo verificado ─────────────── */
const resumen = m.colecciones && typeof m.colecciones === 'object' ? m.colecciones : null;
anotar('El manifiesto trae el conteo por colección', resumen !== null,
  resumen ? `${Object.keys(resumen).length} colecciones` : 'falta el campo colecciones');

if (resumen) {
  const discrepancias = [];
  for (const [col, n] of Object.entries(resumen)) {
    const real = porColeccion[col] || 0;
    if (real !== n) discrepancias.push(`${col}: manifiesto ${n} · archivos ${real}`);
  }
  for (const col of Object.keys(porColeccion)) {
    if (!(col in resumen)) discrepancias.push(`${col}: archivos ${porColeccion[col]} · no está en el manifiesto`);
  }
  anotar('Conteo por colección cuadra', discrepancias.length === 0,
    discrepancias.length ? discrepancias.slice(0, 4).join(' | ') : 'sin discrepancias');
}

const totalDeclarado = typeof m.totalDocumentos === 'number' ? m.totalDocumentos : null;
anotar('Total de documentos cuadra', totalDeclarado === docs.length,
  `manifiesto ${totalDeclarado} · lista ${docs.length}`);

/* ── 4. Huella del resumen.json ───────────────────────────────────── */
const rutaResumen = path.join(DIR, 'resumen.json');
const huellaResumen = m.resumen && typeof m.resumen.sha256 === 'string' ? m.resumen.sha256 : null;
if (!fs.existsSync(rutaResumen)) anotar('resumen.json existe', false, 'no está en la carpeta');
else if (!huellaResumen) anotar('El manifiesto guarda la huella de resumen.json', false, 'sin huella');
else anotar('resumen.json coincide con su huella', sha256De(rutaResumen) === huellaResumen,
  sha256De(rutaResumen).slice(0, 12) + '…');

/* ── 5. Fecha y alcance, para poder citar el respaldo ─────────────── */
if (m.generadoEn) anotar('Fecha de generación registrada', true, String(m.generadoEn));
if (m.proyecto) anotar('Proyecto registrado', true, String(m.proyecto));

const fallos = SALIDA.filter((x) => x.estado === 'FALLIDO').length;
terminar(fallos === 0 ? 0 : 1);
