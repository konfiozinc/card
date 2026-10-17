#!/usr/bin/env node
/**
 * verificar-precios.js - blindaje de precios y nomenclatura de KONFIO ZINC
 *
 * FALLA (exit 1) - hay que corregir antes del commit:
 *   1. Paquetes KZ (no existen)
 *   2. Plan "START" (se llama Star)
 *   3. "todo en uno" (etiqueta retirada de los paquetes KZ)
 *   4. Cobros mensuales al cliente (tarifa/pago/cobro mensual, mensualidad)
 *
 * AVISA (exit 0) - montos de paquetes retirados, para revision manual.
 *
 * Uso:  node herramientas/verificar-precios.js [--quiet]
 *       --quiet  solo muestra las FALLAS (lo usa el hook de pre-commit)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const QUIETO = process.argv.includes('--quiet');
const RAIZ = path.resolve(__dirname, '..');
const ESTE = 'herramientas/verificar-precios.js';

const FALLA = [
  { rx: /KZ\s+(Inicio|Negocio|Profesional|Premium|B[aá]sico)/i, que: 'paquete KZ inexistente' },
  { rx: /\bSTART\b(?=\s*[:$]|\s+\$?\d)/, que: 'plan "START" (el producto es Mini Web Basica/Pro)' },
  { rx: /\btodo en uno\b/i, que: '"todo en uno": etiqueta de los paquetes KZ, retirada' },
  { rx: /(tarifa|pago|cobro|cuota)\s+mensual/i, que: 'cobro mensual al cliente (la agencia no cobra mensualidades)' },
  { rx: /\bmensualidad(?:es)?\b/i, que: 'mensualidad (la agencia no cobra mensualidades)', negable: true }
];
const AVISA = [
  { rx: /\$\s?(59|69|179|279|299|479)\.900\b/, que: 'monto de un paquete KZ retirado (con $ y separador de miles)' },
  /* 17-oct-2026: el producto principal paso de "Tarjeta Star/Pro/Elite" a "Mini Web Basica/Pro".
     Mientras dure la migracion del sitio esto AVISA; cuando el sitio quede migrado, moverlo a FALLA. */
  { rx: /\bStar\b|\bElite\b|149\.900/, que: 'nombre o precio RETIRADO (Star / Elite / $149.900): ahora es Mini Web Basica y Pro' }
];
const IGNORAR_DIR = ['.git', 'node_modules', 'herramientas/backups', '.githooks'];
const IGNORAR_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.pdf', '.zip'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(RAIZ, path.join(dir, e.name)).replace(/\\/g, '/');
    if (rel.split('/').includes('node_modules')) continue;
    if (IGNORAR_DIR.some((d) => rel === d || rel.startsWith(d + '/'))) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), out);
    else if (e.isFile() && !IGNORAR_EXT.includes(path.extname(e.name).toLowerCase())) out.push(path.join(dir, e.name));
  }
  return out;
}

/* "Sin mensualidades" y "no hay cobros mensuales" son la politica correcta:
   no deben contar como falla. */
function esNegado(linea, m) {
  const pre = linea.slice(Math.max(0, m.index - 45), m.index);
  return /(sin|no|ni|nunca|jam[aá]s)[\s\w]{0,25}$/i.test(pre);
}

const fallas = [];
const avisos = [];
for (const f of walk(RAIZ)) {
  const rel = path.relative(RAIZ, f).replace(/\\/g, '/');
  if (rel === ESTE) continue;
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (txt.includes('\u0000')) continue;
  txt.split(/\r?\n/).forEach((linea, i) => {
    if (linea.includes('verificar-precios:ok')) return;
    for (const r of FALLA) {
      const m = r.rx.exec(linea);
      if (m && !(r.negable && esNegado(linea, m))) fallas.push({ rel, n: i + 1, que: r.que, linea: linea.trim().slice(0, 130) });
    }
    for (const r of AVISA) if (r.rx.test(linea)) avisos.push({ rel, n: i + 1, que: r.que, linea: linea.trim().slice(0, 130) });
  });
}

const cop = (n) => '$' + n.toLocaleString('es-CO');
if (!QUIETO) {
  console.log('=== verificar-precios - KONFIO ZINC ===');
  console.log('Mini Webs (pago unico, dominio 1er ano incluido): Basica ' + cop(49900) + ' | Pro ' + cop(99900));
  console.log('Agentes IA: Esencial ' + cop(250000) + ' | Negocio ' + cop(420000) + ' | Premium ' + cop(650000) + ' (pago unico, sin cobros mensuales ni anuales)');
  console.log('');
  if (avisos.length) {
    console.log('AVISOS (' + avisos.length + ') - revisar a mano, pueden ser legitimos:');
    avisos.slice(0, 20).forEach((a) => console.log('  ~ ' + a.rel + ':' + a.n + '  [' + a.que + ']  ' + a.linea));
    if (avisos.length > 20) console.log('  ... y ' + (avisos.length - 20) + ' mas (migracion de nombres Mini Web en curso)');
    console.log('');
  }
}
if (fallas.length) {
  console.log('FALLAS (' + fallas.length + ') - corregir antes del commit:');
  for (const x of fallas) console.log('  X ' + x.rel + ':' + x.n + '  [' + x.que + ']  ' + x.linea);
  console.log('');
  console.log('RESULTADO: FALLA');
  process.exit(1);
}
if (!QUIETO) console.log('RESULTADO: OK - sin paquetes KZ, sin planes "START", sin "todo en uno", sin cobros mensuales' + (avisos.length ? ' (' + avisos.length + ' avisos por revisar)' : ''));