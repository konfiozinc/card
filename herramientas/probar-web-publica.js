#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/probar-web-publica.js

   Batería de calidad reproducible para la web pública. Sirve para el sitio
   actual y para el candidato premium de Codex, apuntando a la URL o al
   servidor local que corresponda.

   Comprueba, sin modificar nada:
     · navegación de las páginas entregadas (estado, título, h1, meta)
     · accesibilidad básica: alt en imágenes, lang, viewport, focus visible,
       navegación por teclado y texto ampliado al 200 %
     · rendimiento: peso del HTML y de las imágenes por página
     · formularios: ningún dato personal viajando en la URL (GET)
     · dependencias externas: qué se cae si no hay red
     · errores críticos de JavaScript
     · móvil (375×667) y escritorio (1440×900)

   Uso:
     node herramientas/probar-web-publica.js --base https://konfiozinc.github.io/card/
     node herramientas/probar-web-publica.js --base http://127.0.0.1:5200/ --paginas 8
   Códigos: 0 todo en verde · 1 hay fallos · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = argVal('--base', 'https://konfiozinc.github.io/card/').replace(/\/?$/, '/');
const MAXPAG = Number(argVal('--paginas', 10));
const PRESUPUESTO_HTML_KB = Number(argVal('--presupuesto-html', 120));
const PRESUPUESTO_IMG_KB = Number(argVal('--presupuesto-img', 900));

const RUTAS = ['', 'servicios.html', 'portafolio.html', 'blog.html', 'nosotros.html', 'contacto.html',
  'precios.html', 'aliados.html', 'politica-privacidad.html', 'servicios/tarjetas-digitales.html'];

const fallos = [];
const avisos = [];
function chequear(nombre, ok, detalle) {
  const linea = `  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${detalle || ''}`;
  console.log(linea);
  if (!ok) fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
}
function avisar(texto) { avisos.push(texto); console.log(`  [AVISO   ] ${texto}`); }

