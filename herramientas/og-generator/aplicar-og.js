const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'https://konfiozinc.github.io/card/assets/img/og/';

// Archivo -> { img, alt }
const MAP = {
  'index.html':                                { img: 'og-home.png',                 alt: 'KONFÍO ZINC — Soluciones digitales para negocios' },
  'nosotros.html':                             { img: 'og-nosotros.png',             alt: 'Conoce KONFÍO ZINC — Quiénes somos' },
  'servicios.html':                            { img: 'og-servicios.png',            alt: 'Nuestros 6 servicios digitales' },
  'portafolio.html':                           { img: 'og-portafolio.png',           alt: 'Casos de éxito reales de KONFÍO ZINC' },
  'contacto.html':                             { img: 'og-contacto.png',             alt: 'Hablemos de tu proyecto — KONFÍO ZINC' },
  'blog.html':                                 { img: 'og-blog.png',                 alt: 'Recursos y estrategias de KONFÍO ZINC' },
  'aliados.html':                              { img: 'og-aliados.png',              alt: 'Aliados estratégicos de KONFÍO ZINC' },
  'servicios/tarjetas-digitales.html':         { img: 'og-tarjetas-digitales.png',   alt: 'Tarjetas Digitales Star, Pro y Elite' },
  'servicios/catalogos-digitales.html':        { img: 'og-catalogos-digitales.png',  alt: 'Catálogos Digitales' },
  'servicios/menus-digitales.html':            { img: 'og-menus-digitales.png',      alt: 'Menús Digitales para restaurantes' },
  'servicios/landing-pages.html':              { img: 'og-landing-pages.png',        alt: 'Landing Pages que convierten' },
  'servicios/codigos-qr.html':                 { img: 'og-codigos-qr.png',           alt: 'Códigos QR personalizados' },
  'servicios/agentes-ia.html':                 { img: 'og-agentes-ia.png',           alt: 'Agentes IA 24/7' },
  'portafolio/tarjetas-digitales.html':        { img: 'og-portafolio.png',           alt: 'Casos de éxito — Tarjetas Digitales' },
  'portafolio/catalogos-digitales.html':       { img: 'og-portafolio.png',           alt: 'Casos de éxito — Catálogos Digitales' },
  'portafolio/menus-digitales.html':           { img: 'og-portafolio.png',           alt: 'Casos de éxito — Menús Digitales' },
  'portafolio/landing-pages.html':             { img: 'og-portafolio.png',           alt: 'Casos de éxito — Landing Pages' },
  'portafolio/codigos-qr.html':                { img: 'og-portafolio.png',           alt: 'Casos de éxito — Códigos QR' },
  'portafolio/agentes-ia.html':                { img: 'og-portafolio.png',           alt: 'Casos de éxito — Agentes IA' },
  'blog/index.html':                           { img: 'og-blog.png',                 alt: 'Recursos y estrategias de KONFÍO ZINC' },
  'blog/tarjetas-digitales-star-pro-elite.html': { img: 'og-blog-star-pro-elite.png', alt: 'Tarjetas Digitales: Star vs Pro vs Elite' },
  'blog/catalogos-y-menus-digitales.html':       { img: 'og-blog-catalogos-menus.png', alt: 'Catálogos y menús digitales' },
  'blog/agentes-ia-atencion-24-7.html':          { img: 'og-blog-agentes-ia.png',     alt: 'Agentes IA para atención 24/7' },
  'blog/tarjeta-digital-para-medicos.html':      { img: 'og-blog-medicos.png',        alt: 'Tarjeta digital para médicos' },
  'blog/menu-digital-para-restaurantes.html':    { img: 'og-blog-restaurantes.png',   alt: 'Menú digital para restaurantes' },
};

const WIDTH_TAG = '<meta property="og:image:width" content="1200" />';
const HEIGHT_TAG = '<meta property="og:image:height" content="630" />';

let modified = [];
let skipped = [];

for (const [file, def] of Object.entries(MAP)) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { skipped.push(file + ' (no existe)'); continue; }
  let c = fs.readFileSync(full, 'utf8');
  const before = c;
  const imgUrl = BASE + def.img;

  // og:image
  c = c.replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${imgUrl}" />`);

  // twitter:image
  c = c.replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${imgUrl}" />`);

  // og:image:alt
  c = c.replace(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/, `<meta property="og:image:alt" content="${def.alt}" />`);

  // Insertar og:image:width y :height justo después de og:image (si no existen)
  const imgLine = `<meta property="og:image" content="${imgUrl}" />`;
  if (!c.includes('og:image:width')) {
    c = c.replace(imgLine, imgLine + '\n' + WIDTH_TAG + '\n' + HEIGHT_TAG);
  }

  if (c !== before) {
    fs.writeFileSync(full, c, 'utf8');
    modified.push(file);
  } else {
    skipped.push(file + ' (sin cambios)');
  }
}

console.log('MODIFICADOS (' + modified.length + '):');
modified.forEach(f => console.log('  ' + f));
console.log('\nOMITIDOS (' + skipped.length + '):');
skipped.forEach(f => console.log('  ' + f));
