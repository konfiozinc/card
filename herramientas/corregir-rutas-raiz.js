#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * corregir-rutas-raiz.js · KONFÍO ZINC
 *
 * Corrección del bug de la migración anterior
 * (herramientas/migracion-servicios.js):
 *
 *   El script anterior calculaba el prefijo de los enlaces de servicio
 *   SOLO a partir de si el archivo estaba en la carpeta `servicios/`,
 *   y en cualquier otro caso usaba `../servicios/`. Eso produjo que en
 *   las páginas de la RAÍZ (index.html, nosotros.html, portafolio.html,
 *   blog.html, contacto.html, gracias.html, 404.html, admin.html y
 *   servicios.html) el submenú del header y la columna "Servicios" del
 *   footer quedaran apuntando a `../servicios/...`, que desde la raíz
 *   resuelve FUERA del sitio (enlace roto).
 *
 *   Correcto:
 *     · Página en la raíz        → servicios/<slug>.html
 *     · Página en servicios/     → <slug>.html
 *     · Página en portafolio/    → ../servicios/<slug>.html
 *     · Página en blog/          → ../servicios/<slug>.html
 *
 * Este script corrige únicamente las páginas de la RAÍZ: reemplaza
 * `../servicios/` por `servicios/` dentro de los atributos href/src.
 * Es idempotente y no toca ninguna otra carpeta.
 *
 * Uso:
 *   node herramientas/corregir-rutas-raiz.js --dry-run
 *   node herramientas/corregir-rutas-raiz.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

/* Solo archivos de la raíz del proyecto (no de subcarpetas) */
const raiz = fs.readdirSync(REPO, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.html') && e.name !== 'index-old.html')
  .map((e) => e.name)
  .sort();

const cambios = [];

for (const nombre of raiz) {
  const file = path.join(REPO, nombre);
  let raw = fs.readFileSync(file, 'utf8');
  const original = raw;

  /* 1. Corregir el prefijo de rutas: ../servicios/ -> servicios/ */
  const antes = (raw.match(/href="\.\.\/servicios\//g) || []).length;
  raw = raw.replace(/(href|src)="\.\.\/servicios\//g, '$1="servicios/');

  /* 2. Corregir también rutas a portafolio y blog si quedaron con ../
        (mismo error de cálculo de prefijo) */
  const antesPort = (raw.match(/(href|src)="\.\.\/(portafolio|blog)\//g) || []).length;
  raw = raw.replace(/(href|src)="\.\.\/(portafolio|blog)\//g, '$1="$2/');

  /* 3. Las páginas raíz no deben usar ../assets/ (resolvería fuera del sitio) */
  const antesAssets = (raw.match(/(href|src)="\.\.\/assets\//g) || []).length;
  raw = raw.replace(/(href|src)="\.\.\/assets\//g, '$1="assets/');

  if (raw !== original) {
    if (!DRY) fs.writeFileSync(file, raw, 'utf8');
    cambios.push({
      archivo: nombre,
      servicios: antes,
      portafolioBlog: antesPort,
      assets: antesAssets
    });
  }
}

console.log(DRY ? '\n=== SIMULACIÓN (--dry-run) ===\n' : '\n=== CORRECCIÓN DE RUTAS EN LA RAÍZ ===\n');
if (!cambios.length) {
  console.log('No había nada que corregir: todas las rutas de la raíz ya son correctas.\n');
} else {
  console.log('Archivo              ../servicios/  ../portafolio|blog/  ../assets/');
  console.log('─'.repeat(72));
  for (const c of cambios) {
    console.log(
      c.archivo.padEnd(20) +
      String(c.servicios).padStart(9) +
      String(c.portafolioBlog).padStart(18) +
      String(c.assets).padStart(12)
    );
  }
  const total = cambios.reduce((s, c) => s + c.servicios + c.portafolioBlog + c.assets, 0);
  console.log('─'.repeat(72));
  console.log(`Total de rutas corregidas: ${total} en ${cambios.length} archivos.\n`);
}
