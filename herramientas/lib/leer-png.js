#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/lib/leer-png.js

   Lector PNG mínimo (sin dependencias) para comprobar los colores realmente
   pintados en una captura. Lo usamos para distinguir "el CSS dice" de "el
   navegador pinta". Soporta 8 bits por canal, color type 2 (RGB) y 6 (RGBA),
   sin entrelazado, que es lo que produce Playwright.

   Uso:
     const { leerPng, pixelEn, colorDominante } = require('./lib/leer-png');
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

function leerPng(rutaArchivo) {
  const buf = fs.readFileSync(rutaArchivo);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG');
  let pos = 8;
  let ancho = 0; let alto = 0; let profundidad = 0; let tipoColor = 0; let entrelazado = 0;
  const trozos = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.toString('ascii', pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0); alto = datos.readUInt32BE(4);
      profundidad = datos[8]; tipoColor = datos[9]; entrelazado = datos[12];
    } else if (tipo === 'IDAT') trozos.push(datos);
    else if (tipo === 'IEND') break;
    pos += 12 + largo;
  }
  if (profundidad !== 8) throw new Error('profundidad no soportada: ' + profundidad);
  if (entrelazado !== 0) throw new Error('PNG entrelazado no soportado');
  const canales = tipoColor === 6 ? 4 : tipoColor === 2 ? 3 : null;
  if (!canales) throw new Error('tipo de color no soportado: ' + tipoColor);

  const crudo = zlib.inflateSync(Buffer.concat(trozos));
  const anchoPx = ancho * canales;
  const pixeles = Buffer.alloc(alto * anchoPx);
  let anterior = Buffer.alloc(anchoPx);
  let off = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[off]; off += 1;
    const linea = Buffer.from(crudo.subarray(off, off + anchoPx)); off += anchoPx;
    for (let x = 0; x < anchoPx; x++) {
      const a = x >= canales ? linea[x - canales] : 0;
      const b = anterior[x];
      const c = x >= canales ? anterior[x - canales] : 0;
      let v = linea[x];
      switch (filtro) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        case 0: break;
        default: throw new Error('filtro PNG desconocido: ' + filtro);
      }
      linea[x] = v & 0xff;
    }
    linea.copy(pixeles, y * anchoPx);
    anterior = linea;
  }
  return { ancho, alto, canales, pixeles };
}

const aHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

function pixelEn(img, x, y) {
  const xi = Math.max(0, Math.min(img.ancho - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(img.alto - 1, Math.round(y)));
  const i = (yi * img.ancho + xi) * img.canales;
  return { r: img.pixeles[i], g: img.pixeles[i + 1], b: img.pixeles[i + 2], a: img.canales === 4 ? img.pixeles[i + 3] : 255 };
}

/** Color más repetido en un rectángulo, cuantizado a 8 niveles por canal. */
function colorDominante(img, { x = 0, y = 0, w = img.ancho, h = img.alto } = {}) {
  const cuenta = new Map();
  const x0 = Math.max(0, Math.round(x)); const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.ancho, Math.round(x + w)); const y1 = Math.min(img.alto, Math.round(y + h));
  for (let yy = y0; yy < y1; yy += 2) {
    for (let xx = x0; xx < x1; xx += 2) {
      const p = pixelEn(img, xx, yy);
      const k = `${p.r >> 3},${p.g >> 3},${p.b >> 3}`;
      const e = cuenta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n += 1; e.r += p.r; e.g += p.g; e.b += p.b;
      cuenta.set(k, e);
    }
  }
  let mejor = null;
  for (const e of cuenta.values()) if (!mejor || e.n > mejor.n) mejor = e;
  if (!mejor) return { hex: '#000000', r: 0, g: 0, b: 0, n: 0 };
  const r = mejor.r / mejor.n; const g = mejor.g / mejor.n; const b = mejor.b / mejor.n;
  return { hex: aHex(r, g, b), r, g, b, n: mejor.n };
}

/**
 * Color de fondo más probable de un texto fotografiado.
 * El dominante a secas falla en titulares grandes, donde los glifos ocupan más
 * superficie que el fondo: ahí el "color más repetido" es el propio texto. Se
 * descarta primero todo lo que se parezca al color del texto y se elige el
 * color más frecuente entre lo que queda.
 */
function fondoDeTexto(img, colorTexto, umbral = 60) {
  const cuenta = new Map();
  let total = 0;
  for (let y = 0; y < img.alto; y += 2) {
    for (let x = 0; x < img.ancho; x += 2) {
      const p = pixelEn(img, x, y);
      const d = Math.sqrt((p.r - colorTexto.r) ** 2 + (p.g - colorTexto.g) ** 2 + (p.b - colorTexto.b) ** 2);
      total += 1;
      if (d < umbral) continue;                       // es glifo o su antialias
      const k = `${p.r >> 3},${p.g >> 3},${p.b >> 3}`;
      const e = cuenta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n += 1; e.r += p.r; e.g += p.g; e.b += p.b;
      cuenta.set(k, e);
    }
  }
  let mejor = null;
  for (const e of cuenta.values()) if (!mejor || e.n > mejor.n) mejor = e;
  if (!mejor || mejor.n < total * 0.02) return null;
  const r = mejor.r / mejor.n; const g = mejor.g / mejor.n; const b = mejor.b / mejor.n;
  return { hex: aHex(r, g, b), r, g, b, n: mejor.n };
}

/** Máximo canal saturado del rectángulo: sirve para detectar un acento cromático. */function acento(img, { x = 0, y = 0, w = img.ancho, h = img.alto } = {}) {
  let mejor = { hex: '#000000', r: 0, g: 0, b: 0, sat: -1 };
  const x0 = Math.max(0, Math.round(x)); const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.ancho, Math.round(x + w)); const y1 = Math.min(img.alto, Math.round(y + h));
  for (let yy = y0; yy < y1; yy += 2) {
    for (let xx = x0; xx < x1; xx += 2) {
      const p = pixelEn(img, xx, yy);
      const max = Math.max(p.r, p.g, p.b); const min = Math.min(p.r, p.g, p.b);
      const sat = max - min;
      const brillo = (p.r + p.g + p.b) / 3;
      if (sat > mejor.sat && brillo > 60) mejor = { hex: aHex(p.r, p.g, p.b), r: p.r, g: p.g, b: p.b, sat };
    }
  }
  return mejor;
}

module.exports = { leerPng, pixelEn, colorDominante, fondoDeTexto, acento, aHex };
