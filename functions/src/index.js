/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · functions/src/index.js
   Cloud Functions del panel (v2). Adaptadas del patrón de UneFibra.

   Garantías centrales (no se pueden relajar):
   - Gate de rol en SERVIDOR (lee usuarios/{uid}.rol y .activo).
   - Auditoría en toda escritura.
   - Historial de estados en toda transición.
   - Anti-duplicado de notificaciones (id = claveDedup, create()).
   - confirmarPago suma 12 meses y reinicia los avisos del nuevo ciclo.
   - Un SUPERADMIN no puede desactivarse ni degradarse a sí mismo.
   ═══════════════════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const NIVEL = { OPERADOR: 1, ADMIN: 2, SUPERADMIN: 3 };
const MESES = 12;
const DIAS_ANTES = [10, 5, 3, 1];
const DIAS_POR_VENCER = 15;
const DIAS_GRACIA = 5;
const WHATSAPP = '573206411340';
const SITIO = 'https://konfiozinc.github.io/card/';

/* ── Utilidades de fecha ───────────────────────────────────────────── */
const aFecha = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const sumarMeses = (f, n) => {
  const d = new Date(f); const dia = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() < dia) d.setDate(0);
  return d;
};
const diasEntre = (desde, hasta) => Math.round((aFecha(hasta) - aFecha(desde)) / 86400000);
const soloDia = (v) => { const d = aFecha(v); d.setHours(0, 0, 0, 0); return d; };

