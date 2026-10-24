/* KZ-DESIGN-001 · Integración final: tipografía corporativa y navegación.

   PROBLEMA MEDIDO
   · La portada carga SOLO fuentes del sistema y usa --display: "Arial Black".
     Las 39 páginas comerciales cargan Orbitron (geométrica) + Inter.
     De ahí que la portada y las interiores "parezcan dos identidades".
   · El menú de la portada apunta a anclas de su propia página
     (#servicios, #portafolio, #precios, #contacto), mientras el resto del sitio
     navega a las páginas reales, con otras etiquetas.

   QUÉ HACE
   1. Adopta Orbitron como fuente de titulares en la portada, con la MISMA carga
      que ya usan las páginas comerciales: no se introduce ninguna fuente nueva
      ni ningún proveedor nuevo.
   2. Alinea el menú de la portada con el vocabulario y los destinos del sitio.
   3. No toca el panel (no recibe navegación pública) ni el botón flotante.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

/* ── 1 · Orbitron como fuente de titulares en las páginas premium ──── */
const FONT_BLOCK = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" onload="this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" /></noscript>
`;

const PREMIUM = ['index.html', '404.html', 'recursos.html', 'politica-privacidad.html'];
let conFuente = 0;
for (const rel of PREMIUM) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) continue;
  let t = fs.readFileSync(p, 'utf8');
  if (t.indexOf('family=Orbitron') !== -1) continue;
  /* Se inserta justo antes de la primera hoja de estilos propia. */
  const m = t.match(/^[ \t]*<link[^>]*href="(?:\.\.\/)?(?:premium-)?assets?\/css\/[^"]*"[^>]*>[ \t]*$/m);
  if (m) {
    const i = m.index;
    t = t.slice(0, i) + FONT_BLOCK + t.slice(i);
    fs.writeFileSync(p, t, 'utf8');
    conFuente++;
  } else {
    console.log('  AVISO: no se encontró dónde insertar las fuentes en ' + rel);
  }
}
console.log('1 · fuentes geométricas añadidas en ' + conFuente + ' páginas premium');

/* ── 2 · --display pasa a Orbitron con respaldo del sistema ────────── */
const prem = path.join(RAIZ, 'premium-assets/styles.css');
let p = fs.readFileSync(prem, 'utf8');
const antes = p;
p = p.replace(
  /--display:\s*"Arial Black",\s*"Helvetica Neue",\s*Arial,\s*sans-serif;/,
  '--display: Orbitron, "Arial Black", "Helvetica Neue", Arial, sans-serif;'
);
if (p !== antes) { fs.writeFileSync(prem, p, 'utf8'); console.log('2 · --display de la portada pasa a Orbitron (con respaldo)'); }
else console.log('2 · AVISO: no se encontró --display');

/* ── 3 · Menú de la portada alineado con el sitio ──────────────────── */
const idx = path.join(RAIZ, 'index.html');
let h = fs.readFileSync(idx, 'utf8');
const antesH = h;
h = h.replace(
  /<nav id="nav-principal" class="nav" aria-label="Navegación principal">[\s\S]*?<\/nav>/,
  `<nav id="nav-principal" class="nav" aria-label="Navegación principal">
      <!-- KZ-DESIGN-001: mismas etiquetas y destinos que la cabecera del resto del
           sitio. Antes apuntaban a anclas de esta misma página (#servicios…), así que
           la portada y las interiores ofrecían dos navegaciones distintas. -->
      <a href="servicios.html">Servicios</a>
      <a href="portafolio.html">Portafolio</a>
      <a href="precios.html">Precios</a>
      <a href="nosotros.html">Nosotros</a>
      <a href="blog.html">Blog</a>
      <a href="contacto.html">Contacto</a>
      <a class="nav__cta" href="https://wa.me/573206411340?text=Hola%20Konf%C3%ADo%20Zinc%2C%20quiero%20agendar%20un%20diagn%C3%B3stico." target="_blank" rel="noopener noreferrer">Agendar diagnóstico</a>
    </nav>`
);
if (h !== antesH) { fs.writeFileSync(idx, h, 'utf8'); console.log('3 · menú de la portada alineado (6 destinos + CTA)'); }
else console.log('3 · AVISO: no se encontró el menú de la portada');
