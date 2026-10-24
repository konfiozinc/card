'use strict';
/* KZ-DESIGN-001 · Certificacion de PRODUCCION de la identidad Neon Tech.
   Mide el sitio REAL (https://konfiozinc.github.io/card), no el local.
   Uso: node test/certificar-produccion-neon.js
*/
const path = require('path');
const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);

const BASE = 'https://konfiozinc.github.io/card';
const PAGINAS = [
  { ruta: '/index.html', nombre: 'Portada' },
  { ruta: '/servicios.html', nombre: 'Servicios' },
  { ruta: '/precios.html', nombre: 'Precios' },
  { ruta: '/portafolio.html', nombre: 'Portafolio' },
  { ruta: '/blog.html', nombre: 'Blog' },
  { ruta: '/contacto.html', nombre: 'Contacto' }
];
const PANEL = ['/admin.html', '/panel.html', '/admin/servicios.html', '/admin/contactos.html'];

const res = [];
const ok = (n, v, d) => { res.push({ n, v: !!v, d: d || '' }); console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(58) + ' ' + (d || '')); };
const seccion = (t) => console.log('\n' + t);

const CAZA = `(() => {
  const RGB_ORO = [240, 180, 41];
  const esOro = (s) => { if (!s) return false; const m = s.match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/); return !!m && +m[1] === 240 && +m[2] === 180 && +m[3] === 41; };
  const props = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
  let hallazgos = 0; const muestra = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    for (const p of props) { if (esOro(cs[p])) { hallazgos++; if (muestra.length < 4) muestra.push(el.tagName + '.' + String(el.className).slice(0, 28) + ' ' + p + '=' + cs[p]); } }
  }
  return { hallazgos, muestra };
})()`;

