/* CARD-SPARK-002 · E2E del flujo financiero nuevo (Playwright + emuladores).
   Cubre: pago de desarrollo (confirmar SIN renovar), renovación de dominio
   (solo cambia el servicio asociado), dashboard y vencimientos coherentes.
   Requisitos: staging + Auth 9099 + Firestore 8080 + Hosting 5000. */
'use strict';
const { chromium } = require('C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/herramientas/node_modules/playwright');
const BASE = 'http://127.0.0.1:5000', FS = 'http://127.0.0.1:8080', AUTH = 'http://127.0.0.1:9099';
const P = 'demo-card-seguridad', K = 'clave-ficticia', PASS = 'Ficticia#1';
const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v }), n = (v) => ({ integerValue: String(v) }), b = (v) => ({ booleanValue: v });
const LOCAL = (url) => { try { const x = new URL(url); return ['127.0.0.1', 'localhost'].includes(x.hostname); } catch { return true; } };
const salida = [];
function anotar(nombre, ok, det) { salida.push(!!ok); console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(60)} ${det || ''}`); }
async function pedir(m, url, cuerpo, token) { const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token; const r = await fetch(url, { method: m, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }); let j = null; try { j = JSON.parse(await r.text()); } catch {} return { st: r.status, j }; }
const crear = (c, id, f, t) => pedir('POST', `${u(c)}?documentId=${id}`, { fields: f }, t);
const leer = (r, t) => pedir('GET', u(r), undefined, t);
async function alta(e, p) { let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email: e, password: p, returnSecureToken: true }); if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email: e, password: p, returnSecureToken: true }); return { uid: r.j.localId, token: r.j.idToken }; }

(async () => {
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
  const ad = await alta('admin.fin@spark.test', PASS);
  await crear('usuarios', ad.uid, { email: s('admin.fin@spark.test'), nombre: s('Admin Fin'), rol: s('ADMIN'), activo: b(true) }, 'owner');
  const hoy = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mas = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); return iso(d); };
  await crear('clientes', 'c-fin', { nombre: s('Cliente Financiero'), servicio: s('Tarjetas Digitales'), telefono: s('3001111111'), precio: n(49900), fechaActivacion: s(iso(hoy)), fechaVencimiento: s(mas(200)), estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), eliminado: b(false) }, ad.token);
  await crear('servicios', 'sv-tarjetas', { clienteId: s('c-fin'), clienteNombre: s('Cliente Financiero'), servicio: s('Tarjetas Digitales'), categoria: s('MINI WEB BÁSICA'), precio: n(49900), fechaVencimiento: s(mas(200)), estado: s('ACTIVO'), activo: b(true) }, ad.token);
  await crear('servicios', 'sv-menu', { clienteId: s('c-fin'), clienteNombre: s('Cliente Financiero'), servicio: s('Menús Digitales'), precio: n(150000), fechaVencimiento: s(mas(200)), estado: s('ACTIVO'), activo: b(true) }, ad.token);
  const ts = { timestampValue: new Date().toISOString() };
  await crear('pagos', 'pago-dev', { clienteId: s('c-fin'), clienteNombre: s('Cliente Financiero'), servicioId: s('sv-tarjetas'), monto: n(49900), concepto: s('DESARROLLO'), metodoPago: s('Nequi'), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'), registradoPor: s(ad.uid), registradoPorNombre: s('Admin Fin'), createdAt: ts }, ad.token);
  await crear('pagos', 'pago-ren', { clienteId: s('c-fin'), clienteNombre: s('Cliente Financiero'), servicioId: s('sv-menu'), monto: n(15000), concepto: s('RENOVACION_DOMINIO'), metodoPago: s('Nequi'), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'), registradoPor: s(ad.uid), registradoPorNombre: s('Admin Fin'), createdAt: ts }, ad.token);

  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  const pag = await ctx.newPage();
  const externas = []; const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));
  await pag.route('**/*', async (r) => { if (LOCAL(r.request().url())) await r.continue(); else { externas.push(r.request().url()); await r.abort('blockedbyclient'); } });
  await pag.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1200);
  await pag.fill('#login-email', 'admin.fin@spark.test');
  await pag.fill('#login-pass', PASS);
  await pag.click('#login-btn');
  await pag.waitForURL('**/dashboard.html', { timeout: 25000 });

  async function confirmarFila(monto) {
    await pag.goto(`${BASE}/admin/pagos.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1500);
    const fila = pag.locator('tr', { has: pag.locator('td', { hasText: String(monto) }) }).first();
    await fila.locator('button[data-a="confirmar"]').click();
    await pag.waitForSelector('.modal.is-open button[data-r="1"]', { timeout: 8000 });
    await pag.click('.modal.is-open button[data-r="1"]');
    await pag.waitForTimeout(2500);
  }

  const antesDev = (await leer('servicios/sv-tarjetas', ad.token)).j.fields.fechaVencimiento.stringValue;
  await confirmarFila('49.900');
  const despDev = (await leer('servicios/sv-tarjetas', ad.token)).j.fields.fechaVencimiento.stringValue;
  anotar('Confirmar DESARROLLO NO renueva el servicio', antesDev === despDev, `${antesDev} → ${despDev}`);

  const antesRen = (await leer('servicios/sv-menu', ad.token)).j.fields.fechaVencimiento.stringValue;
  await confirmarFila('15.000');
  const despRen = (await leer('servicios/sv-menu', ad.token)).j.fields.fechaVencimiento.stringValue;
  anotar('Confirmar RENOVACIÓN cambia SOLO su servicio', antesRen !== despRen, `${antesRen} → ${despRen}`);
  const tarjetaSinTocar = (await leer('servicios/sv-tarjetas', ad.token)).j.fields.fechaVencimiento.stringValue;
  anotar('La renovación no toca el otro servicio', tarjetaSinTocar === despDev, tarjetaSinTocar);

  await pag.goto(`${BASE}/admin/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(2000);
  const kpis = await pag.evaluate(() => document.querySelectorAll('.kpi').length);
  anotar('Dashboard renderiza con KPIs financieros', kpis >= 9, `${kpis} KPIs`);
  anotar('Sin errores de JavaScript', errores.length === 0, errores.join(' · ') || 'ninguno');
  anotar('Sin peticiones externas', externas.length === 0, `${externas.length} externas`);

  console.log(`\nTOTAL: ${salida.length} · PASAN: ${salida.filter(Boolean).length} · FALLAN: ${salida.filter(x => !x).length}`);
  process.exitCode = salida.every(Boolean) ? 0 : 1;
  await nav.close();
})();
