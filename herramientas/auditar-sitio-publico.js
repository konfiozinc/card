#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/auditar-sitio-publico.js

   Inventario y auditoría de SOLO LECTURA del sitio público actual.
   Escribe docs/AUDITORIA-WEB-PUBLICA.json y muestra un resumen.

   Qué hace (sin modificar nada, con peticiones limitadas):
     · lee robots.txt y sitemap.xml
     · recorre las páginas internas descubiertas (tope configurable)
     · por página: estado, title, description, canonical, Open Graph,
       JSON-LD, h1, imágenes sin alt, tamaño del HTML, recursos externos
     · enlaces: internos rotos y externos (para la matriz de migración)
     · datos de contacto visibles (WhatsApp, correo, teléfono)
     · clasifica terceros: fuentes, CDN, analítica

   Uso:
     node herramientas/auditar-sitio-publico.js [--max 40] [--base <url>]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = argVal('--base', 'https://konfiozinc.github.io/card/').replace(/\/?$/, '/');
const MAX = Number(argVal('--max', 40));
const SALIDA = path.join(__dirname, '..', 'docs', 'AUDITORIA-WEB-PUBLICA.json');

const absoluta = (href, desde) => {
  try { return new URL(href, desde).href; } catch (e) { return null; }
};
const esInterna = (url) => { try { return new URL(url).origin === new URL(BASE).origin && new URL(url).pathname.startsWith(new URL(BASE).pathname); } catch (e) { return false; } };
const relativa = (url) => { try { return new URL(url).pathname.replace(new URL(BASE).pathname, '') || '/'; } catch (e) { return url; } };

async function traer(url) {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'KZ-Harness-Auditoria/1.0' } });
  const texto = await r.text();
  return { st: r.status, texto, ms: Date.now() - t0, tipo: r.headers.get('content-type') || '' };
}

