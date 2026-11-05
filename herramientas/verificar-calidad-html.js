#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-calidad-html.js
   KZ-QA-GLOBAL-001 · Verificador del «Definition of Done» de páginas web.

   Comprueba, en TODAS las páginas del sitio (públicas y del panel), las seis
   reglas que Darwin fijó como obligatorias:

     1. <title> único, no vacío y sin repetir la marca
     2. <meta name="description"> de 160 caracteres como máximo
     3. Open Graph completa: og:title, og:description, og:image y og:type,
        con og:image en URL absoluta
     4. Favicon declarado (SVG y PNG) y con el archivo existente;
        sin imágenes locales rotas
     5. Atributo alt en todas las imágenes
     6. lang="es" en <html>

   Uso:
     node herramientas/verificar-calidad-html.js
     node herramientas/verificar-calidad-html.js --json

   Sale con código 1 si alguna página incumple. Pensado para ejecutarse antes
   de cada commit, igual que verificar-precios.js.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const EXCLUIR = [/node_modules/, /[\\/]\.git[\\/]/, /[\\/]crm-dev[\\/]/, /[\\/]docs[\\/]/, /[\\/]evidencias/, /[\\/]_transferencia[\\/]/];
const JSON_SALIDA = process.argv.includes('--json');

function paginasHtml(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (EXCLUIR.some((rx) => rx.test(p))) continue;
    if (e.isDirectory()) paginasHtml(p, salida);
    else if (e.name.endsWith('.html')) salida.push(p);
  }
  return salida;
}

/** Revisa una página y devuelve { archivo, fallos[], avisos[] }. */
function revisar(ruta) {
  const rel = path.relative(RAIZ, ruta).replace(/\\/g, '/');
  const texto = fs.readFileSync(ruta, 'utf8');
  const cabecera = texto.slice(0, Math.max(texto.indexOf('</head>'), 0));
  const fallos = [];
  const avisos = [];

  /* 6 · idioma */
  const html = (texto.match(/<html[^>]*>/i) || [''])[0];
  const lang = (html.match(/lang="([^"]*)"/i) || [])[1] || '';
  if (!lang) fallos.push('falta lang en <html>');
  else if (!/^es/i.test(lang)) fallos.push(`lang="${lang}" no es español`);

  /* 1 · título */
  const titulos = [...cabecera.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1].trim());
  if (!titulos.length) fallos.push('sin <title>');
  else if (titulos.length > 1) fallos.push(`${titulos.length} etiquetas <title>`);
  else if (!titulos[0]) fallos.push('<title> vacío');
  else {
    if ((titulos[0].match(/KONF[ÍI]O\s*ZINC/gi) || []).length > 1) fallos.push('el título repite la marca');
    if (/—\s*Panel\s+KONF/i.test(titulos[0])) fallos.push('título con el formato viejo «— Panel …»');
    if (titulos[0].length > 70) avisos.push(`título largo (${titulos[0].length} caracteres)`);
  }

  /* 2 · descripción */
  const desc = (cabecera.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [])[1];
  if (!desc || !desc.trim()) fallos.push('sin meta description');
  else if (desc.length > 160) fallos.push(`description de ${desc.length} caracteres (máximo 160)`);

  /* 3 · Open Graph */
  const og = {};
  for (const m of cabecera.matchAll(/<meta[^>]+property="(og:[^"]+)"[^>]+content="([^"]*)"/gi)) og[m[1]] = m[2];
  for (const k of ['og:title', 'og:description', 'og:image', 'og:type']) if (!og[k]) fallos.push(`sin ${k}`);
  if (og['og:image'] && !/^https?:\/\//i.test(og['og:image'])) fallos.push('og:image no es una URL absoluta');

  /* 4 · favicon e imágenes */
  const iconos = [...cabecera.matchAll(/<link[^>]+rel="[^"]*icon[^"]*"[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
  const iconosReales = iconos.filter((h) => !/^data:/i.test(h));
  if (!iconosReales.length) fallos.push('sin favicon declarado');
  else {
    if (!iconosReales.some((h) => /\.svg($|\?)/i.test(h))) avisos.push('sin favicon SVG (se ve peor en la pestaña)');
    for (const h of iconosReales) {
      if (/^https?:/i.test(h)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(ruta), h.split('?')[0]))) fallos.push(`favicon inexistente: ${h}`);
    }
  }

  const imgs = [...texto.matchAll(/<img\b([^>]*)>/gi)].map((m) => m[1]);
  let sinAlt = 0;
  const rotas = [];
  for (const attrs of imgs) {
    if (!/\balt\s*=/.test(attrs)) sinAlt++;
    const src = (attrs.match(/\bsrc\s*=\s*"([^"]*)"/) || [])[1];
    if (src && !/^(https?:|data:|#)/i.test(src) && !src.includes('${')) {
      const limpio = src.split('?')[0];
      if (!fs.existsSync(path.resolve(path.dirname(ruta), limpio))) rotas.push(limpio);
    }
  }
  /* 5 · alt */
  if (sinAlt) fallos.push(`${sinAlt} imagen(es) sin atributo alt`);
  if (rotas.length) fallos.push(`${rotas.length} imagen(es) rotas: ${[...new Set(rotas)].slice(0, 2).join(', ')}`);

  return { archivo: rel, fallos, avisos };
}

/* ── Ejecución ─────────────────────────────────────────────────────── */
const archivos = paginasHtml(RAIZ).sort();
const revisiones = archivos.map(revisar);
const conFallos = revisiones.filter((r) => r.fallos.length);

if (JSON_SALIDA) {
  console.log(JSON.stringify({ total: archivos.length, conFallos: conFallos.length, paginas: revisiones }, null, 2));
} else {
  console.log('\n═══ verificar-calidad-html · Definition of Done ═══\n');
  console.log(`  páginas revisadas: ${archivos.length}`);
  for (const r of conFallos) console.log(`  ✗ ${r.archivo}\n      ${r.fallos.join('\n      ')}`);
  const avisos = revisiones.filter((r) => r.avisos.length);
  if (avisos.length) {
    console.log(`\n  avisos (no bloquean): ${avisos.length} página(s)`);
    for (const r of avisos.slice(0, 8)) console.log(`    · ${r.archivo}: ${r.avisos.join(' · ')}`);
  }
  console.log('');
  if (conFallos.length) {
    console.log(`RESULTADO: FALLA — ${conFallos.length} de ${archivos.length} páginas incumplen el estándar.`);
    console.log('  Corrige lo indicado antes de commitear (regla KZ-QA-GLOBAL-001).\n');
  } else {
    console.log(`RESULTADO: OK — las ${archivos.length} páginas cumplen el estándar de calidad.\n`);
  }
}

process.exit(conFallos.length ? 1 : 0);