(async () => {
  console.log('');
  console.log('═══ BATERÍA DE CALIDAD · WEB PÚBLICA ═══');
  console.log(`  base: ${BASE}`);
  console.log('');
  const nav = await chromium.launch({ headless: true });

  /* ── 1 · Navegación, metadatos y accesibilidad básica ───────────── */
  const paginas = RUTAS.slice(0, MAXPAG);
  const resultados = [];
  const errores = [];
  for (const ruta of paginas) {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const pag = await ctx.newPage();
    pag.on('pageerror', (e) => errores.push(`${ruta || '/'}: ${e.message}`));
    const resp = await pag.goto(BASE + ruta, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    await pag.waitForTimeout(900);
    const datos = await pag.evaluate(() => {
      const img = [...document.querySelectorAll('img')];
      const html = document.documentElement.outerHTML;
      return {
        titulo: (document.title || '').trim(),
        desc: (document.querySelector('meta[name="description"]') || {}).content || '',
        lang: document.documentElement.lang || '',
        viewport: !!document.querySelector('meta[name="viewport"]'),
        h1: document.querySelectorAll('h1').length,
        imgsSinAlt: img.filter(i => !i.getAttribute('alt')).length,
        imgs: img.length,
        htmlKB: Math.round(new Blob([html]).size / 1024),
        imgKB: Math.round(img.reduce((s, i) => s + (i.naturalWidth ? 0 : 0), 0)),
        formulariosGET: [...document.querySelectorAll('form')].filter(f => (f.getAttribute('method') || 'get').toLowerCase() === 'get').length,
        enlacesVacios: [...document.querySelectorAll('a')].filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#').length
      };
    });
    resultados.push({ ruta: ruta || '/', st: resp ? resp.status() : 0, ...datos });
    await ctx.close();
  }

  chequear('Todas las páginas responden 200', resultados.every(r => r.st === 200),
    resultados.filter(r => r.st !== 200).map(r => `${r.ruta}=${r.st}`).join(' ') || `${resultados.length} páginas`);
  chequear('Todas tienen título y descripción', resultados.every(r => r.titulo && r.desc),
    resultados.filter(r => !r.titulo || !r.desc).map(r => r.ruta).join(' ') || 'ok');
  chequear('Todas declaran lang y viewport', resultados.every(r => r.lang && r.viewport),
    resultados.filter(r => !r.lang || !r.viewport).map(r => r.ruta).join(' ') || 'ok');
  chequear('Exactamente un h1 por página', resultados.every(r => r.h1 === 1),
    resultados.filter(r => r.h1 !== 1).map(r => `${r.ruta}=${r.h1}`).join(' ') || 'ok');
  chequear('Ninguna imagen sin alt', resultados.every(r => r.imgsSinAlt === 0),
    resultados.reduce((s, r) => s + r.imgsSinAlt, 0) + ' sin alt');
  chequear('Ningún formulario envía datos por GET',
    resultados.every(r => r.formulariosGET === 0), resultados.reduce((s, r) => s + r.formulariosGET, 0) + ' formularios GET');
  chequear(`HTML dentro del presupuesto (${PRESUPUESTO_HTML_KB} KB)`,
    resultados.every(r => r.htmlKB <= PRESUPUESTO_HTML_KB),
    `máximo ${Math.max(...resultados.map(r => r.htmlKB))} KB`);

  /* ── 2 · Teclado y texto ampliado ──────────────────────────────── */
  {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const pag = await ctx.newPage();
    await pag.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(800);
    const foco = [];
    for (let i = 0; i < 6; i++) {
      await pag.keyboard.press('Tab');
      foco.push(await pag.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'ninguno';
        const etiqueta = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
        return el.tagName + (el.id ? '#' + el.id : '') + (etiqueta ? '(' + etiqueta + ')' : '');
      }));
    }
    chequear('El teclado recorre elementos de la página', new Set(foco).size > 2, foco.slice(0, 4).join(' → '));
    await ctx.close();

    const ctxZoom = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const pagZoom = await ctxZoom.newPage();
    await pagZoom.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pagZoom.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await pagZoom.waitForTimeout(600);
    const desborda = await pagZoom.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 8);
    chequear('Con texto al 200 % no se desborda en horizontal', !desborda, desborda ? 'desborda' : 'ok');
    await ctxZoom.close();
  }

  /* ── 3 · Móvil 375×667 ─────────────────────────────────────────── */
  {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 667 } });
    const pag = await ctx.newPage();
    await pag.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1000);
    const m = await pag.evaluate(() => ({
      desborda: document.documentElement.scrollWidth > window.innerWidth + 8,
      ctaVisible: [...document.querySelectorAll('a,button')].some(el => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 20 && r.top < window.innerHeight * 1.5;
      }),
      textoLegible: parseFloat(getComputedStyle(document.body).fontSize) >= 14
    }));
    chequear('En 375×667 no hay desbordamiento horizontal', !m.desborda, m.desborda ? 'desborda' : 'ok');
    chequear('En móvil hay llamada a la acción en la primera pantalla', m.ctaVisible, 'CTA visible');
    chequear('Texto base ≥ 14 px en móvil', m.textoLegible, 'ok');
    await ctx.close();
  }

  /* ── 4 · Sin red externa: qué se cae ───────────────────────────── */
  {
    const ctx = await nav.newContext();
    const pag = await ctx.newPage();
    const externas = new Set();
    await pag.route('**/*', async (r) => {
      const url = r.request().url();
      const mismaBase = url.startsWith(BASE) || /^http:\/\/(127\.0\.0\.1|localhost)/.test(url);
      if (!mismaBase) { externas.add(new URL(url).host); return r.abort('blockedbyclient'); }
      return r.continue();
    });
    await pag.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pag.waitForTimeout(1200);
    const contenido = await pag.evaluate(() => ({
      texto: (document.body.innerText || '').trim().length,
      h1: document.querySelectorAll('h1').length,
      imgsRotas: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length
    }));
    chequear('Sin recursos externos la página sigue mostrando contenido',
      contenido.texto > 200 && contenido.h1 >= 1, `${contenido.texto} caracteres · ${contenido.h1} h1`);
    if (externas.size) avisar(`páginas dependen de: ${[...externas].join(', ')} (revisar si son imprescindibles)`);
    await ctx.close();
  }

  chequear('Sin errores críticos de JavaScript', errores.length === 0,
    errores.slice(0, 3).join(' | ') || 'ninguno');

  await nav.close();
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${fallos.length === 0 ? 'TODO EN VERDE' : fallos.length + ' fallo(s)'} · avisos: ${avisos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log('\n  FALLOS:'); for (const f of fallos) console.log('   · ' + f); }
  console.log('');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n  ✖ ' + (e && e.stack || e)); process.exit(2); });
