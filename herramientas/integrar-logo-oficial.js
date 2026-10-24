#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/integrar-logo-oficial.js

   KZ-ID-001 · Sustituye el monograma vectorial por el LOGOTIPO OFICIAL
   entregado por el propietario, en las dos variantes de cabecera que tiene
   el sitio y en el pie.

   No cambia nombres comerciales ni contenido: solo el recurso gráfico,
   que pasa de un SVG dibujado a mano a la imagen oficial del propietario.

   Uso: node herramientas/integrar-logo-oficial.js [--aplicar]
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const APLICAR = process.argv.includes('--aplicar');

function paginas(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs', 'herramientas', 'functions', 'tools', 'design-system'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');
const prefijo = (p) => '../'.repeat(rel(p).split('/').length - 1);

/* La marca dibujada a mano que sustituimos (dos escalas conocidas). */
const PATHS_VIEJOS = [
  'M8 7h10v13L32 7h8L25 23l16 18H28L18 29v12H8z',
  'M13 11h14v17L43 11h10L34 31l20 22H38L27 39v14H13z'
];

let nCab = 0, nPie = 0, nLogos = 0, nIconos = 0, tocadas = 0;
const detalle = [];

for (const pag of paginas(RAIZ)) {
  const antes = fs.readFileSync(pag, 'utf8');
  let t = antes;
  const P = prefijo(pag);
  const marca = [];

  /* ── 1. Cabecera variante PORTADA: <svg> + <span>KONFÍO <b>ZINC</b></span> ── */
  t = t.replace(
    /<svg\s+viewBox="0 0 48 48"[^>]*>\s*<path\s+d="M8 7h10v13L32 7h8L25 23l16 18H28L18 29v12H8z"\s*\/>\s*<\/svg>\s*<span>KONF[IÍ]O\s*<b>ZINC<\/b><\/span>/gi,
    (m) => {
      nCab++;
      if (/class="brand"/.test(m)) marca.push('portada');
      return '<img class="brand__logo" src="' + P + 'assets/img/marca/logo-oficial.png" alt="KONFÍO ZINC" width="1332" height="574" decoding="async">';
    }
  );

  /* ── 2. Cabecera variante COMERCIAL: <svg class="nav-logo-svg"> + span ── */
  t = t.replace(
    /<svg\s+class="nav-logo-svg"[^>]*>\s*<path\s+d="M8 7h10v13L32 7h8L25 23l16 18H28L18 29v12H8z"\s*\/>\s*<\/svg>\s*<span class="nav-logo-text">[\s\S]*?<\/span>/gi,
    () => {
      nLogos++;
      marca.push('comercial');
      return '<img class="nav-logo-img" src="' + P + 'assets/img/marca/logo-oficial.png" alt="KONFÍO ZINC" width="1332" height="574" decoding="async">';
    }
  );

  /* ── 3. Restos del monograma que quedaran sueltos (pie, etc.) ───── */
  for (const d of PATHS_VIEJOS) {
    const re = new RegExp('<svg[^>]*>\\s*<path\\s+d="' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*\\/?>\\s*<\\/svg>', 'gi');
    t = t.replace(re, () => { nPie++; marca.push('resto'); return '<img class="footer-logo" src="' + P + 'assets/img/marca/marca-oficial.png" alt="KONFÍO ZINC" width="1024" height="1024" decoding="async">'; });
  }

  /* ── 4. Favicon: el SVG dibujado no es el logotipo oficial ──────── */
  const reSvgIcon = /^\s*<link rel="icon" href="[^"]*assets\/img\/marca\/favicon\.svg" type="image\/svg\+xml">\s*$/gm;
  if (reSvgIcon.test(t)) {
    t = t.replace(reSvgIcon, '  <link rel="icon" type="image/png" sizes="64x64" href="' + P + 'assets/img/logos/favicon-64.png">');
    nIconos++;
  }

  if (t !== antes) {
    tocadas++;
    detalle.push(rel(pag) + ' [' + [...new Set(marca)].join(',') + ']');
    if (APLICAR) fs.writeFileSync(pag, t, 'utf8');
  }
}

console.log('=== ' + (APLICAR ? 'APLICADO' : 'SIMULACIÓN (usa --aplicar)') + ' ===');
console.log('  páginas modificadas : ' + tocadas + ' de ' + paginas(RAIZ).length);
console.log('  cabecera portada    : ' + nCab);
console.log('  cabecera comercial  : ' + nLogos);
console.log('  restos de monograma : ' + nPie);
console.log('  favicons actualizados: ' + nIconos);
if (detalle.length <= 12) detalle.forEach((d) => console.log('    · ' + d));

/* Verificación: no debe quedar ningún monograma dibujado. */
let quedan = 0;
for (const pag of paginas(RAIZ)) {
  const t = fs.readFileSync(pag, 'utf8');
  for (const d of PATHS_VIEJOS) if (t.includes(d)) { quedan++; console.log('  QUEDA monograma en ' + rel(pag)); break; }
}
console.log('  páginas con monograma dibujado restante: ' + quedan);
process.exit(quedan === 0 ? 0 : 1);
