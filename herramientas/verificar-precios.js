#!/usr/bin/env node
/**
 * verificar-precios.js - blindaje de precios y nomenclatura de KONFIO ZINC
 *
 * FALLA (exit 1) si encuentra paquetes KZ: no existen, se retiraron y cualquier
 * documento que los mencione es una fuente de error.
 * AVISA (exit 0) sobre montos sospechosos y menciones de mensualidades, para
 * revision manual: algunos avisos son legitimos ("Sin mensualidades" es correcto).
 *
 * Uso:  node herramientas/verificar-precios.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const OFICIALES = { Star: 49900, Pro: 99900, Elite: 149900 };
const NIVELES_IA = { Esencial: 250000, Negocio: 420000, Premium: 650000 };

const FALLA = [
  { rx: /KZ\s+(Inicio|Negocio|Profesional|Premium|B[aá]sico)/i, que: 'paquete KZ inexistente' },
  { rx: /\bSTART\b(?=\s*[:$]|\s+\$?\d)/, que: 'plan "START" (se llama Star)' }
];
const AVISA = [
  { rx: /\$\s?(59|69|179|279|299|479)\.900\b/, que: 'monto de un paquete KZ retirado (con $ y separador de miles)' },
  { rx: /mensualidad|pago mensual|tarifa mensual|cobro mensual/i, que: 'posible cobro mensual AL CLIENTE (la agencia no cobra mensualidades)' }
];
const IGNORAR_DIR = ['.git', 'node_modules', 'herramientas/backups', 'herramientas\\backups', '.githooks'];
const IGNORAR_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.pdf', '.zip'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(RAIZ, path.join(dir, e.name));
    if (rel.split(path.sep).includes('node_modules')) continue;
    if (IGNORAR_DIR.some((d) => rel === d || rel.startsWith(d + path.sep))) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), out);
    else if (e.isFile() && !IGNORAR_EXT.includes(path.extname(e.name).toLowerCase())) out.push(path.join(dir, e.name));
  }
  return out;
}

const fallas = [];
const avisos = [];
for (const f of walk(RAIZ)) {
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (txt.includes('\u0000')) continue;
  txt.split(/\r?\n/).forEach((linea, i) => {
    for (const r of FALLA) if (r.rx.test(linea)) fallas.push({ f, n: i + 1, que: r.que, linea: linea.trim().slice(0, 130) });
    for (const r of AVISA) if (r.rx.test(linea)) avisos.push({ f, n: i + 1, que: r.que, linea: linea.trim().slice(0, 130) });
  });
}

const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');
const cop = (n) => '$' + n.toLocaleString('es-CO');
console.log('=== verificar-precios - KONFIO ZINC ===');
console.log('Tarjetas (pago unico, dominio 1er ano incluido): Star ' + cop(OFICIALES.Star) + ' | Pro ' + cop(OFICIALES.Pro) + ' | Elite ' + cop(OFICIALES.Elite));
console.log('Agentes IA: Esencial ' + cop(NIVELES_IA.Esencial) + ' | Negocio ' + cop(NIVELES_IA.Negocio) + ' | Premium ' + cop(NIVELES_IA.Premium));
console.log('');
if (avisos.length) {
  console.log('AVISOS (' + avisos.length + ') - revisar a mano, pueden ser legitimos:');
  for (const a of avisos) console.log('  ~ ' + rel(a.f) + ':' + a.n + '  [' + a.que + ']  ' + a.linea);
  console.log('');
}
if (fallas.length) {
  console.log('FALLAS (' + fallas.length + ') - corregir antes del commit:');
  for (const x of fallas) console.log('  X ' + rel(x.f) + ':' + x.n + '  [' + x.que + ']  ' + x.linea);
  console.log('');
  console.log('RESULTADO: FALLA');
  process.exit(1);
}
console.log('RESULTADO: OK - no hay paquetes KZ ni planes "START"' + (avisos.length ? ' (' + avisos.length + ' avisos por revisar)' : ''));