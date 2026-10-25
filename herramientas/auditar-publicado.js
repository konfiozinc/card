#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/auditar-publicado.js

   Auditoría del sitio PUBLICADO (no de la rama). Responde una sola
   pregunta que puede ser bloqueo: ¿alguna página publicada referencia un
   archivo que no existe en producción?

   Comprueba, para cada página viva:
     · que responda 200
     · que su og:image / twitter:image / favicon / manifest respondan 200
     · que la imagen social mida 1200x630 y tenga MIME de imagen
     · si declara noindex (para separar públicas de internas)

   Uso: node herramientas/auditar-publicado.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const BASE = 'https://konfiozinc.github.io/card';
const PAGINAS = [
  'index.html', 'servicios.html', 'precios.html', 'portafolio.html', 'blog.html',
  'aliados.html', 'nosotros.html', 'contacto.html', 'gracias.html', 'recursos.html',
  'politica-privacidad.html', '404.html'
];

const UA = { 'User-Agent': 'kz-audit', 'Cache-Control': 'no-cache' };
const cb = '?v=' + Date.now();

async function trae(url, metodo = 'GET') {
  const r = await fetch(url, { method: metodo, headers: UA });
  return r;
}

function extrae(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

(async () => {
  console.log('=== AUDITORÍA DEL SITIO PUBLICADO ===');
  console.log('  base: ' + BASE + '\n');

  let bloqueos = 0, avisos = 0;
  const filas = [];

  for (const pag of PAGINAS) {
    const url = BASE + '/' + pag + cb;
    let html, status;
    try {
      const r = await trae(url);
      status = r.status;
      if (!r.ok) { filas.push([pag, status, 'pagina NO responde', '', '']); bloqueos++; continue; }
      html = await r.text();
    } catch (e) {
      filas.push([pag, 'ERR', e.message.slice(0, 40), '', '']);
      bloqueos++;
      continue;
    }

    const noindex = /name="robots"[^>]*noindex/i.test(html);
    const ogImage = extrae(html, /property="og:image"\s+content="([^"]+)"/i);
    const twImage = extrae(html, /name="twitter:image"\s+content="([^"]+)"/i);
    const icono = extrae(html, /rel="icon"[^>]*href="([^"]+)"[^>]*>|<link[^>]*rel="icon"[^>]*href="([^"]+)"/i);
    const manifest = extrae(html, /rel="manifest"[^>]*href="([^"]+)"/i);

    /* Recolecta los recursos declarados y comprueba cada uno. */
    const recursos = new Map();
    const add = (u, etiqueta) => {
      if (!u) return;
      let abs;
      try { abs = new URL(u, BASE + '/').href; } catch { return; }
      if (!recursos.has(abs)) recursos.set(abs, etiqueta);
    };
    add(ogImage, 'og:image');
    if (twImage && twImage !== ogImage) add(twImage, 'twitter:image');
    add(icono, 'favicon');
    add(manifest, 'manifest');

    const problemas = [];
    for (const [abs, etiqueta] of recursos) {
      try {
        const r = await trae(abs.split('?')[0] + cb);
        if (!r.ok) { problemas.push(etiqueta + '=' + r.status); bloqueos++; continue; }
        const tipo = r.headers.get('content-type') || '';
        if (etiqueta === 'og:image' || etiqueta === 'twitter:image') {
          if (!/^image\//.test(tipo)) { problemas.push(etiqueta + ' MIME ' + tipo); avisos++; }
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf[0] === 0x89 && buf[1] === 0x50) {
            const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
            if (w !== 1200 || h !== 630) { problemas.push(etiqueta + ' ' + w + 'x' + h); avisos++; }
          } else {
            problemas.push(etiqueta + ' no es PNG');
            avisos++;
          }
        }
      } catch (e) {
        problemas.push(etiqueta + ' ERR');
        bloqueos++;
      }
    }

    filas.push([pag, status, noindex ? 'noindex' : 'PÚBLICA', recursos.size + ' recursos', problemas.join(' · ') || 'OK']);
  }

  console.log('  pagina'.padEnd(26) + 'HTTP'.padEnd(7) + 'tipo'.padEnd(10) + 'recursos'.padEnd(11) + 'resultado');
  for (const f of filas) {
    console.log('  ' + String(f[0]).padEnd(24) + String(f[1]).padEnd(7) + String(f[2]).padEnd(10) + String(f[3]).padEnd(11) + f[4]);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('BLOQUEOS (referencia rota en producción): ' + bloqueos);
  console.log('AVISOS   (existe pero no ideal):            ' + avisos);
  console.log('══════════════════════════════════════════════════');
  process.exit(bloqueos ? 1 : 0);
})().catch((e) => { console.error('[ERROR] ' + (e && e.stack || e)); process.exit(2); });
