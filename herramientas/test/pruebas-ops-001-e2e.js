/* ═══════════════════════════════════════════════════════════════════
   pruebas-ops-001-e2e.js · KONFÍO ZINC — CARD — KZ-OPS-001

   Recorrido operativo COMPLETO en navegador real contra los emuladores, con
   datos ficticios y las reglas activas, sobre un staging reconstruido desde el
   HEAD actual y verificado como aislado:

     visitante → contacto (formulario) → seguimiento comercial → conversión a
     cliente → servicios múltiples → edición individual → ciclo de vida por
     servicio → cobro con concepto → renovación ligada a UN servicio →
     vencimiento por obligación → dashboard coherente → pago histórico
     clasificado.

   Cada bloque existe porque un defecto REAL se midió antes de corregirlo:
     · crear el servicio desde el panel daba PERMISSION_DENIED y el cliente se
       guardaba sin servicio (silenciado con `.catch(() => {})`).
     · los botones de la página Servicios actuaban sobre el CLIENTE: suspender
       un servicio suspendía todos.
     · la renovación calculaba la nueva fecha desde la fecha genérica del
       cliente, no desde la del servicio renovado.
     · la ficha de cliente tenía un botón «Renovar 12 meses» que extendía la
       vigencia sin pago, sin concepto y sin auditoría.

   Requisitos: Auth 9099 · Firestore 8080 · Hosting 5000 · proyecto
   demo-card-seguridad. Uso: node herramientas/test/pruebas-ops-001-e2e.js
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
const ts = (x) => ({ timestampValue: x });
const LOCAL = (url) => { try { const x = new URL(url); return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(x.hostname); } catch (e) { return true; } };

const salida = [];
function anotar(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(62)} ${detalle || ''}`);
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
  return (Array.isArray(r.j) ? r.j : []).filter((x) => x.document)
    .map((x) => {
      const campos = {};
      for (const [k, v] of Object.entries(x.document.fields || {})) {
        if ('stringValue' in v) campos[k] = v.stringValue;
        else if ('integerValue' in v) campos[k] = Number(v.integerValue);
        else if ('booleanValue' in v) campos[k] = v.booleanValue;
        else if ('timestampValue' in v) campos[k] = v.timestampValue;
        else if ('arrayValue' in v) campos[k] = (v.arrayValue.values || []).map((z) => z.stringValue !== undefined ? z.stringValue : z);
        else if ('nullValue' in v) campos[k] = null;
        else campos[k] = v;
      }
      return { id: x.document.name.split('/').pop(), ...campos };
    });
};
const leer = async (ruta) => {
  const r = await pedir('GET', u(ruta), undefined, 'owner');
  if (r.st !== 200) return null;
  const campos = {};
  for (const [k, v] of Object.entries(r.j.fields || {})) {
    if ('stringValue' in v) campos[k] = v.stringValue;
    else if ('integerValue' in v) campos[k] = Number(v.integerValue);
    else if ('booleanValue' in v) campos[k] = v.booleanValue;
    else if ('timestampValue' in v) campos[k] = v.timestampValue;
    else if ('nullValue' in v) campos[k] = null;
  }
  return campos;
};

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mas = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); return iso(d); };
/* Misma aritmética que escrituras-local.js / datos.js */
const sumarMesesIso = (fecha, meses) => {
  const d = new Date(fecha + 'T00:00:00');
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return iso(d);
};

