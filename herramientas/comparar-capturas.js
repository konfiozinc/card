#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/comparar-capturas.js

   Compara dos capturas PNG píxel a píxel. Sirve para dos cosas:
     · demostrar que un refactor de CSS NO cambió lo que se ve
     · medir cuánto cambió un rediseño (comparativa antes/después)

   Uso:
     node herramientas/comparar-capturas.js --a antes/x-1440.png --b despues/x-1440.png
     node herramientas/comparar-capturas.js --a a.png --b b.png --max-diferencia 100   (comparativa de rediseño)
   Códigos: 0 dentro del umbral · 1 por encima · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { leerPng, pixelEn, colorDominante, acento } = require('./lib/leer-png');

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const A = argVal('--a', '');
const B = argVal('--b', '');
const MAX = Number(argVal('--max-diferencia', '0.02'));
const TOLERANCIA = Number(argVal('--tolerancia', '3'));

if (!A || !B) { console.error('Uso: --a <png> --b <png> [--max-diferencia 0.02] [--tolerancia 3]'); process.exit(2); }

let a; let b;
try { a = leerPng(A); b = leerPng(B); } catch (e) { console.error('No se pudo leer un PNG:', e.message); process.exit(2); }

const nombre = (p) => p.split(/[\\/]/).pop();
console.log('');
console.log(`  A: ${nombre(A)}  ${a.ancho}×${a.alto}`);
console.log(`  B: ${nombre(B)}  ${b.ancho}×${b.alto}`);

if (a.ancho !== b.ancho || a.alto !== b.alto) {
  console.log(`  [FALLA] dimensiones distintas: ${a.ancho}×${a.alto} vs ${b.ancho}×${b.alto}`);
  process.exit(1);
}

let distintos = 0;
let total = 0;
let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
for (let y = 0; y < a.alto; y++) {
  for (let x = 0; x < a.ancho; x++) {
    const p = pixelEn(a, x, y);
    const q = pixelEn(b, x, y);
    total += 1;
    if (Math.abs(p.r - q.r) > TOLERANCIA || Math.abs(p.g - q.g) > TOLERANCIA || Math.abs(p.b - q.b) > TOLERANCIA) {
      distintos += 1;
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
}

const pct = (distintos / total) * 100;
const domA = colorDominante(a);
const domB = colorDominante(b);
const acA = acento(a);
const acB = acento(b);

console.log(`  píxeles distintos: ${distintos.toLocaleString('es-CO')} de ${total.toLocaleString('es-CO')}  →  ${pct.toFixed(4)} %`);
if (distintos) console.log(`  zona que cambia: x ${x0}–${x1} · y ${y0}–${y1}`);
console.log(`  dominante A ${domA.hex} → B ${domB.hex}   ·   acento A ${acA.hex} → B ${acB.hex}`);
console.log(`  umbral permitido: ${MAX} %`);

const ok = pct <= MAX;
console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${ok ? 'dentro del umbral' : 'por encima del umbral'}`);
console.log('');
process.exit(ok ? 0 : 1);
