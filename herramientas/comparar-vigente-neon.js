/* KZ-NEXT-001 · Comparación medida entre la web vigente y Neon Tech.

   Levanta cada versión en su propio servidor estático y mide en el navegador:
   legibilidad, navegación, rendimiento, accesibilidad, experiencia móvil y
   claridad comercial. Son medidas del DOM y del rendimiento real, no impresiones
   sobre capturas.

   NOTA DE HONESTIDAD SOBRE EL CONTRASTE
   El contraste calculado desde getComputedStyle NO es fiable aquí: con fondos
   degradados, imágenes de fondo y textos con background-clip, el color de fondo
   efectivo no se deduce del DOM y el muestreo devuelve 1:1 (texto y fondo
   iguales). Por eso el contraste se informa como "no concluyente" y NO entra en
   el veredicto. Lo mide verificar-neon.js fotografiando píxeles reales del
   render (WCAG 2.1 sobre 26 muestras).

   Uso: node comparar-vigente-neon.js --a <dir-version-vigente> --b <dir-neon>
*/
'use strict';
const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const A_DIR = argVal('--a', '');
const B_DIR = argVal('--b', '');
if (!A_DIR || !B_DIR) { console.error('Uso: --a <dir-version-vigente> --b <dir-neon>'); process.exit(2); }

const BASE = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/herramientas';
const { chromium } = require(BASE + '/node_modules/playwright');
const { crearServidor } = require(BASE + '/lib/servidor-estatico.js');

const PAGINAS = [
  ['portada', 'index.html'],
  ['precios', 'precios.html'],
  ['servicios', 'servicios.html'],
  ['portafolio', 'portafolio.html'],
  ['contacto', 'contacto.html']
];

/* Se ejecuta dentro de la página. Debe ser autocontenida. */
function medir() {
  const visibles = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1;
  });
  const texto = visibles.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2));
  const tamanos = texto.map((el) => parseFloat(getComputedStyle(el).fontSize)).filter(Boolean);

  const navLinks = document.querySelectorAll('header a, nav a').length;
  const skip = !!document.querySelector('.skip-link, a[href^="#"][class*="skip"]');
  const focusables = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length;

  const imgsSinAlt = [...document.images].filter((i) => !i.hasAttribute('alt')).length;
  const inputsSinEtiqueta = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')].filter((c) => {
    if (c.id === 'website') return false;
    if (c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')) return false;
    if (c.closest('label')) return false;
    return !(c.id && document.querySelector('label[for="' + c.id + '"]'));
  }).length;
  const botonesSinNombre = [...document.querySelectorAll('button')].filter((b) =>
    !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length;
  const h1 = document.querySelectorAll('h1').length;
  const landmarks = document.querySelectorAll('header, nav, main, footer, [role="main"], [role="navigation"]').length;

  /* Objetivos táctiles REALES: botones y enlaces con forma de botón.
     Un enlace dentro de un párrafo es texto, no un objetivo táctil. */
  const touch = [...document.querySelectorAll('button, .button, .btn, [role="button"], .nav > a, .chip')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return r.height < 40;
  }).length;
  const inputsZoom = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')]
    .filter((c) => parseFloat(getComputedStyle(c).fontSize) < 16).length;

  const t = document.body.innerText || '';
  let reglas = 0;
  for (const s of document.styleSheets) { try { reglas += s.cssRules.length; } catch (e) {} }

  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    textoNodos: texto.length,
    fuenteMinima: tamanos.length ? Math.min(...tamanos) : 0,
    pequenos14: tamanos.filter((x) => x < 14).length,
    navLinks, skip, focusables,
    imgsSinAlt, inputsSinEtiqueta, botonesSinNombre, h1, landmarks,
    touch, inputsZoom,
    precios: {
      basica: /49[.,]900/.test(t),
      pro: /99[.,]900/.test(t),
      retirado: /149[.,]900/.test(t)
    },
    ctas: document.querySelectorAll('.button, .btn, button[type="submit"], a[class*="cta"]').length,
    nodos: document.querySelectorAll('*').length,
    reglasCss: reglas
  };
}