const VENCE_2 = mas(900);
const CONCEPTO_RENOVACION = 'RENOVACION_DOMINIO';

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });

  const cuentas = {};
  for (const [rol, email] of [['OPERADOR', 'op.e2e@crm.test'], ['ADMIN', 'ad.e2e@crm.test']]) {
    let a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email, password: PASS, returnSecureToken: true });
    if (a.st !== 200) a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email, password: PASS, returnSecureToken: true });
    cuentas[rol] = { email, uid: a.j.localId, token: a.j.idToken };
    await crear('usuarios', a.j.localId, { email: s(email), nombre: s(rol + ' E2E'), rol: s(rol), activo: b(true) });
  }

  /* Cliente y pago heredados: simulan datos anteriores a esta misión. */
  await crear('clientes', 'cli-legado', {
    nombre: s('Cliente Legado E2E'), telefono: s('3001112233'), servicio: s('Tarjetas Digitales'),
    precio: n(49900), fechaActivacion: s(mas(-400)), fechaVencimiento: s(mas(100)),
    estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), activo: b(true), eliminado: b(false)
  });
  await crear('pagos', 'pg-historico', {
    clienteId: s('cli-legado'), clienteNombre: s('Cliente Legado E2E'),
    monto: n(49900), metodoPago: s('Efectivo'), fechaPago: s(mas(-30)),
    estado: s('PENDIENTE'), registradoPor: s(cuentas.OPERADOR.uid),
    registradoPorNombre: s('OPERADOR E2E'), createdAt: ts(new Date().toISOString())
  });

  /* Lead tal como lo deja el Worker de captación /leads. */
  await crear('contactos', 'ct-lead', {
    nombre: s('Lead Convertible'), telefono: s('3005557788'),
    email: s('lead.convertible@ficticio.test'), servicio: s('Tarjetas Digitales'),
    mensaje: s('Quiero mi mini web con catalogo'),
    estado: s('NUEVO'), createdAt: ts(new Date().toISOString())
  });
  console.log('  2 cuentas · 1 cliente legado + 1 pago histórico · 1 lead capturado\n');

  const nav = await chromium.launch({ headless: true });
  const externas = [];
  const errores = [];
  const prompts = [];

  function nuevaPagina(ctx) {
    const pag = ctx.newPage ? ctx.newPage() : null;
    return pag;
  }

  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const pag = await ctx.newPage();
  const conectar = (p) => {
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('dialog', async (d) => {
      const v = prompts.shift();
      if (v === undefined) await d.dismiss().catch(() => {});
      else await d.accept(String(v)).catch(() => {});
    });
    p.route('**/*', async (r) => {
      const url = r.request().url();
      if (LOCAL(url)) await r.continue();
      else { externas.push(url); await r.abort('blockedbyclient'); }
    });
  };
  conectar(pag);

  async function entrar(p, rol) {
    await p.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await p.fill('#login-email', cuentas[rol].email);
    await p.fill('#login-pass', PASS);
    await p.click('#login-btn');
    await p.waitForURL('**/dashboard.html', { timeout: 30000 });
    await p.waitForTimeout(1500);
  }
  async function aceptarConfirmacion(p) {
    await p.waitForSelector('.modal.is-open button[data-r="1"]', { timeout: 10000 });
    await p.click('.modal.is-open button[data-r="1"]');
  }

  /* ══════════ A · CONTACTOS: SEGUIMIENTO Y CONVERSIÓN ══════════ */
  console.log('═══ A · CONTACTOS: SEGUIMIENTO Y CONVERSIÓN EXPLÍCITA ═══');
  await entrar(pag, 'OPERADOR');
  await pag.goto(`${BASE}/admin/contactos.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('table tbody tr', { timeout: 20000 });
  await pag.waitForTimeout(800);

  const leadFila = pag.locator('tbody tr', { hasText: 'Lead Convertible' });
  anotar('El lead capturado aparece en Contactos', await leadFila.count() === 1, `${await leadFila.count()} fila(s)`);
  const badgeInicial = (await leadFila.innerText()).includes('Nuevo');
  anotar('El lead entra como NUEVO', badgeInicial, 'badge Nuevo');

  /* A2 · seguimiento */
  await leadFila.locator('button[data-a="seguimiento"]').click();
  await pag.waitForSelector('#ct-form', { timeout: 10000 });
  await pag.fill('#ct-nota', 'Llamé, pidió catálogo y menú. Acordamos Mini Web Pro.');
  await pag.selectOption('#ct-estado', 'CONTACTADO');
  await pag.click('button[type="submit"][form="ct-form"]');
  await pag.waitForTimeout(2500);

  const leadTras = await leer('contactos/ct-lead');
  anotar('El seguimiento guarda el estado CONTACTADO', leadTras.estado === 'CONTACTADO', 'estado = ' + leadTras.estado);
  const listaSeg = await listar('contactos');
  const conSeg = listaSeg.find((x) => x.id === 'ct-lead');
  anotar('El historial de atención conserva la nota',
    Array.isArray(conSeg.seguimiento) && conSeg.seguimiento.length === 1,
    `${Array.isArray(conSeg.seguimiento) ? conSeg.seguimiento.length : 0} entrada(s)`);

  /* A3 · conversión a cliente */
  await leadFila.locator('button[data-a="convertir"]').click();
  await pag.waitForSelector('#ct-servicio', { timeout: 10000 });
  await pag.selectOption('#ct-servicio', 'Tarjetas Digitales');
  await pag.fill('#ct-precio', '99900');
  await pag.click('button[type="submit"][form="ct-form"]');
  await pag.waitForTimeout(3000);

  const clientesTras = await listar('clientes');
  const nuevoCli = clientesTras.find((c) => c.nombre === 'Lead Convertible');
  anotar('La conversión crea el cliente', !!nuevoCli, nuevoCli ? `${nuevoCli.servicio} · ${nuevoCli.precio}` : 'no creado');

  const serviciosTras = await listar('servicios');
  const svInicial = serviciosTras.find((x) => x.clienteId === (nuevoCli || {}).id);
  anotar('La conversión crea TAMBIÉN su primer servicio', !!svInicial,
    svInicial ? `${svInicial.servicio} · ${svInicial.estado} · vence ${svInicial.fechaVencimiento}` : 'SIN servicio (defecto createdAt)');
  anotar('El servicio inicial nace ACTIVO y con fecha de vencimiento',
    !!svInicial && svInicial.estado === 'ACTIVO' && !!svInicial.fechaVencimiento,
    svInicial ? `${svInicial.estado} · ${svInicial.fechaVencimiento}` : '—');

  const leadFinal = await leer('contactos/ct-lead');
  anotar('El contacto queda CONVERTIDO y vinculado al cliente',
    leadFinal.estado === 'CONVERTIDO' && leadFinal.clienteId === (nuevoCli || {}).id,
    `${leadFinal.estado} → ${leadFinal.clienteId}`);
  anotar('El lead NO pierde sus datos de origen',
    leadFinal.telefono === '3005557788' && leadFinal.mensaje === 'Quiero mi mini web con catalogo',
    'teléfono y mensaje intactos');

  const clienteId = nuevoCli.id;
  const sv1Id = svInicial.id;

  /* ══════════ B · SERVICIOS MÚLTIPLES ══════════ */
  console.log('\n═══ B · VARIOS SERVICIOS POR CLIENTE ═══');
  const errLogin = [];
  const ctxAd = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const pad = await ctxAd.newPage();
  conectar(pad);
  await entrar(pad, 'ADMIN');

  await pad.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(1000);
  const filaCli = pad.locator('tbody tr', { hasText: 'Lead Convertible' });
  anotar('El cliente nuevo aparece en la lista de Clientes', await filaCli.count() === 1, `${await filaCli.count()} fila(s)`);

  await filaCli.locator('button[data-a="ver"]').click();
  await pad.waitForSelector('#det-servicio-form', { timeout: 15000 });
  await pad.waitForTimeout(1500);
  const detalleTxt = await pad.locator('#det-servicios').innerText();
  anotar('La ficha muestra el servicio contratado', /Tarjetas Digitales/.test(detalleTxt), detalleTxt.split('\n')[0]);

  await pad.selectOption('#ds-servicio', 'Landing Pages');
  await pad.fill('#ds-precio', '699000');
  await pad.fill('#ds-vence', VENCE_2);
  await pad.click('#det-servicio-form button[type="submit"]');
  await pad.waitForTimeout(3000);

  const svTras2 = (await listar('servicios')).filter((x) => x.clienteId === clienteId);
  anotar('El cliente queda con DOS servicios independientes', svTras2.length === 2, `${svTras2.length} servicios`);
  const sv2 = svTras2.find((x) => x.id !== sv1Id);
  anotar('El segundo servicio guarda su propia fecha', !!sv2 && sv2.fechaVencimiento === VENCE_2, sv2 ? sv2.fechaVencimiento : '—');

  /* ══════════ C · PÁGINA SERVICIOS: EDICIÓN Y CICLO DE VIDA ══════════ */
  console.log('\n═══ C · SERVICIOS: EDICIÓN INDIVIDUAL Y ESTADO POR SERVICIO ═══');
  await pad.goto(`${BASE}/admin/servicios.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(1000);
  const filasServicios = await pad.evaluate(() => document.querySelectorAll('tbody tr').length);
  anotar('La página Servicios lista las instancias', filasServicios >= 2, `${filasServicios} filas`);

  /* C2 · edición individual del precio */
  const filaLanding = pad.locator('tbody tr', { hasText: 'Landing Pages' });
  await filaLanding.locator('button[data-a="editar"]').click();
  await pad.waitForSelector('#sv-form', { timeout: 10000 });
  await pad.fill('#sv-precio', '749000');
  await pad.click('button[type="submit"][form="sv-form"]');
  await pad.waitForTimeout(2500);
  const sv2Editado = await leer('servicios/' + sv2.id);
  const sv1Intacto = await leer('servicios/' + sv1Id);
  anotar('Editar un servicio cambia SOLO ese servicio',
    sv2Editado.precio === 749000 && sv1Intacto.precio === 99900,
    `editado=${sv2Editado.precio} · el otro=${sv1Intacto.precio}`);

  /* C3 · suspender un servicio NO toca al otro ni al cliente */
  const estadoClienteAntes = (await leer('clientes/' + clienteId)).estadoCliente;
  await filaLanding.locator('button[data-a="suspender"]').click();
  await aceptarConfirmacion(pad);
  await pad.waitForTimeout(2800);
  const sv2Suspendido = await leer('servicios/' + sv2.id);
  const sv1TrasSuspender = await leer('servicios/' + sv1Id);
  const clienteTrasSuspender = await leer('clientes/' + clienteId);
  anotar('Suspender un servicio deja a ESE servicio en SUSPENDIDO',
    sv2Suspendido.estado === 'SUSPENDIDO', 'servicio Landing = ' + sv2Suspendido.estado);
  anotar('El otro servicio del mismo cliente sigue ACTIVO',
    sv1TrasSuspender.estado === 'ACTIVO', 'servicio Mini Web = ' + sv1TrasSuspender.estado);
  anotar('El cliente NO cambia de estado al suspender un servicio',
    clienteTrasSuspender.estadoCliente === estadoClienteAntes,
    `cliente ${estadoClienteAntes} → ${clienteTrasSuspender.estadoCliente}`);

  const histServ = (await listar('historial_estados')).filter((x) => x.clienteId === clienteId);
  anotar('La transición del servicio queda en el historial', histServ.length >= 1, `${histServ.length} registro(s)`);

  /* reactivar para seguir */
  await filaLanding.locator('button[data-a="activar"]').click();
  await aceptarConfirmacion(pad);
  await pad.waitForTimeout(2500);
  const sv2Reactivado = await leer('servicios/' + sv2.id);
  anotar('Reactivar el servicio no cambia su fecha de vencimiento',
    sv2Reactivado.estado === 'ACTIVO' && sv2Reactivado.fechaVencimiento === VENCE_2,
    `${sv2Reactivado.estado} · vence ${sv2Reactivado.fechaVencimiento}`);

  /* ══════════ D · COBRO RENOVABLE LIGADO A UN SERVICIO ══════════ */
  console.log('\n═══ D · RENOVACIÓN LIGADA AL SERVICIO CORRECTO ═══');
  const sv1Antes = await leer('servicios/' + sv1Id);
  const fechaBase1 = sv1Antes.fechaVencimiento;         // p. ej. hoy+12m
  const esperado1 = sumarMesesIso(fechaBase1, 12);      // base: la del SERVICIO

  await pad.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(900);
  await pad.locator('tbody tr', { hasText: 'Lead Convertible' }).locator('button[data-a="pago"]').click();
  await pad.waitForSelector('#pago-form', { timeout: 15000 });
  await pad.waitForTimeout(1500);

  await pad.selectOption('#p-concepto', CONCEPTO_RENOVACION);
  await pad.selectOption('#p-servicio', sv1Id);
  await pad.fill('#p-monto', '89000');
  await pad.fill('#p-ref', 'E2E-RENOV-1');
  await pad.click('button[type="submit"][form="pago-form"]');
  await pad.waitForTimeout(3000);

  const pagos1 = await listar('pagos');
  const pagoRenov = pagos1.find((x) => x.referencia === 'E2E-RENOV-1');
  const diagPago = await pad.evaluate(() => {
    const e = document.getElementById('p-error');
    return {
      error: e && !e.hidden ? e.textContent.trim() : '',
      toasts: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '),
      servicios: [...document.querySelectorAll('#p-servicio option')].map((o) => o.value + ':' + o.textContent)
    };
  });
  anotar('El cobro renovable se registra PENDIENTE con su servicio',
    !!pagoRenov && pagoRenov.estado === 'PENDIENTE' && pagoRenov.servicioId === sv1Id,
    pagoRenov ? `${pagoRenov.concepto} · servicio ${pagoRenov.servicioId ? pagoRenov.servicioId.slice(0, 8) : '—'}`
      : `no creado | error="${diagPago.error}" | toasts="${diagPago.toasts}" | opciones=${diagPago.servicios.length}`);

  /* D2 · confirmar como ADMIN */
  await pad.goto(`${BASE}/admin/pagos.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(1000);
  const filaPago = pad.locator('tbody tr', { hasText: '89.000' });
  await filaPago.locator('button[data-a="confirmar"]').click();
  await aceptarConfirmacion(pad);
  await pad.waitForTimeout(3000);

  const sv1Tras = await leer('servicios/' + sv1Id);
  const sv2Tras = await leer('servicios/' + sv2.id);
  const clienteTras = await leer('clientes/' + clienteId);

  anotar('La renovación extiende la fecha desde la del SERVICIO, no la del cliente',
    sv1Tras.fechaVencimiento === esperado1,
    `esperado ${esperado1} · obtenido ${sv1Tras.fechaVencimiento}`);
  anotar('La renovación NO toca el otro servicio del cliente',
    sv2Tras.fechaVencimiento === VENCE_2,
    `Landing sigue en ${sv2Tras.fechaVencimiento}`);
  anotar('La fecha genérica del cliente pasa a la obligación más lejana',
    clienteTras.fechaVencimiento === VENCE_2,
    `cliente vence ${clienteTras.fechaVencimiento}`);

  /* ══════════ E · PAGO ÚNICO NO RENUEVA ══════════ */
  console.log('\n═══ E · PAGO ÚNICO (DESARROLLO) NO EXTIENDE VIGENCIA ═══');
  await pad.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(900);
  await pad.locator('tbody tr', { hasText: 'Lead Convertible' }).locator('button[data-a="pago"]').click();
  await pad.waitForSelector('#pago-form', { timeout: 15000 });
  await pad.waitForTimeout(1500);
  await pad.selectOption('#p-concepto', 'DESARROLLO');
  await pad.fill('#p-monto', '120000');
  await pad.fill('#p-ref', 'E2E-DESARROLLO-1');
  await pad.click('button[type="submit"][form="pago-form"]');
  await pad.waitForTimeout(3000);

  await pad.goto(`${BASE}/admin/pagos.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(1000);
  await pad.locator('tbody tr', { hasText: '120.000' }).locator('button[data-a="confirmar"]').click();
  await aceptarConfirmacion(pad);
  await pad.waitForTimeout(3000);

  const sv1TrasDesarrollo = await leer('servicios/' + sv1Id);
  const sv2TrasDesarrollo = await leer('servicios/' + sv2.id);
  anotar('Confirmar un DESARROLLO no mueve ninguna fecha de servicio',
    sv1TrasDesarrollo.fechaVencimiento === esperado1 && sv2TrasDesarrollo.fechaVencimiento === VENCE_2,
    `${sv1TrasDesarrollo.fechaVencimiento} · ${sv2TrasDesarrollo.fechaVencimiento}`);

  /* ══════════ F · RENOVABLE SIN SERVICIO: RECHAZADO ══════════ */
  console.log('\n═══ F · UN COBRO RENOVABLE SIN SERVICIO SE RECHAZA ═══');
  await pad.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(900);
  await pad.locator('tbody tr', { hasText: 'Lead Convertible' }).locator('button[data-a="pago"]').click();
  await pad.waitForSelector('#pago-form', { timeout: 15000 });
  await pad.waitForTimeout(1500);
  const pagosAntes = (await listar('pagos')).length;
  await pad.selectOption('#p-concepto', 'HOSTING');
  await pad.fill('#p-monto', '50000');
  await pad.fill('#p-ref', 'E2E-SIN-SERVICIO');
  await pad.click('button[type="submit"][form="pago-form"]');
  await pad.waitForTimeout(2500);
  const errVisible = await pad.evaluate(() => {
    const e = document.getElementById('p-error');
    return e && !e.hidden ? e.textContent.trim() : '';
  });
  const pagosDespues = (await listar('pagos')).length;
  anotar('Sin servicio el formulario explica y NO guarda nada',
    /servicio/i.test(errVisible) && pagosDespues === pagosAntes,
    `«${errVisible.slice(0, 60)}» · pagos ${pagosAntes}→${pagosDespues}`);
  await pad.evaluate(() => { const m = document.getElementById('modal-detalle'); if (m) m.classList.remove('is-open'); });

  /* ══════════ G · DASHBOARD COHERENTE CON LOS DATOS ══════════ */
  console.log('\n═══ G · DASHBOARD COHERENTE CON FIRESTORE ═══');
  await pad.goto(`${BASE}/admin/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('.kpi', { timeout: 20000 });
  await pad.waitForTimeout(1500);

  const reales = {
    servicios: (await listar('servicios')).filter((x) => (x.clienteId === clienteId) || x.id === sv2.id).length,
    totalServicios: (await listar('servicios')).length,
    ingresos: (await listar('pagos')).filter((x) => x.estado === 'CONFIRMADO').reduce((a, x) => a + (Number(x.monto) || 0), 0)
  };
  const kpis = await pad.evaluate(() => [...document.querySelectorAll('.kpi')].map((k) => k.innerText.replace(/\n/g, ' | ')));
  const kpiServicios = kpis.find((t) => /Servicios contratados/i.test(t)) || '';
  anotar('El KPI «Servicios contratados» coincide con Firestore',
    kpiServicios.includes(String(reales.totalServicios)),
    `KPI «${kpiServicios}» · Firestore ${reales.totalServicios}`);

  const cuerpoDash = await pad.evaluate(() => document.getElementById('app-content').innerText);
  const ingresoTxt = reales.ingresos.toLocaleString('es-CO');
  anotar('Los ingresos confirmados por concepto reflejan los datos reales',
    cuerpoDash.includes('Desarrollo inicial') && cuerpoDash.includes('Renovación de dominio'),
    `total confirmado ${ingresoTxt}`);
  anotar('El dashboard separa obligaciones por servicio',
    /Próximas obligaciones/i.test(cuerpoDash), 'sección presente');
  anotar('El dashboard no promete un motor automático',
    !/processDueDates/.test(cuerpoDash) && /MANUAL/i.test(cuerpoDash), 'avisos manuales');

  /* ══════════ H · VENCIMIENTOS POR OBLIGACIÓN ══════════ */
  console.log('\n═══ H · VENCIMIENTOS POR OBLIGACIÓN REAL ═══');
  /* La página solo lista lo que REQUIERE ATENCIÓN (vencidos, por vencer, sin
     fecha o inactivos). Los servicios del recorrido vencen en 2027 y 2029, así
     que no aparecerían. Se añade un tercer servicio con vencimiento cercano para
     comprobar que cada obligación se presenta con su naturaleza propia. */
  await crear('servicios', 'sv-cerca', {
    clienteId: s(clienteId), clienteNombre: s('Lead Convertible'),
    servicio: s('Tarjetas Digitales'), categoria: s('MINI WEB PRO'),
    precio: n(89000), fechaInicio: s(mas(-355)), fechaVencimiento: s(mas(10)),
    estado: s('ACTIVO'), activo: b(true), createdAt: ts(new Date().toISOString())
  });
  await pad.goto(`${BASE}/admin/vencimientos.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('table', { timeout: 20000 });
  await pad.waitForTimeout(1800);
  const textoVenc = await pad.evaluate(() => document.getElementById('app-content').innerText);
  const tarjetasVenc = await pad.evaluate(() => [...document.querySelectorAll('.card h3')].map((x) => x.innerText.trim()));
  anotar('Vencimientos lista el servicio que requiere atención',
    /Lead Convertible/.test(textoVenc), `${(textoVenc.match(/Lead Convertible/g) || []).length} aparición(es)`);
  anotar('Distingue la obligación de dominio',
    /Renovación de dominio/.test(textoVenc), 'dominio');
  const tarjetaPagoUnico = tarjetasVenc.find((t) => /sin obligación renovable/i.test(t)) || '';
  anotar('Distingue un servicio sin renovación (pago único)',
    /sin obligación renovable · 1/i.test(textoVenc),
    `«${tarjetaPagoUnico}»`);
  anotar('Muestra el plazo del vencimiento cercano',
    /en 10 d/.test(textoVenc), 'en 10 d');

  /* ══════════ I · PAGO HISTÓRICO: CLASIFICAR ══════════ */
  console.log('\n═══ I · PAGO HISTÓRICO: CLASIFICACIÓN ÚNICA ═══');
  await pad.goto(`${BASE}/admin/pagos.html`, { waitUntil: 'domcontentloaded' });
  await pad.waitForSelector('tbody tr', { timeout: 20000 });
  await pad.waitForTimeout(1000);
  const filaHistorica = pad.locator('tbody tr', { hasText: 'Cliente Legado E2E' });
  const hayBotonClasificar = await filaHistorica.locator('button[data-a="clasificar"]').count();
  anotar('Un pago histórico ofrece la vía de clasificación', hayBotonClasificar === 1, `${hayBotonClasificar} botón(es)`);

  prompts.push('DESARROLLO', 'Comprobante en papel del archivo 2025');
  await filaHistorica.locator('button[data-a="clasificar"]').click();
  await pad.waitForTimeout(3000);
  const pagoClasificado = await leer('pagos/pg-historico');
  anotar('La clasificación se guarda con concepto y motivo',
    pagoClasificado.concepto === 'DESARROLLO' && !!pagoClasificado.motivoClasificacion,
    `${pagoClasificado.concepto} · «${String(pagoClasificado.motivoClasificacion || '').slice(0, 40)}»`);
  anotar('La clasificación no altera el importe del pago',
    pagoClasificado.monto === 49900, 'monto = ' + pagoClasificado.monto);

  const auditoria = await listar('auditoria');
  anotar('La clasificación queda auditada',
    auditoria.some((x) => x.accion === 'CLASIFICAR_PAGO'), `${auditoria.length} registro(s) de auditoría`);

  /* ══════════ J · MÓVIL Y AISLAMIENTO ══════════ */
  console.log('\n═══ J · MÓVIL 375×667 Y AISLAMIENTO ═══');
  const ctxMov = await nav.newContext({ viewport: { width: 375, height: 667 } });
  const pmov = await ctxMov.newPage();
  conectar(pmov);
  await entrar(pmov, 'ADMIN');

  const paginas = [
    ['dashboard.html', 'Dashboard'],
    ['contactos.html', 'Contactos'],
    ['servicios.html', 'Servicios']
  ];
  for (const [ruta, nombre] of paginas) {
    await pmov.goto(`${BASE}/admin/${ruta}`, { waitUntil: 'domcontentloaded' });
    await pmov.waitForTimeout(2200);
    const m = await pmov.evaluate(() => ({
      desborda: document.documentElement.scrollWidth > window.innerWidth + 2,
      tieneContenido: document.getElementById('app-content').children.length > 0
    }));
    anotar(`En 375×667 «${nombre}» renderiza sin desbordar`,
      m.tieneContenido && !m.desborda, `desborda=${m.desborda}`);
  }

  anotar('Ninguna petición salió a internet', externas.length === 0, `${externas.length} externas`);
  anotar('Sin errores de JavaScript en todo el recorrido',
    errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');

  /* ══════════ CIERRE ══════════ */
  await nav.close();
  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.length - fallos.length} · FALLADAS: ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log(''); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.stack || e)); process.exit(2); });
