/* ═══════════════════════════════════════════════════════════════════
   pruebas-seguridad-kz-sec-002.js · KONFÍO ZINC — KZ-SEC-002

   Pruebas NEGATIVAS de blindaje sobre las reglas de Firestore:
     · OPERADOR NO puede cambiar precio/fechaVencimiento/estado de un servicio
     · OPERADOR SÍ puede ajustar clienteNombre (flujo legítimo)
     · ADMIN SÍ puede ajustar el precio del servicio
     · tokens_notificacion: no inyección de token con id ajeno ni sin rol
     · contactos: creación pública endurecida (campos, tamaños, email)

   Requisitos: Auth 9099 · Firestore 8080 · proyecto demo-card-seguridad.
   Uso: node herramientas/test/pruebas-seguridad-kz-sec-002.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const P = 'demo-card-seguridad';
const K = 'clave-ficticia';

const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });

const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(64)} ${detalle || ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j };
}
const crear = (col, id, campos, token) => pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, token);
function parchear(ruta, campos, token) {
  const mascara = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  return pedir('PATCH', `${u(ruta)}?${mascara}`, { fields: campos }, token);
}

async function alta(email, pass) {
  let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  return { uid: r.j.localId, token: r.j.idToken, email };
}

const DENEGADO = (r) => r.st === 403 || r.st === 401;

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });

  const op = await alta('op.sec2@crm.test', 'Ficticia#1');
  const ad = await alta('ad.sec2@crm.test', 'Ficticia#1');
  /* Las fichas de usuario se siembran con el token 'owner' del emulador (bypass de
     siembra); `usuarios` es solo-lectura desde el navegador, por eso un ADMIN real
     no puede crear fichas. */
  await crear('usuarios', op.uid, { email: s(op.email), nombre: s('Operador Sec2'), rol: s('OPERADOR'), activo: b(true) }, 'owner');
  await crear('usuarios', ad.uid, { email: s(ad.email), nombre: s('Admin Sec2'), rol: s('ADMIN'), activo: b(true) }, 'owner');

  await crear('clientes', 'cliente-sec2', {
    nombre: s('Cliente Ficticio'), servicio: s('tarjetas'), telefono: s('3000000000'),
    precio: n(49900), fechaActivacion: s('2026-01-01'), fechaVencimiento: s('2027-01-01'),
    estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), eliminado: b(false)
  }, ad.token);
  await crear('servicios', 'servicio-sec2', {
    clienteId: s('cliente-sec2'), clienteNombre: s('Cliente Ficticio'), servicio: s('tarjetas'),
    categoria: s('MINI WEB BÁSICA'), precio: n(49900), fechaVencimiento: s('2027-01-01'),
    estado: s('ACTIVO'), activo: b(true)
  }, ad.token);

  console.log('\n═══ A · SERVICIOS: OPERADOR NO TOCA LO COMERCIAL ═══');
  chequear('OPERADOR cambia precio de servicio: DENEGADO', DENEGADO(await parchear('servicios/servicio-sec2', { precio: n(1) }, op.token)));
  chequear('OPERADOR cambia estado de servicio: DENEGADO', DENEGADO(await parchear('servicios/servicio-sec2', { estado: s('INHABILITADO') }, op.token)));
  chequear('OPERADOR cambia fechaVencimiento de servicio: DENEGADO', DENEGADO(await parchear('servicios/servicio-sec2', { fechaVencimiento: s('2030-01-01') }, op.token)));
  chequear('OPERADOR cambia planId de servicio: DENEGADO', DENEGADO(await parchear('servicios/servicio-sec2', { planId: s('mini-web-pro') }, op.token)));
  chequear('OPERADOR ajusta clienteNombre: PERMITIDO', (await parchear('servicios/servicio-sec2', { clienteNombre: s('Otro Nombre') }, op.token)).st === 200);
  chequear('ADMIN cambia precio de servicio: PERMITIDO', (await parchear('servicios/servicio-sec2', { precio: n(59900) }, ad.token)).st === 200);

  console.log('\n═══ B · tokens_notificacion: SIN INYECCIÓN ═══');
  chequear('Token con id distinto al token: DENEGADO', DENEGADO(await crear('tokens_notificacion', 'token-a', { clienteId: s('cliente-sec2'), token: s('token-b') }, op.token)));
  chequear('Token sin autenticación: DENEGADO', DENEGADO(await crear('tokens_notificacion', 'token-c', { clienteId: s('cliente-sec2'), token: s('token-c') }, undefined)));
  chequear('Token con campo arbitrario: DENEGADO', DENEGADO(await crear('tokens_notificacion', 'token-e', { clienteId: s('cliente-sec2'), token: s('token-e'), rol: s('SUPERADMIN') }, op.token)));
  chequear('Token válido de OPERADOR: PERMITIDO', (await crear('tokens_notificacion', 'token-d', { clienteId: s('cliente-sec2'), token: s('token-d'), activo: b(true) }, op.token)).st === 200);

  console.log('\n═══ C · contactos: CREACIÓN PÚBLICA ENDURECIDA ═══');
  chequear('Contacto público directo (cerrado): DENEGADO', DENEGADO(await crear('contactos', 'c1', { nombre: s('Ana'), email: s('ana@x.com'), mensaje: s('Hola mundo'), origen: s('premium'), estado: s('NUEVO') })));
  chequear('Contacto premium sin email directo (cerrado): DENEGADO', DENEGADO(await crear('contactos', 'c7', { nombre: s('Pedro'), telefono: s('+57 300 000 0000'), servicio: s('Mini Web Básica'), mensaje: s('Negocio: panadería. Objetivo: más clientes'), origen: s('premium'), estado: s('NUEVO'), createdAt: { timestampValue: new Date().toISOString() } })));
  chequear('Contacto sin mensaje: DENEGADO', DENEGADO(await crear('contactos', 'c2', { nombre: s('Ana'), email: s('ana@x.com') })));
  chequear('Contacto con campo arbitrario: DENEGADO', DENEGADO(await crear('contactos', 'c3', { nombre: s('Ana'), email: s('ana@x.com'), mensaje: s('Hola'), admin: b(true) })));
  chequear('Contacto con mensaje > 2000: DENEGADO', DENEGADO(await crear('contactos', 'c4', { nombre: s('Ana'), email: s('ana@x.com'), mensaje: s('x'.repeat(2001)) })));
  chequear('Contacto con email inválido: DENEGADO', DENEGADO(await crear('contactos', 'c5', { nombre: s('Ana'), email: s('noesuncorreo'), mensaje: s('Hola') })));
  chequear('Contacto con nombre > 120: DENEGADO', DENEGADO(await crear('contactos', 'c6', { nombre: s('x'.repeat(121)), email: s('ana@x.com'), mensaje: s('Hola') })));

  console.log('\n══════════════════════════════════════════════════════════════');
  const fallan = salida.filter((x) => !x.ok).length;
  console.log(`TOTAL: ${salida.length} · PASAN: ${salida.length - fallan} · FALLAN: ${fallan}`);
  console.log('══════════════════════════════════════════════════════════════');
  process.exitCode = fallan ? 1 : 0;
})();
