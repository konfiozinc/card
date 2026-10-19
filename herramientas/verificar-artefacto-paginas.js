#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-artefacto-paginas.js

   Reproduce lo que GitHub Pages va a publicar desde la raíz del repositorio,
   aplicando las mismas reglas de exclusión de Jekyll, y comprueba:

     1. que ninguna ruta interna quede en el artefacto;
     2. que el sitio conserve TODOS los recursos que referencia;
     3. que los archivos publicados no lleven credenciales ni rutas internas.

   ¿Por qué no se usa el constructor oficial? Porque GitHub Pages construye con
   Jekyll y en esta máquina no hay Ruby, gem, bundle ni Docker. Esta herramienta
   no sustituye al constructor: aplica las reglas documentadas de Jekyll
   (exclusión de archivos que empiezan por . o _, más la lista `exclude` de
   _config.yml) sobre el árbol de git, que es exactamente la entrada del build.
   La comprobación definitiva es de solo lectura sobre el sitio publicado, con
   los comandos que imprime al final.

   Uso: node herramientas/verificar-artefacto-paginas.js
   Códigos: 0 todo en orden · 1 algún control falla · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const CONFIG = path.join(RAIZ, '_config.yml');

const fallos = [];
const avisos = [];
function revisar(nombre, ok, detalle) {
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${detalle || ''}`);
  if (!ok) fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
}
function avisar(texto) { avisos.push(texto); console.log(`  [AVISO   ] ${texto}`); }

/* ── 1. Árbol de git (lo que verá el constructor) ─────────────────── */
let arbol;
try {
  const crudo = execFileSync('git', ['-C', RAIZ, 'ls-tree', '-r', '--name-only', '-z', 'HEAD'], { encoding: 'utf8' });
  arbol = crudo.split('\0').filter(Boolean).map((f) => f.replace(/\\/g, '/'));
} catch (e) {
  console.error('\n  ✖ No se pudo leer el árbol de git: ' + (e.message || e) + '\n');
  process.exit(2);
}

/* ── 2. Reglas de Jekyll ──────────────────────────────────────────── */
if (!fs.existsSync(CONFIG)) {
  console.error('\n  ✖ Falta _config.yml: GitHub Pages volvería a publicar el repositorio entero.\n');
  process.exit(1);
}
const lineas = fs.readFileSync(CONFIG, 'utf8').split(/\r?\n/);
const excluir = [];
let enLista = false;
for (const l of lineas) {
  if (/^\s*exclude\s*:/.test(l)) { enLista = true; continue; }
  if (enLista) {
    const m = /^\s*-\s*(.+?)\s*$/.exec(l);
    if (m) { excluir.push(m[1].replace(/^["']|["']$/g, '')); continue; }
    if (/^\s*[A-Za-z_]+\s*:/.test(l) || l.trim() === '') { if (l.trim() === '') continue; enLista = false; }
  }
}

const EMPIEZA_ESPECIAL = (f) => f.split('/').some((p) => p.startsWith('_') || p.startsWith('.'));
function excluidaPorLista(f) {
  return excluir.some((e) => {
    const limpio = e.replace(/\/+$/, '');
    return f === limpio || f.startsWith(limpio + '/');
  });
}
const esConfig = (f) => f === '_config.yml';

const artefacto = arbol.filter((f) => !(esConfig(f) || EMPIEZA_ESPECIAL(f) || excluidaPorLista(f)));
const fuera = arbol.filter((f) => !artefacto.includes(f));

/* ── 3. Informe de exclusiones ────────────────────────────────────── */
console.log('');
console.log('═══ ARTEFACTO DE GITHUB PAGES (simulado sobre el árbol de git) ═══');
console.log(`  archivos versionados: ${arbol.length}`);
console.log(`  publicables:          ${artefacto.length}`);
console.log(`  excluidos:            ${fuera.length}`);
console.log('');

const porCarpeta = {};
for (const f of artefacto) {
  const k = f.includes('/') ? f.split('/')[0] : '(raíz)';
  porCarpeta[k] = (porCarpeta[k] || 0) + 1;
}
console.log('  publicables por carpeta:');
for (const [k, n] of Object.entries(porCarpeta).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(22)} ${String(n).padStart(4)}`);
}
console.log('');

const publicadasNoDeseadas = ['docs', 'herramientas', 'functions', 'tools'];
for (const carpeta of publicadasNoDeseadas) {
  const colados = artefacto.filter((f) => f === carpeta || f.startsWith(carpeta + '/'));
  revisar(`La carpeta «${carpeta}» no se publica`, colados.length === 0,
    colados.length ? `${colados.length} archivo(s) colados` : 'excluida');
}

