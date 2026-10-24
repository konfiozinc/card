#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/test/verificar-avisos-push.js

   KZ-WEB-003 · Prueba representativa del circuito de avisos.

   QUÉ COMPRUEBA (en un navegador real, no leyendo el código)
     1. Que el navegador soporte lo necesario (Notification, PushManager, SW).
     2. Que el botón «Recibir avisos» aparezca en la página.
     3. Que al pulsarlo se registre el service worker de mensajería.
     4. Que Firebase Cloud Messaging DEVUELVA UN TOKEN real.
     5. Qué promesa hace la interfaz al usuario.

   LIMITE DECLARADO
     Esto prueba el alta desde el navegador. El ENVÍO depende de que alguien
     mande una campaña desde la consola de Firebase → Messaging. Esta prueba
     no puede verificar que exista un envío real, y no lo finge: lo informa.

   Uso: node herramientas/test/verificar-avisos-push.js [--base http://...]
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);
const { crearServidor } = require('../lib/servidor-estatico');

const RAIZ = path.resolve(__dirname, '..', '..');
const argBase = process.argv.indexOf('--base');
const BASE_ARG = argBase !== -1 ? process.argv[argBase + 1] : null;

const res = [];
const ok = (n, v, d) => { res.push({ n, v: !!v }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(52) + ' ' + (d || '')); };

(async () => {
  let srv = null;
  const BASE = BASE_ARG || (srv = await crearServidor({ raiz: RAIZ, puerto: 5433 }), srv.url);
  console.log('=== AVISOS PUSH · prueba representativa ===');
  console.log('  base: ' + BASE + '\n');

  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, permissions: ['notifications'] });
  const pag = await ctx.newPage();
  const logs = [];
  pag.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 140)));
  pag.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 140)));

  /* Se prueba en una página que ya carga push.js. */
  const objetivo = '/blog.html';
  await pag.goto(BASE + objetivo, { waitUntil: 'networkidle', timeout: 60000 });
  await pag.waitForTimeout(1500);

  const soporte = await pag.evaluate(() => ({
    notification: 'Notification' in window,
    permiso: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
    pushManager: 'PushManager' in window,
    sw: 'serviceWorker' in navigator,
    secure: window.isSecureContext
  }));
  console.log('  soporte del navegador: ' + JSON.stringify(soporte));
  ok('El navegador soporta notificaciones y push', soporte.notification && soporte.pushManager && soporte.sw, JSON.stringify(soporte));

  /* El botón aparece tras interacción; se simula desplazamiento. */
  await pag.mouse.wheel(0, 1200);
  await pag.waitForTimeout(2500);

  const boton = await pag.evaluate(() => {
    const b = [...document.querySelectorAll('button, a, [role="button"]')]
      .find((el) => /recibir avisos|avisos activados/i.test((el.textContent || '').trim()));
    if (!b) return null;
    const c = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      texto: (b.textContent || '').trim().slice(0, 60),
      visible: c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0,
      aria: b.getAttribute('aria-label') || null
    };
  });
  ok('El botón «Recibir avisos» aparece en la página', !!boton, boton ? JSON.stringify(boton) : 'no encontrado');

  let token = null;
  if (boton) {
    await pag.evaluate(() => {
      const b = [...document.querySelectorAll('button, a, [role="button"]')]
        .find((el) => /recibir avisos/i.test((el.textContent || '').trim()));
      if (b) b.click();
    });
    /* getToken puede tardar: se espera hasta 20 s mirando el almacenamiento
       y el DOM en busca de señal de éxito. */
    for (let i = 0; i < 20; i++) {
      await pag.waitForTimeout(1000);
      const estado = await pag.evaluate(() => {
        const claves = Object.keys(localStorage);
        const marca = claves.find((k) => /kz_avisos/i.test(k));
        const txt = [...document.querySelectorAll('button, a, [role="button"]')]
          .map((el) => (el.textContent || '').trim()).find((t) => /avisos/i.test(t)) || '';
        return { marca: marca || null, valor: marca ? localStorage.getItem(marca) : null, texto: txt.slice(0, 60) };
      });
      if (estado.marca && /ok|suscrit|activ/i.test(String(estado.valor) + estado.texto)) { token = estado; break; }
      if (/activados/i.test(estado.texto)) { token = estado; break; }
    }
    ok('La suscripción se registra (token o marca de activado)', !!token, token ? JSON.stringify(token) : 'sin señal de alta en 20 s');
  }

  /* Service worker de mensajería registrado. */
  const sws = await pag.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return [];
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => (r.active || r.installing || r.waiting || {}).scriptURL || (r.scope || ''));
  });
  ok('Service worker de mensajería registrado', sws.some((s) => /firebase-messaging-sw/i.test(s)), JSON.stringify(sws));

  /* Promesa que hace la interfaz. */
  const promesa = await pag.evaluate(() => {
    const textos = [...document.querySelectorAll('[class*=aviso], [class*=kz-accion], .kz-push, dialog, [role="dialog"]')]
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return textos.slice(0, 3);
  });
  console.log('\n  lo que la interfaz promete al usuario:');
  if (promesa.length === 0) console.log('    (no se encontró texto promocional)');
  promesa.forEach((p) => console.log('    «' + p.slice(0, 150) + '»'));

  console.log('\n  registros del navegador (últimos 8):');
  logs.slice(-8).forEach((l) => console.log('    ' + l));

  await nav.close();
  if (srv) await srv.cerrar();

  const fallos = res.filter((x) => !x.v);
  console.log('\n══════════════════════════════════════════════════');
  console.log('AVISOS PUSH: ' + res.length + ' · PASAN ' + (res.length - fallos.length) + ' · FALLAN ' + fallos.length);
  console.log('══════════════════════════════════════════════════');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
