/* ═══════════════════════════════════════════════════════════════════
   pruebas-spark-panel-p1.js · KONFÍO ZINC — CARD — MODO SPARK

   Prueba el panel funcionando SIN Cloud Functions: navegador real contra los
   emuladores, datos ficticios, reglas activas.

   Comprueba lo nuevo de la adaptación Spark:
     · el panel entra y lee con las reglas puestas (sin backend privilegiado)
     · la página de Vencimientos calcula los casos al abrir (sin motor)
     · preparar un aviso crea un registro PREPARADA (nada se envía)
     · suspender y reactivar son botones con confirmación y quedan en historial
     · marcar un aviso como enviado es un acto explícito del operador
     · Usuarios explica que la gestión va por la herramienta local (sin botones
       que escriban), porque las reglas cierran esa colección
     · navegación móvil 375×667 y cero peticiones a internet

   Requisitos: Auth 9099 · Firestore 8080 · Hosting 5000 · proyecto
   demo-card-seguridad. Uso: node herramientas/test/pruebas-spark-panel-p1.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);

const BASE = 'http://127.0.0.1:5000';
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const P = 'demo-card-seguridad';
const K = 'clave-ficticia';
const PASS = 'Ficticia#1';

const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
const LOCAL = (url) => { try { const x = new URL(url); return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(x.hostname); } catch (e) { return true; } };

const salida = [];
function anotar(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${detalle || ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = {}; }
  return { st: r.status, j };
}
const crear = (col, id, campos) => pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, 'owner');
const listar = async (col) => {
  const r = await pedir('POST', `${FS}/v1/projects/${P}/databases/(default)/documents:runQuery`,
    { structuredQuery: { from: [{ collectionId: col }] } }, 'owner');
  return (Array.isArray(r.j) ? r.j : []).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...x.document.fields }));
};
const leer = async (ruta) => (await pedir('GET', u(ruta), undefined, 'owner')).j;

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mas = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); return iso(d); };

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
  const cuentas = {};
  for (const [rol, email] of [['OPERADOR', 'operador.panel@spark.test'], ['ADMIN', 'admin.panel@spark.test'], ['SUPERADMIN', 'super.panel@spark.test']]) {
    let a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email, password: PASS, returnSecureToken: true });
    if (a.st !== 200) a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email, password: PASS, returnSecureToken: true });
    cuentas[rol] = { email, uid: a.j.localId };
    await crear('usuarios', a.j.localId, { email: s(email), nombre: s(rol + ' Panel'), rol: s(rol), activo: b(true) });
  }
  const base = (nombre, estado, venc) => ({
    nombre: s(nombre), servicio: s('Tarjetas Digitales'), telefono: s('300' + Math.floor(Math.random() * 9000000 + 1000000)),
    precio: n(99900), fechaActivacion: s(iso(hoy)), fechaVencimiento: s(venc),
    estadoCliente: s(estado), estadoServicio: s(estado), activo: b(true), eliminado: b(false)
  });
  await crear('clientes', 'c-vencido', base('Cliente Vencido Ficticio', 'ACTIVO', mas(-10)));
  await crear('clientes', 'c-porvencer', base('Cliente PorVencer Ficticio', 'ACTIVO', mas(5)));
  await crear('clientes', 'c-al-dia', base('Cliente AlDia Ficticio', 'ACTIVO', mas(200)));
  console.log('  3 cuentas (OPERADOR/ADMIN/SUPERADMIN) · 3 clientes (vencido, por vencer, al día)\n');

  const nav = await chromium.launch({ headless: true });
  const externas = [];
  const errores = [];
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errores.push(e.message));
  await pag.route('**/*', async (r) => {
    const url = r.request().url();
    if (LOCAL(url)) await r.continue(); else { externas.push(url); await r.abort('blockedbyclient'); }
  });

  async function entrar(rol) {
    await pag.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1200);
    await pag.fill('#login-email', cuentas[rol].email);
    await pag.fill('#login-pass', PASS);
    await pag.click('#login-btn');
    await pag.waitForURL('**/dashboard.html', { timeout: 25000 });
  }

  /* ── 1 · Login y lectura con reglas puestas ─────────────────────── */
  console.log('═══ 1 · PANEL SIN BACKEND ═══');
  await entrar('ADMIN');
  let kpis = 0;
  try { await pag.waitForSelector('.kpi', { timeout: 15000 }); } catch (e) { kpis = 0; }
  kpis = await pag.evaluate(() => document.querySelectorAll('.kpi').length);
  anotar('Entra y pinta el panel sin Cloud Functions', kpis > 0, `${kpis} KPIs`);

  await pag.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(2200);
  const filas = await pag.evaluate(() => document.querySelectorAll('table tbody tr').length);
  anotar('La lista de clientes carga con las reglas nuevas', filas >= 3, `${filas} filas`);

  /* ── 2 · Vencimientos calculados al abrir ───────────────────────── */
  console.log('\n═══ 2 · VENCIMIENTOS SIN MOTOR ═══');
  await pag.goto(`${BASE}/admin/vencimientos.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(2200);
  const cabeceras = await pag.evaluate(() => [...document.querySelectorAll('.card h3')].map(x => x.innerText.trim()));
  const vencidos = cabeceras.find(t => /Vencidos/i.test(t)) || '';
  const porVencer = cabeceras.find(t => /Por vencer/i.test(t)) || '';
  anotar('Calcula vencidos al abrir la página', /1/.test(vencidos), vencidos);
  anotar('Calcula por vencer al abrir la página', /1/.test(porVencer), porVencer);

  /* ── 3 · Preparar aviso (nada se envía) ─────────────────────────── */
  const antesNotif = (await listar('notificaciones')).length;
  const botonAviso = pag.locator('button[data-aviso]').first();
  anotar('Cada caso ofrece «Preparar aviso»', await botonAviso.count() > 0, `${await pag.locator('button[data-aviso]').count()} botones`);
  await botonAviso.click();
  await pag.waitForTimeout(2500);
  const aviso = await pag.evaluate(() => {
    const ok = document.getElementById('v-ok');
    return { visible: !!(ok && !ok.hidden), texto: (ok && ok.textContent || '').trim() };
  });
  const notifs = await listar('notificaciones');
  anotar('Preparar aviso deja constancia en pantalla', aviso.visible, `«${aviso.texto.slice(0, 70)}»`);
  anotar('Se crea UN registro de aviso (estado PREPARADA)',
    notifs.length === antesNotif + 1 && (notifs.find(x => x.estado && x.estado.stringValue) || {}).estado.stringValue === 'PREPARADA',
    `${antesNotif} → ${notifs.length}`);

  /* ── 4 · Suspender y reactivar son manuales ─────────────────────── */
  console.log('\n═══ 3 · SUSPENDER Y REACTIVAR A MANO ═══');
  const suspender = pag.locator('button[data-suspender]').first();
  if (await suspender.count() > 0) {
    await suspender.click();
    await pag.waitForSelector('.modal.is-open button[data-r="1"]', { timeout: 8000 });
    await pag.click('.modal.is-open button[data-r="1"]');
    await pag.waitForTimeout(2500);
    const doc = await leer('clientes/c-vencido');
    const estado = (doc.fields && doc.fields.estadoCliente || {}).stringValue;
    anotar('Suspender con confirmación cambia el estado', estado === 'SUSPENDIDO', `estado = ${estado}`);
    const hist = await listar('historial_estados');
    anotar('El cambio queda en el historial', hist.some(x => (x.usuarioId || {}).stringValue === cuentas.ADMIN.uid), `${hist.length} registro(s)`);

    const reactivar = pag.locator('button[data-reactivar]').first();
    await reactivar.click();
    await pag.waitForSelector('.modal.is-open button[data-r="1"]', { timeout: 8000 });
    await pag.click('.modal.is-open button[data-r="1"]');
    await pag.waitForTimeout(2500);
    const doc2 = await leer('clientes/c-vencido');
    const estado2 = (doc2.fields && doc2.fields.estadoCliente || {}).stringValue;
    const venc = (doc2.fields && doc2.fields.fechaVencimiento || {}).stringValue;
    anotar('Reactivar vuelve a ACTIVO sin regalar vigencia', estado2 === 'ACTIVO' && venc === mas(-10), `estado=${estado2} · vence=${venc}`);
  } else {
    anotar('Botón de suspender disponible para ADMIN', false, 'no apareció');
  }

  /* ── 5 · Notificaciones: marcar enviado ────────────────────────── */
  console.log('\n═══ 4 · NADA SE ENVÍA SOLO ═══');
  await pag.goto(`${BASE}/admin/notificaciones.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(2200);
  const marcar = pag.locator('[data-marcar]').first();
  anotar('El aviso aparece como PREPARADA con acción de marcar', await marcar.count() > 0, `${await pag.locator('[data-marcar]').count()} botón(es)`);
  if (await marcar.count() > 0) {
    await marcar.click();
    await pag.waitForTimeout(2500);
    const tras = await listar('notificaciones');
    const enviada = tras.some(x => (x.estado || {}).stringValue === 'ENVIADA');
    anotar('Marcar enviado actualiza el registro', enviada, `${tras.length} registro(s)`);
  }

  /* ── 6 · Usuarios: solo lectura, con la vía correcta ───────────── */
  console.log('\n═══ 5 · USUARIOS: SOLO LECTURA EN EL NAVEGADOR ═══');
  await ctx.close();
  const ctx2 = await nav.newContext();
  const pag2 = await ctx2.newPage();
  await pag2.route('**/*', async (r) => {
    const url = r.request().url();
    if (LOCAL(url)) await r.continue(); else { externas.push(url); await r.abort('blockedbyclient'); }
  });
  await pag2.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await pag2.waitForTimeout(1200);
  await pag2.fill('#login-email', cuentas.SUPERADMIN.email);
  await pag2.fill('#login-pass', PASS);
  await pag2.click('#login-btn');
  await pag2.waitForURL('**/dashboard.html', { timeout: 25000 });
  await pag2.goto(`${BASE}/admin/usuarios.html`, { waitUntil: 'domcontentloaded' });
  await pag2.waitForTimeout(2200);
  const usuariosVista = await pag2.evaluate(() => ({
    filas: document.querySelectorAll('table tbody tr').length,
    mencionaHerramienta: /admin-spark\.js/.test(document.body.innerText),
    hayBotonCrear: !!document.getElementById('btn-nuevo')
  }));
  anotar('La lista de usuarios se lee', usuariosVista.filas >= 3, `${usuariosVista.filas} filas`);
  anotar('Explica la vía correcta (herramienta local con Admin SDK)', usuariosVista.mencionaHerramienta, 'menciona admin-spark.js');
  anotar('No hay botón que intente escribir en usuarios', !usuariosVista.hayBotonCrear, 'sin btn-nuevo');

  /* ── 7 · Móvil y red ───────────────────────────────────────────── */
  console.log('\n═══ 6 · MÓVIL Y AISLAMIENTO ═══');
  await ctx2.close();
  const ctx3 = await nav.newContext({ viewport: { width: 375, height: 667 } });
  const pag3 = await ctx3.newPage();
  await pag3.route('**/*', async (r) => {
    const url = r.request().url();
    if (LOCAL(url)) await r.continue(); else { externas.push(url); await r.abort('blockedbyclient'); }
  });
  await pag3.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await pag3.waitForTimeout(1000);
  await pag3.fill('#login-email', cuentas.ADMIN.email);
  await pag3.fill('#login-pass', PASS);
  await pag3.click('#login-btn');
  await pag3.waitForURL('**/dashboard.html', { timeout: 25000 });
  await pag3.waitForTimeout(1500);
  const movil = await pag3.evaluate(() => ({
    kpis: document.querySelectorAll('.kpi').length,
    desborda: document.documentElement.scrollWidth > window.innerWidth + 2
  }));
  anotar('En 375×667 el panel renderiza sin desbordar', movil.kpis > 0 && !movil.desborda, `${movil.kpis} KPIs · desborda=${movil.desborda}`);
  anotar('Ninguna petición salió a internet', externas.length === 0, `${externas.length} externas`);
  anotar('Sin errores de JavaScript en las páginas nuevas', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');

  await nav.close();
  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.length - fallos.length} · FALLADAS: ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  if (fallos.length) { for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.stack || e)); process.exit(2); });