for (const archivo of ['firestore.rules', 'firestore.indexes.json', 'firebase.json', '.firebaserc', 'README.md', 'ARQUITECTURA_PANEL.md', 'FICHA_UNICA_ATENCION.md', 'MARCA_Y_NOMBRES.md']) {
  const dentro = artefacto.includes(archivo);
  revisar(`«${archivo}» no se publica`, !dentro, dentro ? 'seguiría publicado' : 'fuera del artefacto');
}

/* Los dotfiles ya los excluye Jekyll: se comprueba que sea así. */
const dotfiles = artefacto.filter((f) => f.split('/').some((p) => p.startsWith('.')));
revisar('Ningún archivo oculto en el artefacto', dotfiles.length === 0, dotfiles.slice(0, 3).join(', ') || 'ninguno');

/* ── 4. El sitio conserva lo que necesita ─────────────────────────── */
console.log('');
console.log('═══ RECURSOS QUE EL SITIO NECESITA ═══');

const EXTERNA = /^(https?:|data:|mailto:|tel:|javascript:|\/\/|#)/i;
const existe = new Set(artefacto);
function resolver(desde, ref) {
  /* REF_INVALIDA: referencias que no apuntan a un archivo ('.', '#id', url(#filtro))
     se descartan; antes se contaban como recursos ausentes y daban falso fallo. */
  if (ref.trim() === '.' || ref.trim() === '' || ref.trim().startsWith('#')) return null;
  const limpio = ref.split('?')[0].split('#')[0].trim();
  if (limpio === '' || limpio === '.' || limpio === './') return null;
  if (!limpio || EXTERNA.test(limpio)) return null;
  /* El sitio se sirve bajo /card/: una ruta absoluta «/card/x» es «x» en el
     repositorio, y «/x» es la raíz del dominio (fuera del repositorio). */
  let base;
  if (limpio.startsWith('/card/')) base = limpio.slice('/card/'.length);
  else if (limpio.startsWith('/')) base = limpio.slice(1);
  else base = path.posix.join(path.posix.dirname(desde), limpio);
  base = base.replace(/^\.\//, '');
  const norm = path.posix.normalize(base);
  if (norm.startsWith('..')) return { fuera: true, ruta: norm };
  return { ruta: norm };
}

const referencias = new Map();
function anotarReferencia(desde, ref, soloRutas) {
  /* En los módulos ES, `from 'firebase/auth'` es un especificador que resuelve
     el import map del navegador, no un archivo del repositorio: solo cuentan
     las rutas que empiezan por ./ ../ o /. */
  if (soloRutas && !/^[.\/]/.test(ref.trim())) return;
  const r = resolver(desde, ref);
  if (!r) return;
  if (!referencias.has(r.ruta)) referencias.set(r.ruta, desde);
}

const esTexto = (f) => /\.(html|css|js|json|xml|txt|md|webmanifest|sw|yml)$/i.test(f);
let faltantes = 0;
const detalleFaltantes = [];

for (const f of artefacto) {
  if (!esTexto(f)) continue;
  let txt;
  try { txt = fs.readFileSync(path.join(RAIZ, f), 'utf8'); } catch (e) { continue; }

  if (/\.html?$/i.test(f)) {
    for (const m of txt.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) anotarReferencia(f, m[1], false);
    for (const m of txt.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) anotarReferencia(f, m[1], false);
    const im = /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(txt);
    if (im) {
      try {
        const mapa = JSON.parse(im[1]);
        for (const v of Object.values(mapa.imports || {})) anotarReferencia(f, String(v), false);
      } catch (e) { avisar(`importmap ilegible en ${f}`); }
    }
  } else if (/\.css$/i.test(f)) {
    for (const m of txt.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) anotarReferencia(f, m[1], false);
  } else if (/\.(m?js)$/i.test(f)) {
    for (const m of txt.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) anotarReferencia(f, m[1], true);
    for (const m of txt.matchAll(/new\s+URL\(\s*["']([^"']+)["']/g)) anotarReferencia(f, m[1], true);
  }
}

const sinResolver = [];
for (const [ruta, desde] of referencias) {
  if (existe.has(ruta)) continue;
  if (existe.has(ruta.replace(/\/$/, '') + '/index.html')) continue;
  if (existe.has(ruta + '.html')) continue;      /* enlaces sin extensión */
  sinResolver.push(`${ruta} (referenciado desde ${desde})`);
  faltantes++;
}

const referenciasInternas = sinResolver.filter((r) => /^(docs|herramientas|functions|tools)\//.test(r));
const referenciasRotas = sinResolver.filter((r) => !referenciasInternas.includes(r));

console.log(`  referencias locales encontradas: ${referencias.size}`);
revisar('Ningún recurso del sitio apunta a una carpeta interna', referenciasInternas.length === 0,
  referenciasInternas.length ? referenciasInternas.slice(0, 3).join(' | ') : 'nada apunta a docs/ herramientas/ functions/ tools/');
revisar('Todos los recursos referenciados están en el artefacto', referenciasRotas.length === 0,
  referenciasRotas.length ? referenciasRotas.slice(0, 4).join(' | ') : `${referencias.size} referencias resueltas`);

/* Entradas imprescindibles del sitio, sin depender del rastreo. */
const imprescindibles = ['index.html', 'panel.html', 'precios.html', 'robots.txt', 'sitemap.xml', '404.html', 'manifest.json',
  'admin/index.html', 'admin/dashboard.html', 'admin/usuarios.html', 'assets/js/config.js', 'assets/js/firebase-config.js',
  'assets/css/admin.css', 'assets/js/admin/shell.js', 'assets/js/admin/core.js', 'assets/js/admin/datos.js',
  'assets/js/admin/escrituras-local.js', 'assets/js/admin/ui.js'];
for (const f of imprescindibles) {
  if (!existe.has(f)) revisar(`El sitio necesita «${f}»`, false, 'no está en el artefacto');
}
revisar('Las páginas y módulos esenciales siguen publicados', imprescindibles.every((f) => existe.has(f)), `${imprescindibles.length} comprobados`);

/* ── 5. Contenido: credenciales y rutas internas ─────────────────── */
console.log('');
console.log('═══ CONTENIDO DE LO PUBLICADO ═══');

const CREDENCIALES = [
  { nombre: 'clave privada PEM', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nombre: 'campo private_key', re: /private_key/ },
  { nombre: 'cuenta de servicio JSON', re: /"type"\s*:\s*"service_account"/ },
  { nombre: 'cuenta firebase-adminsdk', re: /firebase-adminsdk/i },
  { nombre: 'token de GitHub', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { nombre: 'clave de SendGrid', re: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { nombre: 'clave secreta de Stripe', re: /sk_live_[A-Za-z0-9]{20,}/ },
  { nombre: 'ruta interna de respaldos', re: /KONFIO-RESPALDOS|14-HERRAMIENTAS-DESARROLLO/i },
  { nombre: 'ruta absoluta del equipo', re: /C:[\\/]Users[\\/]usuario29/i }
];

const hallazgos = [];
const apiKeysFirebase = [];
for (const f of artefacto) {
  if (!esTexto(f)) continue;
  let txt;
  try { txt = fs.readFileSync(path.join(RAIZ, f), 'utf8'); } catch (e) { continue; }
  for (const c of CREDENCIALES) {
    if (c.re.test(txt)) hallazgos.push(`${c.nombre} en ${f}`);
  }
  if (/AIza[0-9A-Za-z_-]{30,}/.test(txt)) apiKeysFirebase.push(f);
}

revisar('Ningún archivo publicado lleva credenciales ni rutas internas', hallazgos.length === 0,
  hallazgos.length ? hallazgos.slice(0, 4).join(' | ') : `${artefacto.length} archivos revisados`);
if (apiKeysFirebase.length) {
  avisar(`${apiKeysFirebase.length} archivo(s) con la clave web de Firebase (pública por diseño): ${apiKeysFirebase.join(', ')}`);
}

/* ── 6. Qué comprobar en el sitio real después de publicar ───────── */
console.log('');
console.log('═══ COMPROBACIÓN POSTERIOR (solo lectura, tras publicar) ═══');
console.log('  Debe responder 404 en cuanto la rama se publique:');
const yaPublicas = ['herramientas/verificar-precios.js', 'herramientas/README.md', 'functions/src/index.js',
  'functions/package.json', 'functions/src/motor.js', 'functions/src/vencimientos.js',
  'firestore.rules', 'firestore.indexes.json', 'firebase.json', 'README.md',
  'ARQUITECTURA_PANEL.md', 'FICHA_UNICA_ATENCION.md', 'MARCA_Y_NOMBRES.md',
  'docs/LANZAMIENTO-CARD-CHECKLIST.md', 'docs/VENTANA-DE-LANZAMIENTO-CARD.md',
  'herramientas/publicar-paginas.ps1', 'herramientas/desplegar-funciones.ps1'];
for (const r of yaPublicas) console.log(`    https://konfiozinc.github.io/card/${r}`);
console.log('');
console.log('  Debe seguir respondiendo 200:');
for (const r of ['', 'admin/index.html', 'precios.html', 'robots.txt', 'sitemap.xml']) {
  console.log(`    https://konfiozinc.github.io/card/${r}`);
}

/* ── 7. Veredicto ─────────────────────────────────────────────────── */
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  publicables: ${artefacto.length} · excluidos: ${fuera.length} · fallos: ${fallos.length} · avisos: ${avisos.length}`);
console.log('══════════════════════════════════════════════════════════════');
if (fallos.length) { console.log('\n  FALLOS:'); for (const f of fallos) console.log('   · ' + f); }
console.log('');
process.exit(fallos.length ? 1 : 0);