(async () => {
  const inicio = new Date();
  console.log('');
  console.log('═══ AUDITORÍA DEL SITIO PÚBLICO (SOLO LECTURA) ═══');
  console.log(`  base: ${BASE}`);

  const inventario = {
    auditoria: { fecha: inicio.toISOString(), base: BASE, soloLectura: true },
    robots: null, sitemap: null, paginas: [], enlacesRotos: [], externos: {}, terceros: {},
    contacto: {}, imagenes: { total: 0, sinAlt: 0, pesoKB: 0 }, reclamaciones: [], resumen: {}
  };

  /* robots y sitemap */
  try { const r = await traer(BASE + 'robots.txt'); inventario.robots = { st: r.st, texto: r.texto.trim().slice(0, 800) }; } catch (e) { inventario.robots = { error: e.message }; }
  try { const r = await traer(BASE + 'sitemap.xml'); inventario.sitemap = { st: r.st, urls: [...r.texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) }; }
  catch (e) { inventario.sitemap = { error: e.message }; }

  /* cola de páginas: la raíz + sitemap + enlaces descubiertos */
  const cola = [BASE];
  for (const u of (inventario.sitemap.urls || [])) if (esInterna(u)) cola.push(u);
  const vistas = new Set();
  const imagenesVistas = new Set();
  const paginas = [];

  while (cola.length && paginas.length < MAX) {
    const url = cola.shift();
    const clave = url.split('#')[0];
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (!/\.html?$|^[^.]*\/$/.test(new URL(clave).pathname) && !clave.endsWith('/')) {
      if (!/\.(html?)$/i.test(new URL(clave).pathname) && new URL(clave).pathname !== new URL(BASE).pathname) {
        /* recurso no HTML: se verifica aparte si está enlazado como página */
      }
    }
    let r;
    try { r = await traer(clave); } catch (e) { inventario.enlacesRotos.push({ url: relativa(clave), motivo: e.message }); continue; }
    const esHtml = /html/i.test(r.tipo);
    if (!esHtml) continue;

    const html = r.texto;
    const h1 = (html.match(/<h1[\s>]/gi) || []).length;
    const titulo = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
    const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1] || '';
    const og = {
      titulo: (html.match(/property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '',
      imagen: (html.match(/property=["']og:image["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '',
      tipo: (html.match(/property=["']og:type["'][^>]+content=["']([^"']*)["']/i) || [])[1] || ''
    };
    const jsonld = (html.match(/<script[^>]+application\/ld\+json["'][^>]*>/gi) || []).length;
    const lang = (html.match(/<html[^>]+lang=["']([^"']+)["']/i) || [])[1] || '';
    const viewport = /name=["']viewport["']/i.test(html);

    /* imágenes */
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    let sinAlt = 0;
    for (const tag of imgs) {
      if (!/\balt\s*=/.test(tag)) sinAlt++;
      const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
      if (!src) continue;
      const abs = absoluta(src, clave);
      if (abs && esInterna(abs)) imagenesVistas.add(abs.split('?')[0]);
    }
    inventario.imagenes.total += imgs.length;
    inventario.imagenes.sinAlt += sinAlt;

    /* enlaces */
    const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
    const externosPagina = [];
    for (const h of hrefs) {
      if (/^(mailto:|tel:|#|javascript:)/i.test(h)) continue;
      const abs = absoluta(h, clave);
      if (!abs) continue;
      if (esInterna(abs)) { const limpio = abs.split('#')[0]; if (!vistas.has(limpio) && !cola.includes(limpio)) cola.push(limpio); }
      else { externosPagina.push(abs); inventario.externos[new URL(abs).host] = (inventario.externos[new URL(abs).host] || 0) + 1; }
    }

    /* terceros cargados */
    for (const m of html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)) {
      const host = new URL(m[1]).host;
      if (host === new URL(BASE).host) continue;
      inventario.terceros[host] = (inventario.terceros[host] || 0) + 1;
    }

    /* datos de contacto visibles */
    const wa = [...html.matchAll(/(?:wa\.me\/|whatsapp[^0-9]{0,12})(\d{10,15})/gi)].map((m) => m[1]);
    const correos = [...html.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]);
    if (wa.length) inventario.contacto.whatsapp = [...new Set([...(inventario.contacto.whatsapp || []), ...wa])];
    if (correos.length) inventario.contacto.correos = [...new Set([...(inventario.contacto.correos || []), ...correos])];

    paginas.push({
      ruta: relativa(clave), st: r.st, kb: Math.round(html.length / 1024 * 10) / 10, ms: r.ms,
      titulo, descripcion: desc, canonical, lang, viewport, h1, jsonld, og,
      imagenes: imgs.length, imagenesSinAlt: sinAlt, externos: externosPagina.length,
      enlacesInternos: hrefs.filter((h) => absoluta(h, clave) && esInterna(absoluta(h, clave))).length
    });
    process.stdout.write(`  · ${relativa(clave)} (${r.st}, ${Math.round(html.length / 1024)} KB)\n`);
  }

  /* peso de las imágenes internas (HEAD, tope 80) */
  let peso = 0, contadas = 0;
  for (const img of [...imagenesVistas].slice(0, 80)) {
    try {
      const r = await fetch(img, { method: 'HEAD' });
      const len = Number(r.headers.get('content-length') || 0);
      if (len) { peso += len; contadas++; }
    } catch (e) { /* se ignora */ }
  }
  inventario.imagenes.pesoKB = Math.round(peso / 1024);
  inventario.imagenes.contadas = contadas;
  inventario.imagenes.unicas = imagenesVistas.size;

  inventario.paginas = paginas.sort((a, b) => a.ruta.localeCompare(b.ruta));
  inventario.resumen = {
    paginas: paginas.length,
    kbHtmlTotal: Math.round(paginas.reduce((s, p) => s + p.kb, 0)),
    sinDescripcion: paginas.filter((p) => !p.descripcion).length,
    sinCanonical: paginas.filter((p) => !p.canonical).length,
    sinJsonLd: paginas.filter((p) => !p.jsonld).length,
    sinViewport: paginas.filter((p) => !p.viewport).length,
    h1DistintosDeUno: paginas.filter((p) => p.h1 !== 1).length,
    imagenesSinAlt: inventario.imagenes.sinAlt,
    hostsTerceros: Object.keys(inventario.terceros).length,
    hostsExternosEnlazados: Object.keys(inventario.externos).length,
    enlacesRotos: inventario.enlacesRotos.length
  };

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(inventario, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('═══ RESUMEN ═══');
  console.log(`  páginas HTML: ${inventario.resumen.paginas} · HTML total: ${inventario.resumen.kbHtmlTotal} KB`);
  console.log(`  imágenes: ${inventario.imagenes.unicas} únicas · ${inventario.imagenes.pesoKB} KB (${inventario.imagenes.contadas} pesadas) · sin alt: ${inventario.imagenes.sinAlt}`);
  console.log(`  sin description: ${inventario.resumen.sinDescripcion} · sin canonical: ${inventario.resumen.sinCanonical} · sin JSON-LD: ${inventario.resumen.sinJsonLd}`);
  console.log(`  h1 distinto de uno: ${inventario.resumen.h1DistintosDeUno} · sin viewport: ${inventario.resumen.sinViewport}`);
  console.log(`  terceros cargados: ${Object.keys(inventario.terceros).join(', ') || 'ninguno'}`);
  console.log(`  externos enlazados: ${Object.keys(inventario.externos).join(', ') || 'ninguno'}`);
  console.log(`  enlaces internos rotos: ${inventario.enlacesRotos.length}`);
  console.log(`  salida: ${path.relative(path.join(__dirname, '..'), SALIDA)}`);
  console.log('');
})().catch((e) => { console.error('\n  ✖ ' + (e && e.message)); process.exit(1); });
