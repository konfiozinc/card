#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-calidad-html.js
   KZ-QA-GLOBAL-001 / KZ-QA-GLOBAL-002 · Definition of Done de páginas web.

   Comprueba, en TODAS las páginas del sitio (públicas y del panel):

     ESTÁTICO (siempre)
       1. <title> único, no vacío y sin repetir la marca
       2. <meta name="description"> de 160 caracteres como máximo
       3. Open Graph completa (og:title, og:description, og:image, og:type),
          con og:image en URL absoluta
       4. Favicon declarado (SVG + PNG) y con el archivo existente;
          sin imágenes locales rotas
       5. Atributo alt en todas las imágenes
       6. lang="es" en <html>

     CONSOLA (por defecto; se salta con --sin-consola)
       7. Cero errores de JavaScript al cargar la página: se sirve el sitio en
          local y se abre cada página con Chromium, escuchando `pageerror` y los
          errores de consola. Solo cuentan los que provienen del propio sitio.

   Uso:
     node herramientas/verificar-calidad-html.js                # todo (sitio card)
     node herramientas/verificar-calidad-html.js --sin-consola   # salta el navegador
     node herramientas/verificar-calidad-html.js --json          # salida JSON

   Clientes (KZ-QA-CLIENTES-001):
     node herramientas/verificar-calidad-html.js --clientes
        Audita TODOS los proyectos de clientes del workspace: cada carpeta
        numerada (2-TARJETAS-PRO, 3-TARJETAS-ELITE, 7-CATALOGOS,
        8-MENUS-DIGITALES…) que tenga su propio index.html. Un proyecto sin
        metadatos, favicon o con errores de consola hace que el comando salga
        con código 1.
     node herramientas/verificar-calidad-html.js --raiz "C:\ruta\proyecto"
        Audita una carpeta concreta (útil desde el propio proyecto del cliente).

   Variables de entorno:
     KZ_CHROMIUM_PATH   ruta a un Chrome/Chromium ya instalado. Sirve para el CI de
                        GitHub, que no descarga el navegador de Playwright (pesa
                        ~150 MB y el runner ya trae Google Chrome): allí se pasa
                        KZ_CHROMIUM_PATH=/usr/bin/google-chrome y la consola SÍ se
                        revisa de verdad. Sin la variable se usa el navegador de
                        Playwright y, si no está, se avisa y se sigue.

   Sale con código 1 si alguna página incumple algo. Se ejecuta antes de cada
   commit (pre-commit, modo --sin-consola), antes de cada push (pre-push, completo)
   y en el CI (job `calidad-html`), igual que verificar-precios.js. Desde
   KZ-QA-CLIENTES-001 también antes de tocar cualquier proyecto de cliente:
   NINGÚN proyecto de cliente se publica si este comando no sale con 0.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const RAIZ = path.resolve(__dirname, '..');
const EXCLUIR = [/node_modules/, /[\\/]\.git[\\/]/, /[\\/]crm-dev[\\/]/, /[\\/]docs[\\/]/, /[\\/]evidencias/, /[\\/]_transferencia[\\/]/];
const JSON_SALIDA = process.argv.includes('--json');
const SIN_CONSOLA = process.argv.includes('--sin-consola');
const MODO_CLIENTES = process.argv.includes('--clientes');
const RAIZ_PUNTUAL = (() => {
  const i = process.argv.indexOf('--raiz');
  return i > -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : null;
})();

/* ── Proyectos de clientes (KZ-QA-CLIENTES-001) ──────────────────────────
   Se consideran proyectos las carpetas de primer nivel cuya ruta empiece con un
   número (2-TARJETAS-PRO, 3-TARJETAS-ELITE, 7-CATALOGOS, 8-MENUS-DIGITALES…)
   y que contengan su propio index.html. El sitio card se audita aparte. */
const WORKSPACE = path.resolve(RAIZ, '..', '..');
const NO_ES_PROYECTO = [/node_modules/, /[\\/]\.git/, /[\\/]_originales/, /[\\/]_backup/, /[\\/]\.worktrees/, /[\\/]herramientas/, /[\\/]evidencias/];
/* Carpetas de primer nivel que no son proyectos de cliente: respaldos y
   herramientas internas. El sitio card tampoco: se audita aparte. */
