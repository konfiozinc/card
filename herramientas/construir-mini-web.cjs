'use strict';
/**
 * KZ-MINI-001 · EXPORTADOR de Mini Webs.
 *
 * El demostrador (`mini-demo/`) pinta una vista previa y descarga una LÁMINA PNG.
 * No producía el artefacto entregable: la Mini Web en HTML. Este exportador
 * cierra ese eslabón usando el mismo contrato de plantillas (`mini-demo/plantillas.js`),
 * de modo que lo que el visitante elige en el demo es exactamente lo que se entrega.
 *
 * Qué genera, por plantilla:
 *   index.html            · página única, autocontenida, sin una sola petición externa
 *   favicon.svg           · icono vectorial con el color y la inicial del negocio
 *   icono-32.png          · respaldo PNG 32×32
 *   icono-64.png          · respaldo PNG 64×64
 *   apple-touch-icon.png  · 180×180 para iOS
 *   og.png                · 1200×630 para la vista previa al compartir
 *   datos.json            · las entradas exactas con las que se generó (evidencia)
 *
 * Cumple la Definición de Terminado de la casa (KZ-QA-GLOBAL-001): título único,
 * favicon SVG+PNG+apple-touch con los archivos existiendo, Open Graph completo con
 * imagen absoluta, meta descripción <= 160, cero errores de consola (no hay JS) y
 * `alt` en todas las imágenes.
 *
 * No publica nada y no escribe fuera de la carpeta de salida.
 *
 * Uso:
 *   node herramientas/construir-mini-web.cjs --plantilla elegancia \
 *     --negocio "Panadería La Espiga" --url "https://konfiozinc.github.io/mini-web/la-espiga/" \
 *     --salida "mini-demo/salidas/la-espiga" [--descripcion "..."] [--ciudad "..."] \
 *     [--whatsapp 573001234567] [--primario "#1f3a5f"] [--secundario "#c9a227"] \
 *     [--playwright <ruta>] [--browser <exe>]
 *
 * Salida: 0 si exportó, 1 si faltó un dato obligatorio o falló.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '..');
const FUENTE = path.join(RAIZ, 'mini-demo', 'plantillas.js');

function opciones(argv) {
  const conValor = ['--plantilla', '--negocio', '--descripcion', '--ciudad', '--whatsapp',
    '--primario', '--secundario', '--url', '--salida', '--playwright', '--browser', '--servicios'];
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!conValor.includes(k) || !argv[i + 1]) throw new Error('Argumento inválido: ' + k);
    o[k.slice(2)] = argv[i + 1];
  }
  return o;
}

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Recorta respetando palabras, para no cortar a mitad de una. */
function recortar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const ultimo = corte.lastIndexOf(' ');
  return (ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte).trim() + '…';
}

/** Datos de entrada: lo que no viene del cliente se toma del contrato. */
function normalizar(o, plantilla) {
  const servicios = o.servicios
    ? JSON.parse(o.servicios).slice(0, 6)
    : plantilla.servicios;
  const whatsapp = String(o.whatsapp || '').replace(/[^\d]/g, '');
  return {
    negocio: (o.negocio || '').trim(),
    descripcion: (o.descripcion || '').trim(),
    ciudad: (o.ciudad || '').trim(),
    whatsapp,
    primario: /^#[0-9a-f]{6}$/i.test(o.primario || '') ? o.primario : plantilla.colores.primario,
    secundario: /^#[0-9a-f]{6}$/i.test(o.secundario || '') ? o.secundario : plantilla.colores.secundario,
    servicios: servicios.map((s) => ({ nombre: String(s.nombre || '').trim(), precio: String(s.precio || '').trim() })),
    url: String(o.url || '').trim(),
    plantilla: plantilla
  };
}

