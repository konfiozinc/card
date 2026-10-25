#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/test/kz-mob-001-auditoria.js

   KZ-MOB-001 · Auditoría independiente del menú móvil de la portada.
   Complementa la prueba de Codex (kz-mob-001.js) cubriendo lo que esa
   prueba NO mira:

     · la transición 899 ↔ 901 px
     · la rotación del dispositivo
     · que el menú no deje huecos por los que se pueda pulsar el hero
     · qué elementos quedan por ENCIMA del menú abierto
     · el cierre automático al pasar a escritorio
     · el desplazamiento interno cuando el panel no cabe

   Uso: node herramientas/test/kz-mob-001-auditoria.js
   Códigos: 0 todo correcto · 1 fallo real · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('../node_modules/playwright');
const { crearServidor } = require('../lib/servidor-estatico');

const RAIZ = path.resolve(__dirname, '../..');
const SALIDA = 'C:\\KZ-EVIDENCIA\\kz-mob-001';

const res = [];
const ok = (n, v, d) => { res.push({ n, v: !!v, d: d || '' }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(56) + ' ' + (d || '')); };
const seccion = (t) => console.log('\n' + t);

/* Esperas por CONDICIÓN, nunca por número fijo: la transición del panel dura
   350 ms pero en un equipo cargado tarda más, y una espera fija produce fallos
   intermitentes. Medido: 383-413 ms reales. */
async function esperarAbierto(pag) {
  await pag.waitForFunction(() => {
    const n = document.querySelector('#nav-principal');
    return n && n.classList.contains('is-open') && n.getBoundingClientRect().left <= 1;
  }, null, { timeout: 5000 });
}
async function esperarCerrado(pag) {
  await pag.waitForFunction(() => {
    const n = document.querySelector('#nav-principal');
    if (!n) return true;
    return getComputedStyle(n).visibility === 'hidden';
  }, null, { timeout: 5000 });
}

