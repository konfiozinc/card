#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * pulir-textos-marca.js · KONFÍO ZINC
 *
 * Tercera pasada de limpieza tras la reestructuración a los 6 servicios
 * reales. Elimina las referencias residuales a servicios que la agencia
 * ya no ofrece (SEO, redes sociales, publicidad digital, desarrollo web
 * genérico, branding, email marketing) que quedaron en textos de
 * plantilla: la descripción del footer (repetida en todas las páginas),
 * el subtítulo del hero, respuestas de FAQ y la biografía del fundador.
 *
 * Idempotente: informa qué reemplazos no encontró (ya corregidos).
 *
 * Uso:
 *   node herramientas/pulir-textos-marca.js --dry-run
 *   node herramientas/pulir-textos-marca.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const DESCRIPCION_OK = 'Soluciones digitales para negocios en Colombia: tarjetas digitales, catálogos, menús digitales, landing pages, códigos QR y agentes IA que hacen crecer tu negocio.';

/** Descripción antigua del footer (varias variantes). */
const FOOTER_VIEJO = [
  'Agencia de marketing digital en Colombia. Estrategia, diseño y tecnología para que tu negocio consiga más clientes: SEO, redes, publicidad, web, branding, IA y productos digitales.',
  'Agencia de marketing digital en Colombia. Estrategia, diseño y tecnología para que tu negocio consiga más clientes: SEO, redes, publicidad, web, branding, IA y productos digitales',
  'Agencia de marketing digital en Colombia. Estrategia, diseño y tecnología para que tu negocio consiga más clientes: SEO, redes, publicidad, web, branding, IA y productos digitales'
];

/** Reemplazos puntuales por archivo. */
const PUNTUALES = [
  /* ── index.html ───────────────────────────────────────────────── */
  ['index.html',
    '<p class="hero-sub reveal">Somos KONFÍO ZINC: el equipo que combina estrategia, diseño y tecnología para que tu negocio consiga más clientes. Desde tu sitio web y tus redes hasta publicidad, SEO y asistentes con IA, todo en un solo lugar.</p>',
    '<p class="hero-sub reveal">Somos KONFÍO ZINC: creamos las herramientas digitales que tu negocio necesita para conseguir más clientes. Tarjetas digitales, catálogos, menús con QR, landing pages y agentes IA que atienden 24/7, todo diseñado a tu medida.</p>'],
  ['index.html',
    '"acceptedAnswer": { "@type": "Answer", "text": "Los productos digitales como tarjetas, catálogos y menús digitales se entregan en 24 a 48 horas hábiles. Las landing pages y sitios web tardan entre 5 y 15 días hábiles según el alcance. Las estrategias de SEO, redes y publicidad son mensuales con reportes periódicos." }',
    '"acceptedAnswer": { "@type": "Answer", "text": "Las tarjetas digitales, catálogos, menús digitales y códigos QR se entregan en 24 a 48 horas hábiles. Las landing pages tardan entre 5 y 15 días hábiles y los agentes IA entre 5 y 10 días hábiles, según el alcance." }'],
  ['index.html',
    '<div class="faq-answer"><p>Los productos digitales (tarjetas, catálogos y menús) se entregan en <strong>24 a 48 horas hábiles</strong>. Las landing pages y sitios web tardan entre 5 y 15 días hábiles según el alcance. Las estrategias de SEO, redes y publicidad son mensuales, con reportes periódicos.</p></div>',
    '<div class="faq-answer"><p>Las tarjetas digitales, catálogos, menús digitales y códigos QR se entregan en <strong>24 a 48 horas hábiles</strong>. Las landing pages tardan entre 5 y 15 días hábiles y los agentes IA entre 5 y 10 días hábiles, según el alcance y la información disponible.</p></div>'],
  ['index.html',
    'Para estrategias mensuales de SEO, redes o publicidad preparamos una propuesta según tus objetivos. <a href="contacto.html">Pide tu cotización gratis</a>.',
    'Para proyectos que combinan varios servicios, los paquetes todo en uno salen más económicos. <a href="contacto.html">Pide tu cotización gratis</a>.'],

  /* ── nosotros.html: biografía del fundador ───────────────────── */
  ['nosotros.html',
    '"description": "Fundador de KONFÍO ZINC. Diseña y dirige estrategias de marketing digital que combinan posicionamiento, diseño, desarrollo web y automatización para negocios colombianos."',
    '"description": "Fundador de KONFÍO ZINC. Diseña tarjetas digitales, catálogos, menús, landing pages, códigos QR y agentes IA que ayudan a los negocios colombianos a conseguir más clientes."'],
  ['nosotros.html',
    '"name": "Marketing digital",',
    '"name": "Soluciones digitales",'],
  ['nosotros.html',
    '"Posicionamiento SEO",\n      "Publicidad digital en Google y Meta Ads",\n      "Diseño y desarrollo web",\n      "Branding e identidad visual",',
    '"Tarjetas digitales interactivas",\n      "Catálogos y menús digitales",\n      "Landing pages de conversión",\n      "Códigos QR y agentes IA",'],
  ['nosotros.html',
    '<p>Con esa obsesión crecimos. Los clientes empezaron a pedir más: "ya tengo la tarjeta, ¿ahora cómo hago que me encuentren en Google?", "¿cómo consigo',
    '<p>Con esa obsesión crecimos. Los clientes empezaron a pedir más: "ya tengo la tarjeta, ¿cómo muestro mi catálogo completo?", "¿cómo consigo'],
  ['nosotros.html',
    '<p>Hoy KONFÍO ZINC es una <strong>agencia integral de marketing digital</strong> con presencia en toda Colombia, atención 100 % online y un equipo que',
    '<p>Hoy KONFÍO ZINC ofrece <strong>seis soluciones digitales</strong> con presencia en toda Colombia, atención 100 % online y un equipo que'],
  ['nosotros.html',
    '<p class="card-text">Escribe los textos que venden: publicaciones, guiones, artículos de blog optimizados para SEO, correos y mensajes de WhatsApp con',
    '<p class="card-text">Escribe los textos que venden: descripciones de productos, guiones, artículos de blog y mensajes de WhatsApp con'],
  ['nosotros.html',
    '<p class="card-text">Ser la agencia de marketing digital de referencia en Colombia, reconocida por tres cosas: resultados medibles, trato humano y uso',
    '<p class="card-text">Ser la referencia en soluciones digitales para negocios en Colombia, reconocida por tres cosas: resultados medibles, trato humano y uso'],
  ['nosotros.html',
    '<p class="page-hero-sub reveal">Somos KONFÍO ZINC, una agencia de marketing digital colombiana que combina estrategia, diseño y tecnología. No entrega',
    '<p class="page-hero-sub reveal">Somos KONFÍO ZINC, un estudio digital colombiano que combina estrategia, diseño y tecnología. No entrega'],

  /* ── portafolio.html ─────────────────────────────────────────── */
  ['portafolio.html',
    'content="Casos de éxito reales de marketing digital: tarjetas digitales, landing pages, catálogos, menús digitales, asistentes IA y códigos QR."',
    'content="Casos de éxito reales: tarjetas digitales, catálogos, menús digitales, landing pages, códigos QR y agentes IA para negocios en Colombia."'],

  /* ── blog.html y blog/index.html ─────────────────────────────── */
  ['blog.html',
    'content="Artículos y guías prácticas de marketing digital para dueños de negocio: menús digitales, códigos QR, tendencias 2026 y más. Aprende y aplica."',
    'content="Artículos y guías prácticas para dueños de negocio: tarjetas digitales, catálogos, menús con QR, landing pages y agentes IA. Aprende y aplica."'],
  ['blog.html',
    '"description": "Artículos, guías y estrategias de marketing digital para hacer crecer tu negocio: menús digitales, códigos QR, tendencias y más."',
    '"description": "Artículos y guías para hacer crecer tu negocio: tarjetas digitales, catálogos, menús con QR, landing pages y agentes IA."'],
  ['blog.html',
    '"description": "Guías, casos y estrategias de marketing digital para negocios colombianos: menús y catálogos digitales, códigos QR, tarjetas digitales',
    '"description": "Guías y casos para negocios colombianos: tarjetas digitales, catálogos y menús digitales, códigos QR, landing pages y agentes IA'],
  ['blog/index.html',
    'content="Artículos y guías prácticas de marketing digital para dueños de negocio: menús digitales, códigos QR, tendencias 2026 y más. Aprende y aplica."',
    'content="Artículos y guías prácticas para dueños de negocio: tarjetas digitales, catálogos, menús con QR, landing pages y agentes IA. Aprende y aplica."']
];

