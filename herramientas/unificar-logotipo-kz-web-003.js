#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/unificar-logotipo-kz-web-003.js

   KZ-WEB-003 · Deja UN solo logotipo en todo el sitio.

   Sustituye en cada página:
     · La imagen del pie  → monograma vectorial de marca (SVG, sin fondo).
     · El logo de los datos estructurados (JSON-LD) → PNG cuadrado de 512,
       que es lo que los buscadores aceptan como imagen de marca.

   No toca el texto alternativo ni el tamaño: cambia solo el archivo.
   Uso: node herramientas/unificar-logotipo-kz-web-003.js [--aplicar]
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const APLICAR = process.argv.includes('--aplicar');
const SITIO = 'https://konfiozinc.github.io/card';

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

let cambios = 0, pie = 0, json = 0;
const detalle = [];

for (const pag of paginas(RAIZ)) {
  const antes = fs.readFileSync(pag, 'utf8');
  let t = antes;
  const P = prefijo(pag);

  /* 1. Imagen del pie: el JPEG fotográfico no es un logotipo vectorial. */
  const rePie = new RegExp('<img\\s+src="' + P.replace(/\./g, '\\.') + 'assets/img/logos/logo\\.jpeg"([^>]*?)>', 'g');
  t = t.replace(rePie, (m, resto) => {
    pie++;
    return '<img src="' + P + 'assets/img/marca/kz-monograma.svg"' + resto + '>';
  });

  /* 2. Logo de los datos estructurados: PNG cuadrado, como piden los buscadores. */
  if (t.includes('"logo"')) {
    const reJson = /"logo"\s*:\s*"https?:\/\/[^"]*logo\.jpeg"/g;
    const n = (t.match(reJson) || []).length;
    if (n) {
      t = t.replace(reJson, '"logo": "' + SITIO + '/assets/img/icons/icon-512.png"');
      json += n;
    }
  }

  if (t !== antes) {
    cambios++;
    detalle.push(rel(pag));
    if (APLICAR) fs.writeFileSync(pag, t, 'utf8');
  }
}

console.log('=== ' + (APLICAR ? 'APLICADO' : 'SIMULACIÓN (usa --aplicar)') + ' ===');
console.log('  páginas modificadas: ' + cambios + ' de ' + paginas(RAIZ).length);
console.log('  imágenes de pie sustituidas: ' + pie);
console.log('  logos de JSON-LD actualizados: ' + json);

/* Verificación: no debe quedar ninguna referencia al JPEG. */
let quedan = 0;
for (const pag of paginas(RAIZ)) {
  const t = fs.readFileSync(pag, 'utf8');
  const n = (t.match(/logo\.jpeg/g) || []).length;
  if (n) { quedan += n; console.log('  QUEDA ' + n + ' en ' + rel(pag)); }
}
console.log('  referencias a logo.jpeg restantes: ' + quedan);

let malos = 0;
for (const pag of paginas(RAIZ)) {
  const t = fs.readFileSync(pag, 'utf8');
  if (t.includes('\uFFFD')) { console.log('  MOJIBAKE: ' + rel(pag)); malos++; }
  const b = fs.readFileSync(pag);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { console.log('  BOM: ' + rel(pag)); malos++; }
}
console.log('  archivos con BOM o mojibake: ' + malos);
process.exit(quedan === 0 && malos === 0 ? 0 : 1);
