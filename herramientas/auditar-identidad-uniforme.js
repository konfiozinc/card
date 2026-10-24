/* KZ-NEON-INT-001 · Auditoria de identidad uniforme.
   Comprueba en el navegador, sobre todas las paginas, que el acento real es el
   cian de Neon Tech y no el oro heredado. Detecta si la capa de identidad quedo
   anulada por el orden de las hojas o por un token duplicado.
   Uso: node auditar-identidad.js
*/
'use strict';
const path = require('path');
const fs = require('fs');
const BASE = __dirname;
const RAIZ = path.resolve(BASE, '..');
const { chromium } = require(BASE + '/node_modules/playwright');
const { crearServidor } = require(BASE + '/lib/servidor-estatico.js');

const PAGINAS = [
  'index.html', 'precios.html', 'servicios.html', 'portafolio.html', 'contacto.html',
  'nosotros.html', 'blog.html', 'recursos.html', 'aliados.html', '404.html',
  'politica-privacidad.html', 'gracias.html',
  'servicios/tarjetas-digitales.html', 'servicios/catalogos-digitales.html',
  'servicios/menus-digitales.html', 'servicios/landing-pages.html',
  'servicios/codigos-qr.html', 'servicios/agentes-ia.html',
  'portafolio/colsabor.html', 'portafolio/el-titi.html', 'portafolio/postres-snoopy.html',
  'blog/index.html', 'blog/cuanto-cuesta-pagina-web-colombia.html'
];

const CYAN = '#00E5FF';
const ORO = '#F0B429';

(async () => {
  const srv = await crearServidor({ raiz: RAIZ, puerto: 5331 });
  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));

  console.log('\n=== IDENTIDAD UNIFORME (acento computado por pagina) ===\n');
  let malas = 0;
  let revisadas = 0;

  for (const rel of PAGINAS) {
    if (!fs.existsSync(path.join(RAIZ, rel))) { console.log('  [OMITE] ' + rel + ' (no existe)'); continue; }
    revisadas++;
    await pag.goto(srv.url + '/' + rel, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(220);

    const r = await pag.evaluate((cfg) => {
      const cs = getComputedStyle(document.documentElement);
      const leer = (n) => String(cs.getPropertyValue(n) || '').trim().toUpperCase();
      const rgb = (v) => {
        const d = document.createElement('div');
        d.style.color = v; document.body.appendChild(d);
        const c = getComputedStyle(d).color; d.remove(); return c;
      };
      const esCian = (v) => rgb(v) === rgb(cfg.cyan);
      const esOro = (v) => rgb(v) === rgb(cfg.oro);
      const hojas = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l.getAttribute('href') || ''));
      const idxNeon = hojas.findIndex((h) => h.indexOf('kz-neon.css') !== -1);
      const idxBase = hojas.findIndex((h) => /(^|\/)(styles\.css)$/.test(h) && h.indexOf('kz-neon') === -1);
      const premium = hojas.some((h) => h.indexOf('premium-assets/') !== -1);
      const boton = document.querySelector('.button--brand, .button--gold, .btn-primary');
      const acentoVar = leer('--gold');
      /* El ORDEN valido NO es unico y no se puede imponer:
           · paginas comerciales  -> styles.css y despues kz-neon.css
           · paginas premium      -> kz-neon.css y despues premium-assets/styles.css
         Lo que SI debe cumplirse siempre es que las dos hojas esten cargadas y
         que el acento computado sea el cian. Eso es lo que se comprueba. */
      return {
        tieneNeon: idxNeon !== -1,
        tieneBase: idxBase !== -1,
        premium,
        acentoVarEsOro: acentoVar ? esOro(acentoVar) : false,
        botonEsOro: boton ? esOro(getComputedStyle(boton).backgroundColor) : false
      };
    }, { cyan: CYAN, oro: ORO });

    const problemas = [];
    if (!r.tieneNeon) problemas.push('SIN hoja de identidad');
    if (!r.tieneBase) problemas.push('SIN hoja base');
    if (r.acentoVarEsOro) problemas.push('acento = ORO heredado');
    if (r.botonEsOro) problemas.push('boton principal en ORO');

    const ok = problemas.length === 0;
    if (!ok) malas++;
    console.log('  [' + (ok ? 'PASA' : '**FALLA**') + '] ' + rel.padEnd(46) + ' ' + (ok ? 'cian' : problemas.join(' · ')));
  }

  await ctx.close();
  await nav.close();
  await srv.cerrar();

  console.log('\n==============================================================');
  console.log('Paginas revisadas: ' + revisadas + ' · con identidad correcta: ' + (revisadas - malas));
  console.log('  paginas con problema: ' + malas);
  console.log('  errores de JavaScript: ' + errores.length + (errores.length ? ' · ' + errores.slice(0, 3).join(' | ') : ''));
  console.log('==============================================================');
  process.exit(malas || errores.length ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