/* ── CSS a partir de los tokens del contrato ────────────────────────────── */
function css(d) {
  const p = d.plantilla, e = p.estilo;
  const titulo = e.mayusculas ? 'text-transform:uppercase;letter-spacing:.06em;' : 'letter-spacing:-.01em;';
  const sep = e.separador === 'línea'
    ? 'border-bottom:1px solid color-mix(in srgb, var(--tinta) 22%, transparent);padding-bottom:.5rem;'
    : e.separador === 'píldora'
      ? 'display:inline-block;background:color-mix(in srgb, var(--acento) 24%, transparent);padding:.2rem .9rem;border-radius:999px;'
      : '';
  const boton = e.boton === 'contorno'
    ? 'background:transparent;color:var(--acento);border:2px solid var(--acento);'
    : 'background:var(--acento);color:#fff;border:2px solid var(--acento);';
  return `
:root{--primario:${d.primario};--acento:${d.secundario};--tinta:#191a1c;--papel:#fff;--radio:${e.radio}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--papel);color:var(--tinta);font-family:${e.cuerpo};line-height:1.6}
.wrap{width:min(1080px,92vw);margin-inline:auto}
header{background:var(--primario);color:#fff;padding:clamp(2.5rem,7vw,5rem) 0}
.hero{display:flex;flex-direction:column;gap:1rem;text-align:${e.hero === 'centrado' ? 'center' : 'left'}}
.hero img{width:64px;height:64px; ${e.hero === 'centrado' ? 'margin-inline:auto;' : ''}}
h1{font-family:${e.titulo};font-size:clamp(1.8rem,5vw,3rem);margin:0;${titulo}}
.lema{margin:0;opacity:.9;font-size:clamp(1rem,2.2vw,1.2rem)}
.ciudad{margin:0;opacity:.75;font-size:.9rem}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:.7rem 1.6rem;
 border-radius:var(--radio);font-weight:700;text-decoration:none;${boton}cursor:pointer}
.hero .btn{align-self:${e.hero === 'centrado' ? 'center' : 'flex-start'};margin-top:.5rem}
main{padding:clamp(2rem,5vw,3.5rem) 0}
h2{font-family:${e.titulo};font-size:clamp(1.3rem,3vw,1.7rem);margin:0 0 1.2rem;${titulo}${sep}}
.servicios{list-style:none;padding:0;margin:0;display:grid;gap:.8rem}
.servicios li{display:flex;justify-content:space-between;gap:1rem;align-items:baseline;
 background:color-mix(in srgb, var(--primario) 6%, #fff);border-radius:var(--radio);
 box-shadow:${e.sombra};padding:1rem 1.2rem}
.servicios b{font-weight:700}
.precio{font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--primario);font-weight:700}
.galeria{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.9rem;margin-top:2rem}
.galeria figure{margin:0}
.galeria img{width:100%;height:auto;display:block;border-radius:var(--radio);box-shadow:${e.sombra}}
.galeria figcaption{font-size:.82rem;opacity:.75;margin-top:.45rem}
footer{background:var(--primario);color:#fff;padding:2rem 0;font-size:.85rem}
footer a{color:#fff}
footer .wrap{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;justify-content:space-between;align-items:center}
a:focus-visible,.btn:focus-visible{outline:3px solid var(--acento);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`.trim();
}

/* ── HTML completo ──────────────────────────────────────────────────────── */
function html(d, imagenMuestra) {
  const p = d.plantilla;
  const titulo = recortar(d.negocio + ' · ' + p.nombre, 68);
  const descripcion = recortar(d.descripcion || p.lema, 158);
  const urlBase = d.url.replace(/\/+$/, '') + '/';
  const wa = d.whatsapp
    ? `<a class="btn" href="https://wa.me/${esc(d.whatsapp)}" target="_blank" rel="noopener">Escribir por WhatsApp</a>`
    : '';
  const servicios = d.servicios.map((s) =>
    `<li><b>${esc(s.nombre)}</b>${s.precio ? `<span class="precio">${esc(s.precio)}</span>` : ''}</li>`
  ).join('\n        ');
  const galeria = p.muestra.map((m, i) =>
    `<figure><img src="${imagenMuestra(m.titulo, m.subtitulo, d.primario, d.secundario, i, { ancho: 400, alto: 300 })}"
 alt="${esc(m.titulo + ' — ' + m.subtitulo)}"><figcaption>${esc(m.titulo)}</figcaption></figure>`
  ).join('\n        ');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(urlBase + 'og.png')}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${esc(d.primario)}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="icono-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="icono-64.png" sizes="64x64" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png" sizes="180x180">
<style>
${css(d)}
</style>
</head>
<body>
<header>
  <div class="wrap hero">
    <img src="favicon.svg" alt="Logotipo de ${esc(d.negocio)}">
    <h1>${esc(d.negocio)}</h1>
    <p class="lema">${esc(d.descripcion || p.lema)}</p>
    ${d.ciudad ? `<p class="ciudad">${esc(d.ciudad)}</p>` : ''}
    ${wa}
  </div>
</header>
<main class="wrap">
  <h2>Servicios</h2>
  <ul class="servicios">
        ${servicios}
  </ul>
  <div class="galeria">
        ${galeria}
  </div>
</main>
<footer>
  <div class="wrap">
    <span>${esc(d.negocio)}${d.ciudad ? ' · ' + esc(d.ciudad) : ''}</span>
    <span>Mini Web creada por <a href="https://konfiozinc.github.io/card/" target="_blank" rel="noopener">KONFÍO ZINC</a>
      · <a href="https://konfiozinc.github.io/card/privacidad.html" target="_blank" rel="noopener">Política de privacidad</a></span>
  </div>
