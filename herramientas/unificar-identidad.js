/* KZ-DESIGN-001 · Unificacion de la identidad visual.

   1. Separa los tokens de kz-neon.css en assets/css/kz-tokens.css (fuente unica).
   2. Hace que kz-neon.css los importe (no los repita).
   3. Convierte las declaraciones literales de styles.css, admin.css y
      premium-assets/styles.css en REFERENCIAS a esos tokens.
   4. Sustituye los colores duros heredados por tokens.
   5. La hoja de tokens se carga tambien en el panel.

   Por que referencias y no "borrar y esperar el orden de carga": si las tres
   hojas dicen `--gold: var(--kz-cyan)`, el resultado es identico sea cual sea el
   orden de los <link>. Se elimina la dependencia fragil de sobrescrituras.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const CSS = path.join(RAIZ, 'assets', 'css');

const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const escribir = (rel, t) => fs.writeFileSync(path.join(RAIZ, rel), t, 'utf8');

/* ── 1 · Separar tokens ───────────────────────────────────────────── */
console.log('\n=== 1 · SEPARAR TOKENS ===');
const neonBruto = leer('assets/css/kz-neon.css');
const lineas = neonBruto.split('\n');

/* Los dos bloques :root son las lineas 37-108 (indices 36-107). Se localiza por
   marcador en lugar de por numero fijo, para no romperse si alguien edita arriba. */
const iPrim = lineas.findIndex((l) => l.indexOf('01. PRIMITIVAS') !== -1);
const iBase = lineas.findIndex((l) => l.indexOf('03. BASE') !== -1);
if (iPrim === -1 || iBase === -1) { console.error('No se localizaron los marcadores'); process.exit(1); }

const cabeceraTokens = `/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/css/kz-tokens.css
   FUENTE ÚNICA de la paleta oficial. Ningún otro archivo debe declarar un
   color de identidad: los demás lo REFERENCIAN con var(--kz-*).

   KZ-DESIGN-001 · Por qué existe este archivo
   La identidad estaba partida: styles.css y admin.css declaraban su propia
   paleta vieja (--gold: #F0B429, --bg: #000000, --fg: #F5F5F0) y kz-neon.css
   volvía a declarar los mismos nombres con valores nuevos. El resultado
   dependía del orden de los <link>: en unas páginas mandaba el neón y en otras
   el dorado. Además el panel no cargaba la identidad, así que seguía en oro.

   Ahora hay un solo sitio con valores literales. Todo lo demás referencia.

   ORDEN DE CARGA
     · Páginas comerciales: kz-tokens.css → styles.css
     · Portada premium:     kz-tokens.css → premium-assets/styles.css
     · Panel:               kz-tokens.css → admin.css
   Cualquier orden entre las dos últimas es válido porque ya no hay dos valores
   distintos para el mismo nombre.
   ═══════════════════════════════════════════════════════════════════════ */

`;
const bloqueTokens = lineas.slice(iPrim, iBase).join('\n').trimEnd() + '\n';
escribir('assets/css/kz-tokens.css', cabeceraTokens + bloqueTokens);
console.log('   kz-tokens.css creado (' + bloqueTokens.split('\n').length + ' líneas de tokens)');

const cabeceraNeon = lineas.slice(0, iPrim).join('\n').trimEnd();
const resto = lineas.slice(iBase).join('\n');
escribir('assets/css/kz-neon.css',
  cabeceraNeon +
  '\n\n/* KZ-DESIGN-001 · Los tokens NO viven aquí. Se importan de la fuente única. */\n' +
  '@import url("./kz-tokens.css");\n\n' +
  resto);
console.log('   kz-neon.css ahora importa los tokens en lugar de declararlos');

/* ── 2 · Variables heredadas: literal → referencia ────────────────── */
console.log('\n=== 2 · VARIABLES: LITERAL → REFERENCIA ===');
const MAPA_VARS = {
  '--bg': '--kz-bg',
  '--fg': '--kz-text',
  '--elevated': '--kz-surface-raised',
  '--surface': '--kz-surface',
  '--surface2': '--kz-surface-raised',
  '--surface-deep': '--kz-deep',
  '--surface-chat': '--kz-surface-raised',
  '--border': '--kz-border',
  '--border-strong': '--kz-border-soft',
  '--border-gold': null,                 // se trata aparte: usa rgb(var(--kz-rgb-cyan) / a)
  '--gold': '--kz-cyan',
  '--gold2': '--kz-cyan-light',
  '--gold-rgb': '--kz-rgb-cyan',
  '--cyan': '--kz-cyan',
  '--violet': '--kz-violet-light',
  '--muted': '--kz-text-muted',
  '--danger': '--kz-danger',
  '--success': '--kz-success',
  '--orange': '--kz-violet',
  '--line': '--kz-border',
  '--on-accent': '--kz-bg'
};

const HOJAS = ['assets/css/styles.css', 'assets/css/admin.css', 'premium-assets/styles.css', 'premium-assets/chat.css'];
let cambiosVars = 0;
for (const rel of HOJAS) {
  let t = leer(rel);
  const antes = t;
  for (const [viejo, nuevo] of Object.entries(MAPA_VARS)) {
    if (!nuevo) continue;
    /* Solo se sustituye el VALOR literal; si ya es var(...) se deja. */
    const re = new RegExp('(' + viejo.replace(/[-]/g, '\\-') + '\\s*:\\s*)(?!var\\()[^;}]+;', 'g');
    t = t.replace(re, '$1var(' + nuevo + ');');
  }
  /* --border-gold usa el canal RGB del acento */
  const reBG = /(--border-gold\s*:\s*)(?!var\()[^;}]+;/g;
  t = t.replace(reBG, '$1rgb(var(--kz-rgb-cyan) / .28);');
  if (t !== antes) { escribir(rel, t); cambiosVars++; console.log('   ' + rel + ' → referencias aplicadas'); }
  else console.log('   ' + rel + ' → sin cambios');
}

