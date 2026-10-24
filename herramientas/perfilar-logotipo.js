#!/usr/bin/env node
/* KONFÍO ZINC · herramientas/perfilar-logotipo.js
   Perfil por columnas y filas del contenido del logotipo: sirve para separar
   la marca (la K) del texto y recortar sin cortar nada. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);

const nombre = process.argv[2] || 'logo.jpeg';

(async () => {
  const buf = fs.readFileSync(path.join(RAIZ, nombre));
  const mime = /\.png$/i.test(nombre) ? 'image/png' : 'image/jpeg';
  const nav = await chromium.launch({ headless: true });
  const pag = await nav.newPage();
  await pag.setContent('<canvas id=c></canvas>');
  const r = await pag.evaluate(async ({ data, mime }) => {
    const img = new Image(); img.src = 'data:' + mime + ';base64,' + data; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const bg = [d[0], d[1], d[2]];
    const umbral = 40;
    const esContenido = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > umbral;

    const colProf = new Array(W).fill(0);
    const filProf = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (esContenido(i)) { colProf[x]++; filProf[y]++; }
    }

    /* Tramos de columnas con contenido (huecos de >= 2 % del ancho separan bloques). */
    const minCol = Math.round(H * 0.01);
    const tramos = [];
    let dentro = false, ini = 0;
    for (let x = 0; x < W; x++) {
      if (colProf[x] > minCol && !dentro) { dentro = true; ini = x; }
      else if (colProf[x] <= minCol && dentro) { dentro = false; tramos.push([ini, x - 1]); }
    }
    if (dentro) tramos.push([ini, W - 1]);
    const tramosFiltrados = tramos.filter(([a, b]) => b - a > W * 0.005);

    return { W, H, bg: '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(), tramos: tramosFiltrados, colProf, filProf };
  }, { data: buf.toString('base64'), mime });

  console.log(nombre + ' · ' + r.W + 'x' + r.H + ' · fondo ' + r.bg);
  console.log('\nTramos horizontales con contenido (posibles bloques: marca y texto):');
  r.tramos.forEach(([a, b], i) => console.log('  bloque ' + (i + 1) + ': x ' + a + '..' + b + '   ancho ' + (b - a + 1) + ' px'));
  if (r.tramos.length >= 2) {
    const [a1, b1] = r.tramos[0];
    console.log('\nPrimer bloque (candidato a MARCA): x ' + a1 + '..' + b1 + ' -> ' + (b1 - a1 + 1) + ' px de ancho');
    console.log('Hueco hasta el siguiente: ' + (r.tramos[1][0] - b1 - 1) + ' px');
  }
  /* Perfil resumido para leer la forma. */
  const paso = Math.max(1, Math.floor(r.W / 80));
  let linea = '';
  for (let x = 0; x < r.W; x += paso) {
    const v = r.colProf[x];
    const rel = v / r.H;
    linea += rel > 0.30 ? '#' : rel > 0.18 ? '@' : rel > 0.08 ? '+' : rel > 0.01 ? '.' : ' ';
  }
  console.log('\nPerfil de columnas (alto relativo del contenido):');
  console.log('  |' + linea + '|');
  await nav.close();
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
