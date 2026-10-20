/* Optimización de carga: los dos CSS externos (Font Awesome y Google Fonts) dejan
   de bloquear el render. No se toca Google Tag Manager ni su configuración: su
   etiqueta queda exactamente como está.
   Patrón: preload + onload para que el CSS llegue sin bloquear, con respaldo
   <noscript> para quien navegue sin JavaScript. */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/card-pagos-p1';
const EXCLUIR = ['node_modules', '.git', 'docs', 'herramientas', 'functions', 'premium', '.wrangler'];

function paginas(dir, salida = []) {
  for (const e of readdirSync(dir)) {
    if (EXCLUIR.includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) paginas(p, salida);
    else if (e.endsWith('.html')) salida.push(p);
  }
  return salida;
}

const noBloqueante = (href) =>
  `<link rel="preload" as="style" href="${href}" onload="this.rel='stylesheet'" />\n    <noscript><link rel="stylesheet" href="${href}" /></noscript>`;

let conFontAwesome = 0;
let conGoogleFonts = 0;
let yaOptimizadas = 0;

for (const pagina of paginas(RAIZ)) {
  let html = readFileSync(pagina, 'utf8');
  const original = html;

  /* Font Awesome desde cdnjs */
  const fa = html.match(/<link[^>]*cdnjs\.cloudflare\.com[^>]*font-awesome[^>]*>/);
  if (fa && !html.includes('preload" as="style" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome')) {
    const href = (fa[0].match(/href="([^"]+)"/) || [])[1];
    if (href) {
      html = html.replace(fa[0], noBloqueante(href));
      conFontAwesome++;
    }
  } else if (html.includes('preload" as="style" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome')) {
    yaOptimizadas++;
  }

  /* Google Fonts */
  const gf = html.match(/<link[^>]*fonts\.googleapis\.com\/css2\?[^>]*>/);
  if (gf && !html.includes('preload" as="style" href="https://fonts.googleapis.com/css2')) {
    const href = (gf[0].match(/href="([^"]+)"/) || [])[1];
    if (href) {
      html = html.replace(gf[0], noBloqueante(href));
      conGoogleFonts++;
    }
  }

  if (html !== original) writeFileSync(pagina, html, 'utf8');
}

console.log(`  Font Awesome sin bloquear: ${conFontAwesome} páginas · Google Fonts: ${conGoogleFonts} · ya optimizadas antes: ${yaOptimizadas}`);
