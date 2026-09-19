#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * verificar-sitio.js · KONFÍO ZINC
 *
 * Comprueba la integridad del sitio multipágina antes de publicar:
 *   - Enlaces y recursos internos (href/src) que apunten a archivos inexistentes
 *   - <title> único y ≤ 60 caracteres · meta description ≤ 155 caracteres
 *   - canonical coherente con la ubicación real del archivo
 *   - Open Graph, Twitter Cards, favicon, apple-touch-icon y placeholders GA4/Search Console
 *   - data-base correcto según la profundidad de la carpeta
 *   - JSON-LD válido (se parsea)
 *   - exactamente un <h1> por página y jerarquía de encabezados
 *   - imágenes con atributo alt
 *   - URLs del sitemap.xml que correspondan a archivos existentes
 *   - enlaces de navegación (header/footer) presentes y funcionales
 *
 * Uso:
 *   node herramientas/verificar-sitio.js
 *
 * Salida: resumen por página + lista de errores y avisos.
 * Código de salida 1 si hay errores (útil para CI o para frenar un despliegue).
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ORIGIN = 'https://konfiozinc.github.io/card/';

const errores = [];
const avisos = [];
const filas = [];

const err = (m) => errores.push(m);
const warn = (m) => avisos.push(m);

/* ── Recorrido de archivos ─────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(REPO);
const htmlFiles = all
  .filter((f) => f.endsWith('.html'))
  .filter((f) => path.basename(f) !== 'index-old.html')
  .sort();

/* ── Utilidades ────────────────────────────────────────────────────── */
const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');

