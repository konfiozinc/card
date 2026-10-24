/* ═══════════════════════════════════════════════════════════════════
   pruebas-ops-001-servicios-contactos.js · KONFÍO ZINC — CARD — SPARK
   KZ-OPS-001 · Consolidación operativa

   Comprueba con llamadas REST reales al emulador las reglas que sostienen el
   flujo operativo completo. Cada caso existe porque un defecto REAL se midió
   antes de corregirlo:

     · servicios: el panel escribía `createdAt` y la regla no lo permitía →
       TODA alta de servicio daba PERMISSION_DENIED. Como crearCliente() lo
       envolvía en `.catch(() => {})`, el cliente se guardaba sin servicio y la
       pantalla decía «creado».
     · servicios: un ADMIN podía dejar el estado en «BASURA_INVENTADA» o la
       fecha de vencimiento en «no-es-fecha».
     · contactos: un ADMIN podía reescribir teléfono y mensaje del lead, con lo
       que el registro de captación perdía su valor probatorio.
     · pagos: los históricos sin concepto se podían confirmar sin clasificar (se
       bloqueó) pero no había forma de clasificarlos; ahora hay una sola vía, con
       motivo y auditoría, que no permite reclasificar ni tocar el dinero.

   Requisitos: Auth 9099 · Firestore 8080 · proyecto demo-card-seguridad.
   Uso: node herramientas/test/pruebas-ops-001-servicios-contactos.js
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
const ts = (x) => ({ timestampValue: x });
const NULO = { nullValue: null };
const lista = (arr) => ({ arrayValue: { values: arr } });

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
  return { st: r.status, j, txt };
}
const crear = (col, id, campos, token = 'owner') => pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, token);
function parchear(ruta, campos, token) {
  const mascara = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  return pedir('PATCH', `${u(ruta)}?${mascara}`, { fields: campos }, token);
}
const leer = (ruta, token) => pedir('GET', u(ruta), undefined, token);
const borrar = (ruta, token) => pedir('DELETE', u(ruta), undefined, token);

async function alta(email, pass) {
  let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  return { uid: r.j.localId, token: r.j.idToken, email };
}

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mas = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); return iso(d); };

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });

  const op = await alta('op.ops@crm.test', 'Ficticia#1');
  const ad = await alta('ad.ops@crm.test', 'Ficticia#1');
  const otro = await alta('otro.ops@crm.test', 'Ficticia#1');
  await crear('usuarios', op.uid, { email: s(op.email), nombre: s('Operador OPS'), rol: s('OPERADOR'), activo: b(true) });
  await crear('usuarios', ad.uid, { email: s(ad.email), nombre: s('Admin OPS'), rol: s('ADMIN'), activo: b(true) });
  await crear('usuarios', otro.uid, { email: s(otro.email), nombre: s('Otro Operador'), rol: s('OPERADOR'), activo: b(true) });
  await crear('clientes', 'cli-1', {
    nombre: s('Cliente Ficticio OPS'), telefono: s('3001234567'), servicio: s('Tarjetas Digitales'),
    precio: n(49900), fechaActivacion: s(iso(hoy)), fechaVencimiento: s(mas(365)),
    estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), activo: b(true), eliminado: b(false)
  });
  console.log('  2 operadores + 1 admin · 1 cliente ficticio\n');

  /* ═══════ A · SERVICIOS ═══════ */
  console.log('═══ A · SERVICIOS: ALTA Y EDICIÓN ═══');

  /* Exactamente lo que escribe escrituras-local.js crearServicio(): con
     `createdAt`. Es la comprobación que habría evitado el defecto original. */
  const del32 = {
    clienteId: s('cli-1'), clienteNombre: s('Cliente Ficticio OPS'),
    servicio: s('Tarjetas Digitales'), categoria: s('MINI WEB BÁSICA'),
    planId: NULO, precio: n(49900),
    fechaInicio: s(iso(hoy)), fechaVencimiento: s(mas(365)),
    estado: s('ACTIVO'), activo: b(true),
    createdAt: ts(new Date().toISOString())
  };
  const r1 = await crear('servicios', 'sv-1', del32, op.token);
  chequear('OPERADOR crea un servicio tal como lo escribe el panel', r1.st === 200, 'HTTP ' + r1.st);

  const r2 = await crear('servicios', 'sv-sin-cliente', { ...del32, clienteId: s('') }, op.token);
  chequear('Servicio sin clienteId: DENEGADO', r2.st === 403, 'HTTP ' + r2.st);

  const r3 = await crear('servicios', 'sv-sin-servicio', { ...del32, servicio: s('') }, op.token);
  chequear('Servicio sin nombre de servicio: DENEGADO', r3.st === 403, 'HTTP ' + r3.st);

  const r4 = await crear('servicios', 'sv-estado-malo', { ...del32, estado: s('BASURA') }, op.token);
  chequear('Servicio con estado inventado: DENEGADO', r4.st === 403, 'HTTP ' + r4.st);

  const r5 = await crear('servicios', 'sv-fecha-mala', { ...del32, fechaVencimiento: s('no-es-fecha') }, op.token);
  chequear('Servicio con fecha inválida: DENEGADO', r5.st === 403, 'HTTP ' + r5.st);

  const r6 = await crear('servicios', 'sv-campo-extra', { ...del32, colado: s('x') }, op.token);
  chequear('Servicio con campo arbitrario: DENEGADO', r6.st === 403, 'HTTP ' + r6.st);

  const r7 = await crear('servicios', 'sv-precio-neg', { ...del32, precio: n(-1) }, op.token);
  chequear('Servicio con precio negativo: DENEGADO', r7.st === 403, 'HTTP ' + r7.st);

  const r8 = await leer('servicios/sv-1', op.token);
  chequear('OPERADOR lee servicios', r8.st === 200, 'HTTP ' + r8.st);

  const r9 = await parchear('servicios/sv-1', { precio: n(69900), updatedAt: ts(new Date().toISOString()) }, ad.token);
  chequear('ADMIN edita el precio de un servicio', r9.st === 200, 'HTTP ' + r9.st);

  const r10 = await parchear('servicios/sv-1', { estado: s('SUSPENDIDO') }, ad.token);
  chequear('ADMIN suspende UN servicio', r10.st === 200, 'HTTP ' + r10.st);

  const r11 = await parchear('servicios/sv-1', { estado: s('BASURA_INVENTADA') }, ad.token);
  chequear('ADMIN con estado inventado: DENEGADO', r11.st === 403, 'HTTP ' + r11.st);

  const r12 = await parchear('servicios/sv-1', { fechaVencimiento: s('no-es-fecha') }, ad.token);
  chequear('ADMIN con fecha inválida: DENEGADO', r12.st === 403, 'HTTP ' + r12.st);

  const r13 = await parchear('servicios/sv-1', { clienteNombre: s('Nombre Corregido'), updatedAt: ts(new Date().toISOString()) }, op.token);
  chequear('OPERADOR corrige el nombre del cliente en el servicio', r13.st === 200, 'HTTP ' + r13.st);

  const r14 = await parchear('servicios/sv-1', { precio: n(1) }, op.token);
  chequear('OPERADOR tocando precio: DENEGADO', r14.st === 403, 'HTTP ' + r14.st);

  const r15 = await parchear('servicios/sv-1', { clienteId: s('cli-otro') }, ad.token);
  chequear('Reasignar un servicio a otro cliente: DENEGADO', r15.st === 403, 'HTTP ' + r15.st);

  const r16 = await borrar('servicios/sv-1', ad.token);
  chequear('Borrado físico de un servicio: DENEGADO', r16.st === 403, 'HTTP ' + r16.st);

  /* ═══════ B · CONTACTOS ═══════ */
  console.log('\n═══ B · CONTACTOS: CAPTACIÓN INMUTABLE Y SEGUIMIENTO ═══');

  const lead = {
    nombre: s('Lead Ficticio'), telefono: s('3009876543'), email: s('lead@ficticio.test'),
    servicio: s('Tarjetas Digitales'), mensaje: s('Quiero información'),
    estado: s('NUEVO'), createdAt: ts(new Date().toISOString())
  };
  await crear('contactos', 'ct-1', lead);
  await crear('contactos', 'ct-2', lead);
  await crear('contactos', 'ct-3', lead);

  const c1 = await crear('contactos', 'ct-x', lead, op.token);
  chequear('El navegador NO puede crear contactos', c1.st === 403, 'HTTP ' + c1.st);

  const c2 = await leer('contactos/ct-1', op.token);
  chequear('OPERADOR lee contactos', c2.st === 200, 'HTTP ' + c2.st);

  const c3 = await parchear('contactos/ct-1', {
    estado: s('CONTACTADO'), actualizadoPor: s(op.uid), actualizadoEn: ts(new Date().toISOString())
  }, op.token);
  chequear('OPERADOR marca un lead como CONTACTADO', c3.st === 200, 'HTTP ' + c3.st);

  const c4 = await parchear('contactos/ct-1', {
    seguimiento: lista([s('2026-10-24 — Llamé, no contestó')]),
    actualizadoPor: s(op.uid), actualizadoEn: ts(new Date().toISOString())
  }, op.token);
  chequear('OPERADOR añade una entrada de seguimiento', c4.st === 200, 'HTTP ' + c4.st);

  const c5 = await parchear('contactos/ct-2', { telefono: s('3000000000') }, ad.token);
  chequear('Reescribir el teléfono del lead: DENEGADO', c5.st === 403, 'HTTP ' + c5.st);

  const c6 = await parchear('contactos/ct-2', { mensaje: s('mensaje reescrito') }, ad.token);
  chequear('Reescribir el mensaje del lead: DENEGADO', c6.st === 403, 'HTTP ' + c6.st);

  const c7 = await parchear('contactos/ct-2', { nombre: s('Otro nombre') }, ad.token);
  chequear('Reescribir el nombre del lead: DENEGADO', c7.st === 403, 'HTTP ' + c7.st);

  const c8 = await parchear('contactos/ct-2', { createdAt: ts('2020-01-01T00:00:00Z') }, ad.token);
  chequear('Reescribir la fecha de recepción: DENEGADO', c8.st === 403, 'HTTP ' + c8.st);

  const c9 = await parchear('contactos/ct-2', {
    estado: s('PERDIDO'), actualizadoPor: s(ad.uid), actualizadoEn: ts(new Date().toISOString())
  }, ad.token);
  chequear('Estado comercial fuera del catálogo: DENEGADO', c9.st === 403, 'HTTP ' + c9.st);

  const c10 = await parchear('contactos/ct-2', {
    estado: s('CONVERTIDO'), actualizadoPor: s(op.uid), actualizadoEn: ts(new Date().toISOString())
  }, op.token);
  chequear('CONVERTIDO sin cliente asociado: DENEGADO', c10.st === 403, 'HTTP ' + c10.st);

  const c11 = await parchear('contactos/ct-2', {
    estado: s('CONVERTIDO'), clienteId: s('cli-1'),
    actualizadoPor: s(op.uid), actualizadoEn: ts(new Date().toISOString())
  }, op.token);
  chequear('CONVERTIDO con cliente asociado: PERMITIDO', c11.st === 200, 'HTTP ' + c11.st);

  const c12 = await parchear('contactos/ct-3', {
    estado: s('ATENDIDO'), actualizadoPor: s(otro.uid), actualizadoEn: ts(new Date().toISOString())
  }, op.token);
  chequear('Firmar una gestión con el uid de otro usuario: DENEGADO', c12.st === 403, 'HTTP ' + c12.st);

  const c13 = await borrar('contactos/ct-1', op.token);
  chequear('OPERADOR borrando un contacto: DENEGADO', c13.st === 403, 'HTTP ' + c13.st);

  const c14 = await borrar('contactos/ct-3', ad.token);
  chequear('ADMIN puede eliminar un contacto', c14.st === 200, 'HTTP ' + c14.st);

  /* ═══════ C · PAGOS: CLASIFICACIÓN HISTÓRICA ═══════ */
  console.log('\n═══ C · PAGOS HISTÓRICOS: CLASIFICAR UNA VEZ ═══');

  const basePago = {
    clienteId: s('cli-1'), clienteNombre: s('Cliente Ficticio OPS'),
    monto: n(49900), metodoPago: s('Efectivo'), fechaPago: s(iso(hoy)),
    estado: s('PENDIENTE'), registradoPor: s(op.uid), registradoPorNombre: s('Operador OPS'),
    createdAt: ts(new Date().toISOString())
  };
  await crear('pagos', 'pg-h1', basePago);
  await crear('pagos', 'pg-h2', basePago);
  await crear('pagos', 'pg-h3', {
    ...basePago, estado: s('CONFIRMADO'), concepto: s('DESARROLLO'),
    confirmadoPor: s(ad.uid), confirmadoEn: ts(new Date().toISOString())
  });

  /* KZ-OPS-001 · Registrar un cobro SIN descripción.
     El panel enviaba `descripcion: null` y la regla exigía `is string`, así que
     cualquier pago sin detalle fallaba con un mensaje de reglas ilegible. Se
     comprueban las dos formas: sin la clave y con null explícito. */
  const pagoSinDesc = {
    clienteId: s('cli-1'), clienteNombre: s('Cliente Ficticio OPS'), monto: n(30000),
    concepto: s('DESARROLLO'), metodoPago: s('Efectivo'), fechaPago: s(iso(hoy)),
    estado: s('PENDIENTE'), registradoPor: s(op.uid), registradoPorNombre: s('Operador OPS'),
    createdAt: ts(new Date().toISOString())
  };
  const p0a = await crear('pagos', 'pg-sin-desc', pagoSinDesc, op.token);
  chequear('Cobro SIN descripción: PERMITIDO', p0a.st === 200, 'HTTP ' + p0a.st);
  const p0b = await crear('pagos', 'pg-desc-null', { ...pagoSinDesc, descripcion: NULO }, op.token);
  chequear('Cobro con descripción NULL: PERMITIDO', p0b.st === 200, 'HTTP ' + p0b.st);
  const p0c = await crear('pagos', 'pg-desc-larga', { ...pagoSinDesc, descripcion: s('x'.repeat(301)) }, op.token);
  chequear('Cobro con descripción > 300: DENEGADO', p0c.st === 403, 'HTTP ' + p0c.st);

  const p1 = await parchear('pagos/pg-h1', {
    concepto: s('RENOVACION_DOMINIO'), clasificadoPor: s(ad.uid),
    clasificadoEn: ts(new Date().toISOString()), motivoClasificacion: s('Comprobante de dominio 2025')
  }, ad.token);
  chequear('ADMIN clasifica un pago histórico sin concepto', p1.st === 200, 'HTTP ' + p1.st);

  const p2 = await parchear('pagos/pg-h1', {
    concepto: s('HOSTING'), clasificadoPor: s(ad.uid),
    clasificadoEn: ts(new Date().toISOString()), motivoClasificacion: s('Otra vez')
  }, ad.token);
  chequear('Reclasificar un pago ya clasificado: DENEGADO', p2.st === 403, 'HTTP ' + p2.st);

  const p3 = await parchear('pagos/pg-h2', {
    concepto: s('HOSTING'), clasificadoPor: s(ad.uid), clasificadoEn: ts(new Date().toISOString())
  }, ad.token);
  chequear('Clasificar sin motivo: DENEGADO', p3.st === 403, 'HTTP ' + p3.st);

  const p4 = await parchear('pagos/pg-h2', {
    concepto: s('HOSTING'), monto: n(1), clasificadoPor: s(ad.uid),
    clasificadoEn: ts(new Date().toISOString()), motivoClasificacion: s('Intento de cambiar el importe')
  }, ad.token);
  chequear('Clasificar cambiando el importe: DENEGADO', p4.st === 403, 'HTTP ' + p4.st);

  const p5 = await parchear('pagos/pg-h2', {
    concepto: s('CONCEPTO_INVENTADO'), clasificadoPor: s(ad.uid),
    clasificadoEn: ts(new Date().toISOString()), motivoClasificacion: s('Concepto que no existe')
  }, ad.token);
  chequear('Clasificar con concepto inventado: DENEGADO', p5.st === 403, 'HTTP ' + p5.st);

  const p6 = await parchear('pagos/pg-h2', {
    concepto: s('HOSTING'), clasificadoPor: s(op.uid),
    clasificadoEn: ts(new Date().toISOString()), motivoClasificacion: s('Operador no puede')
  }, op.token);
  chequear('OPERADOR clasificando un pago: DENEGADO', p6.st === 403, 'HTTP ' + p6.st);

  const p7 = await parchear('pagos/pg-h3', {
    concepto: s('HOSTING'), clasificadoPor: s(ad.uid),
    clasificadoEn: ts(new Date().toISOString()), motivoClasificacion: s('Ya confirmado')
  }, ad.token);
  chequear('Clasificar un pago ya CONFIRMADO: DENEGADO', p7.st === 403, 'HTTP ' + p7.st);

  /* ═══════ D · HISTORIAL POR SERVICIO ═══════ */
  console.log('\n═══ D · HISTORIAL Y AUDITORÍA ═══');

  const h1 = await crear('historial_estados', 'h-1', {
    clienteId: s('cli-1'), estadoAnterior: s('ACTIVO'), estadoNuevo: s('SUSPENDIDO'),
    motivo: s('Suspensión manual · servicio: Tarjetas Digitales'),
    usuarioId: s(ad.uid), usuarioNombre: s('Admin OPS'),
    fecha: ts(new Date().toISOString())
  }, ad.token);
  chequear('El historial acepta la transición de un servicio', h1.st === 200, 'HTTP ' + h1.st);

  const h2 = await crear('historial_estados', 'h-2', {
    clienteId: s('cli-1'), estadoNuevo: s('ESTADO_INVENTADO'),
    usuarioId: s(ad.uid), fecha: ts(new Date().toISOString())
  }, ad.token);
  chequear('El historial rechaza un estado inventado', h2.st === 403, 'HTTP ' + h2.st);

  const h3 = await crear('historial_estados', 'h-3', {
    clienteId: s('cli-1'), estadoNuevo: s('ACTIVO'), usuarioId: s(op.uid),
    fecha: ts(new Date().toISOString())
  }, ad.token);
  chequear('El historial exige firmar con el uid propio', h3.st === 403, 'HTTP ' + h3.st);

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · PASAN: ${salida.length - fallos.length} · FALLAN: ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log(''); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.stack || e)); process.exit(2); });
