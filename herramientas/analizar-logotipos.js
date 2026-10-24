#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/analizar-logotipos.js

   Inspección programática de los logotipos entregados por el propietario.
   Como el agente no puede ver imágenes, aquí se caracterizan con datos:
   dimensiones, transparencia real, colores dominantes, caja del contenido
   y un mapa de luminancia para leer la composición.

   Uso: node herramientas/analizar-logotipos.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);

/* Candidatos en la raíz del proyecto. */
const archivos = fs.readdirSync(RAIZ, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name))
  .map((e) => e.name);

console.log('=== CANDIDATOS EN LA RAÍZ ===');
archivos.forEach((a, i) => console.log('  ' + (i + 1) + '. ' + a + '  (' + Math.round(fs.statSync(path.join(RAIZ, a)).size / 1024) + ' KB)'));

(async () => {
  const nav = await chromium.launch({ headless: true });
  const pag = await nav.newPage({ viewport: { width: 400, height: 300 } });
  await pag.setContent('<canvas id=c></canvas>');

  for (const nombre of archivos) {
    const buf = fs.readFileSync(path.join(RAIZ, nombre));
    const mime = /\.png$/i.test(nombre) ? 'image/png' : 'image/jpeg';
    const b64 = buf.toString('base64');

    const r = await pag.evaluate(async ({ data, mime }) => {
      const img = new Image();
      img.src = 'data:' + mime + ';base64,' + data;
      await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.getElementById('c');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;

      let transparentes = 0, semitransparentes = 0, opacos = 0;
      let minX = W, minY = H, maxX = -1, maxY = -1;
      const col = new Map();

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const A = d[i + 3];
          if (A < 10) { transparentes++; continue; }
          if (A < 240) semitransparentes++;
          opacos++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          /* Color cuantizado a 4 bits por canal, ignorando los casi transparentes. */
          if (A > 60) {
            const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
            col.set(k, (col.get(k) || 0) + 1);
          }
        }
      }

      const total = W * H;
      const top = [...col.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => {
        const R = ((k >> 8) & 15) * 17, G = ((k >> 4) & 15) * 17, B = (k & 15) * 17;
        return { hex: ('#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()), pct: +(100 * n / Math.max(1, opacos)).toFixed(1) };
      });

      /* Mapa de luminancia con transparencia visible. */
      const COLS = 78, ROWS = 26;
      const lineas = [];
      for (let ry = 0; ry < ROWS; ry++) {
        let linea = '';
        for (let rx = 0; rx < COLS; rx++) {
          let maxL = 0, alfa = 0, n = 0;
          const x0 = Math.floor(rx * W / COLS), x1 = Math.floor((rx + 1) * W / COLS);
          const y0 = Math.floor(ry * H / ROWS), y1 = Math.floor((ry + 1) * H / ROWS);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            if (L > maxL) maxL = L;
            alfa += d[i + 3]; n++;
          }
          alfa = alfa / Math.max(1, n);
          linea += alfa < 10 ? ' ' : (maxL > 200 ? '#' : maxL > 150 ? '@' : maxL > 100 ? '*' : maxL > 60 ? '+' : maxL > 30 ? '.' : '_');
        }
        lineas.push(linea);
      }

      return { W, H, transparentes, semitransparentes, opacos, total, minX, minY, maxX, maxY, top, lineas };
    }, { data: b64, mime });

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  ' + nombre);
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  dimensiones   : ' + r.W + ' x ' + r.H + '  (relación ' + (r.W / r.H).toFixed(3) + ')');
    console.log('  transparencia : opacos ' + (100 * r.opacos / r.total).toFixed(1) + '% · semitransparentes ' + (100 * r.semitransparentes / r.total).toFixed(1) + '% · transparentes ' + (100 * r.transparentes / r.total).toFixed(1) + '%');
    console.log('  tiene alfa    : ' + (r.transparentes > 0 ? 'SÍ (' + r.transparentes + ' px)' : 'NO · fondo sólido'));
    if (r.opacos > 0) {
      console.log('  contenido     : x ' + r.minX + '..' + r.maxX + '  y ' + r.minY + '..' + r.maxY);
      console.log('  márgenes      : izq ' + r.minX + ' · der ' + (r.W - 1 - r.maxX) + ' · sup ' + r.minY + ' · inf ' + (r.H - 1 - r.maxY));
    }
    console.log('  colores dominantes:');
    r.top.forEach((t) => console.log('     ' + t.hex + '   ' + t.pct + '%'));
    console.log('  mapa de luminancia:');
    r.lineas.forEach((l, i) => console.log('  ' + String(i).padStart(2, '0') + '|' + l + '|'));
  }

  await nav.close();
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