const CARPETAS_IGNORADAS = [/BACKUPS/i, /HERRAMIENTAS-DESARROLLO/i, /^\./];

function proyectosClientes() {
  const encontrados = [];
  if (!fs.existsSync(WORKSPACE)) return encontrados;
  for (const carpeta of fs.readdirSync(WORKSPACE, { withFileTypes: true })) {
    if (!carpeta.isDirectory() || !/^\d+-/.test(carpeta.name)) continue;
    if (CARPETAS_IGNORADAS.some((rx) => rx.test(carpeta.name))) continue;
    const base = path.join(WORKSPACE, carpeta.name);
    for (const proyecto of fs.readdirSync(base, { withFileTypes: true })) {
      if (!proyecto.isDirectory()) continue;
      const raiz = path.join(base, proyecto.name);
      if (path.resolve(raiz) === path.resolve(RAIZ)) continue;    // el sitio card va aparte
      if (NO_ES_PROYECTO.some((rx) => rx.test(raiz))) continue;
      if (!fs.existsSync(path.join(raiz, 'index.html'))) continue;
      encontrados.push({ nombre: `${carpeta.name}/${proyecto.name}`, raiz });
    }
  }
  return encontrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function paginasHtml(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (EXCLUIR.some((rx) => rx.test(p))) continue;
    if (e.isDirectory()) paginasHtml(p, salida);
    else if (e.name.endsWith('.html')) salida.push(p);
  }
  return salida;
}

