/* KZ-UNIFICACION-002 · Servidor aislado de la prueba visual.
 *
 * Sirve Card Spark desde el repositorio SIN tocar sus archivos, y reescribe
 * SOLO las respuestas para conectar Firebase a los emuladores:
 *   · config.js      → el projectId pasa a `demo-kz-crm-prospectos`
 *   · admin/core.js  → tras getAuth/getFirestore se inyectan connectAuthEmulator
 *                      y connectFirestoreEmulator sobre ESAS MISMAS instancias
 *                      (core.js:66-68). `seguimiento.js` reutiliza getApps()[0],
 *                      así que hereda las instancias conectadas.
 *
 * Uso: node pruebas/servidor-aislado.mjs <raiz> [puerto]
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const raiz = process.argv[2];
const puerto = Number(process.argv[3] || 5500);
const DEMO = 'demo-kz-crm-prospectos';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

const BLOQUEADOS = [/identitytoolkit\.googleapis\.com/, /securetoken\.googleapis\.com/, /firestore\.googleapis\.com/, /firebaseio\.com/, /firebaseapp\.com/];
const intentosProduccion = [];

/** Inyección en core.js justo después de crear auth y db. */
function parchearCore(texto) {
  if (texto.includes('__KZ_EMU_WIRED__')) return texto;
  const ancla = 'db = getFirestore(app);';
  if (!texto.includes(ancla)) return texto;
  const inyeccion = `${ancla}
  /* AISLAMIENTO KZ-UNIFICACION-002: mismas instancias, emuladores locales. */
  window.__KZ_EMU_WIRED__ = true;
  try {
    const { connectAuthEmulator } = await import('firebase/auth');
    const { connectFirestoreEmulator } = await import('firebase/firestore');
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch (e) {
    console.error('EMULADOR_NO_CONECTADO', e && e.message);
  }`;
  return texto.replace(ancla, inyeccion);
}

const servidor = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/__intentos-produccion') {
    const cuerpo = JSON.stringify({ total: intentosProduccion.length, lista: intentosProduccion.slice(0, 20) });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(cuerpo);
  }
  const f = join(raiz, ruta === '/' ? 'admin/dashboard.html' : ruta);
  if (!f.startsWith(raiz) || !existsSync(f)) { res.writeHead(404); return res.end('no encontrado'); }

  let cuerpo = readFileSync(f);
  const tipo = TIPOS[extname(f)] || 'application/octet-stream';
  const esTexto = tipo.startsWith('text/') || tipo.includes('javascript') || tipo.includes('json');

  if (esTexto) {
    let t = cuerpo.toString('utf8');
    /* 1 · El proyecto de Firebase pasa a demo-* SOLO en la respuesta servida. */
    if (/\/assets\/js\/config\.js$/.test(ruta)) {
      t = t.replace(/konfio-zinc/g, DEMO);
    }
    /* 2 · Las instancias reales de core.js se conectan a los emuladores. */
    if (/\/assets\/js\/admin\/core\.js$/.test(ruta)) {
      t = parchearCore(t);
    }
    /* 3 · Vigilancia: si alguna página intenta hablar con producción, se anota. */
    if (/\.html$/.test(ruta)) {
      const guardia = `<script>
      (function(){var H=[/identitytoolkit\\.googleapis\\.com/,/securetoken\\.googleapis\\.com/,/firestore\\.googleapis\\.com/,/firebaseio\\.com/,/firebaseapp\\.com/];
      var o=window.fetch;window.fetch=function(u){try{var s=String(u&&u.url||u);if(H.some(function(r){return r.test(s)})){navigator.sendBeacon('/__intentos-produccion',s.slice(0,160));}}catch(e){}return o.apply(this,arguments);};})();
      </script>`;
      t = t.replace(/<head[^>]*>/i, (m) => m + guardia);
    }
    cuerpo = Buffer.from(t, 'utf8');
  }

  res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
  res.end(cuerpo);
});

servidor.listen(puerto, '127.0.0.1', () => {
  console.log('servidor aislado en http://127.0.0.1:' + puerto + ' | proyecto ' + DEMO);
  console.log('hosts productivos vigilados: ' + BLOQUEADOS.length);
});
