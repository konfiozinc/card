/**
 * Captura las imágenes de DETALLE de los casos (formato apaisado 900x700)
 * usadas en las subpáginas servicios/* y portafolio/*, reemplazando a thum.io.
 *
 * Uso:  cd herramientas && node capturar-detalles.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://konfiozinc.github.io';
const outDir = path.join(__dirname, '..', 'assets', 'img', 'portafolio');
const VIEWPORT = { width: 900, height: 700 };

// Sitios referenciados en las subpáginas (casos destacados 900x700)
const sitios = [
  'unefibra', 'card', 'proyecto-dta', 'eltiti', 'np-style',
  'servicios_odontologicos', 'abogados-dta', 'konfio-sports', 'adopta',
  'colsabor', 'nutricionista', 'cirujana_dentista', 'nandy-nails',
  'make-up', 'lizeth_lozano'
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ok = [], fail = [];

  for (const slug of sitios) {
    const url = slug === 'card' ? `${BASE}/card/` : `${BASE}/${slug}/`;
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForSelector(
        '#splash.is-hidden, .splash.is-hidden, .loader.is-hidden, .preloader.is-hidden, .loading-screen.is-hidden, [class*="splash"].is-hidden',
        { timeout: 6000 }
      ).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.scrollTo(0, 0));
      const out = path.join(outDir, `${slug}-detalle.jpg`);
      await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
      console.log(`OK   ${slug.padEnd(24)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
      ok.push(slug);
    } catch (e) {
      console.log(`FAIL ${slug.padEnd(24)} ${String(e.message || e).split('\n')[0]}`);
      fail.push(slug);
    } finally {
      await page.close().catch(() => {});
    }
  }
  await browser.close();
  console.log(`\n=== ${ok.length} OK / ${fail.length} FAIL ===`);
  if (fail.length) console.log('Fallaron: ' + fail.join(', '));
})();
