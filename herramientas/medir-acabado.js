'use strict';
const path = require('path');
const BASE = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/herramientas';
const { chromium } = require(BASE + '/node_modules/playwright');
const { crearServidor } = require(BASE + '/lib/servidor-estatico.js');
const RAIZ = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web';

const PAGINAS = ['index.html', 'servicios.html', 'precios.html', 'portafolio.html', 'blog.html', 'contacto.html'];

const MEDIR = () => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right) }; };
  const intersection = (a, b) => {
    const x = Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
    return x * y;
  };

  /* 1 · Titular del hero */
  const h1 = document.querySelector('.hero__title, #hero-title, .hero h1, h1');
  let titulo = null;
  if (h1) {
    const cs = getComputedStyle(h1);
    const r = rect(h1);
    /* ¿alguna palabra se sale de su caja? Se mide con un Range por palabra. */
    const texto = h1.textContent.trim();
    titulo = {
      texto: texto.slice(0, 60),
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      anchoCaja: r.w,
      altoCaja: r.h,
      desborda: h1.scrollWidth > h1.clientWidth + 2,
      ratioPantalla: Number((r.h / window.innerHeight).toFixed(2))
    };
  }

  /* 2 · Flotantes: todo lo que está fijo o sticky en la esquina */
  const flotantes = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) return false;
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) return false;
    return true;
  }).map((el) => ({ id: el.id || el.className.toString().slice(0, 28), tag: el.tagName, ...rect(el), z: getComputedStyle(el).zIndex }));

  /* 3 · Solapamientos de los flotantes con controles y textos */
  const controles = [...document.querySelectorAll('a[href], button')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }).map((el) => ({ txt: (el.textContent || '').trim().slice(0, 34), ...rect(el) }));

  const solapes = [];
  for (const f of flotantes) {
    /* Un flotante solo molesta si tapa algo en la zona visible. */
    if (f.y > window.innerHeight) continue;
    for (const c of controles) {
      if (c.y > window.innerHeight) continue;
      const area = intersection(f, c);
      if (area > 400) solapes.push({ flotante: f.id, tapa: c.txt || '(botón sin texto)', area });
    }
  }

  /* 4 · CTA visibles en la primera pantalla */
  const ctas = controles.filter((c) => c.y >= 0 && c.y < window.innerHeight && /button|btn/i.test(''));

  return { titulo, flotantes, solapes, controlesVisibles: controles.filter((c) => c.y < window.innerHeight).length };
};

(async () => {
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5371 });
  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 375, height: 667 } });
  const pag = await ctx.newPage();

  console.log('\n=== MEDICION A 375x667 ===\n');
  for (const rel of PAGINAS) {
    await pag.goto(srv.url + '/' + rel, { waitUntil: 'networkidle' });
    await pag.waitForTimeout(900);
    const m = await pag.evaluate(MEDIR);
    console.log('── ' + rel);
    if (m.titulo) {
      console.log('   titular  : ' + m.titulo.fontSize + ' · alto ' + m.titulo.altoCaja + 'px (' + m.titulo.ratioPantalla + ' de la pantalla) · caja ' + m.titulo.anchoCaja + 'px · desborda=' + m.titulo.desborda);
      console.log('              «' + m.titulo.texto + '»');
    }
    console.log('   flotantes: ' + (m.flotantes.length ? m.flotantes.map((f) => f.id + '(' + f.w + 'x' + f.h + ' @' + f.x + ',' + f.y + ')').join(' ') : 'ninguno'));
    if (m.solapes.length) {
      const vistos = new Set();
      for (const s of m.solapes) { const k = s.flotante + '→' + s.tapa; if (vistos.has(k)) continue; vistos.add(k); console.log('   SOLAPE   : ' + s.flotante + ' tapa «' + s.tapa + '» (' + s.area + ' px²)'); }
    } else console.log('   solapes  : ninguno');
    console.log('   controles en pantalla: ' + m.controlesVisibles);
    console.log('');
  }
  await ctx.close(); await nav.close(); await srv.cerrar();
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
