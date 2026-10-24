#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-artefacto-paginas.js

   Comprueba lo que GitHub Pages va a servir de verdad.

   Por qué existe: el 19/10/2026 se publicó la portada premium y quedó sin
   estilos. `_config.yml` excluía `premium` y GitHub Pages aplicó esa entrada
   también a `premium-assets/`: los cinco archivos del diseño respondían 404.
   Los archivos estaban en el repositorio y este verificador daba 0 fallos,
   porque aplicaba la regla «por carpeta» y no la regla «por prefijo» que usa
   Pages de verdad. Ahora se reproducen las dos y además se comprueba que cada
   recurso que una página referencia exista en el artefacto.

   1. Lee las exclusiones reales de `_config.yml`.
   2. Aplica el filtro de Jekyll tal como se comporta en Pages (prefijo de
      cadena y por carpeta), más las exclusiones por omisión (. , _ ).
   3. Recorre cada página servible y verifica que todo recurso local esté en
      el artefacto.
   4. Confirma que lo interno (docs, herramientas, functions, reglas,
      configuración) y la maqueta privada quedan FUERA.

   Uso: node herramientas/verificar-artefacto-paginas.js
   Códigos: 0 todo en orden · 1 algún control falla
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CONFIG = path.join(RAIZ, '_config.yml');

