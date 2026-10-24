#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/lib/servidor-estatico.js

   Servidor estático mínimo para revisar el candidato en local. No instala
   nada: usa solo `http`/`fs` de Node. Sirve ÚNICAMENTE la carpeta que se le
   indica, así que nunca expone el repositorio completo por accidente.

   Uso:
     const { crearServidor } = require('./lib/servidor-estatico');
     const servidor = await crearServidor({ raiz, puerto });
     ...
     await servidor.cerrar();
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json'
};

function crearServidor({ raiz, puerto = 5210, host = '127.0.0.1' }) {
  const base = path.resolve(raiz);
  const servidor = http.createServer((req, res) => {
    let ruta;
    try {
      ruta = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    } catch {
      res.writeHead(400); return res.end('ruta inválida');
    }
    if (ruta.endsWith('/')) ruta += 'index.html';
    const abs = path.join(base, ruta);
    if (!abs.startsWith(base)) { res.writeHead(403); return res.end('prohibido'); }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); return res.end('no encontrado'); }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, host, () => resolve({
      url: `http://${host}:${puerto}/`,
      puerto,
      cerrar: () => new Promise((r) => servidor.close(r))
    }));
  });
}

module.exports = { crearServidor };
