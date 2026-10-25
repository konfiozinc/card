#!/usr/bin/env node
'use strict';

// Regresión del menú móvil: ejecutarlo desde la raíz del repositorio con
// `node herramientas/test/kz-mob-001.js` tras instalar Playwright en herramientas/.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../node_modules/playwright');
const { crearServidor } = require('../lib/servidor-estatico');

(async () => {
  const servidor = await crearServidor({ raiz: path.resolve(__dirname, '../..'), puerto: 5221 });
  let navegador;
  try {
    navegador = await chromium.launch({ headless: true });
    for (const ancho of [320, 360, 375, 390, 768, 900]) {
      const pagina = await navegador.newPage({ viewport: { width: ancho, height: 812 } });
      for (const desplazamiento of [0, 500]) {
        await pagina.goto(servidor.url, { waitUntil: 'domcontentloaded' });
        await pagina.evaluate(y => window.scrollTo(0, y), desplazamiento);
        await pagina.waitForTimeout(50);
        const boton = pagina.locator('.menu-toggle');
        await boton.click();
        await pagina.waitForTimeout(400);
        const estado = await pagina.evaluate(() => {
          const nav = document.querySelector('#nav-principal');
          const caja = nav.getBoundingClientRect();
          const muestra = document.elementFromPoint(innerWidth / 2, Math.min(innerHeight - 30, 400));
          return {
            abierto: nav.classList.contains('is-open'),
            fondo: getComputedStyle(nav).backgroundColor,
            arriba: caja.top,
            abajo: caja.bottom,
            ancho: caja.width,
            cubrePantalla: nav.contains(muestra),
            bloqueoScroll: getComputedStyle(document.body).overflow,
            aria: document.querySelector('.menu-toggle').getAttribute('aria-expanded'),
            horizontal: document.documentElement.scrollWidth - innerWidth,
          };
        });
        assert.equal(estado.abierto, true, `${ancho}px: menú no abrió`);
        assert.equal(estado.aria, 'true');
        assert.equal(estado.fondo, 'rgb(5, 11, 20)', `${ancho}px: menú sin fondo opaco`);
        assert.ok(estado.arriba >= 65 && estado.arriba <= 72, `${ancho}px: inicio fuera de cabecera`);
        assert.ok(estado.abajo >= 810, `${ancho}px: panel no cubre pantalla`);
        assert.ok(estado.cubrePantalla, `${ancho}px: el hero tapa el menú`);
        assert.equal(estado.bloqueoScroll, 'hidden');
        assert.ok(estado.horizontal <= 1, `${ancho}px: desbordamiento horizontal`);
        await pagina.keyboard.press('Escape');
        assert.equal(await boton.getAttribute('aria-expanded'), 'false');
        await pagina.waitForTimeout(400);
        assert.equal(await pagina.locator('#nav-principal').evaluate(e => getComputedStyle(e).visibility), 'hidden');
        console.log(`OK ${ancho}px scroll=${desplazamiento}`);
      }
      await pagina.close();
    }
    const escritorio = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
    await escritorio.goto(servidor.url);
    assert.equal(await escritorio.locator('.nav').evaluate(e => getComputedStyle(e).position), 'static');
    console.log('OK escritorio 1440px');
    await escritorio.close();
  } finally {
    await navegador?.close();
    await servidor.cerrar();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