/* ── 3 · Colores duros heredados → tokens ────────────────────────── */
console.log('\n=== 3 · COLORES DUROS → TOKENS ===');
/* Se respetan los colores de MARCA de terceros (WhatsApp, Facebook, Instagram)
   y el blanco puro: no son identidad de la agencia. */
const MAPA_HEX = {
  '#F0B429': 'var(--kz-cyan)', '#f0b429': 'var(--kz-cyan)',
  '#FFD978': 'var(--kz-cyan-light)', '#FFD97D': 'var(--kz-cyan-light)',
  '#F97316': 'var(--kz-violet)', '#f97316': 'var(--kz-violet)',
  '#00D4FF': 'var(--kz-cyan)', '#00d4ff': 'var(--kz-cyan)',
  '#000000': 'var(--kz-bg)',
  '#07070A': 'var(--kz-deep)', '#07070a': 'var(--kz-deep)',
  '#0A0A0A': 'var(--kz-bg)', '#0a0a0a': 'var(--kz-bg)',
  '#0A0A0C': 'var(--kz-bg)', '#0a0a0c': 'var(--kz-bg)',
  '#111114': 'var(--kz-surface)',
  '#17171B': 'var(--kz-surface-raised)', '#17171b': 'var(--kz-surface-raised)',
  '#2A2A2A': 'var(--kz-border)', '#2a2a2a': 'var(--kz-border)',
  '#4A4A4A': 'var(--kz-border)', '#4a4a4a': 'var(--kz-border)',
  '#6B6B6B': 'var(--kz-text-muted)', '#6b6b6b': 'var(--kz-text-muted)',
  '#777': 'var(--kz-text-muted)', '#333': 'var(--kz-border)', '#999': 'var(--kz-text-muted)',
  '#9AA0A6': 'var(--kz-text-muted)', '#9aa0a6': 'var(--kz-text-muted)',
  '#F5F5F0': 'var(--kz-text)', '#f5f5f0': 'var(--kz-text)',
  '#2C3E5C': 'var(--kz-border)', '#2c3e5c': 'var(--kz-border)',
  '#052E16': 'var(--kz-surface)', '#052e16': 'var(--kz-surface)',
  '#082218': 'var(--kz-surface)', '#2A1A06': 'var(--kz-surface)', '#2a1a06': 'var(--kz-surface)',
  '#071D32': 'var(--kz-surface)', '#071d32': 'var(--kz-surface)',
  '#341119': 'var(--kz-surface)',
  '#22C55E': 'var(--kz-success)', '#22c55e': 'var(--kz-success)',
  '#4ADE80': 'var(--kz-success)', '#4ade80': 'var(--kz-success)',
  '#34D399': 'var(--kz-success)', '#34d399': 'var(--kz-success)',
  '#55D674': 'var(--kz-success)', '#55d674': 'var(--kz-success)',
  '#83EFB3': 'var(--kz-success)', '#83efb3': 'var(--kz-success)',
  '#F87171': 'var(--kz-danger)', '#f87171': 'var(--kz-danger)',
  '#FF7B7B': 'var(--kz-danger)', '#ff7b7b': 'var(--kz-danger)',
  '#FF6F7F': 'var(--kz-danger)', '#ff6f7f': 'var(--kz-danger)',
  '#FF9AA6': 'var(--kz-danger)', '#ff9aa6': 'var(--kz-danger)',
  '#E93D68': 'var(--kz-danger)', '#e93d68': 'var(--kz-danger)',
  '#FBBF24': 'var(--kz-cyan)', '#fbbf24': 'var(--kz-cyan)',
  '#F472B6': 'var(--kz-violet-light)', '#f472b6': 'var(--kz-violet-light)'
};
let cambiosHex = 0;
for (const rel of HOJAS.concat(['assets/css/kz-tokens.css'])) {
  let t = leer(rel);
  const antes = t;
  for (const [hex, tok] of Object.entries(MAPA_HEX)) {
    t = t.split(hex).join(tok);
  }
  if (t !== antes) { escribir(rel, t); cambiosHex++; console.log('   ' + rel + ' → colores duros sustituidos'); }
}

/* ── 4 · Cargar los tokens en el panel ───────────────────────────── */
console.log('\n=== 4 · TOKENS EN EL PANEL ===');
const adminDir = path.join(RAIZ, 'admin');
const paginas = fs.readdirSync(adminDir).filter((f) => f.endsWith('.html'));
let tocadas = 0;
for (const f of paginas) {
  const p = path.join(adminDir, f);
  let t = fs.readFileSync(p, 'utf8');
  if (t.indexOf('kz-tokens.css') !== -1) continue;
  const antes = t;
  t = t.replace(
    /<link rel="stylesheet" href="\.\.\/assets\/css\/admin\.css"\s*\/?>/,
    '<link rel="stylesheet" href="../assets/css/kz-tokens.css" />\n  <link rel="stylesheet" href="../assets/css/admin.css" />'
  );
  if (t !== antes) { fs.writeFileSync(p, t, 'utf8'); tocadas++; }
}
console.log('   páginas del panel con tokens: ' + tocadas + '/' + paginas.length);

console.log('\n=== RESUMEN ===');
console.log('   hojas con referencias aplicadas: ' + cambiosVars);
console.log('   hojas con colores duros sustituidos: ' + cambiosHex);
console.log('   páginas del panel actualizadas: ' + tocadas);