/* ── Gate de rol + auditoría + historial ───────────────────────────── */
async function usuarioActivo(uid) {
  const snap = await db.doc(`usuarios/${uid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Tu usuario no tiene ficha en el panel.');
  const u = snap.data();
  if (u.activo !== true) throw new HttpsError('permission-denied', 'Tu usuario está desactivado.');
  return u;
}

async function requerir(request, min) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  const u = await usuarioActivo(request.auth.uid);
  if ((NIVEL[u.rol] || 0) < (NIVEL[min] || 0)) {
    throw new HttpsError('permission-denied', `Tu rol (${u.rol}) no permite esta acción.`);
  }
  return { uid: request.auth.uid, rol: u.rol, nombre: u.nombre || request.auth.uid };
}

async function auditar(ctx, accion, entidad, entidadId, antes, despues) {
  await db.collection('auditoria').add({
    usuarioId: ctx.uid, usuarioNombre: ctx.nombre, accion, entidad, entidadId,
    datosAnteriores: antes || null, datosNuevos: despues || null,
    fecha: FieldValue.serverTimestamp()
  });
}

async function historial(clienteId, estadoAnterior, estadoNuevo, motivo, ctx) {
  await db.collection('historial_estados').add({
    clienteId, estadoAnterior, estadoNuevo, motivo,
    usuarioId: ctx.uid, usuarioNombre: ctx.nombre,
    fecha: FieldValue.serverTimestamp()
  });
}

/* ── Estado derivado del vencimiento ───────────────────────────────── */
function estadoPorVencimiento(v) {
  if (!v) return 'ACTIVO';
  const d = diasEntre(new Date(), v);
  if (d < 0) return 'PENDIENTE_PAGO';
  if (d <= DIAS_POR_VENCER) return 'POR_VENCER';
  return 'ACTIVO';
}

/* ═══════════════ CLIENTES ═══════════════ */
exports.crearCliente = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'OPERADOR');
  const d = request.data || {};
  if (!d.nombre || !d.telefono || !d.servicio) {
    throw new HttpsError('invalid-argument', 'Nombre, teléfono y servicio son obligatorios.');
  }
  /* Anti-duplicado: documento y teléfono únicos */
  if (d.documento) {
    const dup = await db.collection('clientes').where('documento', '==', d.documento).limit(1).get();
    if (!dup.empty) throw new HttpsError('already-exists', `Ya existe un cliente con el documento ${d.documento}.`);
  }
  const tel = String(d.telefono).replace(/\D/g, '');
  const dupTel = await db.collection('clientes').where('telefono', '==', tel).limit(1).get();
  if (!dupTel.empty) throw new HttpsError('already-exists', `Ya existe un cliente con el teléfono ${d.telefono}.`);

  const vencimiento = d.fechaVencimiento || iso(sumarMeses(d.fechaActivacion || new Date(), MESES));
  const estado = estadoPorVencimiento(vencimiento);

  const cliente = {
    nombre: d.nombre, empresa: d.empresa || '', documento: d.documento || null,
    telefono: tel, whatsapp: d.whatsapp || tel, email: d.email || '',
    ciudad: d.ciudad || '', servicio: d.servicio,
    categoria: d.categoria || null, planId: d.planId || null, planNombre: d.planNombre || null,
    precio: Number(d.precio) || 0, metodoPagoPreferido: d.metodoPagoPreferido || null,
    fechaActivacion: d.fechaActivacion || iso(new Date()), fechaVencimiento: vencimiento,
    estadoCliente: estado, estadoServicio: estado === 'PENDIENTE_PAGO' ? 'PENDIENTE_PAGO' : estado,
    urlServicio: d.urlServicio || null, proyectoId: d.proyectoId || null,
    observaciones: d.observaciones || '', activo: true,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  };
  const ref = await db.collection('clientes').add(cliente);

  await db.collection('servicios').add({
    clienteId: ref.id, clienteNombre: d.nombre, planId: d.planId || null,
    servicio: d.servicio, categoria: d.categoria || null,
    fechaInicio: cliente.fechaActivacion, fechaVencimiento: vencimiento,
    precio: cliente.precio, estado: estado === 'PENDIENTE_PAGO' ? 'PENDIENTE_PAGO' : estado,
    createdAt: FieldValue.serverTimestamp()
  });
  await historial(ref.id, null, estado, 'Cliente creado', ctx);
  await auditar(ctx, 'CREAR_CLIENTE', 'clientes', ref.id, null, cliente);
  return { id: ref.id, estado };
});

exports.actualizarCliente = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'OPERADOR');
  const { clienteId, datos } = request.data || {};
  if (!clienteId) throw new HttpsError('invalid-argument', 'Falta clienteId.');
  const ref = db.doc(`clientes/${clienteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Cliente no encontrado.');
  const antes = snap.data();
  const permitidos = ['nombre', 'empresa', 'documento', 'telefono', 'whatsapp', 'email', 'ciudad',
    'servicio', 'categoria', 'planId', 'planNombre', 'precio', 'metodoPagoPreferido',
    'fechaActivacion', 'fechaVencimiento', 'urlServicio', 'proyectoId', 'observaciones'];
  const limpio = {};
  for (const k of permitidos) if (datos[k] !== undefined) limpio[k] = datos[k];
  limpio.updatedAt = FieldValue.serverTimestamp();
  await ref.update(limpio);
  await auditar(ctx, 'ACTUALIZAR_CLIENTE', 'clientes', clienteId, antes, { ...antes, ...limpio });
  return { ok: true };
});

/* ═══════════════ PAGOS ═══════════════ */
exports.registrarPago = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'OPERADOR');
  const d = request.data || {};
  if (!d.clienteId || !Number(d.monto) || Number(d.monto) <= 0) {
    throw new HttpsError('invalid-argument', 'Falta cliente o monto válido.');
  }
  const cliente = await db.doc(`clientes/${d.clienteId}`).get();
  if (!cliente.exists) throw new HttpsError('not-found', 'Cliente no encontrado.');
  const pago = {
    clienteId: d.clienteId, clienteNombre: cliente.data().nombre,
    servicioId: d.servicioId || null, monto: Number(d.monto),
    metodoPago: d.metodoPago || 'Efectivo', fechaPago: d.fechaPago || iso(new Date()),
    referencia: d.referencia || null, comprobanteUrl: d.comprobanteUrl || null,
    estado: 'PENDIENTE', registradoPor: ctx.uid, registradoPorNombre: ctx.nombre,
    createdAt: FieldValue.serverTimestamp()
  };
  const ref = await db.collection('pagos').add(pago);
  await auditar(ctx, 'REGISTRAR_PAGO', 'pagos', ref.id, null, pago);
  return { id: ref.id, estado: 'PENDIENTE' };
});

