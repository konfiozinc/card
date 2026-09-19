#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * configurar-firebase.js · KONFÍO ZINC
 *
 * Toma la configuración de tu app web de Firebase (la que copias del botón
 * "Configuración del SDK" en la consola) y la inyecta en los DOS archivos
 * que la necesitan, sustituyendo los placeholders PENDIENTE.
 *
 * También crea `.firebaserc` para que `firebase deploy` apunte al proyecto
 * correcto sin que tengas que ejecutar `firebase use --add`.
 *
 * ── CÓMO USARLO ─────────────────────────────────────────────────────
 * 1. En la consola de Firebase: ⚙️ Configuración del proyecto → Tus apps →
 *    app web → "Configuración del SDK" → copia el bloque `firebaseConfig`.
 * 2. Pega el JSON en un archivo `firebase-config-temp.json` en la raíz de
 *    este proyecto (o pásalo por el argumento correspondiente).
 * 3. Ejecuta:
 *      node herramientas/configurar-firebase.js
 *    El archivo temporal se borra solo al terminar.
 *
 * Formato aceptado (el que copia Firebase, con o sin las claves entre
 * comillas, y con o sin la línea `const firebaseConfig =`):
 *
 *   {
 *     "apiKey": "AIza...",
 *     "authDomain": "konfio-zinc.firebaseapp.com",
 *     "projectId": "konfio-zinc",
 *     "storageBucket": "konfio-zinc.firebasestorage.app",
 *     "messagingSenderId": "1234567890",
 *     "appId": "1:1234567890:web:abcdef123456"
 *   }
 *
 * Uso:
 *   node herramientas/configurar-firebase.js [ruta-al-json]
 *   node herramientas/configurar-firebase.js --dry-run
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

/* Los TRES archivos deben quedar con la misma configuración.
   Motivo: el panel la lee de config.js (window.KZ_CONFIG), el sitio público
   de firebase-config.js (módulo ES) y el service worker de push no puede
   importar módulos ES, así que necesita su propia copia. */
const ARCHIVOS = [
  'assets/js/config.js',
  'assets/js/firebase-config.js',
  'firebase-messaging-sw.js'
];

/* Archivos que además deben quedar con firebase.habilitado = true */
const ARCHIVO_HABILITADO = 'assets/js/config.js';

const CLAVES = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

/* ── 1. Leer la configuración ──────────────────────────────────────── */
function leerConfig() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const ruta = arg
    ? path.resolve(arg)
    : path.join(REPO, 'firebase-config-temp.json');

  if (!fs.existsSync(ruta)) {
    console.error(`\n❌ No encuentro el archivo de configuración: ${ruta}`);
    console.error('\n   Copia el bloque firebaseConfig de la consola de Firebase');
    console.error(`   en ${path.join(REPO, 'firebase-config-temp.json')} y vuelve a ejecutar.\n`);
    process.exit(1);
  }

  let texto = fs.readFileSync(ruta, 'utf8');

  /* Tolerancia: se acepta el bloque copiado tal cual desde la consola,
     que puede incluir `const firebaseConfig = {` y punto y coma final. */
  texto = texto.replace(/^\s*(?:const|var|let)\s+\w+\s*=\s*/, '').replace(/;\s*$/, '').trim();

  let config;
  try {
    config = JSON.parse(texto);
  } catch (e) {
    /* Segundo intento: si las claves no tienen comillas (formato JS) */
    try {
      const json = texto
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1');
      config = JSON.parse(json);
    } catch (e2) {
      console.error('\n❌ El archivo no es un JSON válido:');
      console.error('   ' + e.message + '\n');
      process.exit(1);
    }
  }

  /* ── 2. Validar ─────────────────────────────────────────────────── */
  const faltan = CLAVES.filter((k) => !config[k]);
  if (faltan.length) {
    console.error('\n❌ Faltan claves en la configuración: ' + faltan.join(', '));
    console.error('   Copia el bloque COMPLETO que muestra la consola.\n');
    process.exit(1);
  }

  /* Detección de errores típicos de copiado */
  const avisos = [];
  if (!/^AIza/.test(config.apiKey)) avisos.push('apiKey no empieza por "AIza": puede estar mal copiada.');
  if (/firebaseapp\.com$/.test(config.authDomain) === false) avisos.push('authDomain no termina en firebaseapp.com.');
  if (!/^\d+$/.test(String(config.messagingSenderId))) avisos.push('messagingSenderId debe ser numérico.');
  if (!/^1:\d+:web:[a-f0-9]+$/i.test(config.appId)) avisos.push('appId no tiene el formato "1:<senderId>:web:<hash>".');
  if (String(config.storageBucket) && !/\.(appspot\.com|firebasestorage\.app)$/.test(config.storageBucket)) {
    avisos.push('storageBucket no termina en appspot.com ni firebasestorage.app.');
  }
  if (!config.projectId || !/^[a-z0-9-]+$/.test(config.projectId)) avisos.push('projectId inválido.');

  return { config, avisos, ruta, eraTemporal: !arg };
}