/* Lee el estado del menú y del hero en un instante dado. */
const LEER = () => {
  const nav = document.querySelector('#nav-principal');
  const boton = document.querySelector('.menu-toggle');
  const caja = nav ? nav.getBoundingClientRect() : null;
  const cs = nav ? getComputedStyle(nav) : null;

  /* ¿Se puede pulsar cada botón del hero con el menú abierto?
     Se mira el elemento que realmente recibe el toque en el centro. */
  const heroBoton = [...document.querySelectorAll('.hero, .hero__actions, .hero__copy')]
    .flatMap((z) => [...z.querySelectorAll('a, button')]);
  const alcanzables = heroBoton.filter((b) => {
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.top < 0 || r.top > innerHeight) return false;
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el && (b.contains(el) || el.contains(b));
  }).map((b) => (b.textContent || '').trim().slice(0, 24));

  /* Qué elementos ajenos al menú quedan por encima de él. */
  const sobreMenu = [];
  if (caja && cs && cs.visibility === 'visible') {
    for (const el of document.querySelectorAll('body *')) {
      if (nav.contains(el) || el.contains(nav)) continue;
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) continue;
      if (s.pointerEvents === 'none' && Number(s.opacity) < 0.2) continue;
      const z = Number(s.zIndex);
      if (!Number.isFinite(z)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      const solapa = r.left < caja.right && caja.left < r.right && r.top < caja.bottom && caja.top < r.bottom;
      if (z > 40 && solapa) sobreMenu.push((el.className || el.tagName).toString().split(' ')[0] + '@z' + z);
    }
  }

  return {
    visible: cs ? cs.visibility : null,
    abierto: nav ? nav.classList.contains('is-open') : null,
    fondo: cs ? cs.backgroundColor : null,
    posicion: cs ? cs.position : null,
    arriba: caja ? Math.round(caja.top) : null,
    abajo: caja ? Math.round(caja.bottom) : null,
    ancho: caja ? Math.round(caja.width) : null,
    aria: boton ? boton.getAttribute('aria-expanded') : null,
    etiqueta: (document.querySelector('.menu-toggle .sr-only') || {}).textContent || null,
    overflowBody: getComputedStyle(document.body).overflow,
    overflowHtml: getComputedStyle(document.documentElement).overflow,
    desborde: document.documentElement.scrollWidth - innerWidth,
    scrollY: Math.round(window.scrollY),
    alcanzables,
    sobreMenu: [...new Set(sobreMenu)]
  };
};

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5231 });
  const nav = await chromium.launch({ headless: true });
  const errores = [];

  try {
    /* ══ 1. Los siete anchos que pide la misión ══ */
    for (const ancho of [320, 360, 375, 390, 768, 900, 1440]) {
      seccion('=== ' + ancho + ' px ===');
      const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho >= 1440 ? 900 : 812 } });
      const pag = await ctx.newPage();
      pag.on('pageerror', (e) => errores.push(ancho + 'px: ' + e.message));
      await pag.goto(srv.url, { waitUntil: 'networkidle', timeout: 60000 });
      await pag.waitForTimeout(500);

      /* Captura con el menú cerrado. */
      await pag.screenshot({ path: path.join(SALIDA, 'menu-cerrado-' + ancho + '.png') });

      const cerrado = await pag.evaluate(LEER);

      if (ancho > 900) {
        /* Escritorio: no debe existir panel desplegable. */
        ok(ancho + ' · el menú es escritorio (static, sin panel)', cerrado.posicion === 'static' && !cerrado.abierto,
          'position=' + cerrado.posicion + ' abierto=' + cerrado.abierto);
        ok(ancho + ' · sin desbordamiento horizontal', cerrado.desborde <= 1, cerrado.desborde + 'px');
        ok(ancho + ' · sin errores de JavaScript', errores.length === 0, errores.slice(0, 1).join(''));
        await ctx.close();
        continue;
      }

      /* Abrir con scroll previo, que es cuando aparece backdrop-filter. */
      await pag.evaluate(() => window.scrollTo(0, 500));
      await pag.waitForTimeout(250);
      await pag.click('.menu-toggle');
      await esperarAbierto(pag);
      const abierto = await pag.evaluate(LEER);
      await pag.screenshot({ path: path.join(SALIDA, 'menu-abierto-' + ancho + '.png') });

      const fallos = [];
      if (!abierto.abierto) fallos.push('no abrió');
      if (abierto.aria !== 'true') fallos.push('aria=' + abierto.aria);
      if (abierto.fondo !== 'rgb(5, 11, 20)') fallos.push('fondo=' + abierto.fondo);
      if (abierto.visible !== 'visible') fallos.push('visibility=' + abierto.visible);
      if (!(abierto.arriba >= 64 && abierto.arriba <= 74)) fallos.push('top=' + abierto.arriba);
      if (!(abierto.abajo >= 800)) fallos.push('bottom=' + abierto.abajo + ' (no cubre pantalla)');
      if (abierto.alcanzables.length) fallos.push('hero pulsable: ' + abierto.alcanzables.join(', '));
      if (abierto.overflowBody !== 'hidden') fallos.push('body overflow=' + abierto.overflowBody);
      if (abierto.overflowHtml !== 'hidden') fallos.push('html overflow=' + abierto.overflowHtml);
      if (abierto.desborde > 1) fallos.push('desborde=' + abierto.desborde);
      if (abierto.etiqueta !== 'Cerrar menú') fallos.push('etiqueta=' + abierto.etiqueta);
      ok(ancho + ' · menú abierto cubre la pantalla y tapa el hero', fallos.length === 0,
        abierto.arriba + '..' + abierto.abajo + 'px · fondo ' + abierto.fondo + (fallos.length ? ' << ' + fallos.join(' ; ') : ''));

      /* Nada ajeno debe quedar por encima del menú. */
      ok(ancho + ' · nada flota por encima del menú', abierto.sobreMenu.length === 0,
        abierto.sobreMenu.length ? 'ENCIMA: ' + abierto.sobreMenu.join(', ') : 'sin elementos superpuestos');

      /* El fondo no se desplaza con el menú abierto. */
      const antesScroll = await pag.evaluate(() => Math.round(window.scrollY));
      await pag.mouse.wheel(0, 600);
      await pag.waitForTimeout(350);
      const despuesScroll = await pag.evaluate(() => Math.round(window.scrollY));
      ok(ancho + ' · la página no se desplaza bajo el menú', antesScroll === despuesScroll, antesScroll + ' -> ' + despuesScroll);

      /* Escape cierra y devuelve el foco. */
      await pag.keyboard.press('Escape');
      await esperarCerrado(pag);
      const cerradoTrasEscape = await pag.evaluate(LEER);
      ok(ancho + ' · Escape cierra, oculta y restaura la etiqueta',
        cerradoTrasEscape.aria === 'false' && cerradoTrasEscape.visible === 'hidden' && cerradoTrasEscape.overflowBody !== 'hidden' && cerradoTrasEscape.etiqueta === 'Abrir menú',
        'aria=' + cerradoTrasEscape.aria + ' visibility=' + cerradoTrasEscape.visible + ' etiqueta=' + cerradoTrasEscape.etiqueta);

      const foco = await pag.evaluate(() => (document.activeElement && document.activeElement.className) || '');
      ok(ancho + ' · el foco vuelve al botón del menú', /menu-toggle/.test(foco), 'activeElement=' + foco);

      /* Un enlace del menú cierra el menú. OJO: los enlaces de la portada llevan a
         otras páginas, así que lo normal es que el documento cambie y el botón
         desaparezca. Se distingue navegación de fallo: si la URL cambia, el menú
         dejó de existir porque nos fuimos, y eso es correcto. */
      await pag.click('.menu-toggle');
      await esperarAbierto(pag);
      const urlAntes = pag.url();
      await pag.click('#nav-principal a:not(.nav__cta)');
      await pag.waitForTimeout(700);
      const urlDespues = pag.url();
      if (urlDespues !== urlAntes) {
        ok(ancho + ' · pulsar un enlace navega fuera de la portada', /^https?:/.test(urlDespues),
          urlDespues.split('/').pop());
      } else {
        const trasEnlace = await pag.evaluate(LEER);
        ok(ancho + ' · pulsar un enlace cierra el menú', trasEnlace.aria === 'false', 'aria=' + trasEnlace.aria);
      }

      ok(ancho + ' · sin errores de JavaScript', errores.length === 0, errores.slice(0, 1).join(''));
      await ctx.close();
    }

    /* ══ 2. La transición 899 ↔ 901 px ══ */
    seccion('=== TRANSICIÓN 899 ↔ 901 px ===');
    {
      const ctx = await nav.newContext({ viewport: { width: 899, height: 812 } });
      const pag = await ctx.newPage();
      const errs = [];
      pag.on('pageerror', (e) => errs.push(e.message));
      await pag.goto(srv.url, { waitUntil: 'networkidle', timeout: 60000 });
      await pag.waitForTimeout(400);

      const en899 = await pag.evaluate(LEER);
      ok('899 px · todavía es móvil (hay botón y panel)', en899.posicion !== 'static' && !!en899.aria,
        'position=' + en899.posicion + ' botón=' + (en899.aria !== null));

      await pag.click('.menu-toggle');
      await esperarAbierto(pag);
      const abierto899 = await pag.evaluate(LEER);
      ok('899 px · el menú abre correctamente', abierto899.abierto && abierto899.visible === 'visible',
        abierto899.arriba + '..' + abierto899.abajo + 'px');

      /* Se ensancha a 901 con el menú abierto: debe cerrarse solo. */
      await pag.setViewportSize({ width: 901, height: 812 });
      await pag.waitForTimeout(700);
      const en901 = await pag.evaluate(LEER);
      ok('901 px · al pasar a escritorio el menú se cierra solo', en901.aria === 'false' && en901.posicion === 'static',
        'aria=' + en901.aria + ' position=' + en901.posicion);
      ok('901 px · el bloqueo de scroll se libera', en901.overflowBody !== 'hidden', 'body overflow=' + en901.overflowBody);
      ok('901 px · el hero vuelve a ser pulsable', en901.alcanzables.length > 0,
        en901.alcanzables.join(', ') || 'ninguno');
      await pag.screenshot({ path: path.join(SALIDA, 'menu-901-escritorio.png') });

      /* Y de vuelta a 899. */
      await pag.setViewportSize({ width: 899, height: 812 });
      await pag.waitForTimeout(700);
      const vuelta = await pag.evaluate(LEER);
      ok('vuelta a 899 px · reaparece el botón sin panel abierto', vuelta.posicion !== 'static' && vuelta.aria === 'false',
        'position=' + vuelta.posicion + ' aria=' + vuelta.aria);
      ok('transición 899 ↔ 901 · sin errores de JavaScript', errs.length === 0, errs.slice(0, 1).join(''));
      await ctx.close();
    }

    /* ══ 3. Rotación ══ */
    seccion('=== ROTACIÓN ===');
    {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
      const pag = await ctx.newPage();
      const errs = [];
      pag.on('pageerror', (e) => errs.push(e.message));
      await pag.goto(srv.url, { waitUntil: 'networkidle', timeout: 60000 });
      await pag.waitForTimeout(400);

      await pag.click('.menu-toggle');
      await esperarAbierto(pag);
      const vertical = await pag.evaluate(LEER);

      /* 390x844 → 844x390 (horizontal, sigue por debajo de 900). */
      await pag.setViewportSize({ width: 844, height: 390 });
      await pag.waitForTimeout(700);
      const horizontal = await pag.evaluate(LEER);
      await pag.screenshot({ path: path.join(SALIDA, 'menu-rotado-horizontal.png') });

      const cubreVertical = vertical.abajo >= 840;
      const cubreHorizontal = horizontal.abajo >= 385;
      ok('Rotación · el menú sigue abierto al girar a horizontal', horizontal.abierto && horizontal.visible === 'visible',
        'abierto=' + horizontal.abierto + ' ' + horizontal.arriba + '..' + horizontal.abajo);
      ok('Rotación · el panel se readapta al nuevo alto', cubreVertical && cubreHorizontal,
        'vertical ' + vertical.abajo + 'px · horizontal ' + horizontal.abajo + 'px');
      ok('Rotación · sin desbordamiento horizontal', horizontal.desborde <= 1, horizontal.desborde + 'px');
      ok('Rotación · el hero sigue tapado', horizontal.alcanzables.length === 0,
        horizontal.alcanzables.join(', ') || 'ninguno pulsable');

      await pag.keyboard.press('Escape');
      await esperarCerrado(pag);
      ok('Rotación · Escape sigue cerrando', (await pag.evaluate(LEER)).aria === 'false');
      ok('Rotación · sin errores de JavaScript', errs.length === 0, errs.slice(0, 1).join(''));
      await ctx.close();
    }

    /* ══ 4. Panel que no cabe: debe poder desplazarse dentro ══ */
    seccion('=== PANTALLA MUY BAJA (320x480) ===');
    {
      const ctx = await nav.newContext({ viewport: { width: 320, height: 480 } });
      const pag = await ctx.newPage();
      await pag.goto(srv.url, { waitUntil: 'networkidle', timeout: 60000 });
      await pag.waitForTimeout(400);
      await pag.click('.menu-toggle');
      await esperarAbierto(pag);
      const m = await pag.evaluate(() => {
        const n = document.querySelector('#nav-principal');
        const cs = getComputedStyle(n);
        return { alto: Math.round(n.clientHeight), scrollAlto: Math.round(n.scrollHeight), overflowY: cs.overflowY, puedeDesplazar: n.scrollHeight > n.clientHeight };
      });
      ok('320x480 · el panel permite desplazamiento interno', m.overflowY === 'auto',
        'overflow-y=' + m.overflowY + ' · contenido ' + m.scrollAlto + 'px en caja ' + m.alto + 'px' + (m.puedeDesplazar ? ' (desplazable)' : ' (cabe entero)'));
      await pag.screenshot({ path: path.join(SALIDA, 'menu-bajo-320x480.png') });
      await ctx.close();
    }
  } finally {
    await nav.close();
    await srv.cerrar();
  }

  seccion('══════════════════════════════════════════════════════════════');
  const fallos = res.filter((x) => !x.v);
  console.log('KZ-MOB-001 AUDITORÍA: ' + res.length + ' comprobaciones · PASAN ' + (res.length - fallos.length) + ' · FALLAN ' + fallos.length);
  if (fallos.length) fallos.forEach((f) => console.log('  FALLA: ' + f.n + ' · ' + f.d));
  console.log('Capturas en ' + SALIDA);
  seccion('══════════════════════════════════════════════════════════════');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
