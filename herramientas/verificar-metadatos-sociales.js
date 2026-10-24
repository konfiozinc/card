#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-metadatos-sociales.js

   KZ-ID-001 · Auditoría de metadatos sociales y de iconos en TODAS las
   páginas públicas. Comprueba cada campo por separado, exige HTTPS
   absoluto y verifica que la imagen referenciada exista y mida 1200x630.

   Uso: node herramientas/verificar-metadatos-sociales.js [--aplicar]
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

/* Dimensiones reales de un PNG. */
function dimPng(p) {
  const b = fs.readFileSync(p);
  if (b[0] !== 0x89 || b[1] !== 0x50) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const CAMPOS = [
  ['og:title', /property="og:title"\s+content="[^"]+"/i],
  ['og:description', /property="og:description"\s+content="[^"]+"/i],
  ['og:image', /property="og:image"\s+content="[^"]+"/i],
  ['og:image:width', /property="og:image:width"\s+content="1200"/i],
  ['og:image:height', /property="og:image:height"\s+content="630"/i],
  ['og:url', /property="og:url"\s+content="[^"]+"/i],
  ['og:type', /property="og:type"\s+content="[^"]+"/i],
  ['twitter:card', /name="twitter:card"\s+content="[^"]+"/i],
  ['twitter:image', /name="twitter:image"\s+content="[^"]+"/i],
  ['canonical', /rel="canonical"\s+href="[^"]+"/i]
];

let tocadas = 0;
const faltantes = {};
const problemas = [];
const noindexSinOg = [];

for (const pag of paginas(RAIZ)) {
  let t = fs.readFileSync(pag, 'utf8');
  const antes = t;

  /* og:type y og:description son los dos que faltaban de forma sistemática. */
  if (/property="og:url"/i.test(t) && !/property="og:type"/i.test(t)) {
    t = t.replace(/(<meta\s+property="og:url"\s+content="[^"]+"\s*\/?>)/i, '$1\n  <meta property="og:type" content="website">');
  }
  if (/property="og:title"/i.test(t) && !/property="og:description"/i.test(t)) {
    const desc = (t.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || [])[1]
      || (t.match(/property="og:title"\s+content="([^"]+)"/i) || [])[1] || 'KONFÍO ZINC';
    t = t.replace(/(<meta\s+property="og:title"\s+content="[^"]+"\s*\/?>)/i,
      '$1\n  <meta property="og:description" content="' + desc.replace(/"/g, '&quot;').slice(0, 300) + '">');
  }
  /* Página pública con Open Graph parcial: se completa con la imagen de marca.
     No se tocan las que ya tienen una imagen propia. */
  const esNoindexPrevio = /name="robots"[^>]*noindex/i.test(t);
  if (!esNoindexPrevio && /property="og:url"/i.test(t) && !/property="og:image"/i.test(t)) {
    const img = SITIO + '/assets/img/og/og-1200x630.png';
    const alt = (t.match(/property="og:title"\s+content="([^"]+)"/i) || [])[1] || 'KONFÍO ZINC';
    t = t.replace(/(<meta\s+property="og:url"\s+content="[^"]+"\s*\/?>)/i,
      '$1\n  <meta property="og:image" content="' + img + '">' +
      '\n  <meta property="og:image:width" content="1200">' +
      '\n  <meta property="og:image:height" content="630">' +
      '\n  <meta property="og:image:alt" content="' + alt.replace(/"/g, '&quot;') + '">' +
      '\n  <meta name="twitter:card" content="summary_large_image">' +
      '\n  <meta name="twitter:image" content="' + img + '">');
  }

  /* twitter:image debe ser la misma imagen que og:image: si difieren, una red
     social muestra una tarjeta y otra distinta, y casi siempre es un residuo. */
  const ogActual = (t.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1];
  const twActual = (t.match(/name="twitter:image"\s+content="([^"]+)"/i) || [])[1];
  if (ogActual && twActual && ogActual !== twActual) {
    t = t.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/i, '$1' + ogActual + '$2');
    if (APLICAR) fs.writeFileSync(pag, t, 'utf8');
  }

  if (t !== antes) {
    tocadas++;
    if (APLICAR) fs.writeFileSync(pag, t, 'utf8');
  }

  /* Auditoría campo por campo sobre el contenido final.
     Las páginas noindex (panel administrativo, 404, demo) NO se comparten en
     redes: exigirles Open Graph sería ruido, no calidad. Se informan aparte. */
  const r = rel(pag);
  const esNoindex = /name="robots"[^>]*noindex/i.test(t);
  if (esNoindex) { if (!noindexSinOg.includes(r) && !/property="og:title"/i.test(t)) noindexSinOg.push(r); continue; }
  for (const [nombre, re] of CAMPOS) {
    if (!re.test(t)) {
      if (!faltantes[nombre]) faltantes[nombre] = [];
      faltantes[nombre].push(r);
    }
  }
  /* URLs absolutas y HTTPS. */
  const ogImg = (t.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1];
  const twImg = (t.match(/name="twitter:image"\s+content="([^"]+)"/i) || [])[1];
  if (ogImg && !/^https:\/\//.test(ogImg)) problemas.push(r + ' :: og:image no es HTTPS absoluta (' + ogImg.slice(0, 60) + ')');
  if (twImg && twImg !== ogImg) problemas.push(r + ' :: twitter:image distinta de og:image');
  /* La imagen debe existir en el repo y medir 1200x630. */
  if (ogImg) {
    const local = path.join(RAIZ, ogImg.replace(SITIO + '/', ''));
    if (!fs.existsSync(local)) problemas.push(r + ' :: og:image no existe en el repo (' + ogImg.replace(SITIO + '/', '') + ')');
    else {
      const d = dimPng(local);
      if (d && (d.w !== 1200 || d.h !== 630)) problemas.push(r + ' :: og:image mide ' + d.w + 'x' + d.h);
    }
  }
  /* Iconos. */
  if (!/rel="icon"/i.test(t)) problemas.push(r + ' :: sin rel="icon"');
  if (!/apple-touch-icon/i.test(t)) problemas.push(r + ' :: sin apple-touch-icon');
}

console.log('=== ' + (APLICAR ? 'APLICADO' : 'SIMULACIÓN (usa --aplicar)') + ' ===');
console.log('  páginas con campos añadidos: ' + tocadas);
console.log('\n=== COBERTURA POR CAMPO ===');
for (const [nombre] of CAMPOS) {
  const n = faltantes[nombre] ? faltantes[nombre].length : 0;
  const barra = n === 0 ? 'completo' : n + ' páginas sin él';
  console.log('  ' + nombre.padEnd(20) + barra + (n && n <= 6 ? '  -> ' + faltantes[nombre].join(', ') : ''));
}
console.log('\n=== PROBLEMAS DE VALOR ===');
if (problemas.length === 0) console.log('  ninguno');
else problemas.slice(0, 20).forEach((p) => console.log('  · ' + p));
console.log('  total: ' + problemas.length);

console.log('\n=== PÁGINAS noindex sin Open Graph (correcto) ===');
console.log('  ' + noindexSinOg.length + ': ' + noindexSinOg.join(', '));

const totalFaltan = Object.values(faltantes).reduce((s, a) => s + a.length, 0);
console.log('\n  páginas PÚBLICAS con algún campo pendiente: ' + totalFaltan);
process.exit(totalFaltan === 0 && problemas.length === 0 ? 0 : 1);
