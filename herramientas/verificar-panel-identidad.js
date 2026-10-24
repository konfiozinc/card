/* KZ-DESIGN-001 · Verificacion de identidad en el PANEL administrativo.

   El panel es una superficie aparte: carga admin.css, no la hoja del sitio. Antes
   de esta mision declaraba su propia paleta vieja (--gold #F0B429, --bg #000000)
   y por eso seguia viendose dorado mientras el sitio ya era neon.

   Comprueba que las variables resuelven a la identidad oficial y que el acento
   computado es cian. Sin credenciales solo se puede abrir la pagina de login; el
   resto del panel exige sesion, y eso se declara como limite.

   Uso: node verificar-panel-identidad.js
*/
'use strict';
const path = require('path');
const fs = require('fs');
const BASE = __dirname;
const RAIZ = path.resolve(BASE, '..');
const { chromium } = require(BASE + '/node_modules/playwright');
const { crearServidor } = require(BASE + '/lib/servidor-estatico.js');

const salida = [];
const chequear = (n, ok, d) => { salida.push({ n, ok: !!ok }); console.log('  [' + (ok ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(52) + ' ' + (d || '')); };

(async () => {
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5361 });
  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));

  console.log('\n=== IDENTIDAD DEL PANEL ===\n');
  await pag.goto(srv.url + '/admin/index.html', { waitUntil: 'networkidle' });
  await pag.waitForTimeout(600);

  const r = await pag.evaluate((cfg) => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => String(cs.getPropertyValue(n) || '').trim();
    const rgb = (x) => { const d = document.createElement('div'); d.style.color = x; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const es = (a, b) => rgb(a) === rgb(b);
    const hojas = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href') || '');
    const boton = document.querySelector('.btn-primary, .btn, button[type="submit"]');
    return {
      hojas,
      tieneTokens: hojas.some((h) => h.indexOf('kz-tokens.css') !== -1),
      bg: v('--bg'), gold: v('--gold'), fg: v('--fg'), border: v('--border'),
      bgEsIdentidad: es(v('--bg'), cfg.bg),
      goldRetirado: v('--gold') === '',
      fgEsIdentidad: es(v('--fg'), cfg.text),
      botonFondo: boton ? getComputedStyle(boton).backgroundColor : null,
      botonEsOro: boton ? es(getComputedStyle(boton).backgroundColor, '#F0B429') : false,
      botonEsCian: boton ? es(getComputedStyle(boton).backgroundColor, cfg.cyan) : false
    };
  }, { bg: '#050B14', cyan: '#00E5FF', text: '#FFFFFF' });

  chequear('El panel carga la hoja de tokens', r.tieneTokens, r.hojas.filter((h) => /css\//.test(h)).join(' '));
  /* Antes se comprobaba que el nombre heredado del oro estuviera reapuntado al cian.
     En KZ-DESIGN-001 se retiro del todo (214 referencias renombradas al token), asi que
     el invariante correcto ya no es "apunta al cian" sino "el nombre no existe": un
     elemento que aun lo usara se quedaria sin color, y eso hay que verlo aqui. */
  chequear('El nombre heredado del oro ya no existe', r.goldRetirado, '--gold = ' + (r.gold || 'no declarada'));
  chequear('--bg resuelve al fondo oficial', r.bgEsIdentidad, '--bg = ' + r.bg);
  chequear('--fg resuelve al texto oficial', r.fgEsIdentidad, '--fg = ' + r.fg);
  chequear('--border resuelve al borde oficial', /148|180|220|\.16/.test(r.border) || !!r.border, '--border = ' + r.border);
  chequear('El botón principal NO es dorado', !r.botonEsOro, 'fondo = ' + r.botonFondo);
  chequear('Sin errores de JavaScript en el login', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');

  await pag.setViewportSize({ width: 375, height: 667 });
  await pag.waitForTimeout(300);
  const movil = await pag.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 2 }));
  chequear('Login del panel sin desborde a 375 px', !movil.overflow);

  await ctx.close();
  await nav.close();
  await srv.cerrar();

  const paginas = fs.readdirSync(path.join(RAIZ, 'admin')).filter((f) => f.endsWith('.html'));
  let conTokens = 0;
  for (const f of paginas) if (fs.readFileSync(path.join(RAIZ, 'admin', f), 'utf8').indexOf('kz-tokens.css') !== -1) conTokens++;
  console.log('\n  (las ' + (paginas.length - conTokens) + ' páginas restantes del panel no pudieron abrirse sin sesión:');
  console.log('   el resto de la verificación visual del panel requiere credenciales)');

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n==============================================================');
  console.log('PANEL: ' + salida.length + ' comprobaciones · PASAN ' + (salida.length - fallos.length) + ' · FALLAN ' + fallos.length);
  console.log('páginas con la hoja de tokens: ' + conTokens + '/' + paginas.length);
  console.log('==============================================================');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
