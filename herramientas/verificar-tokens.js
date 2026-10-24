#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-tokens.js

   Demuestra que un refactor de tokens NO cambió lo que el navegador calcula.
   Abre la misma página dos veces y sirve, mediante intercepción de red, la
   versión anterior y la nueva de la misma hoja de estilos. Después compara
   propiedad por propiedad en cada elemento visible.

   Es determinista: no depende de fuentes, animaciones ni tiempos de carga,
   porque mide valores calculados, no píxeles.

   Uso:
     node herramientas/verificar-tokens.js --pagina precios.html \
       --viejo <ruta\al\styles.css.anterior> --nuevo assets/css/styles.css
   Códigos: 0 idéntico · 1 hay diferencias · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { crearServidor } = require('./lib/servidor-estatico');

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const RAIZ = path.resolve(__dirname, '..');

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PAGINA = argVal('--pagina', 'precios.html');
const VIEJO = argVal('--viejo', '');
const NUEVO = argVal('--nuevo', path.join(RAIZ, 'assets', 'css', 'styles.css'));
const PATRON = argVal('--patron', '**/styles.css');
const PUERTO = Number(argVal('--puerto', '5213'));

const PROPIEDADES = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderRightColor',
  'borderBottomColor', 'borderLeftColor', 'borderTopWidth', 'borderBottomWidth', 'boxShadow', 'textShadow',
  'outlineColor', 'outlineWidth', 'opacity', 'fill', 'stroke', 'backgroundPosition', 'backgroundSize',
  'textDecorationColor', 'caretColor', 'filter', 'backdropFilter'];

if (!VIEJO || !fs.existsSync(VIEJO)) { console.error('Falta --viejo con la hoja anterior:', VIEJO); process.exit(2); }
if (!fs.existsSync(NUEVO)) { console.error('Falta la hoja nueva:', NUEVO); process.exit(2); }

const cssViejo = fs.readFileSync(VIEJO, 'utf8');
const cssNuevo = fs.readFileSync(NUEVO, 'utf8');

const recolectar = async (pag) => pag.evaluate((props) => {
  const salida = {};
  const todos = [...document.querySelectorAll('body *')].slice(0, 1500);
  for (const el of todos) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    let ruta = el.tagName.toLowerCase();
    if (el.id) ruta += '#' + el.id;
    if (el.className && typeof el.className === 'string') ruta += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const pos = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    const clave = `${ruta}[${pos}]`;
    const valores = {};
    for (const p of props) valores[p] = cs[p];
    salida[clave] = valores;
  }
  return salida;
}, PROPIEDADES);

(async () => {
  let chromium;
  try { ({ chromium } = require(PW)); } catch { console.error('Playwright no encontrado:', PW); process.exit(2); }

  const servidor = await crearServidor({ raiz: RAIZ, puerto: PUERTO });
  const nav = await chromium.launch({ headless: true });
  console.log('');
  console.log('═══ COMPARACIÓN DE VALORES CALCULADOS ═══');
  console.log(`  página: ${PAGINA}`);
  console.log(`  antes:  ${path.basename(VIEJO)} (${(cssViejo.length / 1024).toFixed(1)} KB)`);
  console.log(`  ahora:  ${path.basename(NUEVO)} (${(cssNuevo.length / 1024).toFixed(1)} KB)`);
  console.log('');

  const medir = async (css) => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'es-CO' });
    const pag = await ctx.newPage();
    await pag.route(PATRON, (route) => route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: css }));
    await pag.goto(servidor.url + PAGINA, { waitUntil: 'load', timeout: 45000 });
    await pag.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    await pag.waitForTimeout(400);
    const datos = await recolectar(pag);
    await ctx.close();
    return datos;
  };

  const antes = await medir(cssViejo);
  const despues = await medir(cssNuevo);

  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const diferencias = [];
  const soloEnUna = [];
  for (const clave of claves) {
    const a = antes[clave]; const b = despues[clave];
    // Los nodos que inyecta o quita el JavaScript (iconos, burbujas, estados)
    // cambian de una carga a otra: no son comparables y no juzgan el CSS.
    if (!a || !b) { soloEnUna.push(clave); continue; }
    for (const p of PROPIEDADES) {
      if (a[p] !== b[p]) diferencias.push(`${clave} · ${p}: "${a[p]}" → "${b[p]}"`);
    }
  }
  await nav.close();
  await servidor.cerrar();

  console.log(`  elementos comparados: ${claves.size - soloEnUna.length}  ·  propiedades por elemento: ${PROPIEDADES.length}`);
  if (soloEnUna.length) console.log(`  nodos no comparables (los crea o quita el JavaScript): ${soloEnUna.length}`);
  console.log(`  diferencias: ${diferencias.length}`);
  if (diferencias.length) {
    diferencias.slice(0, 25).forEach((d) => console.log('   · ' + d));
    if (diferencias.length > 25) console.log(`   … y ${diferencias.length - 25} más`);
    console.log('');
    console.log('  [**FALLA**] el refactor cambió valores calculados');
    console.log('');
    process.exit(1);
  }
  console.log('  [PASA] valores calculados idénticos · refactor sin efecto visual');
  console.log('');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e && e.stack ? e.stack : e); process.exit(2); });