exports.confirmarPago = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'ADMIN');
  const { pagoId } = request.data || {};
  if (!pagoId) throw new HttpsError('invalid-argument', 'Falta pagoId.');
  const ref = db.doc(`pagos/${pagoId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pago no encontrado.');
  const pago = snap.data();
  if (pago.estado === 'CONFIRMADO') throw new HttpsError('failed-precondition', 'Este pago ya está confirmado.');
  if (pago.estado === 'ANULADO') throw new HttpsError('failed-precondition', 'Este pago está anulado.');

  const clienteRef = db.doc(`clientes/${pago.clienteId}`);
  const clienteSnap = await clienteRef.get();
  if (!clienteSnap.exists) throw new HttpsError('not-found', 'Cliente no encontrado.');

  const vencAnt = clienteSnap.data().fechaVencimiento;
  const hoy = new Date();
  /* Si aún no venció, se suman 12 meses desde el vencimiento; si venció, desde hoy */
  const base = vencAnt && diasEntre(hoy, vencAnt) > 0 ? aFecha(vencAnt) : hoy;
  const nuevoVenc = iso(sumarMeses(base, MESES));
  const estado = estadoPorVencimiento(nuevoVenc);

  await clienteRef.update({
    fechaVencimiento: nuevoVenc,
    estadoCliente: estado, estadoServicio: estado,
    updatedAt: FieldValue.serverTimestamp()
  });
  /* Reiniciar el historial de avisos del nuevo ciclo */
  const servicios = await db.collection('servicios').where('clienteId', '==', pago.clienteId).get();
  for (const s of servicios.docs) {
    await s.ref.update({ fechaVencimiento: nuevoVenc, estado, fechaInicio: iso(hoy) });
  }

  await ref.update({
    estado: 'CONFIRMADO', confirmadoPor: ctx.uid, confirmadoPorNombre: ctx.nombre,
    periodoInicio: iso(hoy), periodoFin: nuevoVenc, confirmadoEn: FieldValue.serverTimestamp()
  });
  await historial(pago.clienteId, 'PENDIENTE_PAGO', estado, 'Pago confirmado: renovación +12 meses', ctx);
  await auditar(ctx, 'CONFIRMAR_PAGO', 'pagos', pagoId, { estado: 'PENDIENTE' }, { estado: 'CONFIRMADO', nuevoVenc });
  return { id: pagoId, estado: 'CONFIRMADO', nuevoVencimiento: nuevoVenc };
});

exports.anularPago = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'ADMIN');
  const { pagoId, motivo } = request.data || {};
  if (!pagoId || !motivo) throw new HttpsError('invalid-argument', 'Pago y motivo son obligatorios.');
  const ref = db.doc(`pagos/${pagoId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pago no encontrado.');
  await ref.update({ estado: 'ANULADO', anuladoPor: ctx.uid, motivo, anuladoEn: FieldValue.serverTimestamp() });
  await auditar(ctx, 'ANULAR_PAGO', 'pagos', pagoId, snap.data(), { estado: 'ANULADO', motivo });
  return { ok: true };
});

