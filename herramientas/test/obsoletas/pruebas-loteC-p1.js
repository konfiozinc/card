/* ═══════════════════════════════════════════════════════════════════
   pruebas-loteC-p1.js · KONFÍO ZINC — CARD
   Cierre funcional del CRM (LOTE C):

     A · Planes: crear, editar, activar/desactivar, eliminar, validaciones y
         visibilidad del botón «Cargar catálogo inicial».
     B · Clientes: ciclo de vida completo y restauración de la baja lógica.
     C · Usuarios: callables con SUPERADMIN, rechazos por rol, idempotencia
         de la migración correo→uid.
     D · Operación general: auditoría tras confirmar un pago, página Servicios,
         navegación móvil y notificaciones.

   Emuladores locales (Auth 9099 · Firestore 8080 · Hosting 5000).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);
const { execFileSync } = require('child_process');
const path = require('path');

const BASE = 'http://127.0.0.1:5000';
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const PROYECTO = 'demo-card-seguridad';
const K = 'clave-ficticia';
const REPO = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\card-pagos-p1';

const u = (r) => `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
const ts = (x) => ({ timestampValue: x });

const LOCAL = (url) => {
  try { const x = new URL(url); return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(x.hostname); }
  catch (e) { return true; }
};

const ROLES = {
  OPERADOR: { email: 'operador@crm.test', pass: 'Ficticia#1' },
  ADMIN: { email: 'admin@crm.test', pass: 'Ficticia#1' },
  SUPERADMIN: { email: 'superadmin@crm.test', pass: 'Ficticia#1' },
};

async function pedir(metodo, url, cuerpo, token) {
  const h = {};
  if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j };
}
async function crear(coleccion, id, campos, token = 'owner') {
  const r = await pedir('POST', `${u(coleccion)}?documentId=${id}`, { fields: campos }, token);
  if (r.st === 409) return pedir('PATCH', `${u(coleccion + '/' + id)}`, { fields: campos }, token);
  return r;
}
const leerDoc = async (ruta) => (await pedir('GET', u(ruta), undefined, 'owner')).j;
async function listar(coleccion) {
  const r = await pedir('POST', `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents:runQuery`,
    { structuredQuery: { from: [{ collectionId: coleccion }] } }, 'owner');
  return (Array.isArray(r.j) ? r.j : []).filter((x) => x.document).map((x) => x.document);
}
async function callable(nombre, datos, token) {
  return pedir('POST', `http://127.0.0.1:5001/${PROYECTO}/us-central1/${nombre}`, { data: datos }, token);
}

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = (d) => { const x = new Date(hoy); x.setDate(x.getDate() + d); return iso(x); };

const salida = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  salida.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : 'BLOQ';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(52)} ${detalle || ''}`);
}

async function login(pag, rol) {
  await pag.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1200);
  await pag.fill('#login-email', ROLES[rol].email);
  await pag.fill('#login-pass', ROLES[rol].pass);
  await pag.click('#login-btn');
  await pag.waitForURL('**/dashboard.html', { timeout: 20000 });
}
const toasts = (pag) => pag.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
async function cerrarModales(pag) {
  await pag.evaluate(() => document.querySelectorAll('.modal.is-open').forEach((m) => m.remove()));
  await pag.waitForTimeout(200);
}
async function aceptar(pag) {
  const b1 = await pag.$('.modal.is-open button[data-r="1"]');
  if (b1) { await b1.click(); return true; }
  return false;
}

