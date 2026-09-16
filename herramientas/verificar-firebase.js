#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * verificar-firebase.js · KONFÍO ZINC
 *
 * Comprueba, SIN necesidad de sesión en Firebase, si la configuración del
 * panel está completa y lista para desplegar. Sirve para saber exactamente
 * qué falta antes de perder tiempo en la consola.
 *
 * Revisa:
 *   1. Que assets/js/firebase-config.js y firebase-messaging-sw.js tengan
 *      los mismos valores y ninguno siga en PENDIENTE.
 *   2. Que la clave VAPID esté puesta (necesaria para las notificaciones push).
 *   3. Que exista .firebaserc con el projectId.
 *   4. Que estén los archivos de despliegue (firebase.json, reglas, índices).
 *   5. Que las Cloud Functions tengan dependencias declaradas.
 *   6. Que el panel cargue los módulos correctos.
 *
 * Uso:  node herramientas/verificar-firebase.js
 * Sale con código 1 si algo falta (útil antes de un despliegue).
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ruta = (p) => path.join(REPO, p);
const existe = (p) => fs.existsSync(ruta(p));
const leer = (p) => (existe(p) ? fs.readFileSync(ruta(p), 'utf8') : '');

const ok = [];
const pendientes = [];
const errores = [];

/* ── 1. Configuración en los dos archivos ──────────────────────────── */
const CLAVES = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

function extraerConfig(texto) {
  const out = {};
  for (const k of CLAVES) {
    const m = texto.match(new RegExp(`${k}\\s*:\\s*'([^']*)'`)) || texto.match(new RegExp(`${k}\\s*:\\s*"([^"]*)"`));
    out[k] = m ? m[1] : null;
  }
  return out;
}

const cfgMain = extraerConfig(leer('assets/js/firebase-config.js'));
const cfgSw = extraerConfig(leer('firebase-messaging-sw.js'));

const sinPoner = (o) => Object.entries(o).filter(([, v]) => !v || v.startsWith('PENDIENTE')).map(([k]) => k);

const faltanMain = CLAVES.filter((k) => !cfgMain[k] || cfgMain[k].startsWith('PENDIENTE'));
const faltanSw = CLAVES.filter((k) => !cfgSw[k] || cfgSw[k].startsWith('PENDIENTE'));

if (faltanMain.length === 0) {
  ok.push('assets/js/firebase-config.js tiene la configuración completa');
} else {
  pendientes.push(`assets/js/firebase-config.js: faltan ${faltanMain.join(', ')}`);
}

if (faltanSw.length === 0) {
  ok.push('firebase-messaging-sw.js tiene la configuración completa');
} else {
  pendientes.push(`firebase-messaging-sw.js: faltan ${faltanSw.join(', ')}`);
}

/* Coherencia entre los dos archivos (si ambos están configurados) */
if (faltanMain.length === 0 && faltanSw.length === 0) {
  const distintos = CLAVES.filter((k) => cfgMain[k] !== cfgSw[k]);
  if (distintos.length === 0) {
    ok.push('Los dos archivos tienen EXACTAMENTE la misma configuración');
  } else {
    errores.push(`Los dos archivos difieren en: ${distintos.join(', ')} (deben ser idénticos)`);
  }
}

/* ── 2. Clave VAPID (push) ─────────────────────────────────────────── */
const mainJs = leer('assets/js/firebase-config.js');
const vapid = (mainJs.match(/vapidKey\s*=\s*'([^']*)'/) || [])[1];
if (vapid && !vapid.startsWith('PENDIENTE') && vapid.length > 20) {
  ok.push('Clave VAPID configurada (notificaciones push listas)');
} else {
  pendientes.push('vapidKey sin configurar → las notificaciones push no funcionarán');
}

/* ── 3. .firebaserc ────────────────────────────────────────────────── */
if (existe('.firebaserc')) {
  try {
    const rc = JSON.parse(leer('.firebaserc'));
    const pid = rc.projects && rc.projects.default;
    if (pid) ok.push(`.firebaserc apunta al proyecto "${pid}"`);
    else pendientes.push('.firebaserc sin projects.default');
  } catch (e) {
    errores.push('.firebaserc no es JSON válido');
  }
} else {
  pendientes.push('.firebaserc no existe → ejecuta herramientas/configurar-firebase.js');
}