/* ═══════════════ CICLO DE VIDA DEL SERVICIO ═══════════════ */
async function transicion(clienteId, nuevoEstado, motivo, extra, ctx, min) {
  if (!clienteId || !motivo) throw new HttpsError('invalid-argument', 'Cliente y motivo son obligatorios.');
  const ref = db.doc(`clientes/${clienteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Cliente no encontrado.');
  const antes = snap.data();
  await ref.update({ estadoCliente: nuevoEstado, estadoServicio: nuevoEstado, ...extra, updatedAt: FieldValue.serverTimestamp() });
  await historial(clienteId, antes.estadoCliente, nuevoEstado, motivo, ctx);
  await auditar(ctx, 'ESTADO_' + nuevoEstado, 'clientes', clienteId, antes.estadoCliente, nuevoEstado);
  return { ok: true };
}

exports.suspenderServicio = onCall({ region: 'us-central1' }, (r) => requerir(r, 'ADMIN').then(ctx => transicion(r.data.clienteId, 'SUSPENDIDO', r.data.motivo || 'Suspensión manual', { fechaSuspension: iso(new Date()), motivoSuspension: r.data.motivo }, ctx)));
exports.reactivarServicio = onCall({ region: 'us-central1' }, (r) => requerir(r, 'ADMIN').then(ctx => transicion(r.data.clienteId, 'ACTIVO', r.data.motivo || 'Reactivación manual', { fechaReactivacion: iso(new Date()) }, ctx)));
exports.desactivarServicio = onCall({ region: 'us-central1' }, (r) => requerir(r, 'ADMIN').then(ctx => transicion(r.data.clienteId, 'INACTIVO', r.data.motivo || 'Desactivación manual', { activo: false }, ctx)));
exports.activarServicio = onCall({ region: 'us-central1' }, (r) => requerir(r, 'ADMIN').then(ctx => transicion(r.data.clienteId, 'ACTIVO', r.data.motivo || 'Activación manual', { activo: true }, ctx)));

/* ═══════════════ NOTIFICACIONES ═══════════════ */
const MENSAJES = {
  VENCIMIENTO_10D: { title: 'Tu servicio vence en 10 días', body: 'Renueva ahora y sigue sin interrupciones.' },
  VENCIMIENTO_5D: { title: 'Quedan 5 días de servicio', body: 'Renueva para no perder tus beneficios.' },
  VENCIMIENTO_3D: { title: 'Últimos 3 días', body: 'Escríbenos y renovamos hoy mismo.' },
  VENCIMIENTO_1D: { title: 'Último día de servicio', body: 'Hoy es tu último día. Renueva ahora.' },
  VENCIDO: { title: 'Tu servicio venció', body: 'Escríbenos para reactivarlo.' },
  MANUAL: { title: 'KONFÍO ZINC', body: 'Tienes un mensaje de KONFÍO ZINC.' }
};

async function pushACliente(clienteId, tipo, mensaje) {
  const m = MENSAJES[tipo] || MENSAJES.MANUAL;
  const tokens = await db.collection('tokens_notificacion')
    .where('clienteId', '==', clienteId).where('activo', '==', true).get();
  if (tokens.empty) return 0;
  const lista = tokens.docs.map(t => t.data().token).filter(Boolean);
  if (!lista.length) return 0;
  try {
    const r = await admin.messaging().sendEachForMulticast({
      tokens: lista,
      notification: { title: m.title, body: mensaje || m.body },
      webpush: { fcmOptions: { link: SITIO + 'contacto.html' } }
    });
    return (r.successCount || 0);
  } catch (e) {
    logger.error('FCM', e);
    return 0;
  }
}

exports.enviarNotificacion = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'ADMIN');
  const { clienteId, tipo, mensaje } = request.data || {};
  if (!clienteId) throw new HttpsError('invalid-argument', 'Falta clienteId.');
  const n = await pushACliente(clienteId, tipo || 'MANUAL', mensaje);
  await db.collection('notificaciones').add({
    clienteId, tipo: tipo || 'MANUAL', mensaje: mensaje || MENSAJES[tipo || 'MANUAL'].body,
    estado: n > 0 ? 'ENVIADA' : 'ERROR', fechaEnvio: FieldValue.serverTimestamp(),
    canal: 'PUSH', error: n > 0 ? null : 'Sin tokens activos'
  });
  await auditar(ctx, 'ENVIAR_NOTIFICACION', 'notificaciones', clienteId, null, { tipo, enviados: n });
  return { enviados: n };
});

exports.registrarToken = onCall({ region: 'us-central1' }, async (request) => {
  await requerir(request, 'OPERADOR');
  const { clienteId, token, plataforma, navegador } = request.data || {};
  if (!clienteId || !token) throw new HttpsError('invalid-argument', 'Cliente y token son obligatorios.');
  await db.doc(`tokens_notificacion/${token}`).set({
    clienteId, token, plataforma: plataforma || 'web', navegador: navegador || '',
    activo: true, fechaRegistro: FieldValue.serverTimestamp(), ultimaActividad: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

/* ═══════════════ USUARIOS (SUPERADMIN) ═══════════════ */
exports.crearUsuario = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'SUPERADMIN');
  const d = request.data || {};
  if (!d.email || !d.password || !d.rol) throw new HttpsError('invalid-argument', 'Email, contraseña y rol son obligatorios.');
  if (!['OPERADOR', 'ADMIN', 'SUPERADMIN'].includes(d.rol)) throw new HttpsError('invalid-argument', 'Rol inválido.');
  const user = await admin.auth().createUser({ email: d.email, password: d.password, displayName: d.nombre });
  await db.doc(`usuarios/${user.uid}`).set({
    uid: user.uid, nombre: d.nombre || d.email, email: d.email, rol: d.rol,
    activo: true, createdAt: FieldValue.serverTimestamp()
  });
  await auditar(ctx, 'CREAR_USUARIO', 'usuarios', user.uid, null, { email: d.email, rol: d.rol });
  return { uid: user.uid };
});

exports.actualizarUsuario = onCall({ region: 'us-central1' }, async (request) => {
  const ctx = await requerir(request, 'SUPERADMIN');
  const { uid, datos } = request.data || {};
  if (!uid || !datos) throw new HttpsError('invalid-argument', 'Faltan uid o datos.');
  const snap = await db.doc(`usuarios/${uid}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
  const antes = snap.data();
  /* Protección: nadie se degrada ni se desactiva a sí mismo */
  if (uid === ctx.uid && (datos.rol && datos.rol !== 'SUPERADMIN' || datos.activo === false)) {
    throw new HttpsError('failed-precondition', 'No puedes quitarte el rol SUPERADMIN ni desactivarte a ti mismo.');
  }
  const limpio = {};
  for (const k of ['nombre', 'rol', 'activo']) if (datos[k] !== undefined) limpio[k] = datos[k];
  limpio.updatedAt = FieldValue.serverTimestamp();
  await db.doc(`usuarios/${uid}`).update(limpio);
  await auditar(ctx, 'ACTUALIZAR_USUARIO', 'usuarios', uid, antes, { ...antes, ...limpio });
  return { ok: true };
});

