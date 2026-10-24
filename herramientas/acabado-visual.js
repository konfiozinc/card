/* KZ-DESIGN-001 · Acabado visual final.

   1. Titular del hero en movil: 60 px de 365 px de alto (55 % de la pantalla) y
      desbordaba. Se reescala en el tramo pequeno.
   2. Flotantes: el boton de WhatsApp estaba a bottom:96px y aterrizaba sobre los
      CTA del hero. Pasa a la franja inferior, al lado del chat. La etiqueta
      «¿Te ayudo?» se oculta en movil para no tapar contenido.
   3. Logo: las paginas interiores usaban un JPEG de 38 px y la portada un
      monograma SVG. Se unifica al SVG.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

const SVG_MARCA = '<svg class="nav-logo-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M8 7h10v13L32 7h8L25 23l16 18H28L18 29v12H8z"/></svg>';

/* ── 1 · Titular del hero en movil ────────────────────────────────── */
const prem = path.join(RAIZ, 'premium-assets/styles.css');
let p = fs.readFileSync(prem, 'utf8');
const antesP = p;

/* El tramo <=560px es el que fija los 60 px medidos (16vw a 375px). */
p = p.replace(
  '.hero h1 { font-size: clamp(3rem,16vw,5rem); line-height: .87; }',
  '.hero h1 { font-size: clamp(1.95rem, 8.6vw, 2.9rem); line-height: .95; letter-spacing: -.025em; }'
);
/* A 320px el clamp anterior todavia daba 51px: se acota tambien ese tramo. */
p = p.replace(
  '.hero h1 { font-size: clamp(4.6rem, 5.5vw, 5.6rem); line-height: .88; }',
  '.hero h1 { font-size: clamp(2rem, 8.2vw, 3rem); line-height: .95; letter-spacing: -.025em; }'
);
if (p !== antesP) { fs.writeFileSync(prem, p, 'utf8'); console.log('1 · titular del hero reescalado en movil'); }
else console.log('1 · AVISO: no se encontro la regla del titular');

/* ── 2 · Flotantes ─────────────────────────────────────────────────── */
const est = path.join(RAIZ, 'assets/css/styles.css');
let s = fs.readFileSync(est, 'utf8');
const antesS = s;

/* El WhatsApp pasa a la franja inferior, a la izquierda del chat (que ocupa
   right:16px y 56px de ancho). Asi ninguno de los dos queda a media pantalla
   sobre los CTA del hero. */
s = s.replace(
  '.wa-float { width: 50px; height: 50px; font-size: 23px; bottom: 96px; right: 16px; }',
  '.wa-float { width: 50px; height: 50px; font-size: 23px; bottom: 19px; right: 84px; }'
);
if (s !== antesS) { fs.writeFileSync(est, s, 'utf8'); console.log('2 · WhatsApp movido a la franja inferior'); }
else console.log('2 · AVISO: no se encontro la regla del flotante de WhatsApp');

/* La etiqueta «¿Te ayudo?» se oculta en movil: es la que quedaba sobre el
   contenido. Se hace en la capa de identidad, que carga ultima en comerciales. */
const neon = path.join(RAIZ, 'assets/css/kz-neon.css');
let n = fs.readFileSync(neon, 'utf8');
if (n.indexOf('AJUSTE DE MOVIL') === -1) {
  n += `

/* ─── 12. AJUSTE DE MOVIL (KZ-DESIGN-001) ────────────────────────────────
   Los tres flotantes (chat, WhatsApp y volver arriba) viven en la franja
   inferior de la pantalla, en una sola fila, para no quedar a media altura
   sobre los botones de llamada a la accion del hero.
   La etiqueta «¿Te ayudo?» se oculta en movil: ocupaba el ancho util y tapaba
   contenido; el boton conserva su aria-label y sigue siendo accesible. */
@media (max-width: 560px) {
  .kz-bubble { display: none !important; }
  /* Hueco al final del documento para que el ultimo contenido no quede bajo
     los flotantes cuando se llega al pie. */
  body { padding-bottom: 78px; }
}
`;
  fs.writeFileSync(neon, n, 'utf8');
  console.log('2 · etiqueta «¿Te ayudo?» oculta en movil y hueco inferior reservado');
}

/* ── 3 · Logo unificado ────────────────────────────────────────────── */
const RE_IMG = /<img src="assets\/img\/logos\/logo\.jpeg"[^>]*class="nav-logo-img"[^>]*>/g;
const RE_IMG_ALT = /<img[^>]*class="nav-logo-img"[^>]*>/g;
let paginas = 0;
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs', 'herramientas', 'design-system'].includes(e.name)) continue;
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) { recorrer(ruta); continue; }
    if (!e.name.endsWith('.html')) continue;
    let t = fs.readFileSync(ruta, 'utf8');
    if (t.indexOf('nav-logo-img') === -1) continue;
    const antes = t;
    t = t.replace(RE_IMG, SVG_MARCA).replace(RE_IMG_ALT, SVG_MARCA);
    if (t !== antes) { fs.writeFileSync(ruta, t, 'utf8'); paginas++; }
  }
})(RAIZ);
console.log('3 · logo unificado al monograma SVG en ' + paginas + ' páginas');

/* Estilo del monograma para que ocupe el mismo hueco que el JPEG. */
if (s.indexOf('.nav-logo-svg') === -1) {
  let t = fs.readFileSync(est, 'utf8');
  t += `

/* KZ-DESIGN-001 · Monograma SVG de la marca, el mismo de la portada. Sustituye
   al JPEG de 38 px que usaban las páginas interiores y que hacia que la
   cabecera pareciera de otra identidad. */
.nav-logo-svg { width: 34px; height: 34px; fill: currentColor; flex-shrink: 0; }
`;
  fs.writeFileSync(est, t, 'utf8');
  console.log('3 · estilo del monograma añadido');
}
