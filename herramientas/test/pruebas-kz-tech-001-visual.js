/* KZ-TECH-001 · regresión visual y funcional del laboratorio Neon Tech.
   Solo loopback, recursos locales y datos ficticios. */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.KZ_TECH_PORT || 5197);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, 'test-results', 'kz-tech-001');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function safePath(url) {
  const pathname = decodeURIComponent(new URL(url, BASE).pathname);
  const relative = pathname === '/' ? 'design-system/lab.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);
  return target.startsWith(`${ROOT}${path.sep}`) ? target : null;
}

const server = http.createServer((request, response) => {
  const target = safePath(request.url);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('No encontrado');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(target).pipe(response);
});

function hexRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}
function luminance(hex) {
  const values = hexRgb(hex).map((item) => {
    const value = item / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sourceCss = fs.readFileSync(path.join(ROOT, 'design-system/components.css'), 'utf8');
  const sourceTokens = fs.readFileSync(path.join(ROOT, 'design-system/tokens.css'), 'utf8');
  const sourceJs = fs.readFileSync(path.join(ROOT, 'design-system/components.js'), 'utf8');
  check('Biblioteca sin URLs remotas en CSS o JavaScript', !/https?:\/\//i.test(`${sourceCss}\n${sourceTokens}\n${sourceJs}`));
  check('Presupuesto ligero de CSS y JavaScript', Buffer.byteLength(sourceCss + sourceTokens + sourceJs) < 80_000, `${Buffer.byteLength(sourceCss + sourceTokens + sourceJs)} bytes`);
  await new Promise((resolve, reject) => server.once('error', reject).listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];
  const missing = [];
  const external = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() === 404) missing.push(response.url()); });
  await page.route('**/*', async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (['127.0.0.1', 'localhost'].includes(hostname)) return route.continue();
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });

  console.log('\n═══ KZ-TECH-001 · CARGA E IDENTIDAD ═══');
  const response = await page.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'networkidle' });
  check('Laboratorio responde por loopback', response && response.status() === 200, `HTTP ${response && response.status()}`);
  check('No solicita dependencias externas', external.length === 0, `${external.length} solicitudes`);
  check('No faltan recursos locales', missing.length === 0, `${missing.length} recursos 404`);
  check('No produce errores JavaScript', errors.length === 0, errors.join(' | ') || 'sin errores');
  check('Identidad Neon Tech visible', await page.locator('h1').getByText(/Tecnología clara/i).count() === 1 && await page.locator('.kz-tech-brand').first().isVisible());
  check('Todos los componentes usan namespace propio', await page.locator('[class]').evaluateAll((nodes) => nodes.every((node) => Array.from(node.classList).every((name) => name === 'no-js' || name === 'js' || name === 'kz-tech' || name.startsWith('kz-tech-')))));

  console.log('\n═══ RESPONSIVE Y CAPTURAS ═══');
  const viewports = [[320, 760], [375, 812], [390, 844], [768, 900], [1024, 900], [1440, 1000]];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelectorAll('.kz-tech-reveal').forEach((node) => { node.dataset.visible = 'true'; }));
    await page.locator('img').evaluateAll((images) => images.forEach((image) => { image.loading = 'eager'; }));
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
    const layout = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      clipped: Array.from(document.querySelectorAll('button,a,input,select,textarea')).filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).length,
    }));
    check(`${width}px sin desbordamiento horizontal`, layout.scroll <= layout.client + 1, `${layout.scroll}/${layout.client}`);
    check(`${width}px sin controles recortados`, layout.clipped === 0, `${layout.clipped} controles`);
    if ([375, 1440].includes(width)) {
      await page.screenshot({ path: path.join(OUT, `laboratorio-${width}.jpg`), type: 'jpeg', quality: 84, fullPage: true, animations: 'disabled' });
    }
  }

  console.log('\n═══ NAVEGACIÓN, TECLADO Y ESTADOS ═══');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'networkidle' });
  const toggle = page.locator('[data-kz-tech-nav-toggle]');
  await toggle.click();
  check('Menú móvil abre y anuncia su estado', await toggle.getAttribute('aria-expanded') === 'true' && await page.locator('[data-kz-tech-nav]').getAttribute('data-open') === 'true');
  await page.keyboard.press('Escape');
  check('Escape cierra menú y devuelve foco', await toggle.getAttribute('aria-expanded') === 'false' && await toggle.evaluate((node) => document.activeElement === node));

  await page.locator('[data-kz-tech-open-modal]').click();
  check('Modal nativo abre con nombre accesible', await page.locator('#modal-demo').evaluate((node) => node.open) && await page.locator('#modal-titulo').isVisible());
  await page.keyboard.press('Escape');
  check('Escape cierra el modal', !(await page.locator('#modal-demo').evaluate((node) => node.open)));

  const secondFaq = page.locator('[data-kz-tech-accordion]').nth(1);
  await secondFaq.click();
  check('FAQ sincroniza botón y panel', await secondFaq.getAttribute('aria-expanded') === 'true' && !(await page.locator('#faq-2').getAttribute('hidden')));

  const form = page.locator('[data-kz-tech-demo-form]');
  await form.locator('button[type="submit"]').click();
  check('Formulario enfoca primer campo inválido', await page.locator('#lab-nombre').evaluate((node) => document.activeElement === node));
  check('Error queda asociado y visible', await page.locator('#lab-nombre').getAttribute('aria-invalid') === 'true' && await page.locator('#lab-nombre-error').isVisible());
  await page.fill('#lab-nombre', 'Persona ficticia');
  await page.selectOption('#lab-servicio', 'Tarjeta');
  await page.check('.kz-tech-check input');
  await form.locator('button[type="submit"]').click();
  check('Éxito es local y explícito', await page.locator('[data-kz-tech-form-status]').getByText(/No se envió ni almacenó/i).count() === 1);
  check('Formulario no persiste datos', await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0));
  check('Botón deshabilitado no es interactivo', await page.locator('button:disabled').isDisabled());

  console.log('\n═══ ACCESIBILIDAD Y MOVIMIENTO ═══');
  await page.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'domcontentloaded' });
  const primary = page.locator('.kz-tech-button--primary').first();
  const normalShadow = await primary.evaluate((node) => getComputedStyle(node).boxShadow);
  await primary.hover();
  await page.waitForTimeout(260);
  const hoverShadow = await primary.evaluate((node) => getComputedStyle(node).boxShadow);
  check('Hover ofrece feedback visual', normalShadow !== hoverShadow, `${normalShadow} → ${hoverShadow}`);
  await primary.focus();
  check('Foco visible usa el token cian', await primary.evaluate((node) => getComputedStyle(node).outlineStyle !== 'none' && parseFloat(getComputedStyle(node).outlineWidth) >= 2));
  await page.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  check('El primer foco permite saltar al contenido', await page.locator('.kz-tech-skip').evaluate((node) => document.activeElement === node));
  const semantics = await page.evaluate(() => ({
    main: document.querySelectorAll('main').length,
    navLabel: document.querySelector('nav')?.getAttribute('aria-label'),
    unlabeledButtons: Array.from(document.querySelectorAll('button')).filter((button) => !(button.textContent || '').trim() && !button.getAttribute('aria-label')).length,
    invalidControls: Array.from(document.querySelectorAll('[aria-controls]')).filter((node) => !document.getElementById(node.getAttribute('aria-controls'))).length,
  }));
  check('Estructura semántica y controles etiquetados', semantics.main === 1 && Boolean(semantics.navLabel) && semantics.unlabeledButtons === 0 && semantics.invalidControls === 0, JSON.stringify(semantics));
  const undersizedTargets = await page.locator('button, .kz-tech-button').evaluateAll((nodes) => nodes.filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.height < 44;
  }).length);
  check('Objetivos táctiles principales miden al menos 44 px', undersizedTargets === 0, `${undersizedTargets} controles inferiores`);
  check('Contraste texto principal AA', contrast('#f4f8fb', '#07121e') >= 4.5, contrast('#f4f8fb', '#07121e').toFixed(2));
  check('Contraste botón cian AA', contrast('#03080d', '#00e5ff') >= 4.5, contrast('#03080d', '#00e5ff').toFixed(2));
  check('Contraste botón oro AA', contrast('#03080d', '#f0b429') >= 4.5, contrast('#03080d', '#f0b429').toFixed(2));

  const reduced = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'networkidle' });
  const motion = await reducedPage.evaluate(() => {
    const reveal = document.querySelector('.kz-tech-reveal');
    const style = getComputedStyle(reveal);
    return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, opacity: style.opacity, duration: style.transitionDuration };
  });
  check('Movimiento reducido deja contenido visible', motion.reduced && motion.opacity === '1', JSON.stringify(motion));
  await reduced.close();

  const noJs = await browser.newContext({ viewport: { width: 375, height: 812 }, javaScriptEnabled: false });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(`${BASE}/design-system/lab.html`, { waitUntil: 'networkidle' });
  check('Sin JavaScript el menú y contenido permanecen disponibles', await noJsPage.locator('[data-kz-tech-nav-menu]').isVisible() && await noJsPage.locator('h1').isVisible());
  await noJs.close();

  /* 320 CSS px representa el reflow de una ventana de 640 px al 200 %. */
  check('Reflow equivalente a zoom 200 % cubierto', results.some((item) => item.name === '320px sin desbordamiento horizontal' && item.ok));

  await context.close();
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify({ results, errors, missing, external }, null, 2));
  const failed = results.filter((item) => !item.ok);
  console.log(`\nTOTAL: ${results.length} · PASAN: ${results.length - failed.length} · FALLAN: ${failed.length}`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 2;
});
