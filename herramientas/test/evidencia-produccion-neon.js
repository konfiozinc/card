'use strict';
/* KZ-DESIGN-001 · Evidencia de PRODUCCION: liveness de /leads (sin escribir datos)
   y capturas de escritorio y movil del sitio publicado. */
const fs = require('fs');
const path = require('path');
const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);

const BASE = 'https://konfiozinc.github.io/card';
const WORKER = 'https://calm-heart-6828.konfiozinc.workers.dev';
const SALIDA = 'C:\\KZ-EVIDENCIA\\produccion-neon';
const PAGINAS = [
  ['index.html', 'portada'],
  ['servicios.html', 'servicios'],
  ['precios.html', 'precios'],
  ['portafolio.html', 'portafolio'],
  ['blog.html', 'blog'],
  ['contacto.html', 'contacto']
];
const ANCHOS = [{ w: 1440, h: 900, n: 'escritorio' }, { w: 375, h: 667, n: 'movil' }];

const res = [];
const ok = (n, v, d) => { res.push({ n, v: !!v }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(56) + ' ' + (d || '')); };

(async () => {
  console.log('\n=== LIVENESS DE /leads (sin POST: no se crean datos) ===');
  for (const metodo of ['GET', 'OPTIONS']) {
    try {
      const r = await fetch(WORKER + '/leads', { method: metodo, headers: { 'User-Agent': 'kz-verify' } });
      /* 405 o 400 = el endpoint existe y rechaza el metodo; 5xx seria un fallo real. */
      ok('/leads responde a ' + metodo + ' (existe, sin escribir)', r.status < 500, 'HTTP ' + r.status);
    } catch (e) { ok('/leads responde a ' + metodo, false, e.message); }
  }
  /* La pagina publica debe apuntar al endpoint correcto. */
  const contacto = await (await fetch(BASE + '/contacto.html?v=' + Date.now())).text();
  const mainJs = await (await fetch(BASE + '/assets/js/main.js?v=' + Date.now())).text();
  ok('La web publica apunta al Worker /leads', /calm-heart-6828/.test(mainJs) && /\/leads/.test(mainJs), 'main.js servido');
  /* Se mira el ATRIBUTO del formulario, no la prosa: contacto.html menciona
     "Formspree" en un comentario que precisamente explica que nunca existio. */
  const actionExterno = (contacto.match(/<form[^>]*\baction\s*=\s*["']([^"']+)["']/gi) || [])
    .filter((a) => /^action\s*=\s*["']https?:/i.test(a))
    .filter((a) => !/calm-heart-6828/i.test(a));
  ok('contacto.html no envia a un endpoint de terceros', actionExterno.length === 0,
    actionExterno.length ? actionExterno.join(',') : 'sin action externa');

  console.log('\n=== CAPTURAS DE PRODUCCION ===');
  fs.mkdirSync(SALIDA, { recursive: true });
  const nav = await chromium.launch({ headless: true });
  for (const vp of ANCHOS) {
    const ctx = await nav.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const pag = await ctx.newPage();
    for (const [ruta, nombre] of PAGINAS) {
      await pag.goto(BASE + '/' + ruta + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
      await pag.waitForTimeout(1200);
      await pag.screenshot({ path: path.join(SALIDA, nombre + '-' + vp.n + '-primera.png') });
      await pag.screenshot({ path: path.join(SALIDA, nombre + '-' + vp.n + '-completa.png'), fullPage: true });
      console.log('  capturada ' + nombre + ' · ' + vp.n);
    }
    await ctx.close();
  }
  await nav.close();

  const fallos = res.filter((x) => !x.v);
  console.log('\n==============================================================');
  console.log('EVIDENCIA PRODUCCION: ' + res.length + ' comprobaciones · PASAN ' + (res.length - fallos.length) + ' · FALLAN ' + fallos.length);
  console.log('Capturas en ' + SALIDA + ' (' + (PAGINAS.length * ANCHOS.length * 2) + ' imagenes)');
  console.log('==============================================================');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