async function medirVersion(nav, dir, puerto) {
  const srv = await crearServidor({ raiz: dir, puerto });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const pag = await ctx.newPage();
  const res = {};
  for (const [etiqueta, archivo] of PAGINAS) {
    let peticiones = 0;
    const contar = () => { peticiones++; };
    pag.on('response', contar);
    const t0 = Date.now();
    await pag.goto(srv.url + '/' + archivo, { waitUntil: 'networkidle' });
    const cargaMs = Date.now() - t0;
    const desk = await pag.evaluate(medir);
    pag.off('response', contar);

    await pag.setViewportSize({ width: 375, height: 667 });
    await pag.waitForTimeout(450);
    const movil = await pag.evaluate(medir);
    await pag.setViewportSize({ width: 1440, height: 900 });

    res[etiqueta] = { desk, movil, peticiones, cargaMs };
  }
  await ctx.close();
  await srv.cerrar();
  return res;
}

(async () => {
  const nav = await chromium.launch({ headless: true });
  console.log('\n=== COMPARACION MEDIDA - web vigente vs Neon Tech ===\n');
  console.log('  midiendo version vigente...');
  const A = await medirVersion(nav, A_DIR, 5321);
  console.log('  midiendo Neon Tech...');
  const B = await medirVersion(nav, B_DIR, 5322);
  await nav.close();

  const filas = [];
  const push = (eje, metrica, a, b, mejor) => filas.push({ eje, metrica, a, b, mejor });
  const cmp = (a, b, menorEsMejor) => {
    if (a === b) return 'igual';
    return (menorEsMejor ? a < b : a > b) ? 'vigente' : 'neon';
  };
  const siNo = (a, b, favorNeonCuandoSi) => {
    if (a === b) return 'igual';
    if (favorNeonCuandoSi) return b ? 'neon' : 'vigente';
    return b ? 'vigente' : 'neon';
  };

  for (const [etiqueta] of PAGINAS) {
    const a = A[etiqueta], b = B[etiqueta];

    push('LEGIBILIDAD - ' + etiqueta, 'fuente minima (px)', a.desk.fuenteMinima, b.desk.fuenteMinima, cmp(a.desk.fuenteMinima, b.desk.fuenteMinima, false));
    push('LEGIBILIDAD - ' + etiqueta, 'textos menores de 14 px', a.desk.pequenos14, b.desk.pequenos14, cmp(a.desk.pequenos14, b.desk.pequenos14, true));
    push('LEGIBILIDAD - ' + etiqueta, 'contraste (lo mide verificar-neon)', 'n/d', 'n/d', 'no concluyente');

    push('NAVEGACION - ' + etiqueta, 'enlaces en cabecera', a.desk.navLinks, b.desk.navLinks, cmp(a.desk.navLinks, b.desk.navLinks, false));
    push('NAVEGACION - ' + etiqueta, 'elementos enfocables', a.desk.focusables, b.desk.focusables, cmp(a.desk.focusables, b.desk.focusables, false));
    push('NAVEGACION - ' + etiqueta, 'salto al contenido', a.desk.skip ? 'si' : 'no', b.desk.skip ? 'si' : 'no', siNo(a.desk.skip, b.desk.skip, true));

    push('RENDIMIENTO - ' + etiqueta, 'nodos del DOM', a.desk.nodos, b.desk.nodos, cmp(a.desk.nodos, b.desk.nodos, true));
    push('RENDIMIENTO - ' + etiqueta, 'reglas CSS', a.desk.reglasCss, b.desk.reglasCss, cmp(a.desk.reglasCss, b.desk.reglasCss, true));
    push('RENDIMIENTO - ' + etiqueta, 'peticiones', a.peticiones, b.peticiones, cmp(a.peticiones, b.peticiones, true));
    push('RENDIMIENTO - ' + etiqueta, 'carga (ms)', a.cargaMs, b.cargaMs, cmp(a.cargaMs, b.cargaMs, true));

    push('ACCESIBILIDAD - ' + etiqueta, 'imagenes sin alt', a.desk.imgsSinAlt, b.desk.imgsSinAlt, cmp(a.desk.imgsSinAlt, b.desk.imgsSinAlt, true));
    push('ACCESIBILIDAD - ' + etiqueta, 'campos sin etiqueta', a.desk.inputsSinEtiqueta, b.desk.inputsSinEtiqueta, cmp(a.desk.inputsSinEtiqueta, b.desk.inputsSinEtiqueta, true));
    push('ACCESIBILIDAD - ' + etiqueta, 'botones sin nombre', a.desk.botonesSinNombre, b.desk.botonesSinNombre, cmp(a.desk.botonesSinNombre, b.desk.botonesSinNombre, true));
    push('ACCESIBILIDAD - ' + etiqueta, 'h1 en la pagina', a.desk.h1, b.desk.h1, cmp(Math.abs(a.desk.h1 - 1), Math.abs(b.desk.h1 - 1), true));
    push('ACCESIBILIDAD - ' + etiqueta, 'landmarks', a.desk.landmarks, b.desk.landmarks, cmp(a.desk.landmarks, b.desk.landmarks, false));

    push('MOVIL - ' + etiqueta, 'desborde a 375px', a.movil.overflow ? 'SI' : 'no', b.movil.overflow ? 'SI' : 'no', siNo(a.movil.overflow, b.movil.overflow, false));
    push('MOVIL - ' + etiqueta, 'controles menores de 40 px', a.movil.touch, b.movil.touch, cmp(a.movil.touch, b.movil.touch, true));
    push('MOVIL - ' + etiqueta, 'campos que provocan zoom iOS', a.movil.inputsZoom, b.movil.inputsZoom, cmp(a.movil.inputsZoom, b.movil.inputsZoom, true));
    push('MOVIL - ' + etiqueta, 'fuente minima a 375px', a.movil.fuenteMinima, b.movil.fuenteMinima, cmp(a.movil.fuenteMinima, b.movil.fuenteMinima, false));

    push('COMERCIAL - ' + etiqueta, 'muestra $49.900', a.desk.precios.basica ? 'si' : 'no', b.desk.precios.basica ? 'si' : 'no', siNo(a.desk.precios.basica, b.desk.precios.basica, true));
    push('COMERCIAL - ' + etiqueta, 'muestra $99.900', a.desk.precios.pro ? 'si' : 'no', b.desk.precios.pro ? 'si' : 'no', siNo(a.desk.precios.pro, b.desk.precios.pro, true));
    push('COMERCIAL - ' + etiqueta, 'anuncia $149.900 (retirado)', a.desk.precios.retirado ? 'SI' : 'no', b.desk.precios.retirado ? 'SI' : 'no', siNo(a.desk.precios.retirado, b.desk.precios.retirado, false));
    push('COMERCIAL - ' + etiqueta, 'llamadas a la accion', a.desk.ctas, b.desk.ctas, cmp(a.desk.ctas, b.desk.ctas, false));
  }

  let ejeActual = '';
  for (const f of filas) {
    if (f.eje !== ejeActual) { ejeActual = f.eje; console.log('\n' + ejeActual); }
    console.log('   ' + f.metrica.padEnd(34) + 'vigente: ' + String(f.a).padEnd(8) + ' neon: ' + String(f.b).padEnd(8) + ' -> ' + f.mejor);
  }

  const cuenta = { neon: 0, vigente: 0, igual: 0, 'no concluyente': 0 };
  filas.forEach((f) => { cuenta[f.mejor] = (cuenta[f.mejor] || 0) + 1; });

  const desbordesNeon = filas.filter((f) => f.eje.indexOf('MOVIL') === 0 && /desborde/.test(f.metrica) && f.b === 'SI').length;
  const retiradosNeon = filas.filter((f) => /149/.test(f.metrica) && f.b === 'SI').length;
  const faltanPrecios = filas.filter((f) => /muestra \$/.test(f.metrica) && f.b === 'no' && f.a === 'si').length;
  const camposNeon = filas.filter((f) => /campos sin etiqueta/.test(f.metrica) && f.b > 0).length;

  console.log('\n==============================================================');
  console.log('Metricas medidas: ' + filas.length + '  (contraste fuera del veredicto)');
  console.log('  gana Neon Tech : ' + cuenta.neon);
  console.log('  gana vigente   : ' + cuenta.vigente);
  console.log('  iguales        : ' + cuenta.igual);
  console.log('\nBLOQUEANTES DE NEON TECH');
  console.log('  desbordes moviles            : ' + desbordesNeon);
  console.log('  precios retirados anunciados : ' + retiradosNeon);
  console.log('  pierde un precio oficial     : ' + faltanPrecios);
  console.log('  paginas con campos sin label : ' + camposNeon);
  console.log('==============================================================');
  process.exit((desbordesNeon || retiradosNeon || faltanPrecios || camposNeon) ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
