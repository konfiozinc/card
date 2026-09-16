#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * migracion-servicios.js · KONFÍO ZINC
 *
 * Migración de una sola ejecución (idempotente: si ya está aplicada no
 * cambia nada). Reestructura el sitio de los 6 servicios incorrectos a
 * los 6 servicios reales de la agencia, cambia el correo de contacto y
 * renombra las páginas del blog.
 *
 *   ANTES (incorrecto)                 →  DESPUÉS (correcto)
 *   seo                                →  tarjetas-digitales
 *   redes-sociales                     →  catalogos-digitales
 *   publicidad-digital                 →  menus-digitales
 *   desarrollo-web                     →  landing-pages
 *   branding                           →  codigos-qr
 *   email-marketing                    →  agentes-ia
 *
 * Qué hace, en orden:
 *   1. Reemplaza el bloque del submenú de Servicios del header (nav-sub)
 *   2. Reemplaza la columna "Servicios" del footer (validando los 6 enlaces)
 *   3. Reemplaza los enlaces sueltos a las páginas de servicio antiguas
 *   4. Cambia confiotv@gmail.com por konfiozinc@gmail.com
 *   5. Renombra portafolio/asistentes-ia.html → portafolio/agentes-ia.html
 *   6. Elimina las 6 páginas de servicio incorrectas (recuperables por git)
 *   7. Elimina los 3 artículos de blog antiguos (se reemplazan por 3 nuevos)
 *
 * Uso:
 *   node herramientas/migracion-servicios.js --dry-run   (simulación)
 *   node herramientas/migracion-servicios.js             (aplica)
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

/* ── Mapa oficial de servicios (orden canónico del menú) ───────────── */
const SERVICIOS = [
  { slug: 'tarjetas-digitales', label: 'Tarjetas Digitales' },
  { slug: 'catalogos-digitales', label: 'Catálogos Digitales' },
  { slug: 'menus-digitales', label: 'Menús Digitales' },
  { slug: 'landing-pages', label: 'Landing Pages' },
  { slug: 'codigos-qr', label: 'Códigos QR' },
  { slug: 'agentes-ia', label: 'Agentes IA' }
];

const SLUGS_NUEVOS = SERVICIOS.map((s) => s.slug);

/* Slug antiguo -> slug nuevo (para el reemplazo de enlaces sueltos) */
const MAPA = {
  seo: 'tarjetas-digitales',
  'redes-sociales': 'catalogos-digitales',
  'publicidad-digital': 'menus-digitales',
  'desarrollo-web': 'landing-pages',
  branding: 'codigos-qr',
  'email-marketing': 'agentes-ia'
};

const EMAIL_VIEJO = 'confiotv@gmail.com';
const EMAIL_NUEVO = 'konfiozinc@gmail.com';

const log = [];
const nota = (m) => log.push(m);

/* ── Utilidades ────────────────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');

function escribir(file, contenido) {
  if (!DRY) fs.writeFileSync(file, contenido, 'utf8');
}

/* ── Bloques generados ─────────────────────────────────────────────── */
/** Submenú del header con los 6 servicios reales. */
function navSub(prefijo) {
  return '<div class="nav-sub">\n' +
    SERVICIOS.map((s) => `          <a href="${prefijo}${s.slug}.html">${s.label}</a>`).join('\n') +
    '\n        </div>';
}

/** Columna "Servicios" del footer con los 6 servicios reales. */
function footerLinks(prefijo) {
  return SERVICIOS.map((s) => `      <a href="${prefijo}${s.slug}.html">${s.label}</a>`).join('\n');
}

/* Detección de la columna de servicios del footer: cabecera + 6 enlaces que
   apuntan a páginas de servicio (evita tocar otras columnas del footer). */
const RE_FOOTER_COL = /(<h4>Servicios<\/h4>\n)((?:\s*<a href="(?:\.\.\/)?(?:servicios\/)?[a-z-]+\.html">[^<]*<\/a>\n){6})/;

/* ── Recorrido de páginas ──────────────────────────────────────────── */
const htmlFiles = walk(REPO)
  .filter((f) => f.endsWith('.html') && path.basename(f) !== 'index-old.html')
  .sort();

let htmlTocados = 0;
let sueltosReemplazados = 0;
let correosReemplazados = 0;