/* ── 1. Exclusiones declaradas ──────────────────────────────────── */
function leerExclusiones() {
  if (!fs.existsSync(CONFIG)) return [];
  const lineas = fs.readFileSync(CONFIG, 'utf8').split(/\r?\n/);
  const salida = [];
  let dentro = false;
  for (const linea of lineas) {
    if (/^exclude\s*:/.test(linea)) { dentro = true; continue; }
    if (!dentro) continue;
    if (/^\S/.test(linea) && !/^\s*#/.test(linea)) { dentro = false; continue; }
    const m = linea.match(/^\s+-\s+(.+?)\s*(?:#.*)?$/);
    if (m) salida.push(m[1].replace(/^["']|["']$/g, ''));
  }
  return salida;
}

const EXCLUSIONES = leerExclusiones();

/* ── 2. Filtro de Jekyll tal como se comporta en GitHub Pages ───── */
function motivoExclusion(ruta) {
  const segmentos = ruta.split('/');
  if (segmentos.some((s) => s.startsWith('_') || s.startsWith('.'))) return 'empieza por _ o .';
  if (ruta === '_config.yml' || ruta === '_config.yaml') return 'archivo de configuración';
  for (const entrada of EXCLUSIONES) {
    const limpia = entrada.replace(/^\/+|\/+$/g, '');
    if (!limpia) continue;
    /* Pages aplica la entrada como prefijo de cadena: `premium` se llevó por
       delante `premium-assets/`. Reproducirlo es el objetivo de este archivo. */
    if (ruta === limpia) return `exclude: ${entrada}`;
    if (ruta.startsWith(limpia + '/')) return `exclude: ${entrada}`;
    if (ruta.startsWith(limpia)) return `exclude: ${entrada} (prefijo, comportamiento de Pages)`;
  }
  return null;
}

/* ── 3. Inventario y artefacto ──────────────────────────────────── */
function inventario(dir, salida = []) {
  for (const entrada of fs.readdirSync(dir)) {
    if (entrada === '.git' || entrada === 'node_modules') continue;
    const ruta = path.join(dir, entrada);
    if (fs.statSync(ruta).isDirectory()) inventario(ruta, salida);
    else salida.push(path.relative(RAIZ, ruta).split(path.sep).join('/'));
  }
  return salida;
}

const archivos = inventario(RAIZ);
const artefacto = archivos.filter((f) => !motivoExclusion(f));
const fuera = archivos.filter((f) => motivoExclusion(f));
const paginas = artefacto.filter((f) => f.endsWith('.html'));
const enArtefacto = new Set(artefacto);

const fallos = [];
const avisos = [];
let referencias = 0;

/* ── 4. Recursos que cada página servible referencia ────────────── */
const EXTERNA = /^(https?:|mailto:|tel:|javascript:|data:|\/\/|#|\/)/i;
for (const pagina of paginas) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
  for (const m of html.matchAll(/(?:href|src|srcset|poster)="([^"]+)"/g)) {
    const destino = m[1].split(',')[0].trim().split(/\s+/)[0];
    if (!destino || EXTERNA.test(destino)) continue;
    const limpio = destino.split('#')[0].split('?')[0];
    if (!limpio) continue;
    referencias++;
    const objetivo = path.normalize(path.join(path.dirname(path.join(RAIZ, pagina)), limpio));
    let objetivoRel = path.relative(RAIZ, objetivo).split(path.sep).join('/');
    /* Una referencia a carpeta («./», «admin/») la sirve Pages con su index.html */
    if (!enArtefacto.has(objetivoRel)) {
      const conIndice = (objetivoRel ? objetivoRel + '/' : '') + 'index.html';
      if (enArtefacto.has(conIndice)) objetivoRel = conIndice;
    }
    if (!enArtefacto.has(objetivoRel)) {
      const motivo = motivoExclusion(objetivoRel);
      fallos.push(`${pagina} → ${destino} :: ${motivo ? 'NO SE SIRVE (' + motivo + ')' : 'no existe en el repositorio'}`);
    }
  }
}

/* ── 5. Lo interno y lo privado debe quedar fuera ───────────────── */
const DEBE_QUEDAR_FUERA = [
  ['docs', 'documentación interna'],
  ['herramientas', 'herramientas y pruebas'],
  ['functions', 'Cloud Functions'],
  ['tools', 'material descartado'],
  ['premium', 'maqueta privada'],
  ['design-system', 'laboratorio y biblioteca KZ-TECH-001'],
  ['firebase.json', 'configuración de Firebase'],
  ['.firebaserc', 'identificador de proyecto'],
  ['firestore.rules', 'reglas de seguridad'],
  ['firestore.indexes.json', 'índices de Firestore'],
  ['README.md', 'documentación'],
  ['ARQUITECTURA_PANEL.md', 'documentación'],
  ['FICHA_UNICA_ATENCION.md', 'documentación'],
  ['MARCA_Y_NOMBRES.md', 'documentación'],
  ['.githooks', 'ganchos de git'],
];
const colados = [];
for (const [entrada, nombre] of DEBE_QUEDAR_FUERA) {
  const dentro = artefacto.filter((f) => f === entrada || f.startsWith(entrada + '/'));
  if (dentro.length) colados.push(`${nombre} (${entrada}): ${dentro.length} archivo(s)`);
}

/* ── 6. Recursos premium que la portada necesita ────────────────── */
const PREMIUM = [
  'premium-assets/styles.css',
  'premium-assets/app.js',
  'premium-assets/chat.css',
  'premium-assets/favicon.svg',
  'premium-assets/og-cover.svg',
];
const premiumPresentes = PREMIUM.filter((f) => enArtefacto.has(f));
const premiumFaltan = PREMIUM.filter((f) => !enArtefacto.has(f));

/* ── 7. Archivos publicados con rastros internos ────────────────── */
const SOSPECHOSOS = [/(?:\/|\b)herramientas\//, /(?:\/|\b)docs\//, /CLAVE_PRIVADA|SERVICE_ACCOUNT|BEGIN PRIVATE KEY/];
let rastros = 0;
for (const f of artefacto) {
  if (!/\.(html|js|json|css|xml|txt)$/.test(f)) continue;
  const contenido = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  for (const patron of SOSPECHOSOS) {
    if (patron.test(contenido) && !/^\s*(\/\/|\*|\/\*)/.test(contenido)) {
      /* se toleran las menciones en comentarios; se avisa, no se falla */
      if (patron === SOSPECHOSOS[2]) { rastros++; }
      break;
    }
  }
}
if (rastros) avisos.push(`${rastros} archivo(s) contienen términos de credenciales`);

/* ── 8. Informe ─────────────────────────────────────────────────── */
console.log('══════════════════════════════════════════════════════════════');
console.log('  ARTEFACTO DE GITHUB PAGES · lo que se sirve de verdad');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  exclusiones leídas de _config.yml: ${EXCLUSIONES.length}`);
console.log(`  archivos en el repositorio:        ${archivos.length}`);
console.log(`  servibles:                         ${artefacto.length}`);
console.log(`  excluidos:                         ${fuera.length}`);
console.log(`  páginas HTML servibles:            ${paginas.length}`);
console.log(`  referencias locales comprobadas:   ${referencias}`);
console.log('');
console.log(`  recursos premium servidos: ${premiumPresentes.length}/${PREMIUM.length}${premiumFaltan.length ? ' · FALTAN: ' + premiumFaltan.join(', ') : ''}`);
console.log(`  interno fuera del artefacto: ${colados.length === 0 ? 'sí, todo' : 'NO'}`);
console.log('');
if (fallos.length) {
  console.log('  FALLOS:');
  for (const f of fallos.slice(0, 40)) console.log('   · ' + f);
  if (fallos.length > 40) console.log(`   … y ${fallos.length - 40} más`);
} else {
  console.log('  FALLOS: ninguno · ningún recurso referenciado queda fuera del artefacto');
}
if (colados.length) {
  console.log('  SE PUBLICAN ARCHIVOS INTERNOS:');
  for (const c of colados) console.log('   · ' + c);
}
if (avisos.length) for (const a of avisos) console.log('  [AVISO] ' + a);
console.log('');
console.log('══════════════════════════════════════════════════════════════');
const veredicto = fallos.length + colados.length + premiumFaltan.length;
console.log(veredicto === 0 ? '  RESULTADO: artefacto íntegro' : `  RESULTADO: ${veredicto} problema(s)`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(veredicto === 0 ? 0 : 1);