/* ── Ejecución ─────────────────────────────────────────────────────── */
const todos = fs.readdirSync(REPO, { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.html') && path.basename(f) !== 'index-old.html')
  .map((f) => path.join(REPO, f));

let footerCorregidos = 0;
let puntualesAplicados = 0;
const noEncontrados = [];

/* 1. Descripción del footer en todas las páginas */
for (const file of todos) {
  let raw = fs.readFileSync(file, 'utf8');
  const original = raw;
  for (const viejo of FOOTER_VIEJO) {
    if (raw.includes(viejo)) {
      raw = raw.split(viejo).join(DESCRIPCION_OK);
    }
  }
  if (raw !== original) {
    if (!DRY) fs.writeFileSync(file, raw, 'utf8');
    footerCorregidos++;
  }
}

/* 2. Reemplazos puntuales */
for (const [archivoRel, buscar, reemplazar] of PUNTUALES) {
  const file = path.join(REPO, archivoRel);
  if (!fs.existsSync(file)) { noEncontrados.push(`${archivoRel} :: (no existe)`); continue; }
  let raw = fs.readFileSync(file, 'utf8');
  if (!raw.includes(buscar)) { noEncontrados.push(`${archivoRel} :: ${buscar.slice(0, 60)}…`); continue; }
  raw = raw.split(buscar).join(reemplazar);
  if (!DRY) fs.writeFileSync(file, raw, 'utf8');
  puntualesAplicados++;
}

console.log(DRY ? '\n=== SIMULACIÓN (--dry-run) ===\n' : '\n=== TEXTOS DE MARCA PULIDOS ===\n');
console.log(`Descripción del footer corregida en : ${footerCorregidos} archivos`);
console.log(`Reemplazos puntuales aplicados      : ${puntualesAplicados} de ${PUNTUALES.length}`);
if (noEncontrados.length) {
  console.log(`\nNo encontrados (${noEncontrados.length}) — probablemente ya corregidos:`);
  for (const x of noEncontrados) console.log('  · ' + x);
}
console.log('');
