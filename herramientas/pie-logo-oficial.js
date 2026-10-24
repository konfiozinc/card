#!/usr/bin/env node
/* KONFÍO ZINC · herramientas/pie-logo-oficial.js
   Sustituye en el PIE el monograma dibujado a mano por la MARCA OFICIAL
   del propietario. El patrón anterior (<img src=".../kz-monograma.svg">)
   no lo cubría la sustitución de <svg>, así que quedaba vivo en 36 páginas. */
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

let n = 0, tocadas = 0;
for (const pag of paginas(RAIZ)) {
  const antes = fs.readFileSync(pag, 'utf8');
  let t = antes;
  /* Marca cuadrada oficial, con sus dimensiones reales para evitar saltos. */
  t = t.replace(
    /<img\s+src="([^"]*?)assets\/img\/marca\/kz-monograma\.svg"\s+alt="([^"]*)"\s+class="footer-logo"[^>]*>/gi,
    (m, P, alt) => {
      n++;
      return '<img src="' + P + 'assets/img/marca/marca-oficial.png" alt="' + alt + '" class="footer-logo" width="1024" height="1024" loading="lazy" decoding="async">';
    }
  );
  if (t !== antes) {
    tocadas++;
    if (APLICAR) fs.writeFileSync(pag, t, 'utf8');
  }
}

console.log('=== ' + (APLICAR ? 'APLICADO' : 'SIMULACIÓN (usa --aplicar)') + ' ===');
console.log('  imágenes de pie sustituidas: ' + n + ' en ' + tocadas + ' páginas');

let quedan = 0;
for (const pag of paginas(RAIZ)) {
  const t = fs.readFileSync(pag, 'utf8');
  const c = (t.match(/kz-monograma/g) || []).length;
  if (c) { quedan += c; console.log('  QUEDA ' + c + ' en ' + rel(pag)); }
}
console.log('  referencias a kz-monograma restantes en HTML: ' + quedan);
process.exit(APLICAR ? (quedan === 0 ? 0 : 1) : 0);
