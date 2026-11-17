'use strict';
/**
 * KZ-MINI-001 · EXPORTADOR de Mini Webs (línea de comandos).
 *
 * Este archivo ya NO genera el HTML: eso lo hace `server/mini-web.mjs` del
 * STUDIO, que es el mismo motor que usa el botón del panel. Antes había dos
 * implementaciones y podían separarse (un cambio en una no llegaba a la otra);
 * ahora hay una sola y aquí solo queda lo que necesita navegador: los PNG del
 * icono y la imagen og.png, que el servidor no puede generar.
 *
 * Qué produce, por plantilla:
 *   index.html            · del módulo compartido (autocontenido, sin red)
 *   favicon.svg           · del módulo compartido
 *   icono-32.png          · aquí, con Chromium
 *   icono-64.png          · aquí, con Chromium
 *   apple-touch-icon.png  · aquí, con Chromium
 *   og.png                · aquí, con Chromium (1200×630)
 *   datos.json            · las entradas exactas (evidencia)
 *
 * Uso:
 *   node herramientas/construir-mini-web.cjs --plantilla elegancia \
 *     --negocio "Panadería La Espiga" --url "https://…/la-espiga/" \
 *     --salida "demo/mini-web/elegancia" \
 *     [--descripcion "..."] [--ciudad "..."] [--whatsapp 573001234567] \
 *     [--primario "#1f3a5f"] [--secundario "#c9a227"] \
 *     [--servicios '[{"nombre":"…","precio":"…"}]'] \
 *     [--playwright <ruta>] [--browser <exe>]
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '..');
const WORKSPACE = path.resolve(RAIZ, '..', '..');
const CONTRATO = path.join(RAIZ, 'mini-demo', 'plantillas.js');
const MODULO = process.env.KZ_MOTOR_MINI_WEB ||
  path.join(WORKSPACE, '18-KONFIO-ZINC-STUDIO', 'server', 'mini-web.mjs');

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

/** Lámina 1200×630 para og.png. Solo se usa aquí: no es una página del sitio. */
function lamina(d) {
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

  // Motor único: el mismo módulo que usa el panel del STUDIO.
  const motor = await import(pathToFileURL(MODULO).href);
  const revision = motor.normalizar({
    plantilla: o.plantilla,
    negocio: o.negocio,
    descripcion: o.descripcion,
    ciudad: o.ciudad,
    whatsapp: o.whatsapp,
    primario: o.primario,
    secundario: o.secundario,
    servicios: o.servicios ? JSON.parse(o.servicios) : undefined,
    url: o.url
  });
  if (!revision.ok) throw new Error('Datos no válidos: ' + revision.errores.join('; '));

  const d = revision.datos;
  const pagina = motor.renderMiniWeb(d, { iconos: 'completo' });
  const salida = path.resolve(o.salida);
  fs.mkdirSync(salida, { recursive: true });

  fs.writeFileSync(path.join(salida, 'index.html'), pagina.html, 'utf8');
  fs.writeFileSync(path.join(salida, 'favicon.svg'), pagina.faviconSvg, 'utf8');
  fs.writeFileSync(path.join(salida, 'lamina.html'), lamina(d), 'utf8');

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
    motor: path.relative(WORKSPACE, MODULO),
    plantilla: d.plantilla.id,
    nombrePlantilla: d.plantilla.nombre,
    entradas: { ...o, servicios: d.servicios },
    archivos: fs.readdirSync(salida).sort(),
    contrato: path.relative(RAIZ, CONTRATO),
    nota: 'Exportación privada. No se ha publicado nada. La imagen og:image apunta a una URL que debe existir cuando se publique; comprobarla a ojo es obligatorio (KZ-QA-CLIENTES-001).'
  };
  fs.writeFileSync(path.join(salida, 'datos.json'), JSON.stringify(registro, null, 2), 'utf8');

  console.log(`Exportada «${d.negocio}» con la plantilla ${d.plantilla.nombre} (motor único): ${salida}`);
  console.log('Archivos: ' + registro.archivos.join(', '));
  process.exitCode = 0;
}

main().catch((e) => {
  console.error('No se pudo exportar: ' + e.message);
  process.exitCode = 1;
});