(async () => {
  const nav = await chromium.launch({ headless: true });

  for (const vp of [{ etiqueta: 'ESCRITORIO', width: 1440, height: 900 }, { etiqueta: 'MOVIL', width: 375, height: 667 }]) {
    seccion('=== ' + vp.etiqueta + ' (' + vp.width + 'x' + vp.height + ') · SITIO PUBLICO ===');
    const ctx = await nav.newContext({ viewport: { width: vp.width, height: vp.height }, bypassCSP: true });
    const pag = await ctx.newPage();
    let errores = [];
    pag.on('pageerror', (e) => errores.push(e.message));
    pag.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR_BLOCKED|blocked by CORS/i.test(m.text())) errores.push('console: ' + m.text().slice(0, 90)); });

    for (const p of PAGINAS) {
      errores = [];
      const r = await pag.goto(BASE + p.ruta + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
      if (!r || r.status() !== 200) { ok(p.nombre + ' · HTTP 200', false, r ? String(r.status()) : 'sin respuesta'); continue; }
      await pag.waitForTimeout(900);

      const m = await pag.evaluate((caza) => {
        const h1 = document.querySelector('h1');
        const csH1 = h1 ? getComputedStyle(h1) : null;
        const raiz = getComputedStyle(document.documentElement);
        const nav = document.querySelector('#nav-principal, nav');
        const enlaces = nav ? [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter(Boolean) : [];
        const desborde = document.documentElement.scrollWidth - window.innerWidth;
        const chat = document.querySelector('.kzFabWrapper, [class*=kzFab], .kz-chat, .wa-float');
        const toggle = document.querySelector('.menu-toggle, [aria-controls]');
        let bloqueados = 0;
        if (chat) {
          const f = chat.getBoundingClientRect();
          for (const el of document.querySelectorAll('a[href],button,input,select,textarea')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const b = el.getBoundingClientRect();
            if (b.width < 8 || b.height < 8 || b.top > window.innerHeight) continue;
            if (chat.contains(el) || el.contains(chat)) continue;
            const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            if (cx >= f.left && cx <= f.right && cy >= f.top && cy <= f.bottom) bloqueados++;
          }
        }
        const chicos = [...document.querySelectorAll('a[href],button')].filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0 || b.top > window.innerHeight) return false;
          if (el.closest('nav, header')) return false;
          return b.height > 0 && b.height < 24;
        }).length;
        return {
          titulo: document.title,
          fuenteH1: csH1 ? csH1.fontFamily : null,
          tamH1: csH1 ? csH1.fontSize : null,
          acento: raiz.getPropertyValue('--kz-cyan').trim(),
          oroVar: raiz.getPropertyValue('--gold').trim(),
          fondo: raiz.getPropertyValue('--kz-bg').trim(),
          enlaces, desborde, bloqueados, chicos,
          tieneChat: !!chat, tieneToggle: !!toggle,
          orbitron: document.fonts.check('700 24px Orbitron'),
          cazaOro: (function () {
            const props = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
            let hallazgos = 0; const muestra = [];
            for (const el of document.querySelectorAll('*')) {
              const cs = getComputedStyle(el);
              for (const pr of props) {
                const v = cs[pr]; if (!v) continue;
                const mm = v.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
                if (mm && +mm[1] === 240 && +mm[2] === 180 && +mm[3] === 41) { hallazgos++; if (muestra.length < 4) muestra.push(el.tagName + '.' + String(el.className).slice(0, 24) + ' ' + pr); }
              }
            }
            return { hallazgos, muestra };
          })()
        };
      }, CAZA).catch((e) => ({ error: e.message }));

      if (m.error) { ok(p.nombre + ' · medicion', false, m.error); continue; }
      const fallos = [];
      if (!/Orbitron/.test(m.fuenteH1 || '')) fallos.push('fuente=' + m.fuenteH1);
      if (m.oroVar && m.oroVar.length) fallos.push('--gold=' + m.oroVar);
      if (m.cazaOro.hallazgos > 0) fallos.push('oro:' + m.cazaOro.muestra.join(','));
      if (m.desborde > 2) fallos.push('desborde=' + m.desborde + 'px');
      if (m.bloqueados > 0) fallos.push('flotante bloquea ' + m.bloqueados);
      if (errores.length) fallos.push('JS: ' + errores.slice(0, 2).join(' | '));
      ok(p.nombre + ' · identidad y maqueta', fallos.length === 0,
        (m.titulo || '').slice(0, 30) + ' · h1 ' + m.tamH1 + ' · desborde ' + m.desborde + 'px · oro ' + m.cazaOro.hallazgos + ' · bloqueos ' + m.bloqueados + (fallos.length ? ' << ' + fallos.join(' ; ') : ''));

      /* Enlaces internos reales */
      const internos = m.enlaces.filter((h) => h && !h.startsWith('http') && !h.startsWith('#') && !h.startsWith('mailto') && !h.startsWith('tel'));
      let rotos = [];
      for (const h of [...new Set(internos)]) {
        const u = new URL(h, BASE + '/').href;
        const rr = await pag.request.get(u, { timeout: 30000 }).catch(() => null);
        if (!rr || rr.status() >= 400) rotos.push(h + '->' + (rr ? rr.status() : 'err'));
      }
      ok(p.nombre + ' · rutas internas de la navegacion', rotos.length === 0, internos.length + ' enlaces' + (rotos.length ? ' · rotos: ' + rotos.join(',') : ''));
      ok(p.nombre + ' · Orbitron disponible', m.orbitron, 'fonts.check=' + m.orbitron);
    }
    await ctx.close();
  }

  /* Panel y Card Spark: solo lectura visual, sin credenciales ni escrituras. */
  seccion('=== PANEL Y CARD SPARK (produccion, sin datos) ===');
  const ctxP = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pagP = await ctxP.newPage();
  for (const ruta of PANEL) {
    let errs = [];
    pagP.removeAllListeners('pageerror');
    pagP.on('pageerror', (e) => errs.push(e.message));
    const r = await pagP.goto(BASE + ruta + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
    if (!r || r.status() !== 200) { ok('Panel ' + ruta + ' · HTTP 200', false, r ? String(r.status()) : 'sin respuesta'); continue; }
    await pagP.waitForTimeout(700);
    const info = await pagP.evaluate(() => ({
      titulo: document.title,
      tokens: [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => (l.getAttribute('href') || '').includes('kz-tokens.css')),
      oro: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
      acento: getComputedStyle(document.documentElement).getPropertyValue('--kz-cyan').trim(),
      login: !!document.querySelector('input[type="password"], input[type="email"], #login, form')
    }));
    /* Todo modulo del panel hace `await requireAuth()` y lanza 'Sin acceso' cuando no
       hay sesion: es la proteccion funcionando, no un fallo. Sin credenciales, lo correcto
       es acabar en la pantalla de acceso con ese unico aviso. Cualquier OTRO error si cuenta. */
    const guardado = /Acceso/i.test(info.titulo || '');
    const ajenos = errs.filter((e) => !/Sin acceso/.test(e));
    ok('Panel ' + ruta + ' · carga, identidad y proteccion',
      info.tokens && !info.oro && ajenos.length === 0 && (info.login || guardado),
      (info.titulo || '').slice(0, 30) + ' · tokens=' + info.tokens + ' · --gold=' + (info.oro || 'no declarada') +
      ' · ' + (guardado ? 'protegido sin sesion (correcto)' : 'con sesion') +
      (ajenos.length ? ' · JS: ' + ajenos[0].slice(0, 60) : ''));
  }
  await ctxP.close();

  await nav.close();
  const fallos = res.filter((x) => !x.v);
  seccion('==============================================================');
  console.log('CERTIFICACION PRODUCCION: ' + res.length + ' comprobaciones · PASAN ' + (res.length - fallos.length) + ' · FALLAN ' + fallos.length);
  if (fallos.length) fallos.forEach((f) => console.log('  FALLA: ' + f.n + ' · ' + f.d));
  seccion('==============================================================');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
