#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * enlazar-aliados-blog.js · KONFÍO ZINC
 *
 * Inserta enlaces internos a `aliados.html` (el Programa de Aliados) desde
 * los 3 artículos del blog, en dos puntos de cada uno:
 *
 *   1. Un párrafo contextual dentro del cuerpo del artículo, donde encaja
 *      con lo que se está explicando (no un bloque pegado al final).
 *   2. Una tarjeta destacada en la sección de "artículos relacionados", que
 *      es el bloque que más clics recibe al terminar de leer.
 *
 * Motivo SEO: `aliados.html` es una página nueva sin enlaces entrantes, y el
 * blog es la sección con más autoridad interna del sitio. El enlazado interno
 * desde contenido temáticamente relacionado ayuda a que Google la descubra y
 * la posicione.
 *
 * Idempotente: si el enlace ya existe, no duplica nada.
 *
 * Uso:
 *   node herramientas/enlazar-aliados-blog.js --dry-run
 *   node herramientas/enlazar-aliados-blog.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const URL_ALIADOS = 'https://konfiozinc.github.io/card/aliados.html';

/* Enlace relativo según la página (las del blog están en /blog/) */
const LINK = (texto) => `<a href="../aliados.html">${texto}</a>`;

/* ── 1. Párrafo contextual por artículo ─────────────────────────────── */
const PARRAFOS = [
  {
    archivo: 'blog/tarjetas-digitales-star-pro-elite.html',
    insertarAntesDe: '<h2 id="que-debe-tener">',
    html: `        <p>Y hay un detalle que muchos pasan por alto: si ya recomiendas productos o servicios a otros negocios, la tarjeta digital es también una fuente de ingresos. Tenemos un ${LINK('programa de aliados')} donde compras a precio de distribuidor (hasta 50% menos) o ganas 20% de comisión solo por referir. Vale la pena mirarlo si tienes red de contactos.</p>\n\n`
  },
  {
    archivo: 'blog/catalogos-y-menus-digitales.html',
    insertarAntesDe: '<div class="article-cta">',
    html: `      <p>Si trabajas con varios negocios —como diseñador, contador o community manager— este tipo de producto se vende solo: ya tienes la confianza del cliente. En el ${LINK('programa de aliados')} puedes comprar catálogos y menús a precio de distribuidor y revenderlos con tu margen, o simplemente referir y llevarte una comisión.</p>\n\n`
  },
  {
    archivo: 'blog/agentes-ia-atencion-24-7.html',
    insertarAntesDe: '<div class="article-cta">',
    html: `      <p>¿Atiendes los negocios de otros como consultor o agencia? Los agentes IA son el servicio que más rápido se vende a un negocio que ya está saturado de mensajes. Puedes ofrecerlo a tus clientes a través de nuestro ${LINK('programa de aliados')}, con precio de distribuidor o comisión por referido.</p>\n\n`
  }
];

/* ── 2. Tarjeta de enlace en la sección de artículos relacionados ───── */
/* Se inserta como primer elemento del .blog-grid de "Otros artículos". */
const TARJETA = `        <article class="post post-aliados reveal">
          <div class="post-body">
            <span class="post-cat">Programa de aliados</span>
            <h3 class="post-title"><a href="../aliados.html">Gana dinero vendiendo tarjetas digitales</a></h3>
            <p class="post-excerpt">Compras a precio de distribuidor (hasta 50% de descuento) o ganas 20% de comisión solo por referir. Sin inversión y con el diseño y el soporte de nuestro lado.</p>
            <div class="post-meta"><span><i class="fas fa-handshake" aria-hidden="true"></i> Programa de aliados</span><span><i class="fas fa-clock" aria-hidden="true"></i> 3 min de lectura</span></div>
          </div>
        </article>
`;

const ARCHIVOS_BLOG = PARRAFOS.map((p) => p.archivo);

let parrafosInsertados = 0;
let tarjetasInsertadas = 0;
const avisos = [];

/* ── Párrafos contextuales ─────────────────────────────────────────── */
for (const p of PARRAFOS) {
  const file = path.join(REPO, p.archivo);
  if (!fs.existsSync(file)) { avisos.push(`no existe ${p.archivo}`); continue; }
  let raw = fs.readFileSync(file, 'utf8');

  if (raw.includes('href="../aliados.html"') && raw.includes('programa de aliados')) {
    avisos.push(`${p.archivo}: ya tenía enlace al programa de aliados`);
  }
  if (!raw.includes(p.insertarAntesDe)) {
    avisos.push(`${p.archivo}: no se encontró el ancla ${p.insertarAntesDe}`);
    continue;
  }

  raw = raw.replace(p.insertarAntesDe, p.html + '      ' + p.insertarAntesDe);
  if (!DRY) fs.writeFileSync(file, raw, 'utf8');
  parrafosInsertados++;
}

/* ── Tarjetas en "Otros artículos que te van a servir" ─────────────── */
for (const archivo of ARCHIVOS_BLOG) {
  const file = path.join(REPO, archivo);
  if (!fs.existsSync(file)) continue;
  let raw = fs.readFileSync(file, 'utf8');

  if (raw.includes('post-aliados')) { avisos.push(`${archivo}: ya tenía la tarjeta de aliados`); continue; }

  /* Se inserta justo después de la apertura del grid de relacionados */
  const ancla = /<div class="blog-grid[^"]*">\s*\n/;
  const m = raw.match(ancla);
  if (!m) { avisos.push(`${archivo}: no se encontró el grid de relacionados`); continue; }

  raw = raw.replace(ancla, m[0] + TARJETA + '\n');
  if (!DRY) fs.writeFileSync(file, raw, 'utf8');
  tarjetasInsertadas++;
}

/* ── Reporte ───────────────────────────────────────────────────────── */
console.log(DRY ? '\n=== SIMULACIÓN (--dry-run · no se escribió nada) ===\n' : '\n=== ENLACE INTERNO A ALIADOS APLICADO ===\n');
console.log(`Párrafos contextuales insertados : ${parrafosInsertados} de ${PARRAFOS.length}`);
console.log(`Tarjetas de "relacionados"        : ${tarjetasInsertadas} de ${ARCHIVOS_BLOG.length}`);
if (avisos.length) {
  console.log('\nAvisos:');
  for (const a of avisos) console.log('  · ' + a);
}
console.log('\nURL de destino: ' + URL_ALIADOS + '\n');
