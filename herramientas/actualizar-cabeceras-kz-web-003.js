#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/actualizar-cabeceras-kz-web-003.js

   KZ-WEB-003 · Unifica en TODAS las páginas:
     · favicon    → SVG de marca + PNG 32 + apple-touch 180 (una sola fuente)
     · Open Graph → PNG 1200x630 con ancho, alto y texto alternativo
     · Twitter    → summary_large_image coherente con og:image

   El favicon y la imagen de Open Graph son recursos DISTINTOS: aquí se
   tratan por separado a propósito.

   Uso: node herramientas/actualizar-cabeceras-kz-web-003.js [--aplicar]
   Sin --aplicar solo informa.
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
const profundidad = (p) => rel(p).split('/').length - 1;
const prefijo = (p) => '../'.repeat(profundidad(p));

const cambios = [];
function anota(pag, que) { cambios.push(rel(pag) + ' :: ' + que); }

let tocadas = 0;
for (const pag of paginas(RAIZ)) {
  const original = fs.readFileSync(pag, 'utf8');
  let t = original;
  const P = prefijo(pag);

  /* ── 1. Favicon: un solo origen para todos ─────────────────────── */
  const bloqueIconos = [
    `<link rel="icon" href="${P}assets/img/marca/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${P}assets/img/logos/favicon-32.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${P}assets/img/icons/apple-touch-icon.png">`
  ].join('\n');

  const lineas = t.split(/\r?\n/);
  const esIcono = (l) => /^\s*<link[^>]*rel="(icon|apple-touch-icon)"[^>]*>\s*$/i.test(l);
  const idx = lineas.findIndex(esIcono);
  if (idx === -1) {
    /* Sin favicon declarado: se inserta antes de </head> para no dejarlo sin icono. */
    if (/<\/head>/i.test(t)) {
      t = t.replace(/(\s*)<\/head>/i, '\n  ' + bloqueIconos.split('\n').join('\n  ') + '$1</head>');
      anota(pag, 'favicon AÑADIDO (no tenía)');
    }
  } else {
    const filtradas = lineas.filter((l) => !esIcono(l));
    /* Se conserva un comentario guía si existía justo encima. */
    const destino = [];
    for (let i = 0; i < filtradas.length; i++) {
      destino.push(filtradas[i]);
      if (i === idx - 1 - (lineas.slice(0, idx).filter(esIcono).length)) {
        bloqueIconos.split('\n').forEach((b) => destino.push('  ' + b.trim()));
      }
    }
    const nuevo = destino.join('\n');
    if (nuevo !== t && /assets\/img\/marca\/favicon\.svg/.test(nuevo)) {
      const teniaJpeg = /logo\.jpeg/.test(lineas.filter(esIcono).join(' '));
      t = nuevo;
      anota(pag, 'favicon unificado' + (teniaJpeg ? ' (era logo.jpeg)' : ''));
    }
  }

  /* ── 2. Open Graph: imágenes SVG o JPEG → PNG 1200x630 ─────────── */
  const ogImg = t.match(/<meta\s+property="og:image"\s+content="([^"]+)"\s*\/?>/i);
  if (ogImg) {
    const actual = ogImg[1];
    let nuevo = actual;
    if (/og-cover\.svg$/i.test(actual)) nuevo = SITIO + '/assets/img/og/og-1200x630.png';
    else if (/og-konfio-zinc\.jpg$/i.test(actual)) nuevo = SITIO + '/assets/img/og/og-1200x630.png';
    if (nuevo !== actual) {
      t = t.replace(actual, nuevo);
      t = t.replace(/(<meta\s+property="twitter:image"\s+content=")[^"]*(")/i, '$1' + nuevo + '$2');
      anota(pag, 'og:image ' + path.basename(actual) + ' -> ' + path.basename(nuevo));
    }

    /* Ancho, alto y alt: sin ellos WhatsApp y Telegram no reservan bien el espacio. */
    const ogFinal = (t.match(/<meta\s+property="og:image"\s+content="([^"]+)"\s*\/?>/i) || [])[1] || nuevo;
    if (!/property="og:image:width"/i.test(t)) {
      t = t.replace(/(<meta\s+property="og:image"\s+content="[^"]+"\s*\/?>)/i,
        '$1\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />');
      anota(pag, 'og:image:width/height AÑADIDOS');
    }
    if (!/property="og:image:alt"/i.test(t)) {
      const ttl = (t.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || [])[1] || 'KONFÍO ZINC';
      t = t.replace(/(<meta\s+property="og:image:height"\s+content="630"\s*\/?>)/i, '$1\n  <meta property="og:image:alt" content="' + ttl.replace(/"/g, '&quot;') + '" />');
      anota(pag, 'og:image:alt AÑADIDO');
    }
    if (!/name="twitter:card"/i.test(t)) {
      t = t.replace(/(<meta\s+property="og:image:alt"[^>]*>)/i,
        '$1\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:image" content="' + ogFinal + '">');
      anota(pag, 'twitter:card AÑADIDO');
    }
  }

  if (t !== original) {
    tocadas++;
    if (APLICAR) fs.writeFileSync(pag, t, 'utf8');
  }
}

console.log('=== ' + (APLICAR ? 'APLICADO' : 'SIMULACIÓN (usa --aplicar)') + ' ===');
console.log('  páginas tocadas: ' + tocadas);
const porTipo = {};
cambios.forEach((c) => { const k = c.split(' :: ')[1].split(' ')[0]; porTipo[k] = (porTipo[k] || 0) + 1; });
for (const [k, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(18) + n);
if (cambios.length <= 40) cambios.forEach((c) => console.log('  · ' + c));
else cambios.slice(0, 40).forEach((c) => console.log('  · ' + c));

/* Integridad de codificación. */
let malos = 0;
for (const pag of paginas(RAIZ)) {
  const b = fs.readFileSync(pag);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { console.log('  BOM: ' + rel(pag)); malos++; }
  if (fs.readFileSync(pag, 'utf8').includes('\uFFFD')) { console.log('  MOJIBAKE: ' + rel(pag)); malos++; }
}
console.log('  archivos con BOM o mojibake: ' + malos);
process.exit(malos === 0 ? 0 : 1);
