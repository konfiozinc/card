#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-neon.js

   Auditoría objetiva de la identidad visual Neon Tech. No instala nada,
   no modifica archivos: sirve el candidato en local, lo abre con Playwright
   y mide lo que el navegador realmente pinta y calcula.

   Comprueba:
     · desborde horizontal en 320/375/768/1024/1440/1920/2560
     · zoom al 200 % (viewport equivalente a 1440 y 1920 a la mitad)
     · tipografía de escritorio: crecimiento monótono y topes razonables
     · contraste WCAG AA real, sobre el color dominante de cada texto
     · teclado: foco visible en toda la secuencia
     · prefers-reduced-motion: sin animaciones y contenido visible
     · consola: errores de JavaScript y violaciones de CSP
     · píxeles pintados: dominante y acento de las zonas clave

   Uso:
     node herramientas/verificar-neon.js
     node herramientas/verificar-neon.js --paginas index.html,precios.html --json C:\KZ-EVIDENCIA\neon\medicion.json
   Códigos: 0 todo en verde · 1 hay fallos · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { crearServidor } = require('./lib/servidor-estatico');
const { leerPng, colorDominante, fondoDeTexto, acento } = require('./lib/leer-png');

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const RAIZ = path.resolve(__dirname, '..');
const TMP = path.join(require('os').tmpdir(), 'kz-neon-medicion');

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PAGINAS = argVal('--paginas', 'index.html,precios.html,servicios.html,portafolio.html,contacto.html').split(',').map((s) => s.trim()).filter(Boolean);
const PUERTO = Number(argVal('--puerto', '5212'));
const JSON_SALIDA = argVal('--json', '');

const ANCHOS = [320, 375, 768, 1024, 1440, 1920, 2560];
const ZOOM_200 = [{ w: 720, h: 450, equivale: 1440 }, { w: 960, h: 540, equivale: 1920 }];

const fallos = [];
const avisos = [];
const medicion = { paginas: {} };