function expectedCanonical(relPath) {
  if (relPath === 'index.html') return ORIGIN;
  return ORIGIN + relPath;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

console.log('\n=== VERIFICACIÓN DEL SITIO KONFÍO ZINC ===');
console.log(`Raíz: ${REPO}`);
console.log(`Archivos HTML analizados: ${htmlFiles.length}\n`);

const titulosVistos = new Map();
const canonicalsVistos = new Map();

for (const file of htmlFiles) {
  const relPath = rel(file);
  const dir = path.dirname(file);
  const raw = fs.readFileSync(file, 'utf8');
  const hash = path.basename(dir) === 'card' ? '.' : '..';
  const esperadoBase = relPath.includes('/') ? '..' : '.';
  /* El panel privado (admin.html y admin/*.html) tiene reglas propias:
     son vistas de aplicación, no páginas del sitio público. */
  const esPanel = relPath === 'admin.html' || relPath.startsWith('admin/');

  /* 1. Enlaces y recursos internos ---------------------------------- */
  const refRe = /(?:href|src)="(?!https?:|mailto:|tel:|data:|javascript:|#)([^"]*)"/g;
  let m;
  while ((m = refRe.exec(raw)) !== null) {
    const target = m[1].split('#')[0].split('?')[0];
    if (!target) continue;
    const resolved = path.resolve(dir, target);
    if (!fs.existsSync(resolved)) {
      err(`ENLACE ROTO · ${relPath}  ->  ${m[1]}`);
    }
  }

  /* 2. Metadatos ---------------------------------------------------- */
  const title = (raw.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title) err(`SIN <title> · ${relPath}`);
  else {
    if (title.length > 60) warn(`TITLE LARGO (${title.length}) · ${relPath}`);
    if (titulosVistos.has(title)) warn(`TITLE DUPLICADO · "${title}" en ${relPath} y ${titulosVistos.get(title)}`);
    else titulosVistos.set(title, relPath);
  }

  const desc = (raw.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!esPanel) {
    if (!desc) err(`SIN meta description · ${relPath}`);
    else {
      if (desc.length > 155) warn(`DESCRIPCIÓN LARGA (${desc.length}) · ${relPath}`);
      if (desc.length < 70) warn(`DESCRIPCIÓN CORTA (${desc.length}) · ${relPath}`);
    }
  }

  const canonical = (raw.match(/rel="canonical" href="([^"]*)"/) || [])[1];
  /* La página 404 y el panel privado no llevan canonical a propósito:
     la 404 es una página de error y el panel es una vista privada. */
  if (relPath === '404.html' || esPanel) {
    if (canonical) warn(`${relPath} NO debería llevar canonical · ${relPath}`);
  } else if (!canonical) err(`SIN canonical · ${relPath}`);
  else {
    const esperado = expectedCanonical(relPath);
    if (canonical !== esperado) warn(`CANONICAL DISTINTO · ${relPath} -> ${canonical} (esperado ${esperado})`);
    if (canonicalsVistos.has(canonical)) err(`CANONICAL DUPLICADO · ${canonical}`);
    canonicalsVistos.set(canonical, relPath);
  }

  if (!esPanel) {
    const base = (raw.match(/data-base="([^"]*)"/) || [])[1];
    if (base === undefined) err(`SIN data-base en <html> · ${relPath}`);
    else if (base !== esperadoBase) err(`data-base INCORRECTO · ${relPath} -> "${base}" (esperado "${esperadoBase}")`);

    const root = (raw.match(/data-root="([^"]*)"/) || [])[1];
    if (root === undefined) warn(`SIN data-root en <html> · ${relPath}`);
  }

  /* El panel privado (admin.html y admin/*.html) tiene reglas propias:
     son vistas de aplicación, no páginas del sitio público. */
  if (!esPanel) {
    if (!/name="google-site-verification"/.test(raw)) warn(`SIN meta de Search Console · ${relPath}`);
    if (!/og:title/.test(raw)) warn(`SIN Open Graph · ${relPath}`);
    if (!/og:image/.test(raw)) warn(`SIN og:image · ${relPath}`);
    if (!/twitter:card/.test(raw)) warn(`SIN Twitter Card · ${relPath}`);
    if (!/rel="icon"/.test(raw)) warn(`SIN favicon · ${relPath}`);
    if (!/apple-touch-icon/.test(raw)) warn(`SIN apple-touch-icon · ${relPath}`);
  }

  if (!esPanel) {
    if (!/G-XXXXXXXXXX/.test(raw)) warn(`SIN placeholder de GA4 · ${relPath}`);
    if (!/assets\/js\/main\.js/.test(raw)) err(`NO CARGA main.js · ${relPath}`);
    if (!/id="navToggle"/.test(raw)) err(`SIN botón de menú móvil (#navToggle) · ${relPath}`);
    if (!/id="navLinks"/.test(raw)) err(`SIN lista de navegación (#navLinks) · ${relPath}`);
    if (!/class="wa-float"/.test(raw)) err(`SIN botón flotante de WhatsApp · ${relPath}`);
    if (!/id="backTop"/.test(raw)) err(`SIN botón volver arriba (#backTop) · ${relPath}`);
    if (!/id="kzFabChat"/.test(raw)) err(`SIN agente IA flotante · ${relPath}`);
    if (!/id="modal"/.test(raw)) err(`SIN modal · ${relPath}`);
    if (!/wa\.me\/573206411340/.test(raw)) err(`SIN enlace de WhatsApp · ${relPath}`);
  } else {
    /* Comprobaciones específicas de la app de administración (no del sitio
       público). Las páginas del panel no llevan OG/Twitter/GA4/canonical:
       son vistas privadas que no se indexan ni se comparten.
       admin.html es SOLO una redirección: no carga módulos. */
    if (!/noindex/.test(raw)) err(`El panel ${relPath} DEBE ser noindex · ${relPath}`);
    if (relPath !== 'admin.html') {
      if (!/importmap/.test(raw)) err(`${relPath} SIN importmap (los módulos de Firebase no resolverán) · ${relPath}`);
      if (!/assets\/js\/config\.js/.test(raw)) err(`${relPath} no carga assets/js/config.js · ${relPath}`);
      if (!/assets\/css\/admin\.css/.test(raw)) err(`${relPath} no carga assets/css/admin.css · ${relPath}`);
      /* El login tiene layout propio (.login); el resto pinta en #app-shell. */
      if (relPath !== 'admin/index.html' && !/id="app-shell"/.test(raw)) err(`${relPath} SIN #app-shell (el shell no puede pintarse) · ${relPath}`);
      if (relPath === 'admin/index.html' && !/id="login-form"/.test(raw)) err(`admin/index.html SIN formulario de login · ${relPath}`);
    }
  }
  if (!esPanel && !/assets\/css\/styles\.css/.test(raw)) err(`NO CARGA styles.css · ${relPath}`);

  /* 3. JSON-LD válido ---------------------------------------------- */
  let jsonld = 0;
  const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  while ((m = ldRe.exec(raw)) !== null) {
    jsonld++;
    try { JSON.parse(m[1]); }
    catch (e) { err(`JSON-LD INVÁLIDO · ${relPath} -> ${e.message}`); }
  }
  if (jsonld === 0 && !esPanel) warn(`SIN datos estructurados · ${relPath}`);

  /* 4. Encabezados -------------------------------------------------- */
  /* El panel pinta su título con el shell (no tiene <h1> estático). */
  const h1s = raw.match(/<h1[\s>]/g) || [];
  if (!esPanel) {
    if (h1s.length === 0) err(`SIN <h1> · ${relPath}`);
    else if (h1s.length > 1) err(`VARIOS <h1> (${h1s.length}) · ${relPath}`);
  }

  /* Para la jerarquía de encabezados solo se analiza el contenido principal:
     el footer (bloques de enlaces con <h4>) y el modal (diálogo con su propia
     jerarquía) quedan fuera del flujo del documento y no deben contarse. */
  const iMain = raw.indexOf('<main');
  const iFinMain = raw.indexOf('</main>');
  const contenidoPrincipal = (iMain !== -1 && iFinMain > iMain) ? raw.slice(iMain, iFinMain) : raw;
  const niveles = [...contenidoPrincipal.matchAll(/<h([1-6])[\s>]/g)].map((x) => Number(x[1]));
  let anterior = 0;
  for (const n of niveles) {
    if (anterior && n > anterior + 1) warn(`SALTO DE JERARQUÍA h${anterior} -> h${n} · ${relPath}`);
    anterior = n;
  }

  /* 5. Imágenes con alt -------------------------------------------- */
  const imgs = raw.match(/<img\b[^>]*>/g) || [];
  for (const tag of imgs) {
    if (!/\balt=/.test(tag)) err(`IMG SIN alt · ${relPath} -> ${tag.slice(0, 80)}`);
  }

  filas.push({
    pagina: relPath,
    h1: h1s.length,
    imgs: imgs.length,
    jsonld,
    kb: Math.round(fs.statSync(file).size / 1024 * 10) / 10
  });
}

