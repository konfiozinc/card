'use strict';
/* 1. Corrige el contraste de la hora del chat (fallaba en las dos burbujas).
   2. Clasifica el degradado de Instagram como color externo de marca. */
const fs = require('fs');
const path = require('path');
const R = process.cwd();

const cssP = path.join(R, 'assets/css/styles.css');
let css = fs.readFileSync(cssP, 'utf8');
const antes = css.length;
let n = 0;

function rep(de, a) {
  const partes = css.split(de);
  if (partes.length - 1 !== 1) { console.log('  [!!] esperaba 1 aparicion, hay ' + (partes.length - 1) + ': ' + de); return false; }
  css = partes.join(a);
  n++;
  return true;
}

/* Burbuja del bot: fondo oscuro -> token de texto apagado. */
rep('.kz-msg-time { font-size: 10px; color: #666; margin-top: 4px; }',
  '.kz-msg-time { font-size: 10px; color: var(--kz-text-muted); margin-top: 4px; }');

/* Burbuja del usuario: fondo cian brillante -> hereda el color oscuro del texto. */
rep('.kz-msg-user .kz-msg-time { text-align: right; }',
  '.kz-msg-user .kz-msg-time { text-align: right; color: inherit; opacity: .72; }');

/* Campo de entrada: fondo oscuro -> token de texto apagado. */
rep('.kz-chat-input textarea::placeholder { color: #666; }',
  '.kz-chat-input textarea::placeholder { color: var(--kz-text-muted); }');

fs.writeFileSync(cssP, css, 'utf8');
console.log('  [OK] assets/css/styles.css: ' + n + ' reglas ajustadas (' + antes + ' -> ' + css.length + ' bytes)');
console.log('  #666 restantes: ' + (css.match(/#666/gi) || []).length);

/* Clasificacion del degradado de Instagram. */
const ap = path.join(R, 'herramientas/auditar-paleta.js');
let t = fs.readFileSync(ap, 'utf8');
const ancla = "  '#E4405F': 'Instagram',";
if (!t.includes(ancla)) { console.log('  [!!] no encuentro el ancla de EXTERNO'); process.exit(1); }
if (!t.includes('#F09433')) {
  t = t.replace(ancla, ancla + "\n  '#F09433': 'Instagram (degradado)',\n  '#E6683C': 'Instagram (degradado)',\n  '#DC2743': 'Instagram (degradado)',\n  '#CC2366': 'Instagram (degradado)',\n  '#BC1888': 'Instagram (degradado)',");
  fs.writeFileSync(ap, t, 'utf8');
  console.log('  [OK] auditar-paleta.js: degradado de Instagram clasificado como externo');
} else {
  console.log('  [--] degradado ya clasificado');
}

/* Integridad. */
const b = fs.readFileSync(cssP);
console.log('  BOM: ' + (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 'SI' : 'no') +
  ' · mojibake: ' + (css.includes('\uFFFD') ? 'SI' : 'no'));