async function sembrar() {
  await fetch(`${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  const ids = {};
  for (const [rol, r] of Object.entries(ROLES)) {
    let a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email: r.email, password: r.pass, returnSecureToken: true });
    if (a.st !== 200) a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email: r.email, password: r.pass, returnSecureToken: true });
    ids[rol] = a.j.localId;
    await crear('usuarios', a.j.localId, { email: s(r.email), nombre: s(rol + ' Ficticio'), rol: s(rol), activo: b(true) });
  }
  await crear('clientes', 'cli-vivo', {
    nombre: s('Cliente Vivo'), telefono: s('3001110001'), servicio: s('Tarjetas Digitales'),
    precio: n(99900), fechaActivacion: s(masDias(-30)), fechaVencimiento: s(masDias(90)),
    estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), estado: s('ACTIVO'), activo: b(true), eliminado: b(false),
  });
  await crear('clientes', 'cli-vencido', {
    nombre: s('Cliente Vencido'), telefono: s('3001110002'), servicio: s('Menús Digitales'),
    precio: n(150000), fechaActivacion: s(masDias(-400)), fechaVencimiento: s(masDias(-30)),
    estadoCliente: s('PENDIENTE_PAGO'), estadoServicio: s('PENDIENTE_PAGO'), estado: s('PENDIENTE_PAGO'), activo: b(true), eliminado: b(false),
  });
  await crear('pagos', 'pago-c', {
    clienteId: s('cli-vivo'), clienteNombre: s('Cliente Vivo'), monto: n(99900), metodoPago: s('Nequi'),
    fechaPago: s(iso(hoy)), estado: s('PENDIENTE'), registradoPor: s(ids.OPERADOR),
    registradoPorNombre: s('Operador Ficticio'), createdAt: ts(hoy.toISOString()),
  });
  await crear('servicios', 'serv-1', {
    clienteId: s('cli-vivo'), servicio: s('Tarjetas Digitales'), estado: s('ACTIVO'),
    fechaInicio: s(masDias(-30)), fechaVencimiento: s(masDias(90)), activo: b(true),
  });
  for (let i = 1; i <= 2; i++) {
    await crear('contactos', 'con-' + i, {
      nombre: s('Contacto Ficticio ' + i), email: s('c' + i + '@ficticio.test'), telefono: s('300000000' + i),
      servicio: s('Tarjetas Digitales'), mensaje: s('Mensaje ficticio ' + i), origen: s('contacto'),
      estado: s('NUEVO'), createdAt: ts(hoy.toISOString()),
    });
  }
  return ids;
}

(async () => {
  console.log('\n═══ SIEMBRA ═══');
  const ids = await sembrar();
  console.log('  3 usuarios · 2 clientes · 1 pago pendiente · 1 servicio · 2 contactos');

  const nav = await chromium.launch({ headless: true });
  let peticiones = 0; const externas = [];

  async function sesion(rol, opciones) {
    const ctx = await nav.newContext(Object.assign({ acceptDownloads: true }, opciones || {}));
    const pag = await ctx.newPage();
    const errores = [];
    pag.on('pageerror', (e) => errores.push(e.message));
    await pag.route('**/*', async (ruta) => {
      const url = ruta.request().url();
      peticiones++;
      if (!LOCAL(url)) { externas.push(url); await ruta.abort('blockedbyclient'); } else await ruta.continue();
    });
    await login(pag, rol);
    return { ctx, pag, errores };
  }

  /* ═══ A · PLANES ═════════════════════════════════════════════════ */
  console.log('\n═══ A · PLANES ═══');
  {
    const { ctx, pag } = await sesion('ADMIN');
    await pag.goto(`${BASE}/admin/planes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);

    /* botón de sembrar oculto para ADMIN */
    const botones = await pag.evaluate(() => ({
      nuevo: !!document.getElementById('btn-nuevo'),
      seed: !!document.getElementById('btn-seed'),
    }));
    anotar('Planes: ADMIN ve «Nuevo plan» y no ve «Cargar catálogo inicial»',
      botones.nuevo === true && botones.seed === false,
      `nuevo=${botones.nuevo} · seed=${botones.seed}`);

    /* crear con validación: precio 0 no debe crear nada (lo frena el propio
       navegador con min="1" y, si pasara, la validación del formulario) */
    const planesAntes = (await listar('planes')).length;
    await pag.click('#btn-nuevo');
    await pag.waitForTimeout(600);
    await pag.fill('#pl-nombre', 'Plan Creado En Prueba');
    await pag.fill('#pl-precio', '0');
    await (await pag.$('button[form="plan-form"]')).click();
    await pag.waitForTimeout(1200);
    const errPrecio = await pag.evaluate(() => { const e = document.getElementById('pl-error'); return e && !e.hidden ? e.textContent : ''; });
    const sigueAbierto = await pag.evaluate(() => !!document.getElementById('plan-form'));
    const planesTrasIntento = (await listar('planes')).length;
    anotar('Planes: un precio de 0 no crea el plan',
      planesTrasIntento === planesAntes && (sigueAbierto || /precio/i.test(errPrecio)),
      `planes ${planesAntes} → ${planesTrasIntento} · formulario abierto=${sigueAbierto}${errPrecio ? ' · ' + errPrecio : ' · validación nativa del navegador'}`);

    /* crear de verdad */
    await pag.fill('#pl-precio', '79900');
    await pag.fill('#pl-duracion', '6');
    await (await pag.$('button[form="plan-form"]')).click();
    await pag.waitForTimeout(2800);
    const planes = await listar('planes');
    const creado = planes.find((p) => p.fields && p.fields.nombre && p.fields.nombre.stringValue === 'Plan Creado En Prueba');
    const idCreado = creado ? creado.name.split('/').pop() : null;
    anotar('Planes: crear un plan nuevo',
      !!creado && creado.fields.precio.integerValue === '79900' && creado.fields.duracionMeses.integerValue === '6' && creado.fields.estado.stringValue === 'ACTIVO',
      creado ? `id=${idCreado} · ${creado.fields.precio.integerValue} COP · ${creado.fields.duracionMeses.integerValue} meses · ${creado.fields.estado.stringValue}` : 'no se creó');

    /* editar */
    await pag.goto(`${BASE}/admin/planes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    await (await pag.$(`tr[data-id="${idCreado}"] button[data-a="edit"]`)).click();
    await pag.waitForTimeout(600);
    await pag.fill('#pl-nombre', 'Plan Editado En Prueba');
    await (await pag.$('button[form="plan-form"]')).click();
    await pag.waitForTimeout(2600);
    const trasEdit = await leerDoc('planes/' + idCreado);
    anotar('Planes: editar el nombre', trasEdit.fields.nombre.stringValue === 'Plan Editado En Prueba', 'nombre = ' + trasEdit.fields.nombre.stringValue);

    /* desactivar */
    await pag.goto(`${BASE}/admin/planes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    await (await pag.$(`tr[data-id="${idCreado}"] button[data-a="toggle"]`)).click();
    await pag.waitForTimeout(2400);
    const trasToggle = await leerDoc('planes/' + idCreado);
    anotar('Planes: desactivar (toggle)', trasToggle.fields.estado.stringValue === 'INACTIVO', 'estado = ' + trasToggle.fields.estado.stringValue);

    /* eliminar */
    await pag.goto(`${BASE}/admin/planes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    pag.once('dialog', async (d) => { await d.accept(); });
    await (await pag.$(`tr[data-id="${idCreado}"] button[data-a="del"]`)).click();
    await pag.waitForTimeout(2400);
    const trasDel = await leerDoc('planes/' + idCreado);
    anotar('Planes: eliminar', !trasDel.fields, trasDel.fields ? 'sigue existiendo' : 'eliminado');
    await ctx.close();
  }

  /* SUPERADMIN sí ve el botón de catálogo inicial */
  {
    const { ctx, pag } = await sesion('SUPERADMIN');
    await pag.goto(`${BASE}/admin/planes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    const seed = await pag.evaluate(() => !!document.getElementById('btn-seed'));
    await pag.click('#btn-seed');
    await pag.waitForTimeout(2800);
    const total = await pag.evaluate(() => document.querySelectorAll('table tbody tr').length);
    anotar('Planes: SUPERADMIN ve y usa «Cargar catálogo inicial»', seed && total >= 3, `botón=${seed} · ${total} planes tras pulsarlo`);
    await ctx.close();
  }

  /* ═══ B · CICLO DE VIDA DE CLIENTES ══════════════════════════════ */
  console.log('\n═══ B · CLIENTES ═══');
  {
    const { ctx, pag } = await sesion('ADMIN');
    const irClientes = async () => {
      await pag.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
      await pag.waitForTimeout(1900);
    };
    const estado = async (id) => (await leerDoc('clientes/' + id)).fields;

    /* crear */
    await irClientes();
    await pag.click('#btn-nuevo');
    await pag.waitForTimeout(600);
    await pag.fill('#e-nombre', 'Cliente Creado Lote C');
    await pag.fill('#e-telefono', '3017778888');
    await pag.selectOption('#e-servicio', { index: 1 });
    await (await pag.$('button[form="editor-form"]')).click();
    await pag.waitForTimeout(3000);
    const nuevos = (await listar('clientes')).filter((c) => c.fields && c.fields.nombre && c.fields.nombre.stringValue === 'Cliente Creado Lote C');
    const idNuevo = nuevos.length ? nuevos[0].name.split('/').pop() : null;
    anotar('Clientes: crear', !!idNuevo, idNuevo ? 'creado id=' + idNuevo : 'no se creó');

    /* editar */
    await irClientes();
    await (await pag.$(`tr[data-id="${idNuevo}"] button[data-a="editar"]`)).click();
    await pag.waitForTimeout(600);
    await pag.fill('#e-nombre', 'Cliente Editado Lote C');
    await (await pag.$('button[form="editor-form"]')).click();
    await pag.waitForTimeout(2800);
    anotar('Clientes: editar', (await estado(idNuevo)).nombre.stringValue === 'Cliente Editado Lote C', 'nombre actualizado');

    /* suspender */
    await irClientes();
    await (await pag.$(`tr[data-id="${idNuevo}"] button[data-a="suspender"]`)).click();
    await pag.waitForTimeout(700);
    await (await pag.$('button[form="susp-form"]')).click();
    await pag.waitForTimeout(2600);
    anotar('Clientes: suspender', (await estado(idNuevo)).estadoCliente.stringValue === 'SUSPENDIDO', 'SUSPENDIDO');

    /* reactivar (sin regalar tiempo) */
    await irClientes();
    const fechaAntes = (await estado(idNuevo)).fechaVencimiento.stringValue;
    await (await pag.$(`tr[data-id="${idNuevo}"] button[data-a="activar"]`)).click();
    await pag.waitForTimeout(700);
    await aceptar(pag);
    await pag.waitForTimeout(2600);
    const trasReact = await estado(idNuevo);
    anotar('Clientes: reactivar sin regalar tiempo',
      trasReact.estadoCliente.stringValue === 'ACTIVO' && trasReact.fechaVencimiento.stringValue === fechaAntes,
      `estado=${trasReact.estadoCliente.stringValue} · fecha ${fechaAntes} → ${trasReact.fechaVencimiento.stringValue}`);

    /* desactivar e inhabilitar */
    await irClientes();
    await (await pag.$(`tr[data-id="${idNuevo}"] button[data-a="desactivar"]`)).click();
    await pag.waitForTimeout(600);
    await aceptar(pag);
    await pag.waitForTimeout(2600);
    const des = await estado(idNuevo);
    anotar('Clientes: desactivar', des.estadoCliente.stringValue === 'INACTIVO', 'INACTIVO');

    await irClientes();
    await (await pag.$(`tr[data-id="${idNuevo}"] button[data-a="activar"]`)).click();
    await pag.waitForTimeout(600);
    await aceptar(pag);
    await pag.waitForTimeout(2500);
    await irClientes();
    await (await pag.$(`tr[data-id="${idNuevo}"] button[data-a="inhabilitar"]`)).click();
    await pag.waitForTimeout(700);
    await pag.fill('#i-motivo', 'Motivo ficticio LOTE C');
    await pag.check('#i-confirma');
    await (await pag.$('button[form="inhab-form"]')).click();
    await pag.waitForTimeout(2600);
    anotar('Clientes: inhabilitar', (await estado(idNuevo)).estadoCliente.stringValue === 'INHABILITADO', 'INHABILITADO');

    /* renovar (sobre el cliente vivo) */
    await irClientes();
    const antesRen = (await estado('cli-vivo')).fechaVencimiento.stringValue;
    await (await pag.$('tr[data-id="cli-vivo"] button[data-a="renovar"]')).click();
    await pag.waitForTimeout(700);
    await aceptar(pag);
    await pag.waitForTimeout(2800);
    const despRen = (await estado('cli-vivo')).fechaVencimiento.stringValue;
    anotar('Clientes: renovar 12 meses', despRen !== antesRen, `${antesRen} → ${despRen}`);
    await ctx.close();
  }

  /* eliminar + restaurar con SUPERADMIN */
  {
    const { ctx, pag } = await sesion('SUPERADMIN');
    await pag.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1900);
    await (await pag.$('tr[data-id="cli-vivo"] button[data-a="eliminar"]')).click();
    await pag.waitForTimeout(600);
    await aceptar(pag);
    await pag.waitForTimeout(2800);
    const del = await leerDoc('clientes/cli-vivo');
    const oculto = await pag.evaluate(() => !document.querySelector('tr[data-id="cli-vivo"]'));
    anotar('Clientes: eliminar (baja lógica)',
      del.fields.eliminado.booleanValue === true && del.fields.activo.booleanValue === false && oculto,
      `eliminado=${del.fields.eliminado.booleanValue} · oculto=${oculto}`);

    await pag.check('#f-eliminados');
    await pag.waitForTimeout(2000);
    await (await pag.$('tr[data-id="cli-vivo"] button[data-a="activar"]')).click();
    await pag.waitForTimeout(700);
    await aceptar(pag);
    await pag.waitForTimeout(2800);
    await pag.uncheck('#f-eliminados').catch(() => {});
    await pag.waitForTimeout(2000);
    const rest = await leerDoc('clientes/cli-vivo');
    const visible = await pag.evaluate(() => !!document.querySelector('tr[data-id="cli-vivo"]'));
    anotar('Clientes: restaurar un eliminado y que reaparezca en la lista',
      rest.fields.eliminado.booleanValue === false && visible,
      `eliminado=${rest.fields.eliminado.booleanValue} · visible sin filtro=${visible}`);
    await ctx.close();
  }

  /* ═══ C · USUARIOS ═══════════════════════════════════════════════ */
  console.log('\n═══ C · USUARIOS ══════════════════════════════════════════════');
  {
    const tSup = (await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
      { email: ROLES.SUPERADMIN.email, password: ROLES.SUPERADMIN.pass, returnSecureToken: true })).j.idToken;
    const tAdm = (await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
      { email: ROLES.ADMIN.email, password: ROLES.ADMIN.pass, returnSecureToken: true })).j.idToken;
    const tOp = (await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
      { email: ROLES.OPERADOR.email, password: ROLES.OPERADOR.pass, returnSecureToken: true })).j.idToken;

    const correo = 'creado.' + Date.now() + '@crm.test';
    const alta = await callable('crearUsuario', { email: correo, password: 'Ficticia#1', rol: 'OPERADOR', nombre: 'Operador Lote C' }, tSup);
    const uid = alta.j && alta.j.result && alta.j.result.uid;
    const ficha = await leerDoc('usuarios/' + uid);
    anotar('Usuarios: crear con SUPERADMIN (uid como id)', alta.st === 200 && !!uid && ficha.fields && ficha.fields.rol.stringValue === 'OPERADOR',
      `HTTP ${alta.st} · uid=${uid} · rol=${ficha.fields ? ficha.fields.rol.stringValue : 'sin ficha'}`);

    const rolCambiado = await callable('actualizarUsuario', { uid, datos: { rol: 'ADMIN' } }, tSup);
    anotar('Usuarios: cambiar rol con SUPERADMIN', rolCambiado.st === 200 && (await leerDoc('usuarios/' + uid)).fields.rol.stringValue === 'ADMIN', `HTTP ${rolCambiado.st}`);

    const desactivar = await callable('actualizarUsuario', { uid, datos: { activo: false } }, tSup);
    const loginBloqueado = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
      { email: correo, password: 'Ficticia#1', returnSecureToken: true });
    anotar('Usuarios: desactivar bloquea el inicio de sesión',
      desactivar.st === 200 && loginBloqueado.st !== 200,
      `HTTP ${desactivar.st} · login HTTP ${loginBloqueado.st}`);

    const reactivar = await callable('actualizarUsuario', { uid, datos: { activo: true } }, tSup);
    const loginOk = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
      { email: correo, password: 'Ficticia#1', returnSecureToken: true });
    anotar('Usuarios: reactivar vuelve a permitir el acceso',
      reactivar.st === 200 && loginOk.st === 200, `HTTP ${reactivar.st} · login HTTP ${loginOk.st}`);

    const comoAdmin = await callable('crearUsuario', { email: 'x1@crm.test', password: 'Ficticia#1', rol: 'OPERADOR' }, tAdm);
    const comoOperador = await callable('crearUsuario', { email: 'x2@crm.test', password: 'Ficticia#1', rol: 'OPERADOR' }, tOp);
    const anonimo = await callable('crearUsuario', { email: 'x3@crm.test', password: 'Ficticia#1', rol: 'OPERADOR' }, null);
    anotar('Usuarios: ADMIN y OPERADOR rechazados, anónimo también',
      comoAdmin.st !== 200 && comoOperador.st !== 200 && anonimo.st !== 200,
      `ADMIN=${comoAdmin.st} · OPERADOR=${comoOperador.st} · anónimo=${anonimo.st}`);

    /* migración: ficha con formato correo + su cuenta de Authentication */
    await crear('usuarios', 'vieja.loteC@crm.test', { email: s('vieja.loteC@crm.test'), rol: s('ADMIN'), activo: b(true) });
    await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`,
      { email: 'vieja.lotec@crm.test', password: 'Ficticia#1', returnSecureToken: true });
    const env = Object.assign({}, process.env, {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      GCLOUD_PROJECT: PROYECTO,
    });
    const script = path.join(REPO, 'herramientas', 'migrar-usuarios-email-a-uid.js');
    const simular = execFileSync('node', [script], { env, encoding: 'utf8' });
    const aplicar = execFileSync('node', [script, '--aplicar'], { env, encoding: 'utf8' });
    const segunda = execFileSync('node', [script], { env, encoding: 'utf8' });
    const quedaEmail = (await listar('usuarios')).some((x) => x.name.split('/').pop().includes('@'));
    const nSim = (simular.match(/se migrarían\s*:\s*(\d+)/) || [])[1];
    const nApp = (aplicar.match(/migradas\s*:\s*(\d+)/) || [])[1];
    const nSeg = (segunda.match(/se migrarían\s*:\s*(\d+)/) || [])[1];
    anotar('Usuarios: migración correo→uid (simular, aplicar, idempotente)',
      nSim === '1' && nApp === '1' && (nSeg === '0' || /Nada que migrar/.test(segunda)) && quedaEmail === false,
      `simulación=${nSim} · aplicación=${nApp} · segunda pasada=${nSeg} · quedan fichas con correo: ${quedaEmail}`);
  }

  /* ═══ D · OPERACIÓN GENERAL ═══════════════════════════════════════ */
  console.log('\n═══ D · OPERACIÓN GENERAL ═════════════════════════════════════');
  {
    const { ctx, pag } = await sesion('ADMIN');

    /* confirmar un pago nuevo y comprobar auditoría + historial */
    await crear('pagos', 'pago-loteC', {
      clienteId: s('cli-vencido'), clienteNombre: s('Cliente Vencido'), monto: n(150000),
      metodoPago: s('Nequi'), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'),
      registradoPor: s(ids.OPERADOR), registradoPorNombre: s('Operador Ficticio'),
      createdAt: ts(hoy.toISOString()),
    });
    await pag.goto(`${BASE}/admin/pagos.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2200);
    const fila = await pag.$('tr[data-id="pago-loteC"] button[data-a="confirmar"]');
    if (fila) {
      await fila.click();
      await pag.waitForTimeout(500);
      await aceptar(pag);
      await pag.waitForTimeout(3200);
    }
    const pagoTras = await leerDoc('pagos/pago-loteC');
    const aud = await listar('auditoria');
    const hist = await listar('historial_estados');
    anotar('Pagos: confirmar deja rastro en auditoría e historial',
      pagoTras.fields.estado.stringValue === 'CONFIRMADO'
        && aud.some((a) => JSON.stringify(a.fields || {}).includes('CONFIRMAR_PAGO'))
        && hist.some((h) => JSON.stringify(h.fields || {}).includes('Pago confirmado')),
      `estado=${pagoTras.fields.estado.stringValue} · auditoría=${aud.length} · historial=${hist.length}`);

    /* notificaciones: refresco inmediato */
    await pag.goto(`${BASE}/admin/notificaciones.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    const filasAntes = await pag.evaluate(() => document.querySelectorAll('#n-filas tr').length);
    await pag.fill('#n-mensaje', 'Aviso ficticio LOTE C');
    await (await pag.$('#notif-form button[type="submit"]')).click();
    await pag.waitForTimeout(3000);
    const filasDespues = await pag.evaluate(() => document.querySelectorAll('#n-filas tr').length);
    anotar('Notificaciones: la tabla se refresca sin recargar', filasDespues === filasAntes + 1, `${filasAntes} → ${filasDespues} filas`);

    /* contactos y CSV */
    await pag.goto(`${BASE}/admin/contactos.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    const [dl] = await Promise.all([pag.waitForEvent('download', { timeout: 25000 }), pag.click('#btn-csv')]);
    anotar('Contactos: exportación CSV', !!dl && /contactos/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : 'sin descarga');

    /* página Servicios y sus botones */
    await pag.goto(`${BASE}/admin/servicios.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2200);
    const serv = await pag.evaluate(() => ({
      filas: document.querySelectorAll('table tbody tr').length,
      acciones: [...document.querySelectorAll('button[data-a]')].map((x) => x.dataset.a),
    }));
    anotar('Servicios: la página lista servicios con sus acciones',
      serv.filas > 0 && serv.acciones.length > 0,
      `${serv.filas} filas · acciones: ${[...new Set(serv.acciones)].join(', ')}`);

    /* error de formulario: monto inválido en registrar pago */
    await pag.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    const btnPago = await pag.$('tr[data-id="cli-vencido"] button[data-a="pago"]');
    if (btnPago) {
      await btnPago.click();
      await pag.waitForTimeout(700);
      await pag.fill('#p-monto', '0');
      await (await pag.$('button[form="pago-form"]')).click();
      await pag.waitForTimeout(1200);
      const err = await pag.evaluate(() => { const e = document.getElementById('p-error'); return e && !e.hidden ? e.textContent : ''; });
      anotar('Formularios: monto inválido muestra error y no guarda', /monto/i.test(err), err || 'sin mensaje');
    } else {
      anotar('Formularios: monto inválido muestra error y no guarda', 'BLOQUEADO', 'no se encontró el botón de pago');
    }
    await ctx.close();
  }

  /* navegación móvil (375×667) */
  {
    const { ctx, pag } = await sesion('ADMIN', { viewport: { width: 375, height: 667 } });
    await pag.goto(`${BASE}/admin/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2200);
    const antes = await pag.evaluate(() => {
      const s = document.querySelector('.sidebar, .shell__nav, aside');
      return s ? s.className : 'sin sidebar';
    });
    const burger = await pag.$('#btn-burger');
    let despues = antes;
    if (burger) {
      await burger.click();
      await pag.waitForTimeout(800);
      despues = await pag.evaluate(() => {
        const s = document.querySelector('.sidebar, .shell__nav, aside');
        return s ? s.className : 'sin sidebar';
      });
    }
    anotar('Navegación móvil: el botón de menú abre/cierra la barra',
      !!burger && antes !== despues,
      burger ? `${antes} → ${despues}` : 'no hay #btn-burger');
    const kpis = await pag.evaluate(() => document.querySelectorAll('.kpi').length);
    anotar('Vista móvil 375×667: el dashboard renderiza', kpis > 0, `${kpis} KPIs`);
    await ctx.close();
  }

  await nav.close();
  const fallos = salida.filter((x) => x.estado === 'FALLIDO');
  const bloqueos = salida.filter((x) => x.estado === 'BLOQUEADO');
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.filter(x => x.estado === 'APROBADO').length} · FALLIDAS: ${fallos.length} · BLOQUEADAS: ${bloqueos.length}`);
  console.log(`RED: ${peticiones} peticiones · externas: ${externas.length}`);
  if (externas.length) for (const x of [...new Set(externas)].slice(0, 5)) console.log('   EXTERNA → ' + x);
  if (fallos.length) { console.log('\nFALLOS:'); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  if (bloqueos.length) { console.log('\nBLOQUEADAS:'); for (const x of bloqueos) console.log(`  · ${x.nombre} — ${x.detalle}`); }
  console.log('══════════════════════════════════════════════════════════════\n');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(2); });
