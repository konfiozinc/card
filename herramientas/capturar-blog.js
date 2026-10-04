/**
 * Captura las imágenes del blog (hero 1200x525 y thumb 600x400),
 * reemplazando a thum.io.
 *
 * Uso:  cd herramientas && node capturar-blog.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://konfiozinc.github.io';
const outDir = path.join(__dirname, '..', 'assets', 'img', 'portafolio');

const sitios = ['servicios_odontologicos', 'pasteleria_artesanal', 'diseno_grafico', 'eltiti'];
const HERO = { width: 1200, height: 525 };
const THUMB = { width: 600, height: 400 };

async function capturar(page, slug, viewport, sufijo) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/${slug}/`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForSelector(
    '#splash.is-hidden, .splash.is-hidden, .loader.is-hidden, .preloader.is-hidden, .loading-screen.is-hidden, [class*="splash"].is-hidden',
    { timeout: 6000 }
  ).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  const out = path.join(outDir, `${slug}-${sufijo}.jpg`);
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
  return fs.statSync(out).size;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const slug of sitios) {
    const page = await browser.newPage();
    try {
      const h = await capturar(page, slug, HERO, 'hero');
      const t = await capturar(page, slug, THUMB, 'thumb');
      console.log(`OK   ${slug.padEnd(24)} hero=${(h / 1024).toFixed(0)}KB thumb=${(t / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`FAIL ${slug.padEnd(24)} ${String(e.message || e).split('\n')[0]}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  await browser.close();
})();
