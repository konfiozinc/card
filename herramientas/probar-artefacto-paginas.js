#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/probar-artefacto-paginas.js

   Prueba DINÁMICA del artefacto de publicación: materializa exactamente los
   archivos que GitHub Pages va a servir (aplicando las mismas exclusiones de
   _config.yml), los sirve en un servidor local y abre las páginas del sitio con
   un navegador real.

   Qué demuestra:
     · que ninguna página del sitio pide un recurso que el artefacto no tenga
       (cero 404 locales);
     · que las rutas internas excluidas (docs/, herramientas/, functions/,
       tools/, reglas, índices) responden 404 en el servidor del artefacto, es
       decir, que ya no viajan al sitio público.

   No sustituye al constructor oficial de Pages (aquí no hay Ruby/Jekyll/Docker):
   reproduce su entrada y sus exclusiones documentadas.

   Uso: node herramientas/probar-artefacto-paginas.js
   Códigos: 0 correcto · 1 algún control falla · 2 error de entorno
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const RAIZ = path.join(__dirname, '..');
const PUERTO = 5188;

const fallos = [];
function revisar(nombre, ok, detalle) {
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${detalle || ''}`);
  if (!ok) fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
}

/* ── 1. Lista del artefacto (mismas reglas que el verificador) ────── */
const arbol = [];
function inventario(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === RAIZ && ['.git', 'node_modules', 'test-results'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) inventario(full);
    else arbol.push(path.relative(RAIZ, full).split(path.sep).join('/'));
  }
}
inventario(RAIZ);

const lineas = fs.readFileSync(path.join(RAIZ, '_config.yml'), 'utf8').split(/\r?\n/);
const excluir = [];
let enLista = false;
for (const l of lineas) {
  if (/^\s*exclude\s*:/.test(l)) { enLista = true; continue; }
  if (enLista) {
    const m = /^\s*-\s*(.+?)\s*$/.exec(l);
    if (m) { excluir.push(m[1].replace(/^["']|["']$/g, '')); continue; }
    if (/^\s*[A-Za-z_]+\s*:/.test(l)) enLista = false;
  }
}
const especial = (f) => f.split('/').some((p) => p.startsWith('_') || p.startsWith('.'));
const excluida = (f) => excluir.some((e) => { const c = e.replace(/\/+$/, ''); return f === c || f.startsWith(c + '/'); });
const artefacto = arbol.filter((f) => !(f === '_config.yml' || especial(f) || excluida(f)));

/* ── 2. Materializar el artefacto en una carpeta temporal ─────────── */
const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-artefacto-'));
for (const f of artefacto) {
  const a = path.join(RAIZ, f);
  const b = path.join(destino, f);
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.copyFileSync(a, b);
}
console.log('');
console.log('═══ PRUEBA DINÁMICA DEL ARTEFACTO ═══');
console.log(`  archivos servidos: ${artefacto.length} · carpeta temporal: ${path.basename(destino)}`);
console.log('');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json'
};

const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const abs = path.join(destino, ruta);
  if (!abs.startsWith(destino)) { res.writeHead(403); return res.end('prohibido'); }
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); return res.end('no encontrado'); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(abs));
});

const paginas = [
  'index.html', 'panel.html', 'precios.html', 'servicios.html', 'portafolio.html', 'blog.html',
  'nosotros.html', 'contacto.html', 'aliados.html', 'gracias.html', 'politica-privacidad.html',
  'admin/index.html', 'admin/dashboard.html', 'admin/clientes.html', 'admin/pagos.html',
  'admin/servicios.html', 'admin/planes.html', 'admin/usuarios.html', 'admin/notificaciones.html',
  'admin/contactos.html', 'admin/auditoria.html', 'admin/configuracion.html'
].filter((p) => artefacto.includes(p));

const internas = ['docs/PLAN-PUBLICACION-CARD.md', 'docs/VENTANA-DE-LANZAMIENTO-CARD.md',
  'herramientas/verificar-precios.js', 'herramientas/publicar-paginas.ps1',
  'functions/src/index.js', 'firestore.rules', 'firestore.indexes.json', 'firebase.json',
  'README.md', 'tools/originales/descartados/pasteleria_artesanal.jpg',
  'design-system/lab.html', 'design-system/components.css', 'design-system/components.js'];

(async () => {
  await new Promise((r) => servidor.listen(PUERTO, '127.0.0.1', r));
  const { chromium } = require('playwright');
  const nav = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });

  /* ── 3. Las páginas no piden recursos que falten ─────────────────── */
  const faltantes = [];
  const externas = [];
  for (const p of paginas) {
    const ctx = await nav.newContext();
    const pag = await ctx.newPage();
    await pag.route('**/*', async (r) => {
      const url = r.request().url();
      if (!url.startsWith(`http://127.0.0.1:${PUERTO}`)) { externas.push(url); return r.abort('blockedbyclient'); }
      return r.continue();
    });
    pag.on('response', (res) => {
      if (res.status() === 404 && res.url().startsWith(`http://127.0.0.1:${PUERTO}`)) faltantes.push(`${res.url().replace(`http://127.0.0.1:${PUERTO}/`, '')} ← ${p}`);
    });
    try { await pag.goto(`http://127.0.0.1:${PUERTO}/${p}`, { waitUntil: 'load', timeout: 20000 }); }
    catch (e) { /* la carga puede esperar externals bloqueados: los 404 locales ya quedaron registrados */ }
    await pag.waitForTimeout(800);
    await ctx.close();
  }

  revisar('Las páginas abren sin pedir recursos ausentes', faltantes.length === 0,
    faltantes.length ? faltantes.slice(0, 4).join(' | ') : `${paginas.length} páginas · 0 fallos 404 locales`);
  console.log(`             (peticiones externas bloqueadas por aislamiento: ${externas.length})`);

  /* ── 4. Las rutas internas ya no se sirven ──────────────────────── */
  const servidas = [];
  for (const r of internas) {
    const code = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: PUERTO, path: '/' + r }, (res) => { res.resume(); resolve(res.statusCode); })
        .on('error', () => resolve(0));
    });
    if (code !== 404) servidas.push(`${r} → HTTP ${code}`);
  }
  revisar('Las rutas internas responden 404 en el artefacto', servidas.length === 0,
    servidas.length ? servidas.slice(0, 4).join(' | ') : `${internas.length} rutas internas fuera`);

  /* ── 5. Contraste: el sitio sí se sirve ─────────────────────────── */
  const vivas = ['index.html', 'panel.html', 'precios.html', 'admin/index.html', 'assets/css/admin.css',
    'assets/js/admin/core.js', 'robots.txt', 'sitemap.xml'];
  const caidas = [];
  for (const r of vivas) {
    const code = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: PUERTO, path: '/' + r }, (res) => { res.resume(); resolve(res.statusCode); })
        .on('error', () => resolve(0));
    });
    if (code !== 200) caidas.push(`${r} → ${code}`);
  }
  revisar('Los archivos del sitio siguen sirviéndose (200)', caidas.length === 0, caidas.join(' | ') || `${vivas.length} comprobados`);

  await nav.close();
  servidor.close();
  fs.rmSync(destino, { recursive: true, force: true });

  console.log('');
  console.log(`  RESULTADO: ${fallos.length === 0 ? 'artefacto cerrado y funcional' : fallos.length + ' control(es) fallido(s)'}`);
  if (fallos.length) for (const f of fallos) console.log('   · ' + f);
  console.log('');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n  ✖ ' + (e && e.stack || e)); servidor.close(); process.exit(2); });
