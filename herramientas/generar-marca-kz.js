#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/generar-marca-kz.js

   KZ-WEB-003 · Fuente maestra de la marca y de los recursos de instalación.

   QUÉ HACE
     Genera, desde UN solo sitio, todo el material gráfico de identidad:
       · SVG  : lockup horizontal, lockup vertical, monograma, favicon.
       · PNG  : lockup transparente, monograma, Open Graph 1200x630,
                favicon 32/64, apple-touch 180, iconos PWA 192/512 y
                maskables.

   GEOMETRÍA
     El monograma NO se rediseña: es el path que el sitio ya usa en las 38
     páginas y en el favicon. La composición (monograma + «KONFÍO ZINC» con
     ZINC en acento) es la que ya está en la cabecera. Aquí solo se formaliza
     con la paleta Neon Tech y se exporta a los formatos que faltaban.

   PALETA (única)
     cian #00E5FF · violeta #8B5CF6 · fondo #050B14 · blanco #FFFFFF

   Uso:
     node herramientas/generar-marca-kz.js
   Códigos: 0 correcto · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PW = path.join(__dirname, 'node_modules', 'playwright');

const CIAN = '#00E5FF';
const VIOLETA = '#8B5CF6';
const FONDO = '#050B14';
const BLANCO = '#FFFFFF';

/* Monograma: mismo path que ya usa el sitio (viewBox 48x48). No se altera. */
const MONOGRAMA = 'M8 7h10v13L32 7h8L25 23l16 18H28L18 29v12H8z';
const VB_MARCA = '0 0 48 48';

const FUENTE = "Orbitron, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";

/* ── Piezas SVG ────────────────────────────────────────────────────── */

const svgLockup = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 534 128" role="img" aria-label="KONFÍO ZINC">
  <title>KONFÍO ZINC</title>
  <g transform="translate(0,16) scale(2)">
    <path d="${MONOGRAMA}" fill="${CIAN}"/>
  </g>
  <text x="120" y="86" fill="${BLANCO}" font-family="${FUENTE}" font-size="54" font-weight="800" letter-spacing="1">KONFÍO <tspan fill="${CIAN}">ZINC</tspan></text>
</svg>
`;

const svgLockupInverso = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 534 128" role="img" aria-label="KONFÍO ZINC">
  <title>KONFÍO ZINC · para fondos claros</title>
  <g transform="translate(0,16) scale(2)">
    <path d="${MONOGRAMA}" fill="${VIOLETA}"/>
  </g>
  <text x="120" y="86" fill="${FONDO}" font-family="${FUENTE}" font-size="54" font-weight="800" letter-spacing="1">KONFÍO <tspan fill="${VIOLETA}">ZINC</tspan></text>
</svg>
`;

const svgVertical = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 300" role="img" aria-label="KONFÍO ZINC">
  <title>KONFÍO ZINC · vertical</title>
  <g transform="translate(172,24) scale(2)">
    <path d="${MONOGRAMA}" fill="${CIAN}"/>
  </g>
  <text x="220" y="204" text-anchor="middle" fill="${BLANCO}" font-family="${FUENTE}" font-size="52" font-weight="800" letter-spacing="1">KONFÍO <tspan fill="${CIAN}">ZINC</tspan></text>
  <text x="220" y="248" text-anchor="middle" fill="${VIOLETA}" font-family="${FUENTE}" font-size="15" font-weight="600" letter-spacing="6">SOLUCIONES DIGITALES</text>
</svg>
`;

const svgMonograma = (color = CIAN) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB_MARCA}" role="img" aria-label="KONFÍO ZINC">
  <title>KONFÍO ZINC · monograma</title>
  <path d="${MONOGRAMA}" fill="${color}"/>
</svg>
`;

/* Favicon: monograma sobre el fondo de marca, con esquina redondeada. */
const svgFavicon = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${FONDO}"/>
  <g transform="translate(8,8) scale(1)">
    <path d="${MONOGRAMA}" fill="${CIAN}"/>
  </g>