/* ── 3. Aplicar a los archivos ─────────────────────────────────────── */
function aplicar(config) {
  const cambios = [];

  for (const rel of ARCHIVOS) {
    const file = path.join(REPO, rel);
    if (!fs.existsSync(file)) { cambios.push({ archivo: rel, estado: 'NO EXISTE' }); continue; }

    let raw = fs.readFileSync(file, 'utf8');
    let n = 0;

    for (const clave of CLAVES) {
      /* Reemplaza tanto los placeholders PENDIENTE como valores ya escritos */
      const re = new RegExp(`(${clave}\\s*:\\s*)('[^']*'|"[^"]*")`, 'g');
      raw = raw.replace(re, (m, pre) => { n++; return `${pre}'${config[clave]}'`; });
    }

    if (!DRY) fs.writeFileSync(file, raw, 'utf8');
    cambios.push({ archivo: rel, estado: `${n} valores` });
  }

  /* Activar Firebase en config.js: sin esto el panel muestra el aviso de
     "Firebase todavía no está configurado" aunque las credenciales estén bien. */
  const fHabilitado = path.join(REPO, ARCHIVO_HABILITADO);
  if (fs.existsSync(fHabilitado)) {
    let raw = fs.readFileSync(fHabilitado, 'utf8');
    const antes = raw;
    raw = raw.replace(/(firebase:\s*\{\s*\n\s*)habilitado:\s*(?:true|false)/, '$1habilitado: true');
    if (raw !== antes) {
      if (!DRY) fs.writeFileSync(fHabilitado, raw, 'utf8');
      cambios.push({ archivo: ARCHIVO_HABILITADO, estado: 'habilitado: true' });
    } else {
      cambios.push({ archivo: ARCHIVO_HABILITADO, estado: 'habilitado ya estaba en true' });
    }
  }

  /* .firebaserc: para que firebase deploy no pregunte el proyecto */
  const rc = path.join(REPO, '.firebaserc');
  const contenido = JSON.stringify({ projects: { default: config.projectId } }, null, 2) + '\n';
  if (!DRY) fs.writeFileSync(rc, contenido, 'utf8');
  cambios.push({ archivo: '.firebaserc', estado: `proyecto: ${config.projectId}` });

  return cambios;
}

/* ── Ejecución ─────────────────────────────────────────────────────── */
const { config, avisos, ruta, eraTemporal } = leerConfig();

console.log(DRY ? '\n=== SIMULACIÓN (--dry-run) ===\n' : '\n=== FIREBASE CONFIGURADO ===\n');
console.log('Proyecto detectado:');
console.log('  projectId        : ' + config.projectId);
console.log('  authDomain       : ' + config.authDomain);
console.log('  messagingSenderId: ' + config.messagingSenderId);
console.log('  appId            : ' + String(config.appId).slice(0, 28) + '…');
console.log('');

if (avisos.length) {
  console.log('⚠️  Revisa esto antes de continuar:');
  for (const a of avisos) console.log('   · ' + a);
  console.log('');
}

const cambios = aplicar(config);
console.log('Archivos actualizados:');
for (const c of cambios) console.log(`  ${c.archivo.padEnd(32)} ${c.estado}`);

/* Limpieza del archivo temporal (contiene la apiKey en claro) */
if (eraTemporal && !DRY) {
  fs.unlinkSync(ruta);
  console.log('\n🗑️  Se eliminó ' + path.basename(ruta) + ' (ya no hace falta).');
}

console.log('\n── Siguiente paso ──────────────────────────────────────────────');
console.log('  firebase login');
console.log('  firebase deploy --only firestore:rules,firestore:indexes');
console.log('  firebase deploy --only functions');
console.log('\n  Guía completa: README.md sección 7 (Panel de administración).\n');
