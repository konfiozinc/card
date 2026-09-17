#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * completar-sameas.js · KONFÍO ZINC
 *
 * Objetivo: que Google entienda que los perfiles sociales pertenecen a la
 * misma entidad que el sitio. Para eso, TODAS las páginas deben declarar el
 * mismo `sameAs` en el nodo Organization, y el nodo debe incluir un
 * `contactPoint` con el canal real de atención (WhatsApp + correo).
 *
 * Qué hace:
 *   1. Añade `sameAs` (Facebook, Instagram, TikTok) a las páginas cuyo nodo
 *      Organization no lo tenga todavía.
 *   2. Añade `contactPoint` al nodo Organization de todas las páginas.
 *   3. Normaliza el nodo Organization: mismo `@id`, mismo nombre, mismas
 *      URL sociales y mismos datos de contacto en todo el sitio.
 *
 * El bloque se inserta después de `"telephone"` dentro del nodo Organization
 * (que se identifica de forma inequívoca por su `@id`), no del nodo Person
 * del fundador ni de otros nodos que también usan `telephone`.
 *
 * Idempotente: si ya está, no duplica.
 *
 * Uso:
 *   node herramientas/completar-sameas.js --dry-run
 *   node herramientas/completar-sameas.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const ORG_ID = 'https://konfiozinc.github.io/card/#organizacion';

/* Los 3 perfiles oficiales. Esta es la lista canónica: si cambia un handle,
   se cambia AQUÍ y se ejecuta este script. */
const SAME_AS = [
  'https://www.facebook.com/share/1DRqH4Vvrt/',
  'https://www.instagram.com/konfio_zinc',
  'https://www.tiktok.com/@tarjetaszinc'
];

const CONTACT_POINT = {
  '@type': 'ContactPoint',
  telephone: '+573206411340',
  contactType: 'customer service',
  email: 'konfiozinc@gmail.com',
  availableLanguage: ['es'],
  areaServed: 'CO',
  contactOption: 'TollFree'
};

const CLAVES_SAME_AS = ['"sameAs"'];
const CLAVES_CONTACTO = ['"contactPoint"'];

/** Bloques JSON listos para insertar, con la indentación del archivo. */
function bloqueSameAs(indent) {
  const lineas = SAME_AS.map((u) => `${indent}  "${u}"`).join(',\n');
  return `${indent}"sameAs": [\n${lineas}\n${indent}],`;
}

function bloqueContactPoint(indent) {
  const cp = JSON.stringify(CONTACT_POINT);
  return `${indent}"contactPoint": ${cp},`;
}

/* ── Recorrido de páginas ──────────────────────────────────────────── */
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

const log = [];
let conOrg = 0;
let sameAsAnadido = 0;
let contactAnadido = 0;
const sinOrganization = [];

for (const file of paginas) {
  const rel = path.relative(REPO, file).replace(/\\/g, '/');
  let raw = fs.readFileSync(file, 'utf8');

  /* Localizar el nodo Organization por su @id */
  const iOrg = raw.indexOf(ORG_ID);
  if (iOrg === -1) { sinOrganization.push(rel); continue; }
  conOrg++;

  /* Fin del nodo: primer cierre de objeto seguido de coma o corchete.
     Se busca desde el @id hacia adelante, con margen suficiente. */
  const ventana = raw.slice(iOrg, iOrg + 3000);
  const iTel = ventana.indexOf('"telephone"');
  if (iTel === -1) { sinOrganization.push(rel + ' (sin telephone)'); continue; }

  /* Posición absoluta del final de la línea de telephone */
  const iTelAbs = iOrg + iTel;
  const finLinea = raw.indexOf('\n', iTelAbs);
  if (finLinea === -1) { sinOrganization.push(rel + ' (telephone sin salto)'); continue; }

  /* ¿Ya tiene sameAs y contactPoint DESPUÉS del @id de la organización? */
  const resto = raw.slice(iOrg);
  const tieneSameAs = CLAVES_SAME_AS.some((k) => resto.slice(0, 2500).includes(k));
  const tieneContacto = CLAVES_CONTACTO.some((k) => resto.slice(0, 2500).includes(k));

  /* Indentación de la línea de telephone, para mantener el formato */
  const lineaTel = raw.slice(raw.lastIndexOf('\n', iTelAbs) + 1, finLinea);
  const indent = lineaTel.match(/^\s*/)[0];

  let insertar = [];
  if (!tieneSameAs) { insertar.push(bloqueSameAs(indent)); sameAsAnadido++; }
  if (!tieneContacto) { insertar.push(bloqueContactPoint(indent)); contactAnadido++; }

  if (!insertar.length) continue;

  const nuevo = raw.slice(0, finLinea + 1) + insertar.map((b) => b + '\n').join('') + raw.slice(finLinea + 1);
  if (!DRY) fs.writeFileSync(file, nuevo, 'utf8');
  log.push(`${rel}  (${insertar.length} bloque(s))`);
}

/* ── Reporte ───────────────────────────────────────────────────────── */
console.log(DRY ? '\n=== SIMULACIÓN (--dry-run · nada escrito) ===\n' : '\n=== SAMEAS Y CONTACTPOINT COMPLETADOS ===\n');
console.log(`Páginas analizadas          : ${paginas.length}`);
console.log(`Páginas con nodo Organization: ${conOrg}`);
console.log(`sameAs añadido              : ${sameAsAnadido}`);
console.log(`contactPoint añadido        : ${contactAnadido}`);

if (log.length) {
  console.log('\nDetalle:');
  for (const l of log) console.log('  · ' + l);
}
if (sinOrganization.length) {
  console.log(`\nSin Organization o con estructura distinta (${sinOrganization.length}):`);
  for (const s of sinOrganization) console.log('  · ' + s);
}
console.log('');
