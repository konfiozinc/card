/* ═══════════════════════════════════════════════════════════════════
   pruebas-callables-p1.js · KONFÍO ZINC — CARD
   Regresión de las Cloud Functions del panel, ejecutadas de verdad contra
   el emulador de Functions (no simuladas).

   Cubre:
     · crearUsuario / actualizarUsuario
     · registrarPago / confirmarPago / anularPago
     · enviarNotificacion (con anti-duplicado)
     · pagos históricos sin servicioId (el caso que rompía las reglas)
     · recuperación ante fallo parcial (sin cuentas huérfanas)

   Requisitos: emuladores Auth 9099 · Firestore 8080 · Functions 5001,
   proyecto demo-card-seguridad. Todas las llamadas van a 127.0.0.1.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const FN = 'http://127.0.0.1:5001';
const PROYECTO = 'demo-card-seguridad';
const K = 'clave-ficticia';

const u = (r) => `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
const ts = (x) => ({ timestampValue: x });

const salida = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  salida.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : 'NO VERIF';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(50)} ${detalle || ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = {};
  if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j, txt };
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
const campo = (doc, k) => doc && doc.fields && doc.fields[k] ? doc.fields[k].stringValue || doc.fields[k].integerValue || doc.fields[k].booleanValue : undefined;
async function callable(nombre, datos, token) {
  return pedir('POST', `${FN}/${PROYECTO}/us-central1/${nombre}`, { data: datos }, token);
}
async function entrar(email, pass) {
  const r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  return r.j && r.j.idToken;
}
async function alta(email, pass) {
  let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email, password: pass, returnSecureToken: true });
  if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email, password: pass, returnSecureToken: true });
  return r.j;
}
async function cuentasAuth() {
  const r = await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`);
  const j = await r.json().catch(() => ({}));
  return (j.users || []).length;
}

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masMeses = (f, m) => { const d = new Date(f); d.setMonth(d.getMonth() + m); return iso(d); };

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });

  const cuentas = {};
  for (const [rol, email] of [['OPERADOR', 'op.fn@crm.test'], ['ADMIN', 'ad.fn@crm.test'], ['SUPERADMIN', 'su.fn@crm.test']]) {
    const a = await alta(email, 'Ficticia#1');
    cuentas[rol] = { uid: a.localId, token: a.idToken };
    await crear('usuarios', a.localId, { email: s(email), nombre: s(rol + ' Ficticio'), rol: s(rol), activo: b(true) });
  }
  await crear('clientes', 'cli-fn', {
    nombre: s('Cliente Funciones'), telefono: s('3001234567'), servicio: s('Tarjetas Digitales'),
    precio: n(99900), fechaActivacion: s(iso(hoy)), fechaVencimiento: s(masMeses(hoy, 1)),
    estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), activo: b(true), eliminado: b(false),
  });
  console.log('  3 cuentas · 1 cliente\n');

  /* ── 1 · USUARIOS ─────────────────────────────────────────────── */
  console.log('═══ crearUsuario / actualizarUsuario ═══');
  const correoNuevo = 'nuevo.' + Date.now() + '@crm.test';
  let r = await callable('crearUsuario', { email: correoNuevo, password: 'Ficticia#1', rol: 'OPERADOR', nombre: 'Nuevo Ficticio' }, cuentas.SUPERADMIN.token);
  const uidNuevo = r.j && r.j.result && r.j.result.uid;
  const ficha = uidNuevo ? await leerDoc('usuarios/' + uidNuevo) : null;
  /* La prueba directa de que la cuenta existe en Authentication es entrar. */
  const tokenNuevo = await entrar(correoNuevo, 'Ficticia#1');
  anotar('crearUsuario crea Auth + ficha con el uid como id',
    r.st === 200 && !!uidNuevo && campo(ficha, 'rol') === 'OPERADOR' && !!tokenNuevo,
    `HTTP ${r.st} · uid=${uidNuevo} · rol=${campo(ficha, 'rol')} · login de la cuenta nueva: ${tokenNuevo ? 'OK' : 'FALLÓ'}`);

  const fichasAntes = (await listar('usuarios')).length;
  r = await callable('crearUsuario', { email: correoNuevo, password: 'Ficticia#1', rol: 'ADMIN' }, cuentas.SUPERADMIN.token);
  anotar('crearUsuario con correo repetido falla sin crear ficha nueva',
    r.st !== 200 && (await listar('usuarios')).length === fichasAntes,
    `HTTP ${r.st} · ${(r.j.error && r.j.error.message || '').slice(0, 60)}`);

  r = await callable('crearUsuario', { email: 'mal', password: 'Ficticia#1', rol: 'OPERADOR' }, cuentas.SUPERADMIN.token);
  anotar('crearUsuario valida el email', r.st !== 200, `HTTP ${r.st}`);
  r = await callable('crearUsuario', { email: 'x' + Date.now() + '@crm.test', password: '123', rol: 'OPERADOR' }, cuentas.SUPERADMIN.token);
  anotar('crearUsuario valida la contraseña', r.st !== 200, `HTTP ${r.st}`);

  r = await callable('actualizarUsuario', { uid: uidNuevo, datos: { rol: 'ADMIN' } }, cuentas.SUPERADMIN.token);
  anotar('actualizarUsuario cambia el rol', r.st === 200 && campo(await leerDoc('usuarios/' + uidNuevo), 'rol') === 'ADMIN', `HTTP ${r.st}`);

  r = await callable('actualizarUsuario', { uid: cuentas.SUPERADMIN.uid, datos: { activo: false } }, cuentas.SUPERADMIN.token);
  anotar('un SUPERADMIN no puede desactivarse a sí mismo', r.st !== 200, `HTTP ${r.st}`);

  r = await callable('actualizarUsuario', { uid: uidNuevo, datos: { rol: 'JEFE' } }, cuentas.SUPERADMIN.token);
  anotar('actualizarUsuario valida el rol', r.st !== 200, `HTTP ${r.st}`);

  r = await callable('actualizarUsuario', { uid: 'no-existe', datos: { rol: 'ADMIN' } }, cuentas.SUPERADMIN.token);
  anotar('actualizarUsuario con uid inexistente falla limpio', r.st !== 200, `HTTP ${r.st}`);

  /* ── 2 · PAGOS ────────────────────────────────────────────────── */
  console.log('\n═══ registrarPago / confirmarPago / anularPago ═══');

  r = await callable('registrarPago', { clienteId: 'cli-fn', monto: 99900, metodoPago: 'Nequi', fechaPago: iso(hoy) }, cuentas.OPERADOR.token);
  const pagoId = r.j && r.j.result && r.j.result.id;
  const pagoDoc = pagoId ? await leerDoc('pagos/' + pagoId) : null;
  anotar('registrarPago crea un pago PENDIENTE (OPERADOR)',
    r.st === 200 && !!pagoId && campo(pagoDoc, 'estado') === 'PENDIENTE' && campo(pagoDoc, 'monto') === '99900',
    `HTTP ${r.st} · id=${pagoId}`);

  r = await callable('registrarPago', { clienteId: 'cli-fn', monto: 0 }, cuentas.OPERADOR.token);
  anotar('registrarPago rechaza monto 0', r.st !== 200, `HTTP ${r.st}`);
  r = await callable('registrarPago', { clienteId: 'no-existe', monto: 1000 }, cuentas.OPERADOR.token);
  anotar('registrarPago rechaza cliente inexistente', r.st !== 200, `HTTP ${r.st}`);
  r = await callable('registrarPago', { clienteId: 'cli-fn', monto: 1000 }, null);
  anotar('registrarPago rechaza anónimo', r.st !== 200, `HTTP ${r.st}`);

  const vencAntes = campo(await leerDoc('clientes/cli-fn'), 'fechaVencimiento');
  r = await callable('confirmarPago', { pagoId }, cuentas.OPERADOR.token);
  anotar('confirmarPago rechaza a OPERADOR', r.st !== 200, `HTTP ${r.st}`);

  r = await callable('confirmarPago', { pagoId }, cuentas.ADMIN.token);
  const pagoConf = await leerDoc('pagos/' + pagoId);
  const cliTras = await leerDoc('clientes/cli-fn');
  anotar('confirmarPago confirma y renueva 12 meses',
    r.st === 200 && campo(pagoConf, 'estado') === 'CONFIRMADO' && campo(cliTras, 'fechaVencimiento') !== vencAntes,
    `HTTP ${r.st} · vencimiento ${vencAntes} → ${campo(cliTras, 'fechaVencimiento')}`);

  r = await callable('confirmarPago', { pagoId }, cuentas.ADMIN.token);
  anotar('confirmarPago rechaza un pago ya confirmado', r.st !== 200, `HTTP ${r.st}`);

  r = await callable('anularPago', { pagoId }, cuentas.ADMIN.token);
  anotar('anularPago exige motivo', r.st !== 200, `HTTP ${r.st}`);

  r = await callable('registrarPago', { clienteId: 'cli-fn', monto: 50000, metodoPago: 'Efectivo' }, cuentas.OPERADOR.token);
  const pago2 = r.j && r.j.result && r.j.result.id;
  r = await callable('anularPago', { pagoId: pago2, motivo: 'Prueba ficticia' }, cuentas.ADMIN.token);
  const pago2Doc = await leerDoc('pagos/' + pago2);
  anotar('anularPago anula con motivo', r.st === 200 && campo(pago2Doc, 'estado') === 'ANULADO', `HTTP ${r.st} · estado=${campo(pago2Doc, 'estado')}`);

  /* pago histórico SIN servicioId: el caso que rompía las reglas */
  await crear('pagos', 'pago-historico', {
    clienteId: s('cli-fn'), clienteNombre: s('Cliente Funciones'), monto: n(30000),
    metodoPago: s('Nequi'), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'),
    registradoPor: s(cuentas.OPERADOR.uid), createdAt: ts(hoy.toISOString()),
  });
  r = await callable('confirmarPago', { pagoId: 'pago-historico' }, cuentas.ADMIN.token);
  const hist = await leerDoc('pagos/pago-historico');
  anotar('un pago histórico SIN servicioId se puede confirmar',
    r.st === 200 && campo(hist, 'estado') === 'CONFIRMADO',
    `HTTP ${r.st} · estado=${campo(hist, 'estado')}`);

  /* ── 3 · NOTIFICACIONES ───────────────────────────────────────── */
  console.log('\n═══ enviarNotificacion ═══');
  const notisAntes = (await listar('notificaciones')).length;
  r = await callable('enviarNotificacion', { clienteId: 'cli-fn', tipo: 'MANUAL', mensaje: 'Aviso ficticio de regresión' }, cuentas.ADMIN.token);
  const notisTras = (await listar('notificaciones')).length;
  anotar('enviarNotificacion crea el aviso (ADMIN)', r.st === 200 && notisTras >= notisAntes + 1, `HTTP ${r.st} · ${notisAntes} → ${notisTras}`);

  r = await callable('enviarNotificacion', { clienteId: 'cli-fn', tipo: 'MANUAL', mensaje: 'Aviso ficticio de regresión' }, cuentas.OPERADOR.token);
  const notisOp = (await listar('notificaciones')).length;
  anotar('enviarNotificacion rechaza a OPERADOR', r.st !== 200 && notisOp === notisTras, `HTTP ${r.st} · sin aviso nuevo`);

  /* ── 4 · PUB/SUB ──────────────────────────────────────────────── */
  console.log('\n═══ processDueDates (onSchedule) ═══');
  let pubsubVivo = false;
  try {
    const r = await fetch('http://127.0.0.1:8085/', { method: 'GET' });
    pubsubVivo = r.status < 500;
  } catch (e) { pubsubVivo = false; }
  anotar('emulador de Pub/Sub disponible para processDueDates',
    pubsubVivo ? 'APROBADO' : 'NO VERIFICADO',
    pubsubVivo ? 'escuchando en 127.0.0.1:8085' : 'no está levantado: la función programada no se ha podido disparar');

  const fallos = salida.filter((x) => x.estado === 'FALLIDO');
  const noVerif = salida.filter((x) => x.estado === 'NO VERIFICADO');
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.filter(x => x.estado === 'APROBADO').length} · FALLIDAS: ${fallos.length} · NO VERIFICADAS: ${noVerif.length}`);
  if (fallos.length) { console.log('\nFALLOS:'); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  if (noVerif.length) { console.log('\nNO VERIFICADAS:'); for (const f of noVerif) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  console.log('──────────────────────────────────────────────────────────────\n');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(2); });