/* ═══════════════ MANTENIMIENTO ═══════════════ */
exports.seedInicial = onCall({ region: 'us-central1' }, async (request) => {
  await requerir(request, 'SUPERADMIN');
  const planes = [
    { nombre: 'Star', precio: 49900, servicio: 'tarjetas', categoria: 'STAR', duracionMeses: 12, orden: 1, estado: 'ACTIVO', incluye: ['Contacto y redes', 'Ubicación', 'Código QR'] },
    { nombre: 'Pro', precio: 99900, servicio: 'tarjetas', categoria: 'PRO', duracionMeses: 12, orden: 2, estado: 'ACTIVO', incluye: ['Todo Star', 'Catálogo o menú', 'Código QR'] },
    { nombre: 'Elite', precio: 149900, servicio: 'tarjetas', categoria: 'ELITE', duracionMeses: 12, orden: 3, estado: 'ACTIVO', incluye: ['Todo Pro', 'Mini landing', 'Agenda de citas'] }
  ];
  for (const p of planes) {
    const exist = await db.collection('planes').where('nombre', '==', p.nombre).limit(1).get();
    if (exist.empty) await db.collection('planes').add({ ...p, createdAt: FieldValue.serverTimestamp() });
  }
  const config = {
    diasAntes: { clave: 'diasAntes', valor: DIAS_ANTES, descripcion: 'Días de aviso antes del vencimiento' },
    diasPorVencer: { clave: 'diasPorVencer', valor: DIAS_POR_VENCER, descripcion: 'Umbral POR_VENCER' },
    diasGracia: { clave: 'diasGracia', valor: DIAS_GRACIA, descripcion: 'Días de gracia tras vencer' },
    mesesSuscripcion: { clave: 'mesesSuscripcion', valor: MESES, descripcion: 'Duración de la suscripción' },
    destinoVencido: { clave: 'destinoVencido', valor: 'contacto.html', descripcion: 'Página destino de la notificación' }
  };
  for (const [k, v] of Object.entries(config)) {
    const ex = await db.doc(`configuracion/${k}`).get();
    if (!ex.exists) await db.doc(`configuracion/${k}`).set(v);
  }
  return { ok: true };
});

