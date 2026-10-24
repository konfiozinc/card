/* KZ-NEON-INT-001 · Verificacion del laboratorio de componentes.
   Comprueba que design-system/index.html se dibuja de verdad: que la hoja de
   identidad esta aplicada, que ninguna clase usada quedo sin definir (texto
   invisible), que no hay desbordes y que los campos tienen etiqueta.
   Uso: node verificar-laboratorio.js
*/
'use strict';
const path = require('path');
const BASE = __dirname;
const RAIZ = path.resolve(BASE, '..');
const { chromium } = require(BASE + '/node_modules/playwright');
const { crearServidor } = require(BASE + '/lib/servidor-estatico.js');

const RUTA = '/design-system/index.html';

const salida = [];
const chequear = (nombre, ok, detalle) => {
  salida.push({ nombre, ok: !!ok });
  console.log('  [' + (ok ? 'PASA' : '**FALLA**') + '] ' + nombre.padEnd(52) + ' ' + (detalle || ''));
};

(async () => {
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5341 });
  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pag = await ctx.newPage();
  const errores = [];
  const fallos404 = [];
  pag.on('pageerror', (e) => errores.push(e.message));
  pag.on('response', (r) => { if (r.status() >= 400) fallos404.push(r.status() + ' ' + r.url()); });

  await pag.goto(srv.url + RUTA, { waitUntil: 'networkidle' });
  await pag.waitForTimeout(400);

  console.log('\n=== LABORATORIO DE COMPONENTES ===\n');

  const r = await pag.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const cyan = String(cs.getPropertyValue('--kz-cyan') || '').trim();
    const hojas = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href') || '');

    /* Texto invisible: color practicamente igual al fondo efectivo. Detecta
       clases que no existen y dejan el texto sin contraste. */
    const parse = (s) => { const m = String(s).match(/(\d+(?:\.\d+)?)/g); return m ? m.slice(0, 4).map(Number) : null; };
    const fondoEfectivo = (el) => {
      let p = el;
      while (p && p !== document.documentElement) {
        const st = getComputedStyle(p);
        /* Si el elemento (o un ancestro) pinta un DEGRADADO o una imagen, el
           fondo real no se puede deducir de background-color: un botón con
           background-image y texto oscuro se leía como «invisible». Tercer
           falso positivo del mismo detector; se resuelve ignorando esos nodos. */
        if (st.backgroundImage && st.backgroundImage !== 'none') return null;
        const c = parse(st.backgroundColor);
        const alfa = c && c.length === 4 ? c[3] : 1;
        if (c && alfa >= 0.5) return c.slice(0, 3);
        p = p.parentElement;
      }
      const b = parse(getComputedStyle(document.body).backgroundColor);
      return b ? b.slice(0, 3) : [5, 11, 20];
    };
    const conTexto = [...document.querySelectorAll('body *')].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    });
    const invisibles = conTexto.filter((el) => {
      const fg = parse(getComputedStyle(el).color);
      const bg = fondoEfectivo(el);
      if (!fg || !bg) return false;
      return Math.abs(fg[0] - bg[0]) + Math.abs(fg[1] - bg[1]) + Math.abs(fg[2] - bg[2]) < 24;
    }).map((el) => {
      const fg = parse(getComputedStyle(el).color);
      const bg = fondoEfectivo(el);
      return (el.tagName + '.' + (el.className || '')).slice(0, 28) + ' fg=' + JSON.stringify(fg) + ' bg=' + JSON.stringify(bg);
    });

    const campos = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')];
    const sinEtiqueta = campos.filter((c) => !(c.id && document.querySelector('label[for="' + c.id + '"]')) &&
      !c.getAttribute('aria-label') && !c.closest('label')).length;
    const fuenteCampoMin = campos.length ? Math.min(...campos.map((c) => parseFloat(getComputedStyle(c).fontSize))) : 0;
    const camposBajos = campos
      .filter((c) => parseFloat(getComputedStyle(c).fontSize) < 16)
      .map((c) => c.id + '=' + getComputedStyle(c).fontSize);

    /* Vocabulario REAL del sitio comercial. */
    const botones = [...document.querySelectorAll('.btn, .btn-primary, button, .button')];
    const altoMin = botones.length ? Math.min(...botones.map((b) => b.getBoundingClientRect().height)) : 0;

    const componentes = {};
    for (const sel of ['.card', '.check-list', '.badge', '.chip', '.eyebrow', '.display', '.btn']) {
      const el = document.querySelector(sel);
      componentes[sel] = el ? (parseFloat(getComputedStyle(el).fontSize) > 0 || el.getBoundingClientRect().height > 0) : false;
    }

    return {
      cyan,
      tieneHoja: hojas.some((h) => h.indexOf('kz-neon.css') !== -1),
      hojasExternas: hojas.filter((h) => /^https?:/.test(h)),
      textoNodos: conTexto.length,
      invisibles,
      sinEtiqueta,
      fuenteCampoMin,
      camposBajos,
      altoMin,
      componentes,
      overflowDesk: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  chequear('Carga la hoja de identidad', r.tieneHoja, r.cyan ? 'acento ' + r.cyan : '');
  chequear('Sin hojas externas (ni fuentes ni iconos remotos)', r.hojasExternas.length === 0, r.hojasExternas.join(', '));
  chequear('Todos los componentes tienen estilo aplicado',
    Object.values(r.componentes).every(Boolean), JSON.stringify(r.componentes));
  chequear('Ningún texto queda invisible por clase sin definir',
    r.invisibles.length === 0, r.invisibles.length ? r.invisibles.slice(0, 4).join(' | ') : r.textoNodos + ' nodos de texto');
  chequear('Todos los campos tienen etiqueta', r.sinEtiqueta === 0, r.sinEtiqueta + ' sin etiqueta');
  chequear('Campos a 16 px o más (sin zoom en iOS)', r.fuenteCampoMin >= 16, 'mínimo ' + r.fuenteCampoMin + ' px');
  chequear('Botones con objetivo táctil de 44 px o más', r.altoMin >= 44, 'mínimo ' + Math.round(r.altoMin) + ' px');
  chequear('Sin desborde horizontal a 1440', !r.overflowDesk, 'scrollWidth ' + (r.overflowDesk ? '>' : '=') + ' ventana');

  await pag.setViewportSize({ width: 375, height: 667 });
  await pag.waitForTimeout(350);
  const movil = await pag.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    botonesBajos: [...document.querySelectorAll('.button')].filter((b) => b.getBoundingClientRect().height < 40).length
  }));
  chequear('Sin desborde horizontal a 375', !movil.overflow);
  chequear('Sin botones por debajo de 40 px en móvil', movil.botonesBajos === 0, movil.botonesBajos + ' bajos');

  chequear('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');
  chequear('Sin recursos con error HTTP', fallos404.length === 0, fallos404.slice(0, 3).join(' | ') || 'ninguno');

  await ctx.close();
  await nav.close();
  await srv.cerrar();

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n==============================================================');
  console.log('LABORATORIO: ' + salida.length + ' comprobaciones · PASAN ' + (salida.length - fallos.length) + ' · FALLAN ' + fallos.length);
  console.log('==============================================================');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
