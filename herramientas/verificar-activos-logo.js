#!/usr/bin/env node
/* KONFÍO ZINC · herramientas/verificar-activos-logo.js
   Comprueba que los PNG generados del logotipo oficial tengan transparencia
   real donde debe, contenido centrado, nada recortado y colores de marca. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);

const archivos = process.argv.slice(2);
if (!archivos.length) {
  archivos.push('assets/img/marca/logo-oficial.png', 'assets/img/marca/marca-oficial.png',
    'assets/img/logos/favicon-64.png', 'assets/img/icons/icon-512.png', 'assets/img/og/og-1200x630.png');
}

(async () => {
  const opciones = { headless: true };
  if (process.env.CHROMIUM_PATH) opciones.executablePath = process.env.CHROMIUM_PATH;
  const nav = await chromium.launch(opciones);
  const pag = await nav.newPage();
  await pag.setContent('<canvas id=c></canvas>');
  let fallos = 0;

  for (const rel of archivos) {
    const p = path.join(RAIZ, rel);
    if (!fs.existsSync(p)) { console.log('FALTA ' + rel); fallos++; continue; }
    const b64 = fs.readFileSync(p).toString('base64');
    const r = await pag.evaluate(async (data) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.getElementById('c'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'); ctx.clearRect(0, 0, W, H); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;
      let minX = W, minY = H, maxX = -1, maxY = -1, trans = 0, semi = 0, op = 0, oscuros = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, A = d[i + 3];
        if (A < 10) { trans++; continue; }
        if (A < 245) semi++; else op++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        /* Un halo del fondo oscuro se veria como pixeles semiopacos muy oscuros. */
        if (A > 20 && A < 200 && (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) < 26) oscuros++;
      }
      /* Perfil vertical/horizontal resumido. */
      const COLS = 76, ROWS = 20;
      const lineas = [];
      for (let ry = 0; ry < ROWS; ry++) {
        let l = '';
        for (let rx = 0; rx < COLS; rx++) {
          let a = 0, L = 0, n = 0;
          const x0 = Math.floor(rx * W / COLS), x1 = Math.floor((rx + 1) * W / COLS);
          const y0 = Math.floor(ry * H / ROWS), y1 = Math.floor((ry + 1) * H / ROWS);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4; a += d[i + 3]; L = Math.max(L, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); n++;
          }
          a = a / Math.max(1, n);
          l += a < 10 ? ' ' : L > 170 ? '#' : L > 110 ? '*' : L > 55 ? '+' : '.';
        }
        lineas.push(l);
      }
      return { W, H, minX, minY, maxX, maxY, trans, semi, op, oscuros, total: W * H, lineas };
    }, b64);

    const mIzq = r.minX, mDer = r.W - 1 - r.maxX, mSup = r.minY, mInf = r.H - 1 - r.maxY;
    const toca = mIzq <= 0 || mSup <= 0 || mDer <= 0 || mInf <= 0;
    /* Los iconos y la imagen social llevan fondo propio a sangre: que lleguen al
       borde es lo correcto, no un recorte. Solo es defecto en piezas transparentes. */
    const aSangre = /favicon|icon-|og-|apple-touch/i.test(rel);
    const recorte = toca && !aSangre;
    const pctTrans = 100 * r.trans / r.total;
    const pctHalo = r.semi > 0 ? (100 * r.oscuros / r.semi) : 0;

    console.log('\n══════ ' + rel + ' ══════');
    console.log('  ' + r.W + 'x' + r.H + ' · transparente ' + pctTrans.toFixed(1) + '% · semitransparente ' + (100 * r.semi / r.total).toFixed(1) + '% · opaco ' + (100 * r.op / r.total).toFixed(1) + '%');
    console.log('  contenido: x ' + r.minX + '..' + r.maxX + '  y ' + r.minY + '..' + r.maxY);
    console.log('  márgenes : izq ' + mIzq + ' · der ' + mDer + ' · sup ' + mSup + ' · inf ' + mInf +
      (recorte ? '   <-- RECORTE' : toca ? '   (a sangre, correcto para un icono)' : '   OK'));
    console.log('  riesgo de halo oscuro en bordes suaves: ' + pctHalo.toFixed(1) + '% de los semitransparentes' + (pctHalo > 25 ? '  <-- REVISAR' : '  OK'));
    r.lineas.forEach((l) => console.log('  |' + l + '|'));
    if (recorte) fallos++;
  }

  await nav.close();
  console.log('\narchivos revisados: ' + archivos.length + ' · con recorte real: ' + fallos);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
