#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/capturar-neon.js

   Capturas comparativas del candidato (antes / después de la identidad
   Neon Tech). Reutiliza Playwright ya instalado en el equipo; no instala
   nada y no modifica el sitio: sirve la carpeta y fotografía.

   Uso:
     node herramientas/capturar-neon.js --etiqueta antes
     node herramientas/capturar-neon.js --etiqueta despues --anchos 320,375,768,1440,1920
     node herramientas/capturar-neon.js --etiqueta antes --paginas index.html,precios.html

   Salida por defecto: C:\KZ-EVIDENCIA\neon\<etiqueta>\
   Códigos: 0 correcto · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { crearServidor } = require('./lib/servidor-estatico');

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const RAIZ = path.resolve(__dirname, '..');

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ETIQUETA = argVal('--etiqueta', 'captura');
const SALIDA = argVal('--salida', 'C:\\KZ-EVIDENCIA\\neon');
const ANCHOS = argVal('--anchos', '320,375,768,1440,1920').split(',').map((n) => Number(n.trim())).filter(Boolean);
const PAGINAS = argVal('--paginas', 'index.html,precios.html,servicios.html,portafolio.html,contacto.html,nosotros.html')
  .split(',').map((p) => p.trim()).filter(Boolean);
const PUERTO = Number(argVal('--puerto', '5211'));
const ALTO_ESCRITORIO = Number(argVal('--alto', '900'));

const nombre = (ruta) => (ruta === 'index.html' ? 'portada' : ruta.replace(/\.html$/, '').replace(/[\\/]/g, '-'));

(async () => {
  let chromium;
  try { ({ chromium } = require(PW)); } catch {
    console.error('No se encontró Playwright en la ruta esperada:', PW);
    process.exit(2);
  }

  const carpeta = path.join(SALIDA, ETIQUETA);
  fs.mkdirSync(carpeta, { recursive: true });

  const servidor = await crearServidor({ raiz: RAIZ, puerto: PUERTO });
  const nav = await chromium.launch({ headless: true });
  console.log('');
  console.log('═══ CAPTURAS · KONFÍO ZINC NEON TECH ═══');
  console.log(`  etiqueta: ${ETIQUETA}  ·  destino: ${carpeta}`);
  console.log(`  servidor: ${servidor.url}`);
  console.log('');

  const hechas = [];
  for (const pagina of PAGINAS) {
    for (const ancho of ANCHOS) {
      const movil = ancho <= 768;
      const ctx = await nav.newContext({
        viewport: { width: ancho, height: movil ? Math.round(ancho * 1.78) : ALTO_ESCRITORIO },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',          // capturas deterministas y prueba real de movimiento reducido
        locale: 'es-CO'
      });
      const pag = await ctx.newPage();
      const resp = await pag.goto(servidor.url + pagina, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
      if (!resp || !resp.ok()) console.log(`  [AVISO] ${pagina} @${ancho}: no cargó (${resp ? resp.status() : 'sin respuesta'})`);
      await pag.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
      // recorre la página para disparar las animaciones de entrada y luego vuelve arriba
      await pag.evaluate(async () => {
        const paso = Math.round(window.innerHeight * 0.8);
        for (let y = 0; y < document.body.scrollHeight; y += paso) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await pag.waitForTimeout(500);

      const base = path.join(carpeta, `${nombre(pagina)}-${ancho}`);
      await pag.screenshot({ path: `${base}.png` });
      await pag.screenshot({ path: `${base}-completa.png`, fullPage: true });
      hechas.push(path.basename(`${base}.png`));

      // el botón flotante del asesor, en primer plano
      if (pagina === 'index.html') {
        const fab = await pag.$('#kzFabToggle');
        if (fab) await fab.screenshot({ path: path.join(carpeta, `robot-${ancho}.png`) }).catch(() => {});
      }
      await ctx.close();
    }
    console.log(`  ✓ ${pagina}`);
  }

  await nav.close();
  await servidor.cerrar();
  console.log('');
  console.log(`  ${hechas.length} capturas + versiones de página completa en ${carpeta}`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e && e.message ? e.message : e); process.exit(2); });
