#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * corregir-contactpoint.js · KONFÍO ZINC
 *
 * Dos correcciones al nodo Organization de todas las páginas:
 *
 *   1. QUITAR `"contactOption":"TollFree"`.
 *      Ese valor de schema.org significa "número gratuito 0800". El canal de
 *      KONFÍO ZINC es un WhatsApp móvil (+57 320 641 1340), así que declararlo
 *      es información falsa en los datos estructurados.
 *
 *   2. AÑADIR `alternateName` a las páginas que no lo tengan.
 *      Sirve para que buscadores y asistentes entiendan que las variantes
 *      "Konfio Zinc", "KONFÍO ZINC" y "KZ" son la misma entidad. Es una de las
 *      piezas que ayuda a unificar la marca entre el sitio, las redes y la
 *      ficha de Google.
 *
 * Idempotente.
 *
 * Uso:
 *   node herramientas/corregir-contactpoint.js --dry-run
 *   node herramientas/corregir-contactpoint.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const ORG_ID = 'https://konfiozinc.github.io/card/#organizacion';

/* Variantes del nombre que la gente escribe y busca de verdad.
   "KZ" se incluye porque es la abreviatura usada en los paquetes y en el
   propio panel (KZ Inicio, KZ Negocio, KZ Activo). */
const ALTERNATE_NAMES = ['Konfio Zinc', 'KONFIO ZINC', 'KZ', 'KZ Soluciones Digitales'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'KIT_COMERCIAL') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const paginas = walk(REPO)
  .filter((f) => f.endsWith('.html') && path.basename(f) !== 'index-old.html')
  .sort();

let quitadosTollFree = 0;
let alternateAnadido = 0;
let jsonInvalido = 0;
const detalle = [];

for (const file of paginas) {
  const rel = path.relative(REPO, file).replace(/\\/g, '/');
  let raw = fs.readFileSync(file, 'utf8');
  const antes = raw;

  /* 1. Quitar contactOption TollFree (en cualquier nodo) */
  const nToll = (raw.match(/"contactOption"\s*:\s*"TollFree",?/g) || []).length;
  if (nToll) {
    raw = raw.replace(/,?"contactOption"\s*:\s*"TollFree"/g, '');
    quitadosTollFree += nToll;
  }

  /* 2. Añadir alternateName si falta, justo después de "name" del Organization */
  const iOrg = raw.indexOf(ORG_ID);
  if (iOrg !== -1) {
    const nodo = raw.slice(iOrg, iOrg + 1200);
    if (!/"alternateName"/.test(nodo)) {
      /* Se ancla en la línea que declara el nombre de la organización */
      const iNombre = raw.indexOf('"name": "KONFÍO ZINC"', iOrg);
      if (iNombre !== -1 && iNombre - iOrg < 600) {
        const finLinea = raw.indexOf('\n', iNombre);
        const indent = raw.slice(raw.lastIndexOf('\n', iNombre) + 1, iNombre).match(/^\s*/)[0];
        const bloque = `${indent}"alternateName": ${JSON.stringify(ALTERNATE_NAMES.join(' · '))},\n`;
        raw = raw.slice(0, finLinea + 1) + bloque + raw.slice(finLinea + 1);
        alternateAnadido++;
      }
    }
  }

  if (raw === antes) continue;

  /* Validar que el JSON-LD siga siendo parseable antes de escribir */
  let ok = true;
  for (const m of raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { ok = false; jsonInvalido++; console.error(`  ❌ JSON inválido en ${rel}: ${e.message}`); break; }
  }
  if (!ok) continue;

  if (!DRY) fs.writeFileSync(file, raw, 'utf8');
  detalle.push(rel);
}

console.log(DRY ? '\n=== SIMULACIÓN (--dry-run · nada escrito) ===\n' : '\n=== CORRECCIONES DE CONTACTPOINT Y ALTERNATENAME ===\n');
console.log(`Páginas modificadas            : ${detalle.length}`);
console.log(`"contactOption":"TollFree" fuera : ${quitadosTollFree}`);
console.log(`alternateName añadido          : ${alternateAnadido}`);
if (jsonInvalido) console.log(`⚠️  Páginas con JSON inválido (no escritas): ${jsonInvalido}`);

/* Muestra de una página para revisar el resultado */
const muestra = path.join(REPO, 'index.html');
if (fs.existsSync(muestra)) {
  const c = fs.readFileSync(muestra, 'utf8');
  const i = c.indexOf(ORG_ID);
  const frag = c.slice(i, i + 620);
  const m = frag.match(/"alternateName"[^\n]*/);
  const t = frag.match(/"contactPoint"[^\n]*/);
  console.log('\nComprobación en index.html:');
  console.log('  ' + (m ? m[0].trim() : '(sin alternateName)'));
  console.log('  ' + (t ? (t[0].includes('TollFree') ? '⚠️ AÚN TIENE TollFree' : 'contactPoint sin TollFree ✅') : '(sin contactPoint)'));
}
console.log('');
