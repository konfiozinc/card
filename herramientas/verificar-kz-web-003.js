#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-kz-web-003.js

   KZ-WEB-003 · Verificación integral de la misión, en navegador real
   (escritorio 1440x900 y móvil 375x667) más comprobaciones de archivo.

   Comprueba los siete puntos del encargo:
     A · Open Graph, metadatos y favicon
     B · logotipo único (sin JPEG, sin oro)
     C · carrusel con flechas, teclado, contador y puntos
     D · aliados con la política correcta
     E · avisos honestos y manifest Neon
     F · composición de capas en la portada
     G · coherencia corporativa

   Uso: node herramientas/verificar-kz-web-003.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');
const { chromium } = require(PW);
const { crearServidor } = require('./lib/servidor-estatico');

const res = [];
const ok = (n, v, d) => { res.push({ n, v: !!v }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(58) + ' ' + (d || '')); };
const sección = (t) => console.log('\n' + t);

function htmls(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs', 'herramientas', 'functions', 'tools', 'design-system'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmls(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');

(async () => {
  /* ═══ A y B: comprobaciones sobre archivos ═══ */
  sección('=== A · METADATOS Y OPEN GRAPH ===');
  const paginas = htmls(RAIZ);

  const ogPng = path.join(RAIZ, 'assets/img/og/og-1200x630.png');
  const ogb = fs.readFileSync(ogPng);
  const ogW = ogb.readUInt32BE(16), ogH = ogb.readUInt32BE(20);
  ok('La imagen Open Graph es PNG de 1200x630', ogb[0] === 0x89 && ogW === 1200 && ogH === 630, ogW + 'x' + ogH + ' · ' + Math.round(ogb.length / 1024) + ' KB');

  let conOgSvg = 0, conJpeg = 0, sinDim = 0, sinAlt = 0, sinTwitter = 0, sinOg = 0, sinCanonical = 0;
  for (const p of paginas) {
    const t = fs.readFileSync(p, 'utf8');
    if (!/property="og:image"/i.test(t)) { sinOg++; continue; }
    const img = (t.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1] || '';
    if (/\.svg($|\?)/i.test(img)) { conOgSvg++; console.log('    og:image SVG -> ' + rel(p)); }
    if (/logo\.jpeg/i.test(img)) { conJpeg++; console.log('    og:image JPEG de logo -> ' + rel(p)); }
    if (!/og:image:width/i.test(t) || !/og:image:height/i.test(t)) sinDim++;
    if (!/og:image:alt/i.test(t)) sinAlt++;
    if (!/name="twitter:card"/i.test(t)) sinTwitter++;
    if (!/rel="canonical"/i.test(t)) sinCanonical++;
  }
  ok('Ninguna página usa un SVG como og:image', conOgSvg === 0, conOgSvg + ' páginas');
  ok('Ninguna página usa el JPEG del logotipo como og:image', conJpeg === 0, conJpeg + ' páginas');
  ok('Todas las og:image declaran ancho y alto', sinDim === 0, sinDim + ' sin declarar');
  ok('Todas las og:image declaran texto alternativo', sinAlt === 0, sinAlt + ' sin alt');
  ok('Todas las páginas con Open Graph traen Twitter Card', sinTwitter === 0, sinTwitter + ' sin twitter:card');
  ok('Todas las páginas con Open Graph tienen canonical', sinCanonical === 0, sinCanonical + ' sin canonical');
  console.log('    (páginas sin Open Graph: ' + sinOg + ')');

  sección('=== B · LOGOTIPO ÚNICO ===');
  let conJpegLogo = 0;
  for (const p of paginas) if (/logo\.jpeg/.test(fs.readFileSync(p, 'utf8'))) { conJpegLogo++; console.log('    usa logo.jpeg -> ' + rel(p)); }
  ok('Ninguna página usa el JPEG como logotipo', conJpegLogo === 0, conJpegLogo + ' páginas');

  const activos = ['assets/img/marca/kz-logo.svg', 'assets/img/marca/kz-logo-inverso.svg', 'assets/img/marca/kz-logo-vertical.svg',
    'assets/img/marca/kz-monograma.svg', 'assets/img/marca/favicon.svg', 'assets/img/marca/kz-logo.png',
    'assets/img/marca/kz-monograma.png', 'assets/img/icons/icon-192.png', 'assets/img/icons/icon-512.png',
    'assets/img/icons/icon-maskable-192.png', 'assets/img/icons/icon-maskable-512.png', 'assets/img/icons/apple-touch-icon.png',
    'assets/img/logos/favicon-32.png', 'assets/img/logos/favicon-64.png'];
  const faltan = activos.filter((a) => !fs.existsSync(path.join(RAIZ, a)));
  ok('Todos los recursos de marca existen', faltan.length === 0, activos.length + ' archivos' + (faltan.length ? ' · faltan ' + faltan.join(', ') : ''));

  let oroEnMarca = [];
  for (const a of activos.filter((x) => x.endsWith('.svg'))) {
    const t = fs.readFileSync(path.join(RAIZ, a), 'utf8');
    if (/F0B429/i.test(t)) oroEnMarca.push(a);
  }
  ok('Ningún SVG de marca reintroduce el oro', oroEnMarca.length === 0, oroEnMarca.join(', '));

  sección('=== E · MANIFEST Y AVISOS ===');
  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
  ok('El manifest no usa el dorado', !/F0B429/i.test(JSON.stringify(man)), 'theme_color=' + man.theme_color + ' · background=' + man.background_color);
  ok('El manifest apunta a iconos Neon existentes', man.icons.every((i) => fs.existsSync(path.join(RAIZ, i.src))), man.icons.length + ' iconos');
  const push = fs.readFileSync(path.join(RAIZ, 'assets/js/push.js'), 'utf8');
  /* Se quitan los comentarios antes de buscar: el archivo explica en un comentario
     cuál era la promesa anterior, y eso no es una promesa vigente. */
  const pushSinComentarios = push.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('push.js no promete avisos automáticos', !/te contactaremos/i.test(pushSinComentarios), /ocasionales/i.test(pushSinComentarios) ? 'dice «ocasionales»' : 'sin la palabra clave');
  ok('push.js ofrece salida por WhatsApp', /wa\.me\/573206411340/.test(pushSinComentarios), 'enlace presente');

  /* ═══ C, D, F, G: navegador real ═══ */
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5444 });
  const opciones = { headless: true };
  if (process.env.CHROMIUM_PATH) opciones.executablePath = process.env.CHROMIUM_PATH;
  const nav = await chromium.launch(opciones);

  for (const vp of [{ n: 'ESCRITORIO', w: 1440, h: 900 }, { n: 'MÓVIL', w: 375, h: 667 }]) {
    sección('=== C/F/G · PORTADA ' + vp.n + ' (' + vp.w + 'x' + vp.h + ') ===');
    const ctx = await nav.newContext({ viewport: { width: vp.w, height: vp.h } });
    const pag = await ctx.newPage();
    const errs = [];
    pag.on('pageerror', (e) => errs.push(e.message));
    await pag.goto(srv.url + '/index.html', { waitUntil: 'networkidle', timeout: 60000 });
    await pag.waitForTimeout(1200);

    const c = await pag.evaluate(() => {
      const raiz = document.querySelector('[data-carrusel]');
      const pista = document.querySelector('[data-pista]');
      const prev = document.querySelector('[data-prev]');
      const next = document.querySelector('[data-next]');
      const vis = (el) => { if (!el) return false; const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
      const capas = document.querySelector('.hero__capas img');
      return {
        hayCarrusel: !!raiz,
        slides: pista ? pista.children.length : 0,
        prevVisible: vis(prev), nextVisible: vis(next),
        prevDeshabilitado: prev ? prev.disabled : null,
        total: (document.querySelector('[data-total]') || {}).textContent || null,
        actual: (document.querySelector('[data-actual]') || {}).textContent || null,
        puntos: document.querySelectorAll('.kz-carrusel__punto').length,
        ariaLive: !!document.querySelector('[data-anuncio][aria-live]'),
        pistaFocusable: pista ? pista.getAttribute('tabindex') : null,
        snap: pista ? getComputedStyle(pista).scrollSnapType : null,
        capasVisible: vis(capas),
        capasCargada: capas ? capas.complete && capas.naturalWidth > 0 : false,
        capasAlt: capas ? (capas.getAttribute('alt') || '').length : 0,
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        marqueeViejo: !!document.querySelector('.marquee')
      };
    });

    ok('El carrusel existe y sustituye al marquee', c.hayCarrusel && !c.marqueeViejo, c.slides + ' diapositivas');
    ok('Las flechas anterior y siguiente son visibles', c.prevVisible && c.nextVisible, 'prev=' + c.prevVisible + ' next=' + c.nextVisible);
    ok('La flecha anterior arranca deshabilitada', c.prevDeshabilitado === true, 'disabled=' + c.prevDeshabilitado);
    ok('Hay contador de posición', c.total === String(c.slides) && c.actual === '1', c.actual + ' / ' + c.total);
    ok('Hay un punto por diapositiva', c.puntos === c.slides, c.puntos + ' puntos');
    ok('La pista es focusable y anuncia el cambio', c.pistaFocusable === '0' && c.ariaLive);
    ok('El swipe nativo está activo (scroll-snap)', /x/.test(String(c.snap)), 'scroll-snap-type=' + c.snap);
    ok('La composición de capas se muestra y carga', c.capasVisible && c.capasCargada && c.capasAlt > 20, 'cargada=' + c.capasCargada + ' alt=' + c.capasAlt + ' chars');
    ok('La portada no desborda horizontalmente', c.desborde <= 2, 'desborde=' + c.desborde + 'px');
    ok('Sin errores de JavaScript en la portada', errs.length === 0, errs.slice(0, 2).join(' | ') || 'ninguno');

    /* Navegación real del carrusel: flecha y teclado. */
    const antes = await pag.evaluate(() => ({ izq: document.querySelector('[data-pista]').scrollLeft, act: document.querySelector('[data-actual]').textContent }));
    await pag.click('[data-next]');
    await pag.waitForTimeout(900);
    const trasFlecha = await pag.evaluate(() => ({ izq: document.querySelector('[data-pista]').scrollLeft, act: document.querySelector('[data-actual]').textContent }));
    ok('La flecha siguiente avanza y actualiza el contador', trasFlecha.izq > antes.izq && trasFlecha.act !== antes.act, antes.act + ' -> ' + trasFlecha.act);

    /* Se vuelve al inicio y se avanza con el teclado: así la prueba mide algo
       en los dos tamaños, porque en escritorio caben tres tarjetas y desde el
       final no queda recorrido. */
    await pag.focus('[data-pista]');
    await pag.keyboard.press('Home');
    await pag.waitForTimeout(900);
    const trasHome0 = await pag.evaluate(() => document.querySelector('[data-actual]').textContent);
    await pag.keyboard.press('ArrowRight');
    await pag.waitForTimeout(900);
    const trasTeclado = await pag.evaluate(() => ({ izq: document.querySelector('[data-pista]').scrollLeft, act: document.querySelector('[data-actual]').textContent }));
    ok('La tecla Inicio vuelve al primer proyecto', trasHome0 === '1', 'contador=' + trasHome0);
    ok('El teclado (→) avanza el carrusel', trasTeclado.izq > 2 && trasTeclado.act === '2', 'contador=' + trasTeclado.act + ' · scrollLeft=' + Math.round(trasTeclado.izq));

    /* Al final, la flecha siguiente debe quedar deshabilitada: el teclado y el
       botón tienen que estar de acuerdo en cuál es el límite. */
    for (let k = 0; k < 4; k++) { await pag.keyboard.press('End'); await pag.waitForTimeout(400); }
    await pag.waitForTimeout(600);
    const alFinal = await pag.evaluate(() => ({ next: document.querySelector('[data-next]').disabled, act: document.querySelector('[data-actual]').textContent }));
    ok('Al final del carrusel la flecha siguiente se deshabilita', alFinal.next === true, 'contador=' + alFinal.act + ' next.disabled=' + alFinal.next);

    await ctx.close();
  }

  /* ═══ D: aliados ═══ */
  sección('=== D · PÁGINA DE ALIADOS ===');
  const ctx2 = await nav.newContext({ viewport: { width: 375, height: 667 } });
  const pag2 = await ctx2.newPage();
  const errs2 = [];
  pag2.on('pageerror', (e) => errs2.push(e.message));
  await pag2.goto(srv.url + '/aliados.html', { waitUntil: 'networkidle', timeout: 60000 });
  await pag2.waitForTimeout(900);

  const a = await pag2.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return {
      texto: t,
      tiene20: /20\s?%/.test(t),
      tiene30: /30\s?%/.test(t),
      tiene40: /40\s?%/.test(t),
      tiene50: /50\s?%/.test(t),
      bronce14: /1 a 4/.test(t),
      plata59: /5 a 9/.test(t),
      oro10: /10 o más|10 \+|10\+/.test(t),
      umbralViejo: /1 a 5|6 a 15|16\+/.test(t),
      panelAliados: /panel de aliados/i.test(t),
      wa: document.querySelectorAll('a[href*="wa.me/573206411340"]').length,
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      h1: (document.querySelector('h1') || {}).textContent || ''
    };
  });
  ok('La comisión de referido es el 20%', a.tiene20, 'aparece 20%');
  ok('El descuento de distribuidor usa 30/40/50', a.tiene30 && a.tiene40 && a.tiene50, [a.tiene30, a.tiene40, a.tiene50].join('/'));
  ok('Los umbrales son 1-4, 5-9 y 10+', a.bronce14 && a.plata59 && a.oro10, '1-4=' + a.bronce14 + ' 5-9=' + a.plata59 + ' 10+=' + a.oro10);
  ok('No quedan los umbrales antiguos (1-5 / 6-15 / 16+)', !a.umbralViejo);
  ok('No promete un panel de aliados inexistente', !a.panelAliados);
  ok('La página ofrece contacto por WhatsApp', a.wa >= 3, a.wa + ' enlaces');
  ok('Aliados no desborda en móvil', a.desborde <= 2, 'desborde=' + a.desborde + 'px');
  ok('Sin errores de JavaScript en aliados', errs2.length === 0, errs2.slice(0, 2).join(' | ') || 'ninguno');
  await ctx2.close();

  /* ═══ Verificación de no-oro en todo el CSS/HTML servido ═══ */
  sección('=== G · COHERENCIA CORPORATIVA ===');
  let oroActivo = [];
  for (const p of paginas) {
    const t = fs.readFileSync(p, 'utf8');
    if (/F0B429/i.test(t)) oroActivo.push(rel(p));
  }
  ok('Ningún HTML reintroduce el dorado', oroActivo.length === 0, oroActivo.slice(0, 3).join(', '));

  await nav.close();
  await srv.cerrar();

  const fallos = res.filter((x) => !x.v);
  sección('══════════════════════════════════════════════════════════════');
  console.log('KZ-WEB-003: ' + res.length + ' comprobaciones · PASAN ' + (res.length - fallos.length) + ' · FALLAN ' + fallos.length);
  fallos.forEach((f) => console.log('  FALLA: ' + f.n));
  sección('══════════════════════════════════════════════════════════════');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