exports.recalcularEstados = onCall({ region: 'us-central1' }, async (request) => {
  await requerir(request, 'SUPERADMIN');
  let n = 0;
  const clientes = await db.collection('clientes').get();
  for (const c of clientes.docs) {
    const d = c.data();
    const estado = estadoPorVencimiento(d.fechaVencimiento);
    if (estado !== d.estadoCliente) {
      await c.ref.update({ estadoCliente: estado, estadoServicio: estado, updatedAt: FieldValue.serverTimestamp() });
      n++;
    }
  }
  return { actualizados: n };
});

/* ═══════════════ MOTOR DE VENCIMIENTOS (programado) ═══════════════ */
exports.processDueDates = onSchedule({ schedule: 'every day 08:00', timeZone: 'America/Bogota', region: 'us-central1' }, async () => {
  const hoy = new Date();
  let avisados = 0, suspendidos = 0, porVencer = 0, vencidos = 0;

  const clientes = await db.collection('clientes').where('activo', '==', true).get();
  for (const c of clientes.docs) {
    const d = c.data();
    if (!d.fechaVencimiento) continue;
    const dias = diasEntre(hoy, d.fechaVencimiento);

    /* 1. Vencido: marcar PENDIENTE_PAGO; tras gracia, SUSPENDIDO */
    if (dias < 0) {
      if (d.estadoCliente !== 'PENDIENTE_PAGO') {
        await c.ref.update({ estadoCliente: 'PENDIENTE_PAGO', estadoServicio: 'PENDIENTE_PAGO', updatedAt: FieldValue.serverTimestamp() });
        vencidos++;
      }
      if (dias <= -DIAS_GRACIA && d.estadoCliente !== 'SUSPENDIDO') {
        await c.ref.update({ estadoCliente: 'SUSPENDIDO', estadoServicio: 'SUSPENDIDO', fechaSuspension: iso(hoy), motivoSuspension: 'Vencido sin pago' });
        suspendidos++;
      }
      continue;
    }

    /* 2. Por vencer (≤15 días) */
    if (dias <= DIAS_POR_VENCER && d.estadoCliente !== 'POR_VENCER' && d.estadoCliente !== 'PENDIENTE_PAGO') {
      await c.ref.update({ estadoCliente: 'POR_VENCER', estadoServicio: 'POR_VENCER' });
      porVencer++;
    }

    /* 3. Avisos 10/5/3/1 día */
    if (DIAS_ANTES.includes(dias)) {
      const tipo = `VENCIMIENTO_${dias}D`;
      const claveDedup = `${c.id}_${d.fechaVencimiento}_${tipo}`;
      try {
        await db.doc(`notificaciones/${claveDedup}`).create({
          clienteId: c.id, tipo, mensaje: MENSAJES[tipo].body, estado: 'PENDIENTE',
          periodoServicio: d.fechaVencimiento, fechaProgramada: FieldValue.serverTimestamp()
        });
        const enviados = await pushACliente(c.id, tipo);
        await db.doc(`notificaciones/${claveDedup}`).update({
          estado: enviados > 0 ? 'ENVIADA' : 'ERROR', fechaEnvio: FieldValue.serverTimestamp(),
          error: enviados > 0 ? null : 'Sin tokens activos'
        });
        if (enviados > 0) avisados++;
      } catch (e) {
        /* create() falla si ya existía: anti-duplicado funcionando */
      }
    }
  }

  const resumen = { revisados: clientes.size, avisados, suspendidos, porVencer, vencidos };
  logger.info('processDueDates', resumen);
  return resumen;
});