</svg>
`;

/* Lienzo de Open Graph 1200x630 · estética Neon Tech. */
const svgOpenGraph = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glowV" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${VIOLETA}" stop-opacity=".55"/>
      <stop offset="1" stop-color="${FONDO}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowC" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${CIAN}" stop-opacity=".38"/>
      <stop offset="1" stop-color="${FONDO}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="linea" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CIAN}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${CIAN}" stop-opacity=".9"/>
      <stop offset="1" stop-color="${VIOLETA}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="${FONDO}"/>
  <circle cx="1010" cy="70" r="470" fill="url(#glowV)"/>
  <circle cx="150" cy="640" r="430" fill="url(#glowC)"/>
  <g opacity=".16" stroke="${CIAN}" stroke-width="1" fill="none">
    <path d="M0 210h1200M0 420h1200M300 0v630M900 0v630"/>
  </g>
  <g transform="translate(84,118) scale(1.9)">
    <path d="${MONOGRAMA}" fill="${CIAN}"/>
  </g>
  <text x="200" y="212" fill="${BLANCO}" font-family="${FUENTE}" font-size="74" font-weight="800" letter-spacing="1">KONFÍO <tspan fill="${CIAN}">ZINC</tspan></text>
  <text x="202" y="268" fill="${CIAN}" font-family="${FUENTE}" font-size="26" font-weight="600" letter-spacing="9">SOLUCIONES DIGITALES A MEDIDA</text>
  <rect x="200" y="310" width="880" height="2" fill="url(#linea)"/>
  <text x="202" y="384" fill="${BLANCO}" opacity=".92" font-family="Inter, Arial, sans-serif" font-size="34">Sitio web corporativo · servicios, portafolio y recursos</text>
  <text x="202" y="438" fill="${BLANCO}" opacity=".68" font-family="Inter, Arial, sans-serif" font-size="28">Mini Webs · Catálogos · Menús QR · Landing pages · Agentes IA</text>
  <g transform="translate(202,510)">
    <rect x="0" y="0" rx="999" width="274" height="62" fill="${CIAN}"/>
    <text x="137" y="40" text-anchor="middle" fill="${FONDO}" font-family="${FUENTE}" font-size="24" font-weight="800" letter-spacing="1">konfiozinc.github.io</text>
  </g>
</svg>
`;

/* ── Escritura ─────────────────────────────────────────────────────── */
const salidas = [];
function escribir(rel, contenido) {
  const p = path.join(RAIZ, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenido, 'utf8');
  salidas.push(rel + '  (' + contenido.length + ' B)');
}

const svgs = {
  'assets/img/marca/kz-logo.svg': svgLockup(),
  'assets/img/marca/kz-logo-inverso.svg': svgLockupInverso(),
  'assets/img/marca/kz-logo-vertical.svg': svgVertical(),
  'assets/img/marca/kz-monograma.svg': svgMonograma(),
  'assets/img/marca/kz-monograma-violeta.svg': svgMonograma(VIOLETA),
  'assets/img/marca/favicon.svg': svgFavicon(),
  'assets/img/marca/og-1200x630.svg': svgOpenGraph()
};
for (const [rel, c] of Object.entries(svgs)) escribir(rel, c);

console.log('=== SVG generados ===');
salidas.forEach((s) => console.log('  ' + s));

/* ── Exportación a PNG con el navegador ya instalado ───────────────── */
const TAREAS = [
  { rel: 'assets/img/marca/kz-logo.png', svg: svgLockup(), w: 1068, h: 256, transparente: true },
  { rel: 'assets/img/marca/kz-logo-negro.png', svg: svgLockupInverso(), w: 1068, h: 256, transparente: true },
  { rel: 'assets/img/marca/kz-monograma.png', svg: svgMonograma(), w: 512, h: 512, transparente: true },
  { rel: 'assets/img/og/og-1200x630.png', svg: svgOpenGraph(), w: 1200, h: 630, transparente: false },
  { rel: 'assets/img/logos/favicon-32.png', svg: svgFavicon(), w: 32, h: 32, transparente: false },
  { rel: 'assets/img/logos/favicon-64.png', svg: svgFavicon(), w: 64, h: 64, transparente: false },
  { rel: 'assets/img/icons/apple-touch-icon.png', svg: svgFavicon(), w: 180, h: 180, transparente: false },
  { rel: 'assets/img/icons/icon-192.png', svg: svgFavicon(), w: 192, h: 192, transparente: false },
  { rel: 'assets/img/icons/icon-512.png', svg: svgFavicon(), w: 512, h: 512, transparente: false },
  /* Maskable: el monograma va al 55 % para sobrevivir al recorte circular. */
  {
    rel: 'assets/img/icons/icon-maskable-192.png',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="${FONDO}"/><g transform="translate(43,43) scale(2.3)"><path d="${MONOGRAMA}" fill="${CIAN}"/></g></svg>`,
    w: 192, h: 192, transparente: false
  },
  {
    rel: 'assets/img/icons/icon-maskable-512.png',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${FONDO}"/><g transform="translate(115,115) scale(6.1)"><path d="${MONOGRAMA}" fill="${CIAN}"/></g></svg>`,
    w: 512, h: 512, transparente: false
  }
];