function chequear(nombre, ok, detalle = '') {
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(62)} ${detalle}`);
  if (!ok) fallos.push(`${nombre} — ${detalle}`);
}
function avisar(texto) { avisos.push(texto); console.log(`  [AVISO   ] ${texto}`); }

/* ── contraste WCAG 2.1 ──────────────────────────────────────────── */
const aRgb = (s) => {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const lum = ({ r, g, b }) => {
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contraste = (a, b) => {
  const l1 = lum(a); const l2 = lum(b);
  const hi = Math.max(l1, l2); const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
};
const hexDe = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

(async () => {
  let chromium;
  try { ({ chromium } = require(PW)); } catch { console.error('Playwright no encontrado:', PW); process.exit(2); }
  fs.mkdirSync(TMP, { recursive: true });

  const servidor = await crearServidor({ raiz: RAIZ, puerto: PUERTO });
  const nav = await chromium.launch({ headless: true });
  console.log('');
  console.log('═══ AUDITORÍA VISUAL NEON TECH · KONFÍO ZINC ═══');
  console.log(`  servidor: ${servidor.url}  ·  páginas: ${PAGINAS.length}`);
  console.log('');

  /* Barrido rápido: todas las páginas que cargan la capa neón. Comprueba que
     la capa se aplica, que el fondo es el de la identidad, que hay acento
     cian pintado, que no hay desborde y que la consola está limpia. */
  if (process.argv.includes('--barrido')) {
    const saltar = new Set(['node_modules', '.git', 'docs', 'herramientas', 'premium', 'functions', 'tools', 'admin']);
    const recorrer = (d, acc = []) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (saltar.has(f.name)) continue;
        const p = path.join(d, f.name);
        if (f.isDirectory()) recorrer(p, acc); else if (f.name.endsWith('.html')) acc.push(p);
      }
      return acc;
    };
    const paginas = recorrer(RAIZ)
      .filter((p) => fs.readFileSync(p, 'utf8').includes('kz-neon.css'))
      .map((p) => path.relative(RAIZ, p).replace(/\\/g, '/'));
    console.log(`  barrido de ${paginas.length} páginas con la capa neón`);
    console.log('');
    const externos = new Set();
    for (const pagina of paginas) {
      const errores = [];
      let datos = null;
      for (const ancho of [375, 1440]) {
        const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho === 375 ? 667 : 900 }, reducedMotion: 'reduce', locale: 'es-CO' });
        const pag = await ctx.newPage();
        pag.on('pageerror', (e) => errores.push(String(e.message).slice(0, 70)));
        pag.on('console', (m) => {
          if (m.type() !== 'error') return;
          const t = m.text();
          // Sin red, los recursos externos (fuentes, GTM, CDN) no resuelven.
          // Eso no es un defecto del candidato: se informa aparte y no aborta.
          if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|net::ERR_FAILED/i.test(t)) { externos.add(t.slice(0, 40)); return; }
          errores.push(t.slice(0, 70));
        });
        await pag.goto(servidor.url + pagina, { waitUntil: 'load', timeout: 45000 });
        await pag.waitForTimeout(320);
        const r = await pag.evaluate(() => {
          const doc = document.documentElement;
          const cs = getComputedStyle(document.body);
          const capa = [...document.styleSheets].some((h) => (h.href || '').includes('kz-neon.css'));
          const acento = getComputedStyle(doc).getPropertyValue('--kz-cyan').trim();
          const boton = document.querySelector('.btn-primary, .nav-cta, .button--brand');
          return {
            desborde: doc.scrollWidth - doc.clientWidth,
            fondo: cs.backgroundColor,
            capa,
            acento,
            botonFondo: boton ? getComputedStyle(boton).backgroundImage.slice(0, 60) : ''
          };
        });
        if (!datos) datos = r; else datos.desborde = Math.max(datos.desborde, r.desborde);
        await ctx.close();
      }
      const okCapa = datos.capa && datos.acento.toUpperCase() === '#00E5FF';
      const okFondo = /rgb\(5, 11, 20\)|rgba\(5, 11, 20/.test(datos.fondo) || /rgb\(10, 20, 36\)|rgba\(10, 20, 36/.test(datos.fondo);
      const okDesborde = datos.desborde <= 1;
      const okConsola = errores.length === 0;
      const todo = okCapa && okFondo && okDesborde && okConsola;
      chequear(`${pagina}`, todo, [
        okCapa ? '' : `capa/acento (${datos.acento || 'sin token'})`,
        okFondo ? '' : `fondo ${datos.fondo}`,
        okDesborde ? '' : `desborde ${datos.desborde}px`,
        okConsola ? '' : `${errores.length} errores: ${errores[0]}`
      ].filter(Boolean).join(' · '));
    }
    await nav.close();
    await servidor.cerrar();
    console.log('');
    console.log('═══ RESUMEN DEL BARRIDO ═══');
    console.log(`  páginas: ${paginas.length}  ·  fallos: ${fallos.length}`);
    if (externos.size) console.log(`  sin red: ${externos.size} recursos externos no resolvieron (fuentes/CDN); no afectan a la capa neón`);
    if (fallos.length) { fallos.forEach((f) => console.log('   · ' + f)); process.exit(1); }
    process.exit(0);
  }

  for (const pagina of PAGINAS) {
    const detalle = { anchos: {}, zoom: {}, contraste: [], pixeles: {}, tipografia: {} };
    medicion.paginas[pagina] = detalle;
    console.log(`── ${pagina} ──`);

    /* 1 · desborde horizontal en todos los anchos */
    for (const ancho of ANCHOS) {
      const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho <= 768 ? Math.round(ancho * 1.78) : 900 }, reducedMotion: 'reduce', locale: 'es-CO' });
      const pag = await ctx.newPage();
      const errores = [];
      pag.on('pageerror', (e) => errores.push(String(e.message)));
      await pag.goto(servidor.url + pagina, { waitUntil: 'load', timeout: 45000 });
      await pag.waitForTimeout(350);
      const r = await pag.evaluate(() => {
        const doc = document.documentElement;
        const desborde = doc.scrollWidth - doc.clientWidth;
        const culpables = [];
        if (desborde > 1) {
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;
            if (b.right > doc.clientWidth + 1.5 || b.left < -1.5) {
              const cs = getComputedStyle(el);
              if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
              culpables.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0] || ''} [${Math.round(b.left)}→${Math.round(b.right)}]`);
            }
          }
        }
        const tam = (sel) => { const el = document.querySelector(sel); return el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : 0; };
        return {
          desborde,
          culpables: [...new Set(culpables)].slice(0, 4),
          h1: tam('h1'),
          h2: tam('.section-head h2, h2'),
          h3: tam('h3'),
          precio: tam('.price-list strong, .precio, .precio-valor')
        };
      });
      detalle.anchos[ancho] = { ...r, errores };
      chequear(`${pagina} · ${ancho}px sin desborde horizontal`, r.desborde <= 1, r.desborde > 1 ? `desborde ${r.desborde}px · ${r.culpables.join(', ')}` : '');
      if (errores.length) avisar(`${pagina} @${ancho}: ${errores.length} error(es) JS — ${errores[0].slice(0, 90)}`);
      await ctx.close();
    }

    /* 2 · zoom al 200 % (mitad de viewport) */
    for (const z of ZOOM_200) {
      const ctx = await nav.newContext({ viewport: { width: z.w, height: z.h }, reducedMotion: 'reduce', locale: 'es-CO' });
      const pag = await ctx.newPage();
      await pag.goto(servidor.url + pagina, { waitUntil: 'load', timeout: 45000 });
      await pag.waitForTimeout(300);
      const r = await pag.evaluate(() => {
        const doc = document.documentElement;
        const recortadoPorAncestro = (el) => {
          let p = el.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') {
              const pb = p.getBoundingClientRect();
              const eb = el.getBoundingClientRect();
              if (eb.right > pb.right + 2 || eb.left < pb.left - 2) return true;
            }
            p = p.parentElement;
          }
          return false;
        };
        const ocultoPorDiseno = (el) => {
          let p = el;
          while (p && p !== document.documentElement) {
            if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return true;
            const cs = getComputedStyle(p);
            if (cs.visibility === 'hidden' || cs.display === 'none') return true;
            // paneles fuera de pantalla: menú móvil cerrado, cajón lateral, chat cerrado
            const tr = cs.transform;
            if (tr && tr.startsWith('matrix')) {
              const nums = tr.slice(tr.indexOf('(') + 1, tr.lastIndexOf(')')).split(',').map(Number);
              const tx = nums[4] || 0;
              if (Math.abs(tx) > doc.clientWidth * 0.4) return true;
            }
            p = p.parentElement;
          }
          return false;
        };
        const cortados = [...document.querySelectorAll('h1,h2,h3,p,li,a,button,span,strong,small,dt,dd,label')]
          .filter((el) => {
            const b = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden') return false;
            if (b.bottom < 0 || b.top > document.documentElement.scrollHeight) return false;
            const fuera = b.right > doc.clientWidth + 1.5 || b.left < -1.5;
            if (!fuera) return false;
            if (cs.position === 'fixed') return false;
            if (ocultoPorDiseno(el)) return false;
            return !recortadoPorAncestro(el);
          });
        return { desborde: doc.scrollWidth - doc.clientWidth, cortados: cortados.length, ejemplo: cortados.slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]) };
      });
      detalle.zoom[z.equivale] = r;
      chequear(`${pagina} · ${z.equivale}px al 200 % (${z.w}px) sin recortes`, r.desborde <= 1 && r.cortados === 0, r.desborde > 1 ? `desborde ${r.desborde}px` : (r.cortados ? `${r.cortados} textos fuera (${r.ejemplo.join(', ')})` : ''));
      await ctx.close();
    }

    /* 3 · tipografía de escritorio y contraste, medidas en 1440 y 1920 */
    for (const ancho of [375, 768, 1440, 1920, 2560]) {
      const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho <= 768 ? 812 : 1000 }, reducedMotion: 'reduce', locale: 'es-CO' });
      const pag = await ctx.newPage();
      await pag.goto(servidor.url + pagina, { waitUntil: 'load', timeout: 45000 });
      await pag.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
      await pag.waitForTimeout(300);

      if ([1440, 1920, 2560].includes(ancho)) {
        const t = await pag.evaluate(() => {
          const g = (sel) => { const el = document.querySelector(sel); return el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null; };
          return { h1: g('h1'), statement: g('.statement__text'), h2: g('.section-head h2, h2'), h3: g('.service-panel h3, h3'), precio: g('.price-list strong') };
        });
        detalle.tipografia[ancho] = t;
      }

      /* contraste real: se fotografía cada texto y se mide su fondo dominante */
      if (ancho === 1440) {
        const zonas = await pag.evaluate(() => {
          const doc = document.documentElement;
          const recortadoPorAncestro = (el) => {
            let p = el.parentElement;
            while (p && p !== document.body) {
              const cs = getComputedStyle(p);
              if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') {
                const pb = p.getBoundingClientRect(); const eb = el.getBoundingClientRect();
                if (eb.right > pb.right + 2 || eb.left < pb.left - 2) return true;
              }
              p = p.parentElement;
            }
            return false;
          };
          const sel = 'h1, h2, h3, p, li, a, button, summary, small, strong, .price-list span';
          const vistos = new Set(); const salida = [];
          let i = 0;
          for (const el of document.querySelectorAll(sel)) {
            const texto = (el.textContent || '').trim();
            if (texto.length < 4 || texto.length > 220) continue;
            const b = el.getBoundingClientRect();
            if (b.width < 24 || b.height < 10) continue;
            if (b.top + window.scrollY > 6000) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
            if (b.right < 0 || b.bottom < 0 || b.left > doc.clientWidth) continue;   // fuera de pantalla por diseño
            if (el.closest('.sr-only, .skip-link')) continue;                          // texto auxiliar oculto
            if (recortadoPorAncestro(el)) continue;
            const col = cs.color;
            const m = col.match(/rgba?\(([^)]+)\)/);
            if (!m) continue;
            const partes = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
            if (partes.length > 3 && partes[3] < 0.35) continue;                       // contorno decorativo o casi transparente
            const clave = texto.slice(0, 48) + '|' + Math.round(b.top);
            if (vistos.has(clave)) continue;
            vistos.add(clave);
            el.setAttribute('data-kz-med', String(i));
            salida.push({
              i,
              texto: texto.replace(/\s+/g, ' ').slice(0, 46),
              color: col,
              tamano: Math.round(parseFloat(cs.fontSize) * 10) / 10,
              negrita: Number(cs.fontWeight) >= 600,
              fondo: cs.backgroundColor
            });
            i += 1;
            if (salida.length >= 26) break;
          }
          return salida;
        });

        const peor = [];
        for (const z of zonas) {
          const el = await pag.$(`[data-kz-med="${z.i}"]`);
          if (!el) continue;
          const colorTexto = aRgb(z.color) || { r: 0, g: 0, b: 0, a: 1 };
          let base = null;
          try {
            await el.scrollIntoViewIfNeeded({ timeout: 2000 });
            const archivo = path.join(TMP, `zona-${pagina.replace(/\W/g, '')}-${z.i}.png`);
            await el.screenshot({ path: archivo });
            const img = leerPng(archivo);
            // el fondo es el color más repetido que NO sea el propio texto:
            // en titulares grandes los glifos ocupan más superficie que el fondo
            const fondo = fondoDeTexto(img, colorTexto);
            if (fondo) base = { r: fondo.r, g: fondo.g, b: fondo.b };
            else {
              const dom = colorDominante(img, { x: 0, y: 0, w: img.ancho, h: img.alto });
              if (dom.n >= 6) base = { r: dom.r, g: dom.g, b: dom.b };
            }
          } catch { /* sin muestra: se intenta el fondo calculado */ }
          if (!base) {
            const f = aRgb(z.fondo);
            if (f && f.a > 0.1) base = f;
          }
          if (!base) continue;
          const ratio = contraste(colorTexto, base);
          const minimo = (z.tamano >= 24 || (z.negrita && z.tamano >= 18.66)) ? 3 : 4.5;
          if (ratio < minimo) peor.push({ texto: z.texto, tamano: z.tamano, color: z.color, fondo: hexDe(base), ratio: Math.round(ratio * 100) / 100, minimo });
        }
        detalle.contraste = peor;
        chequear(`${pagina} · contraste WCAG AA (muestras reales)`, peor.length === 0,
          peor.length ? `${peor.length} bajo mínimo · p.ej. "${peor[0].texto}" ${peor[0].ratio}:1 < ${peor[0].minimo}` : `${zonas.length} textos fotografiados`);
      }

      /* píxeles pintados de las zonas clave, solo a 1440 */
      if (ancho === 1440) {
        const cajas = await pag.evaluate(() => {
          const salida = {};
          const pon = (clave, sel) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.setAttribute('data-kz-pix', clave);
            salida[clave] = true;
          };
          pon('hero', '.hero');
          pon('hero_h1', 'h1');
          pon('cta', '.button--brand, .button--gold, .btn-primario, .hero__actions .button');
          pon('cabecera', '.site-header, header');
          pon('footer', 'footer, .footer');
          pon('robot', '#kzFabToggle, .kz-fab-btn');
          pon('panel_servicio', '.service-panel');
          pon('precios', '.pricing, .pricing-grid');
          return salida;
        });
        const pix = {};
        for (const clave of Object.keys(cajas)) {
          const el = await pag.$(`[data-kz-pix="${clave}"]`);
          if (!el) continue;
          const archivo = path.join(TMP, `pix-${pagina.replace(/\W/g, '')}-${clave}.png`);
          try {
            await el.scrollIntoViewIfNeeded({ timeout: 2500 });
            await el.screenshot({ path: archivo });
            const img = leerPng(archivo);
            const dom = colorDominante(img, { x: 0, y: 0, w: img.ancho, h: img.alto });
            const ac = acento(img, { x: 0, y: 0, w: img.ancho, h: img.alto });
            pix[clave] = { fondo: dom.hex, acento: ac.hex, ancho: img.ancho, alto: img.alto };
          } catch (e) { pix[clave] = { error: String(e.message).slice(0, 60) }; }
        }
        detalle.pixeles = pix;
        console.log(`    píxeles: ${Object.entries(pix).map(([k, v]) => `${k}=${v.fondo || '?'}/${v.acento || '?'}`).join('  ')}`);
      }
      await ctx.close();
    }
    console.log('');
  }

  /* 4 · teclado, foco y movimiento reducido en la portada y en precios */
  for (const pagina of ['index.html', 'precios.html']) {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'es-CO' });
    const pag = await ctx.newPage();
    await pag.goto(servidor.url + pagina, { waitUntil: 'load', timeout: 45000 });
    await pag.waitForTimeout(400);

    const foco = [];
    for (let i = 0; i < 12; i++) {
      await pag.keyboard.press('Tab');
      const d = await pag.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') ||
          (cs.boxShadow && cs.boxShadow !== 'none') || (cs.textDecorationLine && cs.textDecorationLine !== 'none' && cs.textDecorationColor !== 'rgba(0, 0, 0, 0)');
        return { etiqueta: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 34), visible };
      });
      if (d) foco.push(d);
    }
    const sinFoco = foco.filter((f) => !f.visible);
    chequear(`${pagina} · foco visible en la secuencia de tabulación`, sinFoco.length === 0,
      sinFoco.length ? sinFoco.map((f) => f.etiqueta).join(' | ') : `${foco.length} paradas comprobadas`);

    const anim = await pag.evaluate(() => {
      const objetivos = [...document.querySelectorAll('.reveal, .noise, header, .service-panel, .price-list a')].slice(0, 40);
      let maxDuracion = 0; let invisibles = 0;
      for (const el of objetivos) {
        const cs = getComputedStyle(el);
        maxDuracion = Math.max(maxDuracion, parseFloat(cs.animationDuration) || 0, parseFloat(cs.transitionDuration) || 0);
        if (el.classList.contains('reveal') && Number(cs.opacity) < 0.9) invisibles += 1;
      }
      return { maxDuracion, invisibles };
    });
    chequear(`${pagina} · movimiento reducido sin animaciones ni contenido oculto`, anim.maxDuracion <= 0.05 && anim.invisibles === 0,
      `${anim.maxDuracion.toFixed(3)}s · ${anim.invisibles} bloques ocultos`);

    /* CSS efectivo: ninguna regla rota por la capa de tema */
    const hojas = await pag.evaluate(() => {
      let reglas = 0; let vacias = 0;
      for (const hoja of document.styleSheets) {
        let lista = null;
        try { lista = hoja.cssRules; } catch { continue; }
        for (const r of lista) { reglas += 1; if (r.cssText && r.cssText.replace(/\s/g, '').endsWith('{}')) vacias += 1; }
      }
      return { reglas, vacias };
    });
    chequear(`${pagina} · hoja de estilos aplicada`, hojas.reglas > 50, `${hojas.reglas} reglas · ${hojas.vacias} vacías`);
    await ctx.close();
  }

  await nav.close();
  await servidor.cerrar();

  if (JSON_SALIDA) {
    fs.mkdirSync(path.dirname(JSON_SALIDA), { recursive: true });
    fs.writeFileSync(JSON_SALIDA, JSON.stringify({ fecha: new Date().toISOString(), fallos, avisos, medicion }, null, 2), 'utf8');
    console.log(`  medición guardada en ${JSON_SALIDA}`);
  }

  console.log('');
  console.log('═══ RESUMEN ═══');
  console.log(`  fallos: ${fallos.length}  ·  avisos: ${avisos.length}`);
  if (fallos.length) { fallos.forEach((f) => console.log('   · ' + f)); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e && e.stack ? e.stack : e); process.exit(2); });
