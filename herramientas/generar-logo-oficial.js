#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/generar-logo-oficial.js

   KZ-ID-001 · Activos derivados del LOGOTIPO OFICIAL entregado por el
   propietario (logo.jpeg, 1600x678).

   QUÉ HACE
     No redibuja nada. Recorta el archivo original, le quita el fondo oscuro
     por luminancia (con desmultiplicación para no dejar halos) y exporta las
     variantes que el sitio necesita:
       · lockup horizontal transparente (escritorio, pie, social)
       · marca cuadrada transparente (iconos)
       · favicon 32 / 64, apple-touch 180
       · PWA 192 / 512 y maskables
       · Open Graph 1200x630 compuesto sobre la identidad Neon Tech

   POR QUÉ SE QUITA EL FONDO
     El original trae fondo sólido #010715. El sitio tiene #050B14: pegarlo
     tal cual deja un rectángulo visible. Se separa el fondo conservando los
     colores originales del logotipo.

   Uso: node herramientas/generar-logo-oficial.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);

const ORIGEN = 'assets/img/marca/fuente/logo.jpeg';
const SALIDA = 'assets/img/marca';
const FONDO_MARCA = '#050B14';   /* --kz-bg */
const CIAN = '#00E5FF';

(async () => {
  const nav = await chromium.launch({ headless: true });
  const pag = await nav.newPage({ viewport: { width: 1400, height: 800 } });
  await pag.setContent('<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&family=Inter:wght@400;600&display=block">' +
    '<style>html,body{margin:0;padding:0;background:transparent}#c{display:block}</style></head><body><div id="c"></div></body></html>',
    { waitUntil: 'networkidle' });
  await pag.evaluate(async () => {
    try { await document.fonts.load('800 54px Orbitron'); } catch {}
    try { await document.fonts.load('400 28px Inter'); } catch {}
    await document.fonts.ready;
  });

  const b64 = fs.readFileSync(path.join(RAIZ, ORIGEN)).toString('base64');

  /* ── 1. Medición y preparación de las dos piezas recortadas ─────── */
  console.log('=== ANÁLISIS DEL ORIGINAL ===');
  const medida = await pag.evaluate(async (data) => {
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + data; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const bg = [d[0], d[1], d[2]];

    const esC = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40;
    const colProf = new Array(W).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (esC((y * W + x) * 4)) colProf[x]++;

    const minCol = Math.round(H * 0.01);
    const tramos = []; let dentro = false, ini = 0;
    for (let x = 0; x < W; x++) {
      if (colProf[x] > minCol && !dentro) { dentro = true; ini = x; }
      else if (colProf[x] <= minCol && dentro) { dentro = false; tramos.push([ini, x - 1]); }
    }
    if (dentro) tramos.push([ini, W - 1]);
    const t = tramos.filter(([a, b]) => b - a > W * 0.005);

    const caja = (x0, x1) => {
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        if (esC(i)) { if (x < minX || minY === H) { if (x < minX) minX = x; } if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    };

    return {
      W, H, bg: '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(),
      tramos: t,
      cajaTotal: caja(0, W - 1),
      cajaMarca: t.length >= 2 ? caja(t[0][0], t[0][1]) : null,
      cajaTexto: t.length >= 2 ? caja(t[1][0], t[1][1]) : null
    };
  }, b64);

  console.log('  original: ' + medida.W + 'x' + medida.H + ' · fondo ' + medida.bg);
  console.log('  bloques detectados: ' + medida.tramos.map(([a, b]) => a + '..' + b).join(' | '));
  console.log('  caja total : ' + JSON.stringify(medida.cajaTotal));
  console.log('  caja marca : ' + JSON.stringify(medida.cajaMarca));
  console.log('  caja texto : ' + JSON.stringify(medida.cajaTexto));

  if (!medida.cajaMarca || !medida.cajaTexto) {
    console.error('  No se pudieron separar marca y texto: abortado sin escribir activos.');
    await nav.close();
    process.exit(2);
  }

  /* Caja del lockup completo con el fondo ya transparente. */
  const cajaLockup = medida.cajaTotal;

  fs.mkdirSync(path.join(RAIZ, SALIDA), { recursive: true });
  const escritos = [];

  /* ── 2. Exportación con fondo transparente ───────────────────────── */
  async function exportar(destino, caja, W, H, margen, opciones = {}) {
    const buffer = await pag.evaluate(async ({ data, caja, W, H, margen, bgHex, maskable }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + data; await img.decode();
      const src = document.createElement('canvas');
      src.width = img.naturalWidth; src.height = img.naturalHeight;
      const sctx = src.getContext('2d'); sctx.drawImage(img, 0, 0);
      const sd = sctx.getImageData(0, 0, src.width, src.height).data;
      const bg = [parseInt(bgHex.slice(1, 3), 16), parseInt(bgHex.slice(3, 5), 16), parseInt(bgHex.slice(5, 7), 16)];

      /* Recorte + limpieza de fondo por luminancia, con desmultiplicacion:
         color_real = (color - fondo * (1 - a)) / a. Asi no quedan halos al
         poner el logotipo sobre otro fondo. */
      const out = document.createElement('canvas');
      out.width = caja.w; out.height = caja.h;
      const octx = out.getContext('2d');
      const od = octx.createImageData(caja.w, caja.h);
      const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];

      for (let y = 0; y < caja.h; y++) {
        for (let x = 0; x < caja.w; x++) {
          const si = ((y + caja.y) * src.width + (x + caja.x)) * 4;
          const R = sd[si], G = sd[si + 1], B = sd[si + 2];
          const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          let a = (lum - bgLum) / (255 - bgLum);
          a = Math.max(0, Math.min(1, a));
          /* Curva suave: quita el ruido del fondo sin comerse el brillo. */
          a = a <= 0.06 ? 0 : Math.min(1, (a - 0.06) / 0.86);
          const di = (y * caja.w + x) * 4;
          if (a <= 0) { od.data[di + 3] = 0; continue; }
          od.data[di] = Math.max(0, Math.min(255, (R - bg[0] * (1 - a)) / a));
          od.data[di + 1] = Math.max(0, Math.min(255, (G - bg[1] * (1 - a)) / a));
          od.data[di + 2] = Math.max(0, Math.min(255, (B - bg[2] * (1 - a)) / a));
          od.data[di + 3] = Math.round(255 * a);
        }
      }
      octx.putImageData(od, 0, 0);

      /* Lienzo final: se encaja la pieza respetando proporcion. */
      const fc = document.createElement('canvas');
      fc.width = W; fc.height = H;
      const fctx = fc.getContext('2d');
      if (maskable) {
        fctx.fillStyle = maskable === true ? '#050B14' : maskable;
        fctx.fillRect(0, 0, W, H);
      }
      const utilW = W * (1 - 2 * margen), utilH = H * (1 - 2 * margen);
      const esc = Math.min(utilW / caja.w, utilH / caja.h);
      const dw = Math.round(caja.w * esc), dh = Math.round(caja.h * esc);
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = 'high';
      fctx.drawImage(out, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
      return fc.toDataURL('image/png');
    }, { data: b64, caja, W, H, margen, bgHex: medida.bg, maskable: opciones.relleno || false });

    const raw = Buffer.from(buffer.split(',')[1], 'base64');
    fs.writeFileSync(path.join(RAIZ, destino), raw);
    escritos.push({ destino, W, H, kb: Math.round(raw.length / 1024) });
    console.log('  ' + destino.padEnd(48) + W + 'x' + H + '  ' + Math.round(raw.length / 1024) + ' KB');
  }

  console.log('\n=== EXPORTANDO ACTIVOS ===');

  /* Lockup completo: cabecera de escritorio y pie. Margen 3 %. */
  await exportar(SALIDA + '/logo-oficial.png', cajaLockup, 1332, 574, 0.03);

  /* Marca sola: iconos cuadrados. Margen 8 % para que respire. */
  await exportar(SALIDA + '/marca-oficial.png', medida.cajaMarca, 1024, 1024, 0.08);

  /* Favicon y apple-touch sobre FONDO DE MARCA (un icono transparente se ve
     distinto en cada navegador; con fondo propio es predecible). */
  await exportar('assets/img/logos/favicon-64.png', medida.cajaMarca, 64, 64, 0.14, { relleno: FONDO_MARCA });
  await exportar('assets/img/logos/favicon-32.png', medida.cajaMarca, 32, 32, 0.14, { relleno: FONDO_MARCA });
  await exportar('assets/img/icons/apple-touch-icon.png', medida.cajaMarca, 180, 180, 0.16, { relleno: FONDO_MARCA });

  /* PWA: 'any' con aire, 'maskable' con el doble de margen (zona segura). */
  await exportar('assets/img/icons/icon-192.png', medida.cajaMarca, 192, 192, 0.16, { relleno: FONDO_MARCA });
  await exportar('assets/img/icons/icon-512.png', medida.cajaMarca, 512, 512, 0.16, { relleno: FONDO_MARCA });
  await exportar('assets/img/icons/icon-maskable-192.png', medida.cajaMarca, 192, 192, 0.26, { relleno: FONDO_MARCA });
  await exportar('assets/img/icons/icon-maskable-512.png', medida.cajaMarca, 512, 512, 0.26, { relleno: FONDO_MARCA });

  /* ── 3. Open Graph 1200x630 con el logotipo oficial ─────────────── */
  console.log('\n=== OPEN GRAPH 1200x630 ===');
  const lockupB64 = fs.readFileSync(path.join(RAIZ, SALIDA, 'logo-oficial.png')).toString('base64');
  await pag.setViewportSize({ width: 1200, height: 630 });
  await pag.evaluate(async ({ lockup, fondo, cian }) => {
    const cont = document.getElementById('c');
    cont.innerHTML = '';
    const lienzo = document.createElement('div');
    lienzo.style.cssText = 'position:relative;width:1200px;height:630px;overflow:hidden;background:' + fondo;
    lienzo.innerHTML =
      '<div style="position:absolute;right:-160px;top:-220px;width:820px;height:820px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.42),transparent 62%)"></div>' +
      '<div style="position:absolute;left:-190px;bottom:-260px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(0,229,255,.30),transparent 62%)"></div>' +
      '<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(0,229,255,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.10) 1px,transparent 1px);background-size:150px 150px"></div>' +
      '<img src="data:image/png;base64,' + lockup + '" style="position:absolute;left:80px;top:150px;width:660px;height:auto" alt="">' +
      '<div style="position:absolute;left:82px;top:400px;width:520px;height:2px;background:linear-gradient(90deg,rgba(0,229,255,.9),rgba(139,92,246,0))"></div>' +
      '<div style="position:absolute;left:82px;top:432px;font-family:Inter,Arial,sans-serif;font-size:31px;color:#fff;opacity:.93">Sitio web corporativo · servicios, portafolio y recursos</div>' +
      '<div style="position:absolute;left:82px;top:486px;font-family:Inter,Arial,sans-serif;font-size:25px;color:#fff;opacity:.66">Mini Webs · Catálogos · Menús QR · Landing pages · Agentes IA</div>' +
      '<div style="position:absolute;left:82px;top:552px;width:300px;height:52px;border-radius:999px;background:' + cian + ';display:flex;align-items:center;justify-content:center;font-family:Orbitron,Arial,sans-serif;font-size:21px;font-weight:800;color:' + fondo + '">konfiozinc.github.io</div>';
    cont.appendChild(lienzo);
  }, { lockup: lockupB64, fondo: FONDO_MARCA, cian: CIAN });
  await pag.waitForTimeout(220);
  const og = await pag.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  fs.writeFileSync(path.join(RAIZ, 'assets/img/og/og-1200x630.png'), og);
  escritos.push({ destino: 'assets/img/og/og-1200x630.png', W: 1200, H: 630, kb: Math.round(og.length / 1024) });
  console.log('  assets/img/og/og-1200x630.png'.padEnd(50) + '1200x630  ' + Math.round(og.length / 1024) + ' KB');

  await nav.close();

  /* ── 4. Verificación de lo escrito ──────────────────────────────── */
  console.log('\n=== VERIFICACIÓN ===');
  let fallos = 0;
  for (const e of escritos) {
    const p = path.join(RAIZ, e.destino);
    if (!fs.existsSync(p)) { console.log('  FALTA ' + e.destino); fallos++; continue; }
    const b = fs.readFileSync(p);
    const okPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (!okPng || w !== e.W || h !== e.H) { console.log('  INVÁLIDO ' + e.destino + ' (' + w + 'x' + h + ')'); fallos++; }
  }
  console.log('  archivos escritos: ' + escritos.length + ' · fallos: ' + fallos);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
