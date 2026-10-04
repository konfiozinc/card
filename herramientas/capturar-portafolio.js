/**
 * Captura automática de miniaturas del portafolio (KONFÍO ZINC).
 *
 * Genera una captura JPEG local por proyecto en assets/img/portafolio/
 * con aspect ratio 3:4 (viewport 600x800, retina x2 = 1200x1600),
 * reemplazando la dependencia de thum.io.
 *
 * Uso:  cd herramientas && node capturar-portafolio.js
 * Requiere: npm install playwright && npx playwright install chromium
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://konfiozinc.github.io';

// 27 proyectos: los 20 del grid + los 7 faltantes (slug = URL del sitio)
const proyectos = [
  // — Grid actual (20) —
  'servicios_odontologicos',
  'nutricionista',
  'nutricion_funcional',
  'decoradora_de_fiestas',
  'diseno_grafico',
  'pasteleria_artesanal',
  'cirujana_dentista',
  'eltiti',
  'colsabor',
  'abogados-dta',
  'nandy-nails',
  'np-style',
  'century_21_radial',
  'mega-express',
  'calixto_acordeon_magico',
  'quiromasajes-gap',
  'nbc-company',
  'nutridrink',
  'adopta',
  'proyecto-dta',
  // — Faltantes (7) —
  'samem',
  'deicy-buitrago',
  'make-up',
  'ali',
  'unefibra',
  'konfio-sports',
  'nomina_centinela',
];

const outDir = path.join(__dirname, '..', 'assets', 'img', 'portafolio');
const VIEWPORT = { width: 600, height: 800 };
const SETTLE_MS = Number(process.env.CAPTURE_SETTLE_MS) || 2500;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ok = [];
  const fail = [];

  for (const slug of proyectos) {
    const url = `${BASE}/${slug}/`;
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      // 1) Esperar a que se oculte cualquier splash/loader conocido (evita capturar pantallas de carga)
      await page.waitForSelector(
        '#splash.is-hidden, .splash.is-hidden, .loader.is-hidden, .preloader.is-hidden, .loading-screen.is-hidden, [class*="splash"].is-hidden',
        { timeout: 6000 }
      ).catch(() => {});
      // 2) Esperar a que las fuentes estén listas
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      // 3) Tiempo de asentamiento para imágenes lazy y animaciones de entrada
      await page.waitForTimeout(SETTLE_MS);
      // 4) Asegurar scroll arriba
      await page.evaluate(() => window.scrollTo(0, 0));
      const out = path.join(outDir, `${slug}.jpg`);
      await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
      const size = fs.statSync(out).size;
      console.log(`OK   ${slug.padEnd(26)} ${(size / 1024).toFixed(0)} KB`);
      ok.push(slug);
    } catch (e) {
      const msg = String(e.message || e).split('\n')[0];
      console.log(`FAIL ${slug.padEnd(26)} ${msg}`);
      fail.push(slug);
    } finally {
      await page.close().catch(() => {});
    }
  }

  await browser.close();
  console.log(`\n=== ${ok.length} OK / ${fail.length} FAIL ===`);
  if (fail.length) console.log('Fallaron: ' + fail.join(', '));
})();
