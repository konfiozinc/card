const BASE = 'https://konfiozinc.github.io/card';
const path = require('path');
const fs = require('fs');
const RAIZ = path.resolve(__dirname, '..', '..');
const norm = (t) => t.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd();

/* Comprobación clave: el archivo servido es EXACTAMENTE el commiteado.
   Buscar palabras sueltas da falsos positivos (una nota que explica el defecto
   menciona el defecto); comparar el contenido entero, no. */
const IDENTICOS = ['/assets/js/main.js', '/contacto.html', '/premium-assets/app.js',
  '/assets/js/admin/escrituras-local.js', '/assets/js/admin/datos.js', '/admin/servicios.js'];

const checks = [
  { pag: '/contacto.html', nombre: 'contacto.html HTTP', test: (t, s) => s === 200, esperado: 'HTTP 200' },
  { pag: '/contacto.html', nombre: 'contacto.html SIN endpoint formspree', test: (t) => !/formspree\.io/i.test(t), esperado: 'ausente' },
  { pag: '/contacto.html', nombre: 'contacto.html SIN <form action="http...">', test: (t) => !/<form[^>]*\baction\s*=\s*["']https?:/i.test(t), esperado: 'ausente' },
  { pag: '/contacto.html', nombre: 'contacto.html CON aviso noscript', test: (t) => /necesitas JavaScript activado/.test(t), esperado: 'presente' },
  { pag: '/contacto.html', nombre: 'contacto.html SIN inicializacion Firebase', test: (t) => !/firebasejs/.test(t), esperado: 'ausente' },
  { pag: '/assets/js/main.js', nombre: 'main.js SIN persistir kz_leads (codigo)', test: (t) => !/(setItem|getItem)\s*\(\s*['"]kz_leads['"]/.test(t), esperado: 'ausente' },
  { pag: '/assets/js/main.js', nombre: 'main.js SIN guardarLocal', test: (t) => !/guardarLocal/.test(t), esperado: 'ausente' },
  { pag: '/assets/js/main.js', nombre: 'main.js CON Worker /leads', test: (t) => /WORKER_LEADS\s*=\s*'https:\/\/calm-heart-6828\.konfiozinc\.workers\.dev\/leads'/.test(t), esperado: 'presente' },
  { pag: '/assets/js/main.js', nombre: 'main.js CON guarda saved !== true', test: (t) => /saved\s*!==\s*true/.test(t), esperado: 'presente' },
  { pag: '/assets/js/main.js', nombre: 'main.js SIN rama Formspree (FormData)', test: (t) => !/FormData\(/.test(t), esperado: 'ausente' },
  { pag: '/premium-assets/app.js', nombre: 'premium app.js CON LEADS_URL /leads', test: (t) => /LEADS_URL\s*=\s*'https:\/\/calm-heart-6828\.konfiozinc\.workers\.dev\/leads'/.test(t), esperado: 'presente' },
  { pag: '/admin/servicios.html', nombre: 'panel servicios.html HTTP', test: (t, s) => s === 200, esperado: 'HTTP 200' },
  { pag: '/admin/contactos.html', nombre: 'panel contactos.html HTTP', test: (t, s) => s === 200, esperado: 'HTTP 200' },
  { pag: '/admin/servicios.js', nombre: 'panel servicios.js CON cambiarEstadoServicio', test: (t) => /cambiarEstadoServicio/.test(t), esperado: 'presente' },
  { pag: '/assets/js/admin/escrituras-local.js', nombre: 'escrituras CON cambiarEstadoServicio', test: (t) => /cambiarEstadoServicio/.test(t), esperado: 'presente' },
  { pag: '/assets/js/admin/datos.js', nombre: 'datos.js CON obligacionServicio', test: (t) => /obligacionServicio/.test(t), esperado: 'presente' },
  { pag: '/', nombre: 'portada HTTP', test: (t, s) => s === 200, esperado: 'HTTP 200' },
  { pag: '/politica-privacidad.html', nombre: 'politica de privacidad HTTP', test: (t, s) => s === 200, esperado: 'HTTP 200' },
];
for (const rel of IDENTICOS) {
  checks.push({
    pag: rel,
    nombre: 'desplegado == commiteado · ' + rel,
    esperado: 'identico',
    test: (t) => fs.existsSync(path.join(RAIZ, rel)) && norm(t) === norm(fs.readFileSync(path.join(RAIZ, rel), 'utf8'))
  });
}

(async () => {
  const fallos = [];
  for (const c of checks) {
    let t = '', s = 0;
    try {
      const r = await fetch(BASE + c.pag, { redirect: 'follow' });
      s = r.status; t = await r.text();
    } catch (e) { s = -1; }
    const ok = c.test(t, s);
    console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${c.nombre.padEnd(52)} ${c.esperado} · obtenido HTTP ${s}`);
    if (!ok) fallos.push(c.nombre);
  }
  console.log('\nTOTAL: ' + checks.length + ' · PASAN: ' + (checks.length - fallos.length) + ' · FALLAN: ' + fallos.length);
  if (fallos.length) { console.log(''); fallos.forEach((f) => console.log('  · ' + f)); }
  process.exit(fallos.length ? 1 : 0);
})();
