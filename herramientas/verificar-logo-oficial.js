#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-logo-oficial.js

   KZ-ID-001 · Verifica en navegador real (escritorio y móvil) que el
   logotipo oficial esté bien puesto: tamaño, proporcion (sin deformar),
   nitidez del archivo servido, ausencia de recortes y de monogramas viejos.

   Uso: node herramientas/verificar-logo-oficial.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);
const { crearServidor } = require('./lib/servidor-estatico');

const res = [];
const ok = (n, v, d) => { res.push({ n, v: !!v }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(56) + ' ' + (d || '')); };

const PAGINAS = ['index.html', 'servicios.html', 'precios.html', 'portafolio.html', 'blog.html', 'contacto.html', 'aliados.html', 'nosotros.html'];

(async () => {
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5455 });
  const opciones = { headless: true };
  if (process.env.CHROMIUM_PATH) opciones.executablePath = process.env.CHROMIUM_PATH;
  const nav = await chromium.launch(opciones);

  for (const vp of [{ n: 'ESCRITORIO', w: 1440, h: 900 }, { n: 'MÓVIL', w: 375, h: 667 }]) {
    console.log('\n=== LOGOTIPO · ' + vp.n + ' (' + vp.w + 'x' + vp.h + ') ===');
    const ctx = await nav.newContext({ viewport: { width: vp.w, height: vp.h } });
    const pag = await ctx.newPage();
    const errs = [];
    pag.on('pageerror', (e) => errs.push(e.message));

    for (const r of PAGINAS) {
      errs.length = 0;
      await pag.goto(srv.url + '/' + r, { waitUntil: 'networkidle', timeout: 60000 });
      await pag.waitForTimeout(600);

      const m = await pag.evaluate(() => {
        const img = document.querySelector('.brand__logo, .nav-logo-img');
        if (!img) return { falta: true };
        const b = img.getBoundingClientRect();
        const nat = { w: img.naturalWidth, h: img.naturalHeight };
        const cs = getComputedStyle(img);
        const cont = img.closest('a, header, nav');
        const cb = cont ? cont.getBoundingClientRect() : null;
        /* ¿Se sale de su contenedor o del viewport? */
        const seSale = cb ? (b.right > cb.right + 2 || b.left < cb.left - 2) : false;
        return {
          fuente: img.currentSrc || img.src,
          ancho: Math.round(b.width), alto: Math.round(b.height),
          natural: nat.w + 'x' + nat.h,
          ratio: +(b.width / b.height).toFixed(3),
          ratioNatural: +(nat.w / nat.h).toFixed(3),
          visible: b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
          cargada: img.complete && nat.w > 0,
          seSale,
          desbordePagina: document.documentElement.scrollWidth - window.innerWidth,
          monogramaViejo: !!document.querySelector('.nav-logo-svg') || !!document.querySelector('.nav-logo-text'),
          altOk: (img.getAttribute('alt') || '').trim().length > 3
        };
      });

      if (m.falta) { ok(r + ' · logotipo presente', false, 'no encontrado'); continue; }

      const deformado = Math.abs(m.ratio - m.ratioNatural) > 0.02;
      const nitidez = m.natural.split('x')[0] >= m.ancho * 1.5;
      const fallos = [];
      if (!m.visible || !m.cargada) fallos.push('no visible');
      if (deformado) fallos.push('deformado ' + m.ratio + ' vs ' + m.ratioNatural);
      if (m.ancho < 60) fallos.push('demasiado pequeño ' + m.ancho + 'px');
      if (m.seSale) fallos.push('se sale del contenedor');
      if (m.desbordePagina > 2) fallos.push('desborde ' + m.desbordePagina + 'px');
      if (m.monogramaViejo) fallos.push('quedan clases del monograma viejo');
      if (!m.altOk) fallos.push('sin texto alternativo');
      if (errs.length) fallos.push('JS: ' + errs[0].slice(0, 40));

      /* Marca del pie: es otra pieza (cuadrada) del mismo logotipo oficial.
         Se baja hasta ella primero: lleva loading="lazy" y medirla sin
         desplazarse daría "no cargada" aunque el archivo esté perfecto. */
      await pag.evaluate(() => {
        const f = document.querySelector('.footer-logo');
        if (f) f.scrollIntoView({ block: 'center', behavior: 'instant' });
        else window.scrollTo(0, document.body.scrollHeight);
      });
      await pag.waitForFunction(() => {
        const f = document.querySelector('.footer-logo');
        return !f || (f.complete && f.naturalWidth > 0);
      }, null, { timeout: 8000 }).catch(() => {});
      await pag.waitForTimeout(250);

      const f = await pag.evaluate(() => {
        const img = document.querySelector('.footer-logo');
        if (!img) return null;
        const b = img.getBoundingClientRect();
        const nat = { w: img.naturalWidth, h: img.naturalHeight };
        return {
          archivo: (img.currentSrc || img.src || '').split('/').pop(),
          w: Math.round(b.width), h: Math.round(b.height),
          ratio: +(b.width / b.height).toFixed(3), natRatio: +(nat.w / nat.h).toFixed(3),
          cargada: img.complete && nat.w > 0,
          alt: (img.getAttribute('alt') || '').trim()
        };
      });
      if (f) {
        const okPie = f.cargada && Math.abs(f.ratio - f.natRatio) < 0.05 && f.w >= 30 && f.alt.length > 3 && /marca-oficial|logo-oficial/.test(f.archivo);
        ok(r + ' · marca oficial en el pie', okPie, f.archivo + ' · ' + f.w + 'x' + f.h + 'px · ratio ' + f.ratio);
      }

      ok(r + ' · logotipo oficial correcto', fallos.length === 0,
        m.ancho + 'x' + m.alto + 'px · natural ' + m.natural + ' · ratio ' + m.ratio +
        ' · nitidez ' + (nitidez ? 'ok' : 'justa') + (fallos.length ? ' << ' + fallos.join(' ; ') : ''));
    }
    await ctx.close();
  }

  await nav.close();
  await srv.cerrar();

  const fallos = res.filter((x) => !x.v);
  console.log('\n══════════════════════════════════════════════════');
  console.log('LOGOTIPO OFICIAL: ' + res.length + ' · PASAN ' + (res.length - fallos.length) + ' · FALLAN ' + fallos.length);
  console.log('══════════════════════════════════════════════════');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