/* ── 4. Archivos de despliegue ─────────────────────────────────────── */
const ARCHIVOS = {
  'firebase.json': 'configuración de despliegue',
  'firestore.rules': 'reglas de seguridad',
  'firestore.indexes.json': 'índices compuestos'
};
for (const [f, desc] of Object.entries(ARCHIVOS)) {
  if (existe(f)) ok.push(`${f} presente (${desc})`);
  else errores.push(`${f} FALTA (${desc})`);
}

/* Validar que los índices sean JSON correcto */
if (existe('firestore.indexes.json')) {
  try {
    const idx = JSON.parse(leer('firestore.indexes.json'));
    ok.push(`firestore.indexes.json válido (${(idx.indexes || []).length} índices)`);
  } catch (e) {
    errores.push('firestore.indexes.json no es JSON válido');
  }
}

/* Que las reglas exijan autenticación */
if (existe('firestore.rules')) {
  const rules = leer('firestore.rules');
  if (/request\.auth != null/.test(rules)) ok.push('firestore.rules exige autenticación');
  else errores.push('firestore.rules no exige autenticación: riesgo de datos abiertos');
  if (/match \/\{document=\*\*\}/.test(rules) && /allow read, write: if false/.test(rules)) {
    ok.push('firestore.rules deniega por defecto (regla comodín al final)');
  }
}

/* ── 5. Cloud Functions ────────────────────────────────────────────── */
if (existe('functions/index.js')) {
  ok.push('functions/index.js presente');
  const pkg = leer('functions/package.json');
  if (/firebase-admin/.test(pkg) && /firebase-functions/.test(pkg)) {
    ok.push('functions/package.json declara firebase-admin y firebase-functions');
  } else {
    errores.push('functions/package.json sin las dependencias necesarias');
  }
  const idx = leer('functions/index.js');
  for (const fn of ['verificarVencimientos', 'enviarRecordatorio']) {
    if (idx.includes(`exports.${fn}`)) ok.push(`Cloud Function exportada: ${fn}`);
    else errores.push(`Falta la Cloud Function ${fn}`);
  }
  if (existe('functions/node_modules')) {
    ok.push('functions/node_modules presente (npm install hecho)');
  } else {
    pendientes.push('functions/node_modules ausente → ejecuta "cd functions && npm install"');
  }
} else {
  errores.push('functions/index.js FALTA');
}

/* ── 6. Panel y service worker ─────────────────────────────────────── */
if (existe('admin.html')) {
  const a = leer('admin.html');
  if (/assets\/js\/admin\.js/.test(a)) ok.push('admin.html carga admin.js');
  else errores.push('admin.html no carga assets/js/admin.js');
  if (/noindex/.test(a)) ok.push('admin.html marcado como noindex');
  else pendientes.push('admin.html sin noindex: podría indexarse');
}
if (existe('firebase-messaging-sw.js')) ok.push('firebase-messaging-sw.js presente (push en segundo plano)');

/* ── 7. Borrar el temporal si quedó ────────────────────────────────── */
if (existe('firebase-config-temp.json')) {
  pendientes.push('firebase-config-temp.json sigue ahí → ejecuta configurar-firebase.js o bórralo a mano');
}

/* ── Reporte ───────────────────────────────────────────────────────── */
const linea = '─'.repeat(66);
console.log('\n' + linea);
console.log('VERIFICACIÓN DE FIREBASE · KONFÍO ZINC');
console.log(linea + '\n');

console.log(`✅ LISTO (${ok.length})`);
for (const o of ok) console.log('   · ' + o);

if (pendientes.length) {
  console.log(`\n⏳ PENDIENTE (${pendientes.length})`);
  for (const p of pendientes) console.log('   · ' + p);
}

if (errores.length) {
  console.log(`\n❌ ERRORES (${errores.length})`);
  for (const e of errores) console.log('   · ' + e);
}

console.log('');
if (errores.length) {
  console.log('❌ Hay errores que impiden el despliegue.\n');
  process.exit(1);
}
if (pendientes.length) {
  console.log('⏳ Falta configuración: sigue los pasos del README, sección 7.\n');
  process.exit(0);
}
console.log('🎉 Firebase está configurado: listo para "firebase deploy".\n');
