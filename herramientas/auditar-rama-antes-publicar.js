#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/auditar-rama-antes-publicar.js

   Simula la publicación: para CADA página de la rama, extrae todos los
   recursos locales que referencia (imágenes, CSS, JS, manifest, iconos,
   enlaces internos) y comprueba que el archivo exista en disco.

   Esto es lo que convierte un "funciona en local" en "no va a dar 404 al
   publicar". No comprueba red: comprueba existencia y rutas.

   Uso: node herramientas/auditar-rama-antes-publicar.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

function paginas(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs', 'herramientas', 'functions', 'tools', 'design-system'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');

/* Exclusiones reales de GitHub Pages (de _config.yml). */
const cfg = fs.readFileSync(path.join(RAIZ, '_config.yml'), 'utf8');
const excluidos = [...cfg.matchAll(/^\s*-\s*([^\s#]+)\s*$/gm)].map((m) => m[1].trim());
function sePublica(relPath) {
  return !excluidos.some((ex) => relPath === ex || relPath.startsWith(ex + '/'));
}

const todas = paginas(RAIZ);
const publicas = [], noindex = [];
let referencias = 0, rotas = 0, excluidasReferenciadas = 0;
const problemas = [];
const absolutas = [];

for (const pag of todas) {
  const t = fs.readFileSync(pag, 'utf8');
  const esNoindex = /name="robots"[^>]*noindex/i.test(t);
  (esNoindex ? noindex : publicas).push(rel(pag));
  if (esNoindex) continue; /* Las internas se auditan aparte. */

  const dirPag = path.dirname(pag);
  const refs = new Set();

  /* Atributos que apuntan a recursos locales. */
  for (const m of t.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/gi)) {
    let u = m[1].trim();
    if (!u || /^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(u)) continue;
    u = u.split('#')[0].split('?')[0];
    if (!u) continue;
    refs.add(u);
  }
  /* CSS url(...) dentro de style="" */
  for (const m of t.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const u = m[1].trim();
    if (/^(https?:|data:)/i.test(u)) continue;
    refs.add(u.split('#')[0].split('?')[0]);
  }

  for (const u of refs) {
    referencias++;
    /* Rutas absolutas del sitio: /card/... se resuelven contra la raíz del repo.
       Tratarlas como relativas producía falsos "no existe". */
    let destino;
    if (u.startsWith('/card/')) destino = path.join(RAIZ, u.slice('/card/'.length));
    else if (u.startsWith('/')) destino = path.join(RAIZ, u.slice(1));
    else destino = path.resolve(dirPag, u);
    const relDestino = rel(destino);
    if (!fs.existsSync(destino)) {
      rotas++;
      problemas.push(rel(pag) + ' -> ' + u + ' (NO EXISTE)');
      continue;
    }
    if (!sePublica(relDestino)) {
      excluidasReferenciadas++;
      problemas.push(rel(pag) + ' -> ' + u + ' (existe pero _config.yml la EXCLUYE de la publicación)');
    }
    /* Ruta absoluta con /card/: funciona en Pages pero se rompe si el sitio
       pasa a dominio propio. Se informa como observación, no como fallo. */
    if (u.startsWith('/card/') && !absolutas.includes(rel(pag) + ' -> ' + u)) absolutas.push(rel(pag) + ' -> ' + u);
  }
}

console.log('=== INVENTARIO DE PÁGINAS ===');
console.log('  total de .html en la rama : ' + todas.length);
console.log('  PÚBLICAS (indexables)     : ' + publicas.length);
console.log('  NOINDEX (internas)        : ' + noindex.length);
console.log('  suma                      : ' + (publicas.length + noindex.length));
console.log('\n  noindex: ' + noindex.join(', '));

console.log('\n=== REFERENCIAS LOCALES EN PÁGINAS PÚBLICAS ===');
console.log('  referencias comprobadas      : ' + referencias);
console.log('  archivos inexistentes (404)  : ' + rotas);
console.log('  archivos excluidos de Pages  : ' + excluidasReferenciadas);

console.log('\n=== PROBLEMAS ===');
if (problemas.length === 0) console.log('  ninguno');
else problemas.slice(0, 40).forEach((p) => console.log('  · ' + p));
if (problemas.length > 40) console.log('  ... y ' + (problemas.length - 40) + ' más');

/* Comprobación aparte: enlaces de navegación a rutas internas.
   Se ignoran los anclas (#panel es una sección, no una página) y se acepta que
   una página pública enlace a gracias.html: es la pantalla posterior al envío
   del formulario y noindex no significa inalcanzable. */
console.log('\n=== ENLACES A RUTAS INTERNAS ===');
const fugas = [];
for (const pag of publicas) {
  const t = fs.readFileSync(path.join(RAIZ, pag), 'utf8');
  const destinos = [...t.matchAll(/href="([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((u) => !/^(https?:|mailto:|tel:|data:|#|javascript:|\/card\/)/i.test(u))
    .map((u) => u.split('#')[0].split('?')[0])
    .filter((u) => /(^|\/)(admin|panel)(\.html|\/|$)/i.test(u) && !/gracias/i.test(u));
  if (destinos.length) fugas.push(rel(pag) + ' -> ' + [...new Set(destinos)].join(', '));
}
if (fugas.length === 0) console.log('  ninguna: ninguna página pública enlaza al panel administrativo');
else fugas.forEach((f) => console.log('  · ' + f));

console.log('\n=== OBSERVACIONES (no bloquean) ===');
if (absolutas.length === 0) console.log('  ninguna');
else absolutas.forEach((a) => console.log('  · ruta absoluta /card/: ' + a + '  (válida en Pages; se rompería con dominio propio)'));

process.exit(rotas === 0 && excluidasReferenciadas === 0 ? 0 : 1);
