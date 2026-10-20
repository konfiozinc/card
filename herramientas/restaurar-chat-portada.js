/* Rehace la inyección del asesor en la portada premium, esta vez limpia:
   solo el bloque del chat flotante (sin el modal ni el resto del marcado
   heredado que arrastraba la extracción anterior). */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RAIZ = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/card-pagos-p1';

/* 1. Portada limpia, como está en HEAD */
execFileSync('git', ['-C', RAIZ, 'checkout', '--', 'index.html']);
let portada = readFileSync(RAIZ + '/index.html', 'utf8');
console.log('  portada restaurada desde HEAD: ' + Math.round(portada.length / 1024) + ' KB');

/* 2. Bloque del chat, recortado a lo que es suyo */
const fuente = readFileSync(RAIZ + '/precios.html', 'utf8');
const inicio = fuente.indexOf('<div class="kz-fab-wrapper"');
const fin = fuente.indexOf('<!-- Modal', inicio);
if (inicio < 0 || fin < 0) throw new Error('no se pudo recortar el bloque del chat');
let bloque = fuente.slice(inicio, fin).trim();
console.log('  bloque del chat recortado: ' + bloque.length + ' caracteres');

/* 3. El botón flotante usa un icono propio (la portada no carga Font Awesome)
      y su etiqueta accesible coincide con lo que se ve. */
bloque = bloque
  .replace(
    'aria-label="Abrir chat con asesor IA"',
    'aria-label="Abrir el chat del Asesor Konfi"'
  )
  .replace(
    '<i class="fas fa-robot" aria-hidden="true"></i>',
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
  );

/* 4. Inyección: hoja del chat, permiso de red para el asesor, marcado y motor */
portada = portada.replace('</head>', '  <link rel="stylesheet" href="premium-assets/chat.css">\n</head>');
portada = portada.replace(
  "connect-src 'self';",
  "connect-src 'self' https://calm-heart-6828.konfiozinc.workers.dev;"
);
portada = portada.replace(
  '</body>',
  `${bloque}\n\n  <!-- Asesor Konfi: configuración de marca y motor de respuestas -->\n  <script src="assets/js/config.js"></script>\n  <script src="assets/js/main.js" defer></script>\n</body>`
);
writeFileSync(RAIZ + '/index.html', portada, 'utf8');

/* 5. Comprobaciones de la inyección */
const scripts = (portada.match(/<script[^>]*src="assets\/js\/(config|main)\.js"/g) || []).length;
const modal = portada.includes('class="modal"');
const fab = portada.includes('id="kzFabToggle"');
const svg = portada.includes('M21 11.5a8.38');
const csp = portada.includes('calm-heart-6828');
console.log(`  scripts del asesor: ${scripts} (deben ser 2) · modal heredado: ${modal} · botón: ${fab} · icono propio: ${svg} · CSP con el Worker: ${csp}`);
console.log('  portada final: ' + Math.round(portada.length / 1024) + ' KB');
