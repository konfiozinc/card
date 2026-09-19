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

/* ── 1. Configuración en los TRES archivos que deben coincidir ───────
   · assets/js/config.js         → la lee el PANEL (window.KZ_CONFIG)
   · assets/js/firebase-config.js → la lee el sitio público (módulo ES)
   · firebase-messaging-sw.js    → el service worker no puede importar
                                    módulos ES, así que lleva su copia      */
const CLAVES = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

const ARCHIVOS_CFG = [
  'assets/js/config.js',
  'assets/js/firebase-config.js',
  'firebase-messaging-sw.js'
];

function extraerConfig(texto) {
  const out = {};
  for (const k of CLAVES) {
    const m = texto.match(new RegExp(`${k}\\s*:\\s*'([^']*)'`)) || texto.match(new RegExp(`${k}\\s*:\\s*"([^"]*)"`));
    out[k] = m ? m[1] : null;
  }
  return out;
}

const configs = {};
for (const rel of ARCHIVOS_CFG) {
  configs[rel] = extraerConfig(leer(rel));
}

for (const rel of ARCHIVOS_CFG) {
  const faltan = CLAVES.filter((k) => !configs[rel][k] || configs[rel][k].startsWith('PENDIENTE'));
  if (faltan.length === 0) {
    ok.push(`${rel} tiene la configuración completa`);
  } else if (existe(rel)) {
    pendientes.push(`${rel}: faltan ${faltan.join(', ')}`);
  } else {
    errores.push(`${rel} NO EXISTE`);
  }
}

/* Coherencia entre los tres (si todos están configurados) */
const configurados = ARCHIVOS_CFG.filter((rel) =>
  CLAVES.every((k) => configs[rel][k] && !configs[rel][k].startsWith('PENDIENTE')));

if (configurados.length === ARCHIVOS_CFG.length) {
  const base = configs[ARCHIVOS_CFG[0]];
  const distintos = [];
  for (const rel of ARCHIVOS_CFG.slice(1)) {
    for (const k of CLAVES) if (configs[rel][k] !== base[k]) distintos.push(`${k} en ${rel}`);
  }
  if (distintos.length === 0) {
    ok.push('Los 3 archivos tienen EXACTAMENTE la misma configuración');
  } else {
    errores.push(`Los archivos de configuración difieren: ${distintos.join(', ')} (deben ser idénticos)`);
  }
}

/* La bandera que enciende el panel */
const cfgJs = leer('assets/js/config.js');
if (/firebase:\s*\{\s*\n\s*habilitado:\s*true/.test(cfgJs)) {
  ok.push('config.js tiene firebase.habilitado = true');
} else if (configurados.length === ARCHIVOS_CFG.length) {
  pendientes.push('config.js tiene la configuración pero firebase.habilitado sigue en false → el panel mostrará el aviso de "sin configurar"');
} else {
  pendientes.push('config.js: firebase.habilitado en false (correcto mientras falten credenciales)');
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

/* ── 5. Cloud Functions (viven en functions/src/index.js) ──────────── */
const RUTA_FUNCS = 'functions/src/index.js';
if (existe(RUTA_FUNCS)) {
  const idx = leer(RUTA_FUNCS);
  ok.push(`${RUTA_FUNCS} presente (${Math.round(idx.length / 1024)} KB)`);

  const pkg = leer('functions/package.json');
  if (/firebase-admin/.test(pkg) && /firebase-functions/.test(pkg)) {
    ok.push('functions/package.json declara firebase-admin y firebase-functions');
  } else {
    errores.push('functions/package.json sin las dependencias necesarias');
  }
  if (/"main"\s*:\s*"src\/index\.js"/.test(pkg)) {
    ok.push('functions/package.json apunta a src/index.js');
  } else {
    pendientes.push('functions/package.json: "main" no apunta a src/index.js');
  }

  /* Callables que el panel invoca: deben existir o el panel falla en runtime */
  const CALLABLES = [
    'crearCliente', 'actualizarCliente', 'registrarPago', 'confirmarPago', 'anularPago',
    'activarServicio', 'suspenderServicio', 'desactivarServicio', 'reactivarServicio',
    'enviarNotificacion', 'registrarToken', 'crearUsuario', 'actualizarUsuario',
    'seedInicial', 'recalcularEstados'
  ];
  const faltanFuncs = CALLABLES.filter((fn) => !new RegExp(`exports\\.${fn}\\b`).test(idx));
  if (faltanFuncs.length === 0) {
    ok.push(`Los ${CALLABLES.length} callables del panel están exportados`);
  } else {
    errores.push(`Callables que el panel invoca y NO existen: ${faltanFuncs.join(', ')}`);
  }
  if (/exports\.processDueDates\b/.test(idx)) {
    ok.push('Función programada processDueDates exportada (motor de vencimientos)');
  } else {
    errores.push('Falta la función programada processDueDates');
  }
  if (/claveDedup/.test(idx)) {
    ok.push('Anti-duplicado de notificaciones implementado (claveDedup)');
  } else {
    errores.push('Sin anti-duplicado de notificaciones: se repetirían los avisos');
  }
  if (existe('functions/node_modules')) {
    ok.push('functions/node_modules presente (npm install hecho)');
  } else {
    pendientes.push('functions/node_modules ausente → ejecuta "cd functions && npm install"');
  }

  /* El archivo antiguo no debe quedarse compitiendo */
  if (existe('functions/index.js')) {
    pendientes.push('functions/index.js sigue existiendo (versión anterior). Bórralo o renómbralo: puede confundir el despliegue');
  }
} else {
  errores.push(`${RUTA_FUNCS} FALTA (las Cloud Functions del panel)`);
}

/* ── 6. Panel multipágina y service worker ─────────────────────────── */
const PAGINAS_PANEL = [
  'admin/index.html', 'admin/dashboard.html', 'admin/clientes.html', 'admin/servicios.html',
  'admin/pagos.html', 'admin/planes.html', 'admin/notificaciones.html',
  'admin/configuracion.html', 'admin/usuarios.html', 'admin/auditoria.html'
];
const faltanPaginas = PAGINAS_PANEL.filter((p) => !existe(p));
if (faltanPaginas.length === 0) {
  ok.push(`Panel completo: ${PAGINAS_PANEL.length} páginas en /admin/`);
} else {
  pendientes.push(`Páginas del panel que faltan: ${faltanPaginas.join(', ')}`);
}
if (existe('admin/index.html')) {
  const a = leer('admin/index.html');
  if (/noindex/.test(a)) ok.push('admin/index.html marcado como noindex');
  else pendientes.push('admin/index.html sin noindex: el login podría indexarse');
}
/* El panel antiguo debe quedar como redirección, no como app duplicada */
if (existe('admin.html')) {
  const viejo = leer('admin.html');
  if (/http-equiv="refresh"|location\.replace/.test(viejo)) {
    ok.push('admin.html es una redirección al panel nuevo (correcto)');
  } else if (/id="panelView"|id="loginForm"/.test(viejo)) {
    pendientes.push('admin.html sigue siendo el panel ANTIGUO: sustitúyelo por una redirección a admin/');
  }
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