for (const file of htmlFiles) {
  const r = rel(file);
  const esDirServicios = path.dirname(file) === path.join(REPO, 'servicios');
  const prefijo = esDirServicios ? '' : '../servicios/';

  let raw = fs.readFileSync(file, 'utf8');
  const original = raw;

  /* 1. Submenú del header */
  const antesNav = raw;
  raw = raw.replace(/<div class="nav-sub">[\s\S]*?<\/div>/, navSub(prefijo).replace(/^\s+/, ''));
  if (raw !== antesNav) nota(`header nav-sub actualizado · ${r}`);

  /* 2. Columna de servicios del footer */
  const antesFooter = raw;
  raw = raw.replace(RE_FOOTER_COL, (m, cabecera) => cabecera + footerLinks(prefijo) + '\n');
  if (raw !== antesFooter) nota(`footer columna Servicios actualizada · ${r}`);

  /* 3. Enlaces sueltos a páginas de servicio antiguas.
        Nunca se toca un slug que ya sea nuevo (evita encadenar reemplazos). */
  raw = raw.replace(/((?:\.\.\/)?(?:servicios\/)?)([a-z-]+)\.html/g, (m, pre, slug) => {
    if (SLUGS_NUEVOS.includes(slug)) return m;
    if (!MAPA[slug]) return m;
    sueltosReemplazados++;
    return pre + MAPA[slug] + '.html';
  });

  /* 3b. Rutas absolutas de servicio en canonical, og:url y JSON-LD */
  for (const [viejo, nuevo] of Object.entries(MAPA)) {
    if (raw.includes(`/servicios/${viejo}.html`)) {
      raw = raw.split(`/servicios/${viejo}.html`).join(`/servicios/${nuevo}.html`);
      nota(`ruta absoluta actualizada · ${r} (${viejo} -> ${nuevo})`);
    }
  }

  /* 4. Correo de contacto */
  const nCorreos = raw.split(EMAIL_VIEJO).length - 1;
  if (nCorreos > 0) {
    raw = raw.split(EMAIL_VIEJO).join(EMAIL_NUEVO);
    correosReemplazados += nCorreos;
    nota(`correo actualizado (${nCorreos}) · ${r}`);
  }

  if (raw !== original) {
    escribir(file, raw);
    htmlTocados++;
  }
}

/* ── 5. Renombrar asistentes-ia → agentes-ia (portafolio) ──────────── */
const viejoAsistentes = path.join(REPO, 'portafolio', 'asistentes-ia.html');
const nuevoAgentes = path.join(REPO, 'portafolio', 'agentes-ia.html');

if (fs.existsSync(viejoAsistentes) && !fs.existsSync(nuevoAgentes)) {
  let raw = fs.readFileSync(viejoAsistentes, 'utf8');
  raw = raw.split('asistentes-ia.html').join('agentes-ia.html');
  raw = raw.split('data-category="asistentes"').join('data-category="agentes"');
  raw = raw.split('data-filter="asistentes"').join('data-filter="agentes"');
  raw = raw.split('Asistentes con IA').join('Agentes IA');
  raw = raw.split('asistentes con IA').join('agentes IA');
  raw = raw.split('Asistentes IA').join('Agentes IA');
  raw = raw.split('asistentes IA').join('agentes IA');
  raw = raw.split('asistente con IA').join('agente IA');
  raw = raw.split('/card/portafolio/asistentes-ia.html').join('/card/portafolio/agentes-ia.html');
  if (!DRY) {
    fs.writeFileSync(nuevoAgentes, raw, 'utf8');
    fs.unlinkSync(viejoAsistentes);
  }
  nota('RENOMBRADO · portafolio/asistentes-ia.html -> portafolio/agentes-ia.html');
} else if (fs.existsSync(nuevoAgentes)) {
  nota('YA RENOMBRADO · portafolio/agentes-ia.html (sin cambios)');
}

/* ── 6 y 7. Eliminar páginas obsoletas ─────────────────────────────── */
const OBSOLETOS = [
  ...Object.keys(MAPA).map((s) => path.join(REPO, 'servicios', `${s}.html`)),
  path.join(REPO, 'blog', 'menu-digital-interactivo.html'),
  path.join(REPO, 'blog', 'tendencias-marketing-digital-2026.html'),
  path.join(REPO, 'blog', 'guia-codigos-qr-negocio.html')
];

for (const f of OBSOLETOS) {
  if (fs.existsSync(f)) {
    if (!DRY) fs.unlinkSync(f);
    nota(`ELIMINADO · ${rel(f)}`);
  }
}

/* ── Reporte ───────────────────────────────────────────────────────── */
console.log(DRY ? '\n=== SIMULACIÓN (--dry-run · no se escribió nada) ===\n' : '\n=== MIGRACIÓN APLICADA ===\n');
console.log(`Páginas HTML modificadas : ${htmlTocados}`);
console.log(`Enlaces sueltos remapeados: ${sueltosReemplazados}`);
console.log(`Correos actualizados     : ${correosReemplazados}`);
console.log('\nDetalle por archivo:');
for (const l of log) console.log('  ' + l);
console.log('');