/* ── 6. Sitemap ------------------------------------------------------ */
const sitemap = path.join(REPO, 'sitemap.xml');
if (!fs.existsSync(sitemap)) err('NO EXISTE sitemap.xml');
else {
  const xml = fs.readFileSync(sitemap, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  console.log(`URLs en sitemap.xml: ${locs.length}`);
  for (const loc of locs) {
    let p = loc.replace(ORIGIN, '');
    if (p === '' || p === loc) p = 'index.html';
    if (!fs.existsSync(path.join(REPO, p))) err(`SITEMAP apunta a archivo inexistente · ${loc}`);
  }
  /* Aviso si hay páginas indexables que no están en el sitemap.
     Se excluyen las páginas que a propósito no se indexan: gracias.html
     (confirmación de formulario), 404.html (error) y todo el panel
     (admin.html y admin/*). */
  const SIN_INDEXAR = ['gracias.html', '404.html', 'admin.html'];
  for (const f of htmlFiles) {
    const r = rel(f);
    if (SIN_INDEXAR.includes(r) || r.startsWith('admin/')) continue;
    const url = expectedCanonical(r);
    if (!locs.includes(url)) warn(`PÁGINA FUERA DEL SITEMAP · ${r}`);
  }
}

/* ── 7. robots.txt --------------------------------------------------- */
const robots = path.join(REPO, 'robots.txt');
if (!fs.existsSync(robots)) err('NO EXISTE robots.txt');
else if (!/Sitemap:\s*https:\/\/konfiozinc\.github\.io\/card\/sitemap\.xml/.test(fs.readFileSync(robots, 'utf8'))) {
  err('robots.txt no referencia el sitemap');
}

/* ── 8. Reporte ------------------------------------------------------ */
console.log('\n--- RESUMEN POR PÁGINA ---');
const pad = (s, n) => String(s).padEnd(n, ' ');
for (const r of filas) {
  console.log(`${pad(r.pagina, 46)} H1:${r.h1}  imgs:${pad(r.imgs, 3)} jsonld:${r.jsonld}  ${r.kb} KB`);
}

const uniq = (a) => [...new Set(a)];
console.log(`\n--- AVISOS (${uniq(avisos).length}) ---`);
uniq(avisos).sort().forEach((a) => console.log('  ' + a));

console.log(`\n--- ERRORES (${uniq(errores).length}) ---`);
uniq(errores).sort().forEach((e) => console.log('  ' + e));

if (errores.length === 0) {
  console.log('\n✅ Sin errores: el sitio está listo para publicar.\n');
  process.exit(0);
} else {
  console.log(`\n❌ Corrige los ${uniq(errores).length} errores antes de publicar.\n`);
  process.exit(1);
}