(async () => {
  let chromium;
  try { ({ chromium } = require(PW)); }
  catch { console.error('No se encontró Playwright en ' + PW); process.exit(2); }

  console.log('\n=== Exportando PNG ===');
  const nav = await chromium.launch({ headless: true });
  const pag = await nav.newPage({ viewport: { width: 1300, height: 700 }, deviceScaleFactor: 1 });

  /* Orbitron se carga en tiempo de generación para que el PNG quede con la
     tipografía de marca. El SVG servido no depende de ello: lleva fallback. */
  await pag.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&family=Inter:wght@400;600&display=block">
    <style>html,body{margin:0;padding:0;background:transparent}#c{display:block}</style>
    </head><body><div id="c"></div></body></html>`, { waitUntil: 'networkidle' });
  const cargo = await pag.evaluate(async () => {
    /* document.fonts.check() da false si la fuente aún no se ha descargado:
       hay que pedirla explícitamente antes de medir. */
    try { await document.fonts.load("800 54px Orbitron"); } catch {}
    try { await document.fonts.load("700 26px Orbitron"); } catch {}
    try { await document.fonts.load("400 28px Inter"); } catch {}
    try { await document.fonts.load("600 28px Inter"); } catch {}
    await document.fonts.ready;
    return {
      orbitron: document.fonts.check('800 54px Orbitron'),
      orbitron700: document.fonts.check('700 26px Orbitron'),
      inter: document.fonts.check('400 28px Inter')
    };
  }).catch(() => ({ orbitron: false, inter: false }));
  console.log('  fuente Orbitron disponible al renderizar: ' + cargo.orbitron + ' (700: ' + cargo.orbitron700 + ') · Inter: ' + cargo.inter);
  if (!cargo.orbitron) {
    console.error('\n  ABORTADO: sin Orbitron los PNG saldrían con tipografía de reserva.');
    console.error('  Comprueba la conexión o sirve la fuente en local. No se escribe un activo de marca incorrecto.');
    await nav.close();
    process.exit(2);
  }

  for (const t of TAREAS) {
    await pag.setViewportSize({ width: t.w, height: t.h });
    await pag.evaluate(({ svg, w, h }) => {
      const cont = document.getElementById('c');
      cont.innerHTML = '';
      const holder = document.createElement('div');
      holder.style.cssText = 'width:' + w + 'px;height:' + h + 'px;overflow:hidden';
      holder.innerHTML = svg.replace(/width="1200" height="630"/, 'width="' + w + '" height="' + h + '"');
      cont.appendChild(holder);
      const el = holder.querySelector('svg');
      if (el) { el.setAttribute('width', w); el.setAttribute('height', h); el.style.display = 'block'; }
    }, t);
    await pag.waitForTimeout(120);
    const buffer = await pag.screenshot({ omitBackground: t.transparente, clip: { x: 0, y: 0, width: t.w, height: t.h } });
    const destino = path.join(RAIZ, t.rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, buffer);
    console.log('  ' + t.rel.padEnd(46) + t.w + 'x' + t.h + '  ' + [Math.round(buffer.length / 1024), 'KB'].join(' ') + (t.transparente ? '  (transparente)' : ''));
  }

  await nav.close();

  /* ── Verificación de lo generado ─────────────────────────────────── */
  console.log('\n=== VERIFICACIÓN ===');
  let fallos = 0;
  const esperados = [...Object.keys(svgs), ...TAREAS.map((t) => t.rel)];
  for (const rel of esperados) {
    const p = path.join(RAIZ, rel);
    if (!fs.existsSync(p)) { console.log('  FALTA ' + rel); fallos++; continue; }
    const b = fs.readFileSync(p);
    /* PNG: comprobar firma y dimensiones reales de la cabecera IHDR. */
    if (rel.endsWith('.png')) {
      const firmaOk = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      const esperado = TAREAS.find((t) => t.rel === rel);
      const dimOk = esperado ? (w === esperado.w && h === esperado.h) : true;
      if (!firmaOk || !dimOk) { console.log('  PNG INVALIDO ' + rel + ' (' + w + 'x' + h + ')'); fallos++; }
    }
    /* SVG: sin oro y sin dependencias externas reales.
       El xmlns http://www.w3.org/2000/svg es obligatorio y no es una carga externa. */
    if (rel.endsWith('.svg')) {
      const t = fs.readFileSync(p, 'utf8');
      if (/F0B429/i.test(t)) { console.log('  ORO DETECTADO en ' + rel); fallos++; }
      const externas = [...t.matchAll(/(?:href|src)\s*=\s*["'](https?:|\/\/)[^"']*|@import\s+url\(\s*["']?https?:|url\(\s*["']?https?:/gi)];
      if (externas.length) { console.log('  REFERENCIA EXTERNA en ' + rel + ' -> ' + externas.map((e) => e[0].slice(0, 60)).join(' , ')); fallos++; }
    }
  }
  console.log('  archivos verificados: ' + esperados.length + ' · fallos: ' + fallos);

  /* El PNG de Open Graph debe ser exactamente 1200x630. */
  const og = path.join(RAIZ, 'assets/img/og/og-1200x630.png');
  const ogb = fs.readFileSync(og);
  const osw = ogb.readUInt32BE(16), osh = ogb.readUInt32BE(20);
  console.log('  Open Graph PNG: ' + osw + 'x' + osh + (osw === 1200 && osh === 630 ? '  OK' : '  <-- DEBE SER 1200x630'));

  process.exit(fallos === 0 && osw === 1200 && osh === 630 ? 0 : 1);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
