#!/usr/bin/env node
/**
 * Extrae y valida los bloques JSON-LD de un archivo HTML, mostrando el
 * contexto exacto del error si alguno es inválido.
 * Uso: node herramientas/revisar-jsonld.js [archivo.html]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const objetivo = process.argv[2];

const archivos = objetivo
  ? [path.resolve(REPO, objetivo)]
  : fs.readdirSync(REPO)
      .filter((f) => f.endsWith('.html'))
      .map((f) => path.join(REPO, f));

let revisados = 0;
let fallos = 0;

for (const file of archivos) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const rel = path.relative(REPO, file).replace(/\\/g, '/');
  let n = 0;

  for (const m of raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    n++;
    revisados++;
    const json = m[1];
    try {
      JSON.parse(json);
    } catch (e) {
      fallos++;
      console.log(`\n❌ ${rel} · bloque ${n}`);
      console.log(`   ${e.message}`);

      /* Localizar la posición del error dentro del bloque y mostrar contexto */
      const posMatch = e.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = Number(posMatch[1]);
        const ini = Math.max(0, pos - 220);
        const fin = Math.min(json.length, pos + 120);
        const frag = json.slice(ini, fin);
        const lineas = frag.split('\n');
        const lineaError = json.slice(0, pos).split('\n').length;
        console.log(`   línea ${lineaError} del bloque (carácter ${pos}):`);
        for (const l of lineas.slice(-9)) console.log('     | ' + l);
        console.log('     ' + ' '.repeat(Math.max(0, (lineas[lineas.length - 1] || '').length - 0)) + '^');
      }
    }
  }
}

console.log(`\nBloques JSON-LD revisados: ${revisados} · válidos: ${revisados - fallos} · inválidos: ${fallos}\n`);
process.exit(fallos ? 1 : 0);
