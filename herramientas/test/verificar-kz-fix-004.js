#!/usr/bin/env node
/* KZ-FIX-004 · regresión visual focalizada y evidencias reproducibles. */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('../node_modules/playwright');
const { crearServidor } = require('../lib/servidor-estatico');

const RAIZ = path.resolve(__dirname, '../..');
const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defecto;
};
const ETIQUETA = arg('--etiqueta', 'final');
const SALIDA = path.resolve(arg('--salida', path.join(RAIZ, 'test-results', 'kz-fix-004')));
const OBSERVACION = process.argv.includes('--observacion');
const EJECUTABLE = process.env.CHROMIUM_PATH || '';
const resultados = [];
const comprobar = (nombre, valor, detalle = '') => {
  resultados.push({ nombre, pasa: !!valor, detalle });
  console.log(`  [${valor ? 'PASA' : 'FALLA'}] ${nombre}${detalle ? ` · ${detalle}` : ''}`);
};

const viewports = [
  { nombre: 'movil-360', width: 360, height: 740 },
  { nombre: 'movil-375', width: 375, height: 812 },
  { nombre: 'tableta-768', width: 768, height: 1024 },
  { nombre: 'escritorio-1440', width: 1440, height: 900 }
];
const paginas = ['index.html', 'servicios.html', 'precios.html', 'aliados.html'];

function copiar(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origen, destino);
}