</footer>
</body>
</html>
`;
}

/* ── Iconos: SVG + PNG con el navegador ya instalado ────────────────────── */
function svgIcono(d) {
  const inicial = (d.negocio || 'K').trim().charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${esc(d.negocio)}">
  <rect width="64" height="64" rx="14" fill="${d.primario}"/>
  <text x="32" y="43" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${d.secundario}">${esc(inicial)}</text>
</svg>
`;
}

function svgLamina(d) {
  const p = d.plantilla;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:${d.primario};color:#fff;font-family:${p.estilo.cuerpo};
       display:flex;flex-direction:column;justify-content:center;padding:90px 110px;gap:26px}
  .marca{display:flex;align-items:center;gap:22px}
  .marca img{width:96px;height:96px}
  h1{font-family:${p.estilo.titulo};font-size:76px;line-height:1.05;letter-spacing:-.02em}
  p{font-size:30px;opacity:.92;max-width:900px}
  .pie{font-size:22px;opacity:.7;letter-spacing:.06em;text-transform:uppercase}
  </style></head><body>
  <div class="marca"><img src="favicon.svg" alt=""><span class="pie">Mini Web · ${esc(p.nombre)}</span></div>
  <h1>${esc(d.negocio)}</h1>
  <p>${esc(d.descripcion || p.lema)}</p>
  </body></html>`;
}

async function capturar(chromium, exe, entrada, salida, ancho, alto) {
  const navegador = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
    await pagina.goto(entrada, { waitUntil: 'load' });
    await pagina.screenshot({ path: salida, omitBackground: true });
  } finally {
    await navegador.close();
  }
}

async function main() {
  const o = opciones(process.argv.slice(2));
  if (!o.plantilla) throw new Error('Falta --plantilla');
  if (!o.negocio) throw new Error('Falta --negocio');
  if (!o.url || !/^https?:\/\//i.test(o.url)) throw new Error('Falta --url absoluta (https://…) para og:image');
  if (!o.salida) throw new Error('Falta --salida');

  const mod = await import(pathToFileURL(FUENTE).href);
  const plantilla = mod.PLANTILLAS[o.plantilla];
  if (!plantilla) throw new Error(`La plantilla «${o.plantilla}» no está en el contrato. Válidas: ${Object.keys(mod.PLANTILLAS).join(', ')}`);

  const d = normalizar(o, plantilla);
  const salida = path.resolve(o.salida);
  fs.mkdirSync(salida, { recursive: true });

  fs.writeFileSync(path.join(salida, 'index.html'), html(d, mod.imagenDeMuestra), 'utf8');
  fs.writeFileSync(path.join(salida, 'favicon.svg'), svgIcono(d), 'utf8');
  fs.writeFileSync(path.join(salida, 'lamina.html'), svgLamina(d), 'utf8');

  const playwright = o.playwright || process.env.KZ_PLAYWRIGHT ||
    path.join(__dirname, 'node_modules', 'playwright');
  const browser = o.browser || process.env.KZ_CHROME ||
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const { chromium } = require(playwright);

  const base = pathToFileURL(path.join(salida, 'favicon.svg')).href;
  for (const [nombre, lado] of [['icono-32.png', 32], ['icono-64.png', 64], ['apple-touch-icon.png', 180]]) {
    await capturar(chromium, browser, base, path.join(salida, nombre), lado, lado);
  }
  await capturar(chromium, browser, pathToFileURL(path.join(salida, 'lamina.html')).href,
    path.join(salida, 'og.png'), 1200, 630);
  fs.unlinkSync(path.join(salida, 'lamina.html'));

  const registro = {
    generado: new Date().toISOString(),
    plantilla: o.plantilla,
    nombrePlantilla: plantilla.nombre,
    entradas: { ...o, servicios: d.servicios },
    archivos: fs.readdirSync(salida).sort(),
    contrato: path.relative(RAIZ, FUENTE),
    nota: 'Exportación privada. No se ha publicado nada. La imagen og:image apunta a una URL que debe existir cuando se publique; comprobarla a ojo es obligatorio (KZ-QA-CLIENTES-001).'
  };
  fs.writeFileSync(path.join(salida, 'datos.json'), JSON.stringify(registro, null, 2), 'utf8');

  console.log(`Exportada «${d.negocio}» con la plantilla ${plantilla.nombre}: ${salida}`);
  console.log('Archivos: ' + registro.archivos.join(', '));
  process.exitCode = 0;
}

main().catch((e) => {
  console.error('No se pudo exportar: ' + e.message);
  process.exitCode = 1;
});
