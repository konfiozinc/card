#!/usr/bin/env node
/* KONFÍO ZINC · herramientas/analizar-colores-logotipo.js
   Colores cromáticos (saturados) de cada logotipo y caja REAL del contenido
   con umbral estricto, para saber qué hay que recortar y con qué armoniza. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);

const archivos = ['logo.jpeg', 'Logotipo neón futurista KONFÍO ZINC.png'];

(async () => {
  const nav = await chromium.launch({ headless: true });
  const pag = await nav.newPage();
  await pag.setContent('<canvas id=c></canvas>');

  for (const nombre of archivos) {
    const buf = fs.readFileSync(path.join(RAIZ, nombre));
    const mime = /\.png$/i.test(nombre) ? 'image/png' : 'image/jpeg';
    const r = await pag.evaluate(async ({ data, mime }) => {
      const img = new Image(); img.src = 'data:' + mime + ';base64,' + data; await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.getElementById('c'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;

      /* Fondo: color de la esquina superior izquierda. */
      const bg = [d[0], d[1], d[2]];

      const crom = new Map();
      let cromPx = 0, claros = 0;
      /* Caja del contenido con umbral alto: lo que NO es fondo. */
      let minX = W, minY = H, maxX = -1, maxY = -1;

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const dist = Math.abs(R - bg[0]) + Math.abs(G - bg[1]) + Math.abs(B - bg[2]);
          if (dist > 60) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat > 0.35 && max > 70) {
            cromPx++;
            const k = ((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3);
            crom.set(k, (crom.get(k) || 0) + 1);
          }
          if (max > 190) claros++;
        }
      }

      const topCrom = [...crom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => {
        const R = ((k >> 10) & 31) * 8, G = ((k >> 5) & 31) * 8, B = (k & 31) * 8;
        return { hex: '#' + [R, G, B].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('').toUpperCase(), n };
      });

      return { W, H, bg: '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(), cromPx, claros, total: W * H, topCrom, caja: { minX, minY, maxX, maxY } };
    }, { data: buf.toString('base64'), mime });

    console.log('\n══════ ' + nombre + ' ══════');
    console.log('  ' + r.W + 'x' + r.H + ' · fondo de esquina ' + r.bg);
    console.log('  píxeles cromáticos (saturados): ' + r.cromPx + ' (' + (100 * r.cromPx / r.total).toFixed(2) + '%)');
    console.log('  píxeles claros (L>190): ' + r.claros + ' (' + (100 * r.claros / r.total).toFixed(2) + '%)');
    console.log('  caja del contenido: x ' + r.caja.minX + '..' + r.caja.maxX + '  y ' + r.caja.minY + '..' + r.caja.maxY);
    console.log('     -> ancho ' + (r.caja.maxX - r.caja.minX + 1) + ' px · alto ' + (r.caja.maxY - r.caja.minY + 1) + ' px');
    console.log('     -> márgenes: izq ' + r.caja.minX + ' · der ' + (r.W - 1 - r.caja.maxX) + ' · sup ' + r.caja.minY + ' · inf ' + (r.H - 1 - r.caja.maxY));
    console.log('  colores cromáticos dominantes:');
    if (r.topCrom.length === 0) console.log('     (ninguno: el logotipo es acromático)');
    r.topCrom.forEach((c) => console.log('     ' + c.hex + '   ' + c.n + ' px'));
  }
  await nav.close();
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