(async () => {
  const carpeta = path.join(SALIDA, ETIQUETA);
  fs.mkdirSync(carpeta, { recursive: true });
  const servidor = await crearServidor({ raiz: RAIZ, puerto: 5464 });
  const opciones = { headless: true };
  if (EJECUTABLE) opciones.executablePath = EJECUTABLE;
  const navegador = await chromium.launch(opciones);

  let colisiones = 0;
  let erroresConsola = 0;
  let desbordamientos = 0;

  for (const vp of viewports) {
    const contexto = await navegador.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: 'reduce',
      locale: 'es-CO'
    });
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('pageerror', (e) => errores.push(e.message));
    pagina.on('console', (m) => {
      if (m.type() === 'error' && !/ERR_FAILED|Content Security Policy directive/.test(m.text())) errores.push(m.text());
    });
    await pagina.route('**/*', async (ruta) => {
      const url = ruta.request().url();
      if (url.startsWith(servidor.url)) await ruta.continue();
      else await ruta.abort();
    });

    for (const archivo of paginas) {
      errores.length = 0;
      await pagina.goto(`${servidor.url}/${archivo}`, { waitUntil: 'load', timeout: 30000 });
      await pagina.waitForTimeout(2600);

      const medicion = await pagina.evaluate(async () => {
        const visible = (el) => {
          if (!el) return false;
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01 && r.width > 0 && r.height > 0;
        };
        const interseca = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const flotantes = ['.wa-float', '.kz-fab-wrapper', '.back-top.show'];
        const ctas = 'a.btn, a.button, button.btn, button.button, form button[type="submit"], input[type="submit"]';
        const choques = [];
        const paso = Math.max(120, Math.floor(innerHeight / 3));
        for (let y = 0; y <= document.documentElement.scrollHeight; y += paso) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 35));
          const fijos = flotantes.flatMap((s) => [...document.querySelectorAll(s)]).filter(visible);
          const acciones = [...document.querySelectorAll(ctas)].filter((el) => visible(el) && !el.closest('.kz-fab-wrapper'));
          for (const f of fijos) for (const a of acciones) {
            const fr = f.getBoundingClientRect(), ar = a.getBoundingClientRect();
            if (interseca(fr, ar)) choques.push({ y, flotante: f.className, accion: (a.textContent || a.value || '').trim().slice(0, 55) });
          }
        }
        scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 80));
        const waFijo = document.querySelector('.wa-float');
        const asesor = document.querySelector('.kz-fab-wrapper');
        const burbuja = document.querySelector('.kz-bubble');
        return {
          choques: [...new Map(choques.map((c) => [JSON.stringify(c), c])).values()],
          desborde: document.documentElement.scrollWidth - innerWidth,
          waFijoVisible: visible(waFijo),
          asesorVisible: visible(asesor),
          burbujaVisible: visible(burbuja),
          enlacesWa: document.querySelectorAll('a[href*="wa.me/"]').length,
          textoHeroViejo: /Sin plantillas genéricas[.\s]*Cada píxel tiene una razón/i.test(document.body.innerText),
          capasAlt: (document.querySelector('.hero__capas img') || {}).alt || ''
        };
      });

      colisiones += medicion.choques.length;
      erroresConsola += errores.length;
      if (medicion.desborde > 2) desbordamientos++;
      fs.writeFileSync(path.join(carpeta, `${archivo.replace('.html', '')}-${vp.nombre}.json`), JSON.stringify({ medicion, errores }, null, 2));

      if ((archivo === 'index.html' && ['movil-375', 'escritorio-1440'].includes(vp.nombre)) ||
          (archivo === 'aliados.html' && vp.nombre === 'movil-375')) {
        await pagina.screenshot({ path: path.join(carpeta, `${archivo.replace('.html', '')}-${vp.nombre}-completa.png`), fullPage: true, animations: 'disabled' });
      }
      if (archivo === 'index.html' && vp.nombre === 'escritorio-1440') {
        for (const [selector, nombre] of [['header', 'cabecera-logotipo'], ['.hero__capas', 'hero-capas'], ['[data-carrusel]', 'carrusel']]) {
          const el = pagina.locator(selector).first();
          if (await el.count()) await el.screenshot({ path: path.join(carpeta, `${nombre}.png`), animations: 'disabled' });
        }
      }
    }
    await contexto.close();
  }

  const contextoActivos = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const activos = await contextoActivos.newPage();
  await activos.goto(`${servidor.url}/index.html`, { waitUntil: 'load' });
  await activos.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#111827;color:#fff;font:20px Arial;padding:36px}
    .fila{display:grid;grid-template-columns:1fr 1fr;gap:24px}.muestra{min-height:300px;padding:32px;display:grid;place-items:center;border:2px solid #00e5ff}.clara{background:#fff}.oscura{background:#050b14}.muestra img{max-width:100%;max-height:240px}.iconos{display:flex;gap:24px;margin-top:24px;align-items:center}.iconos img{width:128px;height:128px;object-fit:contain}
  </style><div class="fila"><div class="muestra clara"><img src="${servidor.url}/assets/img/marca/logo-oficial.png" alt="Logo sobre fondo claro"></div><div class="muestra oscura"><img src="${servidor.url}/assets/img/marca/logo-oficial.png" alt="Logo sobre fondo oscuro"></div></div><div class="iconos"><img src="${servidor.url}/assets/img/icons/icon-192.png" alt="Icono PWA"><img src="${servidor.url}/assets/img/logos/favicon-64.png" alt="Favicon"><img src="${servidor.url}/assets/img/marca/marca-oficial.png" alt="Marca oficial"></div>`);
  await activos.waitForTimeout(400);
  await activos.screenshot({ path: path.join(carpeta, 'logotipo-fondos-e-iconos.png'), fullPage: true });

  const alfa = await activos.evaluate(async (url) => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const limite = Math.floor(c.height * 0.1); let visibles = 0, semitransparentes = 0;
    for (let y = 0; y < limite; y++) for (let px = 0; px < c.width; px++) {
      const a = d[(y * c.width + px) * 4 + 3];
      if (a > 8) visibles++;
      if (a > 8 && a < 245) semitransparentes++;
    }
    return { width: c.width, height: c.height, limite, visibles, semitransparentes };
  }, `${servidor.url}/assets/img/marca/logo-oficial.png`);
  await contextoActivos.close();

  copiar(path.join(RAIZ, 'assets/img/og/og-1200x630.png'), path.join(carpeta, 'open-graph-1200x630.png'));
  comprobar('No hay colisiones entre flotantes y CTA', colisiones === 0, `${colisiones} colisiones`);
  comprobar('No hay errores de consola', erroresConsola === 0, `${erroresConsola} errores`);
  comprobar('No hay desbordamiento horizontal', desbordamientos === 0, `${desbordamientos} casos`);
  comprobar('El texto sustituido ya no aparece en el hero', !fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').includes('Sin plantillas genéricas'));
  comprobar('El logotipo no tiene residuos en el 10 % superior', alfa.visibles === 0, `${alfa.visibles} píxeles visibles; ${alfa.semitransparentes} semitransparentes`);

  await navegador.close();
  await servidor.cerrar();
  const fallos = resultados.filter((r) => !r.pasa);
  const informe = { etiqueta: ETIQUETA, observacion: OBSERVACION, resultados, alfa, fallos: fallos.length };
  fs.writeFileSync(path.join(carpeta, 'resultado.json'), JSON.stringify(informe, null, 2));
  console.log(`\nKZ-FIX-004: ${resultados.length - fallos.length}/${resultados.length} aprobadas · evidencias: ${carpeta}`);
  process.exit(!OBSERVACION && fallos.length ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
