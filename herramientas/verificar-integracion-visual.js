'use strict';
const fs = require('fs');
const path = require('path');
const BASE = __dirname;
const RAIZ = path.resolve(BASE, '..');
const { chromium } = require(BASE + '/node_modules/playwright');
const { crearServidor } = require(BASE + '/lib/servidor-estatico.js');

const salida = [];
const ok = (n, v, d) => { salida.push({ n, v: !!v }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(54) + ' ' + (d || '')); };

(async () => {
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5411 });
  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 375, height: 667 } });
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));

  console.log('\n=== INTEGRACION TIPOGRAFICA Y DE NAVEGACION (375px) ===\n');

  await pag.goto(srv.url + '/index.html', { waitUntil: 'networkidle' });
  await pag.waitForTimeout(1200);

  const m = await pag.evaluate(() => {
    const h1 = document.querySelector('.hero h1');
    const cs = h1 ? getComputedStyle(h1) : null;
    const r = h1 ? h1.getBoundingClientRect() : null;
    const links = [...document.querySelectorAll('#nav-principal a')].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute('href') }));
    return {
      font: cs ? cs.fontFamily.split(',')[0] : null,
      tam: cs ? cs.fontSize : null,
      alto: r ? Math.round(r.height) : 0,
      ratio: r ? Number((r.height / window.innerHeight).toFixed(2)) : 0,
      desborda: h1 ? h1.scrollWidth > h1.clientWidth + 2 : false,
      links,
      toggle: !!document.querySelector('.menu-toggle'),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  ok('La portada usa la fuente geométrica', /Orbitron/.test(m.font || ''), m.font);
  ok('El titular no desborda en móvil', !m.desborda, m.tam + ' · alto ' + m.alto + 'px');
  ok('El titular ocupa menos de un tercio de la pantalla', m.ratio <= 0.35, m.ratio + ' de la pantalla');
  ok('La página no desborda horizontalmente', !m.overflow);

  /* Los seis destinos deben existir como archivo real. */
  const destinos = m.links.filter((l) => l.h && !l.h.startsWith('http') && !l.h.startsWith('#'));
  let faltan = [];
  for (const d of destinos) if (!fs.existsSync(path.join(RAIZ, d.h.split('#')[0]))) faltan.push(d.h);
  ok('Todos los destinos del menú son páginas reales', faltan.length === 0, destinos.length + ' destinos' + (faltan.length ? ' · faltan ' + faltan.join(',') : ''));
  ok('El menú ofrece el vocabulario del sitio', m.links.length >= 6, m.links.map((l) => l.t).join(' · '));

  /* Comportamiento del menú móvil. */
  ok('Existe el botón de menú', m.toggle);
  if (m.toggle) {
    await pag.click('.menu-toggle');
    await pag.waitForTimeout(500);
    const abierto = await pag.evaluate(() => ({
      expandido: document.querySelector('.menu-toggle').getAttribute('aria-expanded'),
      visible: (() => { const n = document.querySelector('#nav-principal'); if (!n) return false; const r = n.getBoundingClientRect(); return r.left < window.innerWidth && r.width > 50; })()
    }));
    ok('El menú abre y anuncia su estado', abierto.expandido === 'true' && abierto.visible, 'aria-expanded=' + abierto.expandido);
    await pag.keyboard.press('Escape');
    await pag.waitForTimeout(400);
    const cerrado = await pag.evaluate(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded'));
    ok('Escape cierra el menú', cerrado === 'false', 'aria-expanded=' + cerrado);
  }

  /* Controles bloqueados por el flotante en las páginas clave. */
  let bloqueados = 0;
  for (const rel of ['index.html', 'servicios.html', 'precios.html', 'portafolio.html', 'blog.html', 'contacto.html']) {
    await pag.goto(srv.url + '/' + rel, { waitUntil: 'networkidle' });
    await pag.waitForTimeout(500);
    const n = await pag.evaluate(() => {
      const fab = document.querySelector('.kzFabWrapper') || document.querySelector('[class*=kz-fab]');
      if (!fab) return 0;
      const f = fab.getBoundingClientRect();
      let c = 0;
      for (const el of document.querySelectorAll('a[href],button')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const b = el.getBoundingClientRect();
        if (b.width < 8 || b.height < 8 || b.top > 667) continue;
        if (fab.contains(el) || el.contains(fab)) continue;
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        if (cx >= f.left && cx <= f.right && cy >= f.top && cy <= f.bottom) c++;
      }
      return c;
    });
    bloqueados += n;
  }
  ok('Ningún control con el centro tapado por el flotante', bloqueados === 0, bloqueados + ' en 6 páginas');
  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');

  await ctx.close(); await nav.close(); await srv.cerrar();
  const fallos = salida.filter((x) => !x.v);
  console.log('\n==============================================================');
  console.log('INTEGRACION: ' + salida.length + ' comprobaciones · PASAN ' + (salida.length - fallos.length) + ' · FALLAN ' + fallos.length);
  console.log('==============================================================');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
