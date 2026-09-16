#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * corregir-textos-servicios.js · KONFÍO ZINC
 *
 * Segunda parte de la corrección de la migración anterior: el script
 * `migracion-servicios.js` reescribió los `href` de los enlaces a las
 * páginas de servicio, pero NO los textos visibles que los acompañan.
 * Resultado: quedaron enlaces correctos con etiquetas equivocadas
 * (por ejemplo "Ver servicio de SEO" apuntando a tarjetas digitales).
 *
 * Este script reemplaza esas etiquetas por las correctas y limpia las
 * menciones a los servicios que la agencia ya no ofrece.
 *
 * Es idempotente: si el texto ya está corregido, informa "no encontrado".
 *
 * Uso:
 *   node herramientas/corregir-textos-servicios.js --dry-run
 *   node herramientas/corregir-textos-servicios.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const P = 'https://konfiozinc.github.io/card/servicios/';

/* Reemplazos: [archivo, buscar (literal), reemplazar] */
const REEMPLAZOS = [
  /* ── index.html: metadatos ─────────────────────────────────────── */
  ['index.html',
    '<title>KONFÍO ZINC | Agencia de marketing digital en Colombia</title>',
    '<title>KONFÍO ZINC | Soluciones digitales para negocios</title>'],
  ['index.html',
    'content="Agencia de marketing digital: SEO, redes sociales, publicidad, desarrollo web, branding e IA. Estrategias que generan resultados medibles."',
    'content="Tarjetas digitales, catálogos, menús, landing pages, códigos QR y agentes IA. Soluciones digitales que generan resultados medibles."'],
  ['index.html',
    'content="agencia de marketing digital, SEO Colombia, publicidad digital, redes sociales, desarrollo web, branding, asistentes IA, tarjetas digitales"',
    'content="tarjetas digitales, catálogos digitales, menús digitales, landing pages, códigos QR, agentes IA, soluciones digitales Colombia"'],
  ['index.html',
    'content="KONFÍO ZINC | Agencia de marketing digital en Colombia"',
    'content="KONFÍO ZINC | Soluciones digitales para negocios"'],
  ['index.html',
    'content="Impulsamos tu marca con estrategias digitales que generan resultados: SEO, redes, publicidad, web, branding e IA."',
    'content="Tarjetas digitales, catálogos, menús, landing pages, códigos QR y agentes IA para hacer crecer tu negocio."'],
  ['index.html',
    '"description": "Agencia de marketing digital especializada en SEO, redes sociales, publicidad digital, desarrollo web, branding, email marketing, asistentes con IA, tarjetas digitales y códigos QR."',
    '"description": "Agencia de soluciones digitales: tarjetas digitales, catálogos digitales, menús digitales, landing pages, códigos QR y agentes IA para negocios en Colombia."'],
  ['index.html',
    '"name": "Servicios de marketing digital"',
    '"name": "Soluciones digitales KONFÍO ZINC"'],
  ['index.html',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Posicionamiento SEO", "url": "' + P + 'tarjetas-digitales.html" } }',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Tarjetas Digitales", "url": "' + P + 'tarjetas-digitales.html" } }'],
  ['index.html',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Gestión de redes sociales", "url": "' + P + 'catalogos-digitales.html" } }',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Catálogos Digitales", "url": "' + P + 'catalogos-digitales.html" } }'],
  ['index.html',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Publicidad digital (Google, Meta y TikTok Ads)", "url": "' + P + 'menus-digitales.html" } }',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Menús Digitales", "url": "' + P + 'menus-digitales.html" } }'],
  ['index.html',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Diseño y desarrollo web", "url": "' + P + 'landing-pages.html" } }',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Landing Pages", "url": "' + P + 'landing-pages.html" } }'],
  ['index.html',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Branding e identidad visual", "url": "' + P + 'codigos-qr.html" } }',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Códigos QR", "url": "' + P + 'codigos-qr.html" } }'],
  ['index.html',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Email marketing y automatización", "url": "' + P + 'agentes-ia.html" } }',
    '{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Agentes IA", "url": "' + P + 'agentes-ia.html" } }'],

  /* ── index.html: FAQ visible y JSON-LD ─────────────────────────── */
  ['index.html',
    '"acceptedAnswer": { "@type": "Answer", "text": "Ofrecemos SEO y posicionamiento, gestión de redes sociales, publicidad digital en Google, Meta y TikTok Ads, diseño y desarrollo web, branding e identidad visual, email marketing y automatización, tarjetas digitales, catálogos y menús digitales, asistentes con IA y códigos QR personalizados." }',
    '"acceptedAnswer": { "@type": "Answer", "text": "Ofrecemos seis soluciones: Tarjetas Digitales (planes Star, Pro y Elite), Catálogos Digitales, Menús Digitales, Landing Pages, Códigos QR y Agentes IA." }'],
  ['index.html',
    '<div class="faq-answer"><p>Ofrecemos SEO y posicionamiento, gestión de redes sociales, publicidad digital (Google, Meta y TikTok Ads), diseño y desarrollo web, branding e identidad visual, email marketing y automatización, además de productos digitales como tarjetas digitales, catálogos, menús digitales, asistentes con IA y códigos QR. Puedes ver el detalle en <a href="servicios.html">nuestros servicios</a>.</p></div>',
    '<div class="faq-answer"><p>Ofrecemos seis soluciones digitales: <strong>Tarjetas Digitales</strong> (planes Star, Pro y Elite), <strong>Catálogos Digitales</strong>, <strong>Menús Digitales</strong>, <strong>Landing Pages</strong>, <strong>Códigos QR</strong> y <strong>Agentes IA</strong>. Puedes ver el detalle y los precios en <a href="servicios.html">nuestros servicios</a>.</p></div>'],

  /* ── 404.html: enlaces de estado con etiquetas antiguas ─────────── */
  ['404.html',
    '<a href="servicios/tarjetas-digitales.html">SEO</a>',
    '<a href="servicios/tarjetas-digitales.html">Tarjetas Digitales</a>'],
  ['404.html',
    '<a href="servicios/catalogos-digitales.html">Redes sociales</a>',
    '<a href="servicios/catalogos-digitales.html">Catálogos Digitales</a>'],
  ['404.html',
    '<a href="servicios/menus-digitales.html">Publicidad digital</a>',
    '<a href="servicios/menus-digitales.html">Menús Digitales</a>'],
  ['404.html',
    '<a href="servicios/landing-pages.html">Desarrollo web</a>',
    '<a href="servicios/landing-pages.html">Landing Pages</a>'],
  ['404.html',
    '<a href="servicios/codigos-qr.html">Branding</a>',
    '<a href="servicios/codigos-qr.html">Códigos QR</a>'],
  ['404.html',
    '<a href="servicios/agentes-ia.html">Email marketing</a>',
    '<a href="servicios/agentes-ia.html">Agentes IA</a>'],

  /* ── contacto.html: selector de servicio del formulario ────────── */
  ['contacto.html',
    '<option value="SEO y posicionamiento">SEO y posicionamiento</option>',
    '<option value="Tarjetas Digitales">Tarjetas Digitales (Star, Pro, Elite)</option>'],
  ['contacto.html',
    '<option value="Redes sociales">Redes sociales</option>',
    '<option value="Catálogos Digitales">Catálogos Digitales</option>'],
  ['contacto.html',
    '<option value="Publicidad digital">Publicidad digital</option>',
    '<option value="Menús Digitales">Menús Digitales</option>'],
  ['contacto.html',
    '<option value="Desarrollo web">Desarrollo web</option>',
    '<option value="Landing Pages">Landing Pages</option>'],
  ['contacto.html',
    '<option value="Branding">Branding</option>',
    '<option value="Códigos QR">Códigos QR</option>'],
  ['contacto.html',
    '<option value="Email marketing">Email marketing</option>',
    '<option value="Agentes IA">Agentes IA</option>'],
  ['contacto.html',
    '<option value="Tarjeta digital">Tarjeta digital</option>',
    '<option value="Paquete todo en uno">Paquete todo en uno (varios servicios)</option>'],
  ['contacto.html',
    '<option value="Asistente con IA">Asistente con IA</option>',
    '<option value="Otro">Otro</option>'],

  /* ── contacto.html: descripción del blog ──────────────────────── */
  ['contacto.html',
    '<p class="card-text">Publicamos casos reales, ideas aplicables y novedades de marketing digital todas las semanas.</p>',
    '<p class="card-text">Publicamos casos reales e ideas aplicables sobre tarjetas, catálogos, menús digitales, códigos QR y agentes IA.</p>'],

  /* ── gracias.html: enlaces a artículos eliminados ──────────────── */
  ['gracias.html',
    'href="blog/tendencias-marketing-digital-2026.html"',
    'href="blog/tarjetas-digitales-star-pro-elite.html"'],
  ['gracias.html',
    'href="blog/menu-digital-interactivo.html"',
    'href="blog/catalogos-y-menus-digitales.html"'],
  ['gracias.html',
    'href="blog/guia-codigos-qr-negocio.html"',
    'href="blog/agentes-ia-atencion-24-7.html"'],

  /* ── blog.html: enlaces y nombres de artículos ─────────────────── */
  ['blog.html',
    'href="blog/tendencias-marketing-digital-2026.html"',
    'href="blog/tarjetas-digitales-star-pro-elite.html"'],
  ['blog.html',
    'href="blog/menu-digital-interactivo.html"',
    'href="blog/catalogos-y-menus-digitales.html"'],
  ['blog.html',
    'href="blog/guia-codigos-qr-negocio.html"',
    'href="blog/agentes-ia-atencion-24-7.html"']
];