/** Revisa el <head> y las imágenes de una página. */
function revisar(ruta, raiz) {
  const rel = path.relative(raiz || RAIZ, ruta).replace(/\\/g, '/');
  const texto = fs.readFileSync(ruta, 'utf8');
  const cabecera = texto.slice(0, Math.max(texto.indexOf('</head>'), 0));
  const fallos = [];
  const avisos = [];

  /* 6 · idioma */
  const html = (texto.match(/<html[^>]*>/i) || [''])[0];
  const lang = (html.match(/lang="([^"]*)"/i) || [])[1] || '';
  if (!lang) fallos.push('falta lang en <html>');
  else if (!/^es/i.test(lang)) fallos.push(`lang="${lang}" no es español`);

  /* 1 · título */
  const titulos = [...cabecera.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1].trim());
  if (!titulos.length) fallos.push('sin <title>');
  else if (titulos.length > 1) fallos.push(`${titulos.length} etiquetas <title>`);
  else if (!titulos[0]) fallos.push('<title> vacío');
  else {
    if ((titulos[0].match(/KONF[ÍI]O\s*ZINC/gi) || []).length > 1) fallos.push('el título repite la marca');
    if (/—\s*Panel\s+KONF/i.test(titulos[0])) fallos.push('título con el formato viejo «— Panel …»');
    if (titulos[0].length > 70) avisos.push(`título largo (${titulos[0].length} caracteres)`);
  }

  /* 2 · descripción */
  const desc = (cabecera.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [])[1];
  if (!desc || !desc.trim()) fallos.push('sin meta description');
  else if (desc.length > 160) fallos.push(`description de ${desc.length} caracteres (máximo 160)`);

  /* 3 · Open Graph */
  const og = {};
  for (const m of cabecera.matchAll(/<meta[^>]+property="(og:[^"]+)"[^>]+content="([^"]*)"/gi)) og[m[1]] = m[2];
  for (const k of ['og:title', 'og:description', 'og:image', 'og:type']) if (!og[k]) fallos.push(`sin ${k}`);
  if (og['og:image'] && !/^https?:\/\//i.test(og['og:image'])) fallos.push('og:image no es una URL absoluta');

  /* 4 · favicon e imágenes */
  const iconos = [...cabecera.matchAll(/<link[^>]+rel="[^"]*icon[^"]*"[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
  const iconosReales = iconos.filter((h) => !/^data:/i.test(h));
  if (!iconosReales.length) fallos.push('sin favicon declarado');
  else {
    if (!iconosReales.some((h) => /\.svg($|\?)/i.test(h))) fallos.push('sin favicon SVG');
    if (!iconosReales.some((h) => /\.png($|\?)/i.test(h))) avisos.push('sin favicon PNG de respaldo');
    for (const h of iconosReales) {
      if (/^https?:/i.test(h)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(ruta), h.split('?')[0]))) fallos.push(`favicon inexistente: ${h}`);
    }
  }

  const imgs = [...texto.matchAll(/<img\b([^>]*)>/gi)].map((m) => m[1]);
  let sinAlt = 0;
  const rotas = [];
  let noVerificables = 0;
  /* KZ-QA-CLIENTES-001 · Muchos proyectos antiguos generan las imágenes por
     JavaScript dentro del propio HTML (`src="' + urlImagen(p) + '"`). Ahí no hay
     una ruta que comprobar y antes se contaban como «imágenes rotas»: eran
     falsos positivos, y un verificador que grita en falso se acaba ignorando.
     Solo se comprueba en disco lo que tiene forma de ruta relativa real. */
  const FORMA_DE_RUTA = /^[A-Za-z0-9._~\/%-]+$/;
  for (const attrs of imgs) {
    if (!/\balt\s*=/.test(attrs)) sinAlt++;
    /* KZ-QA-CLIENTES-002 · Solo el atributo `src` de verdad. `:src="img"` y
       `x-bind:src="…"` son expresiones de Alpine: el valor se calcula en el
       navegador y no es una ruta. Antes se leían como rutas y salían «imágenes
       rotas» que no lo eran (`img`, `newProduct.imagen`). Un `src` roto de
       verdad, sin los dos puntos, se sigue detectando igual. */
    const src = (attrs.match(/(?<![:\w-])src\s*=\s*"([^"]*)"/) || [])[1];
    if (!src || /^(https?:|data:|#)/i.test(src)) continue;
    if (src.includes('${') || !FORMA_DE_RUTA.test(src.split('?')[0])) { noVerificables++; continue; }
    const limpio = src.split('?')[0];
    if (!fs.existsSync(path.resolve(path.dirname(ruta), limpio))) rotas.push(limpio);
  }
  if (sinAlt) fallos.push(`${sinAlt} imagen(es) sin atributo alt`);
  if (rotas.length) fallos.push(`${rotas.length} imagen(es) rotas: ${[...new Set(rotas)].slice(0, 2).join(', ')}`);
  if (noVerificables) avisos.push(`${noVerificables} imagen(es) con src generado por JavaScript (no comprobables)`);

  return { archivo: rel, fallos, avisos, consola: null };
}

/* ¿Este equipo alcanza un dominio externo? Sin `fetch` disponible se asume que
   sí y el examen de consola queda estricto. */
async function alcanzable(url, ms = 5000) {
  if (typeof fetch !== 'function') return true;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/* ── 7 · Errores de consola (Playwright) ───────────────────────────────
   Se sirve el sitio en local y se abre cada página en Chromium. Solo cuentan
   los errores que produce el propio sitio.

   Tres protecciones contra falsos positivos, todas visibles en la salida:
   · Un mensaje cuyo origen no es 127.0.0.1 (script de un tercero) no cuenta.
   · Si este equipo no alcanza un dominio externo que las páginas usan (Google
     Fonts, reCAPTCHA, CDN), sus peticiones se cortan y su fallo se informa
     aparte: medir la red del equipo no es medir el sitio. La comprobación se
     repite en cada ejecución, así que en una máquina con salida a internet el
     examen es estricto. (KZ-QA-GLOBAL-002: este equipo tiene Google bloqueado.)
   · La navegación espera `domcontentloaded` + 1,2 s, no `load`: el `load` puede
     quedarse 30 s esperando un script de un tercero que nunca llega. */
async function revisarConsola(revisiones, raiz) {
  const RAIZ_PROYECTO = raiz || RAIZ;
  let chromium;
  try {
    ({ chromium } = require(path.join(__dirname, 'node_modules', 'playwright')));
  } catch (e) {
    console.warn('  ⚠ Playwright no está instalado en herramientas/node_modules: se omite la revisión de consola.');
    return false;
  }

  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
  };
  const PUERTO = 8137;
  const servidor = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
      let rel = decodeURIComponent(url.pathname);
      /* GitHub Pages sirve este repositorio en el subdirectorio /card/, así que
         las rutas absolutas del sitio real empiezan por /card/. Se replica para
         que un enlace como 404.html → /card/index.html no dé un 404 falso. */
      if (rel === '/card' || rel.startsWith('/card/')) rel = rel.slice('/card'.length) || '/';
      if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
      const datos = fs.readFileSync(path.join(RAIZ_PROYECTO, rel));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
      res.end(datos);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('no encontrado');
    }
  });
  await new Promise((r) => servidor.listen(PUERTO, '127.0.0.1', r));

  /* Dominios externos que las páginas cargan. Se comprueba la salida antes de
     medir: lo que no se alcanza se corta y se informa, no se cuenta. */
  const EXTERNOS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.google.com', 'www.gstatic.com', 'cdnjs.cloudflare.com'];
  const inalcanzables = [];
  for (const host of EXTERNOS) {
    if (!(await alcanzable(`https://${host}/`))) inalcanzables.push(host);
  }
  if (inalcanzables.length) {
    console.log(`  ⚠ sin salida a ${inalcanzables.join(', ')} desde este equipo:`);
    console.log('    sus peticiones se cortan y su fallo no cuenta como error del sitio.');
  }

  /* Si el navegador no arranca (p. ej. Playwright instalado sin su Chromium), se
     avisa y se sigue: el resto de reglas valen igual. Nunca se cae con una traza:
     un verificador que revienta se acaba ignorando.
     KZ_CHROMIUM_PATH permite usar el Chrome del runner de GitHub en vez de
     descargar el navegador de Playwright dentro del CI. */
  const rutaChrome = process.env.KZ_CHROMIUM_PATH || '';
  let navegador;
  try {
    navegador = await chromium.launch(rutaChrome ? { executablePath: rutaChrome } : {});
  } catch (e) {
    console.warn('  ⚠ no se pudo abrir Chromium: se omite la revisión de consola.');
    if (rutaChrome) console.warn('    KZ_CHROMIUM_PATH=' + rutaChrome);
    console.warn('    ' + String(e.message).split('\n')[0].slice(0, 110));
    console.warn('    Para habilitarla: cd herramientas && npx playwright install chromium');
    servidor.close();
    return false;
  }

  /* Se dice siempre con qué motor se juzga. No dan lo mismo: Chrome 156 marcó un
     estilo en línea que Chromium 153 dejó pasar, y ese error estaba dejando sin
     formato el aviso de notificaciones de la portada (KZ-QA-GLOBAL-003). */
  console.log(`  navegador de la revisión: ${rutaChrome ? 'Chrome del sistema (' + rutaChrome + ')' : 'Chromium de Playwright'} v${navegador.version()}`);

  const LOCAL = `127.0.0.1:${PUERTO}`;
  for (const rev of revisiones) {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();

    /* Lo que no se alcanza no se intenta descargar: así no bloquea la carga ni
       genera mensajes que no vienen del sitio. Solo se cortan esos dominios. */
    if (inalcanzables.length) {
      await p.route('**/*', async (ruta) => {
        const u = ruta.request().url();
        try {
          if (inalcanzables.some((host) => u.includes(host))) await ruta.abort();
          else await ruta.continue();
        } catch { /* la petición ya no existe */ }
      });
    }

    const errores = [];
    const externos = new Set();
    p.on('requestfailed', (req) => {
      const u = req.url();
      if (inalcanzables.some((host) => u.includes(host))) externos.add(u.split('?')[0]);
    });
    p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)));
    p.on('console', (m) => {
      if (m.type() !== 'error') return;
      const url = (m.location() && m.location().url) || '';
      if (url && !url.includes(LOCAL)) return;            // ruido de dominios externos
      const txt = m.text().slice(0, 160);
      if (/Failed to load resource/i.test(txt) && !url.includes(LOCAL)) return;
      errores.push(txt);
    });

    let abierta = false;
    for (let intento = 1; intento <= 2 && !abierta; intento++) {
      try {
        await p.goto(`http://${LOCAL}/${rev.archivo}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        abierta = true;
      } catch (e) {
        if (intento === 2) errores.push('no cargó: ' + String(e.message).slice(0, 120));
      }
    }
    await p.waitForTimeout(1200);

    rev.consola = [...new Set(errores)];
    rev.externos = [...externos];
    if (rev.consola.length) rev.fallos.push(`${rev.consola.length} error(es) en consola`);
    await ctx.close();
  }
  await navegador.close();
  servidor.close();
  return true;
}

/* ── Ejecución ─────────────────────────────────────────────────────── */
(async () => {
  /* Qué se audita: el sitio card (por omisión), una carpeta concreta (--raiz) o
     todos los proyectos de clientes del workspace (--clientes).
     KZ-QA-CLIENTES-001: ningún proyecto de cliente se publica si esto no da 0. */
  let proyectos;
  if (MODO_CLIENTES) {
    proyectos = proyectosClientes();
    if (!proyectos.length) { console.error('No se encontró ningún proyecto de cliente con index.html.'); process.exit(1); }
  } else if (RAIZ_PUNTUAL) {
    if (!fs.existsSync(path.join(RAIZ_PUNTUAL, 'index.html'))) {
      console.error('La carpeta indicada no tiene index.html: ' + RAIZ_PUNTUAL);
      process.exit(1);
    }
    proyectos = [{ nombre: path.basename(RAIZ_PUNTUAL), raiz: RAIZ_PUNTUAL }];
  } else {
    proyectos = [{ nombre: 'card (sitio principal)', raiz: RAIZ }];
  }

  const resultados = [];
  for (const proyecto of proyectos) {
    const archivos = paginasHtml(proyecto.raiz).sort();
    const revisiones = archivos.map((f) => revisar(f, proyecto.raiz));
    const conConsola = SIN_CONSOLA ? false : await revisarConsola(revisiones, proyecto.raiz);
    resultados.push({ proyecto, archivos, revisiones, conConsola, conFallos: revisiones.filter((r) => r.fallos.length) });
  }

  const totalFallos = resultados.reduce((n, r) => n + r.conFallos.length, 0);
  const paginas = resultados.reduce((n, r) => n + r.archivos.length, 0);

  if (JSON_SALIDA) {
    console.log(JSON.stringify({
      proyectos: resultados.map((r) => ({
        proyecto: r.proyecto.nombre, paginas: r.archivos.length,
        conFallos: r.conFallos.length, consola: r.conConsola, detalle: r.revisiones
      }))
    }, null, 2));
    process.exit(totalFallos ? 1 : 0);
  }

  console.log('\n═══ verificar-calidad-html · Definition of Done ═══\n');
  for (const r of resultados) {
    console.log(`${r.conFallos.length ? '✗' : '✓'} ${r.proyecto.nombre}`);
    console.log(`    páginas : ${r.archivos.length}`);
    console.log(`    consola : ${r.conConsola ? 'revisada en Chromium' : 'OMITIDA (--sin-consola o sin Playwright)'}`);
    if (!r.archivos.length) console.log('    ⚠ no se encontraron páginas HTML');
    for (const rev of r.conFallos) {
      console.log(`    ✗ ${rev.archivo}`);
      for (const f of rev.fallos) console.log(`        ${f}`);
      if (rev.consola) for (const c of rev.consola.slice(0, 3)) console.log(`        ↳ ${c}`);
    }
    const avisos = r.revisiones.filter((x) => x.avisos.length);
    if (avisos.length) console.log(`    avisos (no bloquean): ${avisos.length} página(s)`);
    console.log('');
  }

  if (totalFallos) {
    const malos = resultados.filter((r) => r.conFallos.length).map((r) => r.proyecto.nombre);
    console.log(`RESULTADO: FALLA — ${totalFallos} de ${paginas} páginas incumplen el estándar.`);
    console.log(`  proyectos afectados: ${malos.join(', ')}`);
    console.log('  Corrige lo indicado antes de publicar (KZ-QA-GLOBAL-001 / KZ-QA-CLIENTES-001).\n');
    process.exit(1);
  }
  const consolaOk = resultados.every((r) => r.conConsola);
  console.log(`RESULTADO: OK — ${paginas}/${paginas} páginas en ${resultados.length} proyecto(s) cumplen el estándar${consolaOk ? ', incluida la consola sin errores' : ''}.\n`);
  process.exit(0);
})();