/* ── Ejecución ─────────────────────────────────────────────────────── */
const porArchivo = new Map();
let aplicados = 0;
const noEncontrados = [];

for (const [archivoRel, buscar, reemplazar] of REEMPLAZOS) {
  const file = path.join(REPO, archivoRel);
  if (!fs.existsSync(file)) {
    noEncontrados.push(`${archivoRel} :: (archivo no existe)`);
    continue;
  }
  let raw = fs.readFileSync(file, 'utf8');

  if (!raw.includes(buscar)) {
    noEncontrados.push(`${archivoRel} :: ${buscar.slice(0, 70)}`);
    continue;
  }

  raw = raw.split(buscar).join(reemplazar);
  if (!DRY) fs.writeFileSync(file, raw, 'utf8');
  aplicados++;
  porArchivo.set(archivoRel, (porArchivo.get(archivoRel) || 0) + 1);
}

console.log(DRY ? '\n=== SIMULACIÓN (--dry-run) ===\n' : '\n=== TEXTOS CORREGIDOS ===\n');
console.log(`Reemplazos aplicados: ${aplicados} de ${REEMPLAZOS.length}`);
console.log('\nPor archivo:');
for (const [a, n] of [...porArchivo.entries()].sort()) console.log(`  ${a.padEnd(24)} ${n}`);

if (noEncontrados.length) {
  console.log(`\nNo encontrados (${noEncontrados.length}) — revisar si ya estaban corregidos:`);
  for (const x of noEncontrados) console.log('  · ' + x);
}
console.log('');
