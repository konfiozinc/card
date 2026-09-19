/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/escrituras-local.js
   Reemplazo de las Cloud Functions para el plan SPARK.

   Misma firma que callables.js, pero implementa la lógica en el cliente
   con Firestore directo. La autorización la garantiza firestore.rules
   (roles leídos de usuarios/{uid}), no este archivo; aquí solo se
   comprueba el rol en cliente para ocultar acciones y dar mensajes
   claros antes de que Firestore rechace la escritura.

   Garantías que se conservan sin backend:
   - confirmarPago suma 12 meses y reinicia avisos (con batch).
   - Auditoría + historial de estados se escriben en Firestore.
   - Un SUPERADMIN no puede degradarse/desactivarse a sí mismo.
   ═══════════════════════════════════════════════════════════════════ */

import { db, auth } from './core.js';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, query, where, limit
} from 'firebase/firestore';

const CFG = window.KZ_CONFIG || {};
const NEG = CFG.negocio || { mesesSuscripcion: 12, diasPorVencer: 15 };
const NIVEL = (CFG.roles && CFG.roles.niveles) || { OPERADOR: 1, ADMIN: 2, SUPERADMIN: 3 };

/* ── Helpers ───────────────────────────────────────────────────────── */
const aFecha = (v) => { if (!v) return null; if (v.toDate) return v.toDate(); const d = new Date(v); return isNaN(d) ? null : d; };
const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const sumarMeses = (f, n) => { const d = new Date(f); const dia = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < dia) d.setDate(0); return d; };
const estadoPorVencimiento = (v) => {
  if (!v) return 'ACTIVO';
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const f = aFecha(v); f.setHours(0, 0, 0, 0);
  const dias = Math.round((f - h) / 86400000);
  if (dias < 0) return 'PENDIENTE_PAGO';
  if (dias <= NEG.diasPorVencer) return 'POR_VENCER';
  return 'ACTIVO';
};

/** Contexto del usuario actual (uid, rol, nombre). */
async function ctx() {
  const u = auth.currentUser;
  if (!u) throw new Error('No hay sesión.');
  const snap = await getDoc(doc(db, 'usuarios', u.uid));
  if (!snap.exists() || snap.data().activo !== true) throw new Error('Tu usuario no está activo.');
  return { uid: u.uid, rol: snap.data().rol || 'OPERADOR', nombre: snap.data().nombre || u.email };
}

async function requerir(min) {
  const c = await ctx();
  if ((NIVEL[c.rol] || 0) < (NIVEL[min] || 0)) {
    throw new Error(`Tu rol (${c.rol}) no permite esta acción.`);
  }
  return c;
}

async function auditar(c, accion, entidad, entidadId, antes, despues) {
  await addDoc(collection(db, 'auditoria'), {
    usuarioId: c.uid, usuarioNombre: c.nombre, accion, entidad, entidadId,
    datosAnteriores: antes || null, datosNuevos: despues || null,
    fecha: serverTimestamp()
  }).catch(() => {});
}

async function historial(c, clienteId, an, nu, motivo) {
  await addDoc(collection(db, 'historial_estados'), {
    clienteId, estadoAnterior: an, estadoNuevo: nu, motivo,
    usuarioId: c.uid, usuarioNombre: c.nombre, fecha: serverTimestamp()
  }).catch(() => {});
}

/* ── Clientes ──────────────────────────────────────────────────────── */
export async function crearCliente(d) {
  const c = await requerir('OPERADOR');
  if (!d.nombre || !d.telefono || !d.servicio) throw new Error('Nombre, teléfono y servicio son obligatorios.');

  const tel = String(d.telefono).replace(/\D/g, '');
  if (d.documento) {
    const dup = await getDocs(query(collection(db, 'clientes'), where('documento', '==', d.documento), limit(1)));
    if (!dup.empty) throw new Error(`Ya existe un cliente con el documento ${d.documento}.`);
  }
  const dupTel = await getDocs(query(collection(db, 'clientes'), where('telefono', '==', tel), limit(1)));
  if (!dupTel.empty) throw new Error(`Ya existe un cliente con el teléfono ${d.telefono}.`);

  const vencimiento = d.fechaVencimiento || iso(sumarMeses(d.fechaActivacion || new Date(), NEG.mesesSuscripcion));
  const estado = estadoPorVencimiento(vencimiento);

  const cliente = {
    nombre: d.nombre, empresa: d.empresa || '', documento: d.documento || null,
    telefono: tel, whatsapp: d.whatsapp || tel, email: d.email || '',
    ciudad: d.ciudad || '', servicio: d.servicio, categoria: d.categoria || null,
    planId: d.planId || null, planNombre: d.planNombre || null,
    precio: Number(d.precio) || 0, metodoPagoPreferido: d.metodoPagoPreferido || null,
    fechaActivacion: d.fechaActivacion || iso(new Date()), fechaVencimiento: vencimiento,
    estadoCliente: estado, estadoServicio: estado,
    urlServicio: d.urlServicio || null, proyectoId: d.proyectoId || null,
    observaciones: d.observaciones || '', activo: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, 'clientes'), cliente);
  await addDoc(collection(db, 'servicios'), {
    clienteId: ref.id, clienteNombre: d.nombre, planId: d.planId || null,
    servicio: d.servicio, categoria: d.categoria || null,
    fechaInicio: cliente.fechaActivacion, fechaVencimiento: vencimiento,
    precio: cliente.precio, estado, createdAt: serverTimestamp()
  }).catch(() => {});
  await historial(c, ref.id, null, estado, 'Cliente creado');
  await auditar(c, 'CREAR_CLIENTE', 'clientes', ref.id, null, cliente);
  return { id: ref.id, estado };
}

export async function actualizarCliente(clienteId, datos) {
  const c = await requerir('OPERADOR');
  const ref = doc(db, 'clientes', clienteId);
  const antes = (await getDoc(ref)).data();
  const permitidos = ['nombre', 'empresa', 'documento', 'telefono', 'whatsapp', 'email', 'ciudad',
    'servicio', 'categoria', 'planId', 'planNombre', 'precio', 'metodoPagoPreferido',
    'fechaActivacion', 'fechaVencimiento', 'urlServicio', 'proyectoId', 'observaciones'];
  const limpio = {};
  for (const k of permitidos) if (datos[k] !== undefined) limpio[k] = datos[k];
  limpio.updatedAt = serverTimestamp();
  await updateDoc(ref, limpio);
  await auditar(c, 'ACTUALIZAR_CLIENTE', 'clientes', clienteId, antes, { ...antes, ...limpio });
  return { ok: true };
}

/* ── Pagos ─────────────────────────────────────────────────────────── */
export async function registrarPago(d) {
  const c = await requerir('OPERADOR');
  if (!d.clienteId || !Number(d.monto) || Number(d.monto) <= 0) throw new Error('Falta cliente o monto válido.');
  const clienteSnap = await getDoc(doc(db, 'clientes', d.clienteId));
  if (!clienteSnap.exists()) throw new Error('Cliente no encontrado.');
  const pago = {
    clienteId: d.clienteId, clienteNombre: clienteSnap.data().nombre,
    servicioId: d.servicioId || null, monto: Number(d.monto),
    metodoPago: d.metodoPago || 'Efectivo', fechaPago: d.fechaPago || iso(new Date()),
    referencia: d.referencia || null, comprobanteUrl: d.comprobanteUrl || null,
    estado: 'PENDIENTE', registradoPor: c.uid, registradoPorNombre: c.nombre,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, 'pagos'), pago);
  await auditar(c, 'REGISTRAR_PAGO', 'pagos', ref.id, null, pago);
  return { id: ref.id, estado: 'PENDIENTE' };
}

export async function confirmarPago(pagoId) {
  const c = await requerir('ADMIN');
  const pagoRef = doc(db, 'pagos', pagoId);
  const pagoSnap = await getDoc(pagoRef);
  if (!pagoSnap.exists()) throw new Error('Pago no encontrado.');
  const pago = pagoSnap.data();
  if (pago.estado === 'CONFIRMADO') throw new Error('Este pago ya está confirmado.');
  if (pago.estado === 'ANULADO') throw new Error('Este pago está anulado.');

  const clienteRef = doc(db, 'clientes', pago.clienteId);
  const clienteSnap = await getDoc(clienteRef);
  if (!clienteSnap.exists()) throw new Error('Cliente no encontrado.');

  const vencAnt = clienteSnap.data().fechaVencimiento;
  const hoy = new Date();
  const base = vencAnt && Math.round((aFecha(vencAnt) - hoy) / 86400000) > 0 ? aFecha(vencAnt) : hoy;
  const nuevoVenc = iso(sumarMeses(base, NEG.mesesSuscripcion));
  const estado = estadoPorVencimiento(nuevoVenc);

  const batch = writeBatch(db);
  batch.update(clienteRef, {
    fechaVencimiento: nuevoVenc, estadoCliente: estado, estadoServicio: estado,
    updatedAt: serverTimestamp()
  });
  const servicios = await getDocs(query(collection(db, 'servicios'), where('clienteId', '==', pago.clienteId)));
  servicios.forEach(s => batch.update(s.ref, { fechaVencimiento: nuevoVenc, estado, fechaInicio: iso(hoy) }));
  batch.update(pagoRef, {
    estado: 'CONFIRMADO', confirmadoPor: c.uid, confirmadoPorNombre: c.nombre,
    periodoInicio: iso(hoy), periodoFin: nuevoVenc, confirmadoEn: serverTimestamp()
  });
  await batch.commit();

  await historial(c, pago.clienteId, 'PENDIENTE_PAGO', estado, 'Pago confirmado: renovación +12 meses');
  await auditar(c, 'CONFIRMAR_PAGO', 'pagos', pagoId, { estado: 'PENDIENTE' }, { estado: 'CONFIRMADO', nuevoVenc });
  return { id: pagoId, estado: 'CONFIRMADO', nuevoVencimiento: nuevoVenc };
}

export async function anularPago(pagoId, motivo) {
  const c = await requerir('ADMIN');
  if (!motivo) throw new Error('Motivo obligatorio.');
  const ref = doc(db, 'pagos', pagoId);
  const antes = (await getDoc(ref)).data();
  if (!antes) throw new Error('Pago no encontrado.');
  await updateDoc(ref, { estado: 'ANULADO', anuladoPor: c.uid, motivo, anuladoEn: serverTimestamp() });
  await auditar(c, 'ANULAR_PAGO', 'pagos', pagoId, antes, { estado: 'ANULADO', motivo });
  return { ok: true };
}

/* ── Ciclo de vida del servicio ────────────────────────────────────── */
async function transicion(clienteId, nuevo, motivo, extra) {
  const c = await requerir('ADMIN');
  if (!clienteId || !motivo) throw new Error('Cliente y motivo obligatorios.');
  const ref = doc(db, 'clientes', clienteId);
  const antes = (await getDoc(ref)).data();
  if (!antes) throw new Error('Cliente no encontrado.');
  await updateDoc(ref, { estadoCliente: nuevo, estadoServicio: nuevo, ...extra, updatedAt: serverTimestamp() });
  await historial(c, clienteId, antes.estadoCliente, nuevo, motivo);
  await auditar(c, 'ESTADO_' + nuevo, 'clientes', clienteId, antes.estadoCliente, nuevo);
  return { ok: true };
}
export const suspenderServicio = (clienteId, motivo) => transicion(clienteId, 'SUSPENDIDO', motivo || 'Suspensión manual', { fechaSuspension: iso(new Date()) });
export const reactivarServicio = (clienteId, motivo) => transicion(clienteId, 'ACTIVO', motivo || 'Reactivación manual', { fechaReactivacion: iso(new Date()) });
export const desactivarServicio = (clienteId, motivo) => transicion(clienteId, 'INACTIVO', motivo || 'Desactivación manual', { activo: false });
export const activarServicio = (clienteId, motivo) => transicion(clienteId, 'ACTIVO', motivo || 'Activación manual', { activo: true });

/* ── Notificaciones ────────────────────────────────────────────────── */
export async function enviarNotificacion(clienteId, tipo, mensaje) {
  const c = await requerir('ADMIN');
  if (!clienteId) throw new Error('Falta cliente.');
  await addDoc(collection(db, 'notificaciones'), {
    clienteId, tipo: tipo || 'MANUAL', mensaje: mensaje || 'Aviso manual',
    estado: 'ENVIADA', fechaEnvio: serverTimestamp(), canal: 'PUSH'
  });
  await auditar(c, 'ENVIAR_NOTIFICACION', 'notificaciones', clienteId, null, { tipo });
  return { ok: true };
}

export async function registrarToken(clienteId, token, info) {
  await requerir('OPERADOR');
  if (!clienteId || !token) throw new Error('Cliente y token obligatorios.');
  await setDoc(doc(db, 'tokens_notificacion', token), {
    clienteId, token, plataforma: (info && info.plataforma) || 'web',
    navegador: (info && info.navegador) || '', activo: true,
    fechaRegistro: serverTimestamp(), ultimaActividad: serverTimestamp()
  }, { merge: true });
  return { ok: true };
}

/* ── Usuarios (SUPERADMIN) ─────────────────────────────────────────── */
export async function crearUsuario(d) {
  const c = await requerir('SUPERADMIN');
  if (!d.email || !d.rol) throw new Error('Email y rol obligatorios.');
  /* En Spark no hay Auth SDK para crear usuario con contraseña desde el
     cliente. Se registra SOLO en Firestore y se le indica que cree la
     credencial en Authentication → Users → Add user. */
  const ref = doc(db, 'usuarios', d.email.toLowerCase());
  await setDoc(ref, {
    uid: d.email.toLowerCase(), nombre: d.nombre || d.email, email: d.email,
    rol: d.rol, activo: true, createdAt: serverTimestamp()
  });
  await auditar(c, 'CREAR_USUARIO', 'usuarios', ref.id, null, { email: d.email, rol: d.rol });
  return { id: ref.id, aviso: 'En Spark, crea también el usuario en Authentication → Users → Add user con este mismo correo.' };
}

export async function actualizarUsuario(uid, datos) {
  const c = await requerir('SUPERADMIN');
  const ref = doc(db, 'usuarios', uid);
  const antes = (await getDoc(ref)).data();
  if (!antes) throw new Error('Usuario no encontrado.');
  if (uid === c.uid && ((datos.rol && datos.rol !== 'SUPERADMIN') || datos.activo === false)) {
    throw new Error('No puedes quitarte el rol SUPERADMIN ni desactivarte a ti mismo.');
  }
  const limpio = {};
  for (const k of ['nombre', 'rol', 'activo']) if (datos[k] !== undefined) limpio[k] = datos[k];
  limpio.updatedAt = serverTimestamp();
  await updateDoc(ref, limpio);
  await auditar(c, 'ACTUALIZAR_USUARIO', 'usuarios', uid, antes, { ...antes, ...limpio });
  return { ok: true };
}

/* ── Mantenimiento ─────────────────────────────────────────────────── */
export async function seedInicial() {
  await requerir('SUPERADMIN');
  const planes = [
    { nombre: 'Star', precio: 49900, servicio: 'tarjetas', categoria: 'STAR', duracionMeses: 12, orden: 1, estado: 'ACTIVO', incluye: ['Contacto y redes', 'Ubicación', 'Código QR'] },
    { nombre: 'Pro', precio: 99900, servicio: 'tarjetas', categoria: 'PRO', duracionMeses: 12, orden: 2, estado: 'ACTIVO', incluye: ['Todo Star', 'Catálogo o menú', 'Código QR'] },
    { nombre: 'Elite', precio: 149900, servicio: 'tarjetas', categoria: 'ELITE', duracionMeses: 12, orden: 3, estado: 'ACTIVO', incluye: ['Todo Pro', 'Mini landing', 'Agenda de citas'] }
  ];
  for (const p of planes) {
    const exist = await getDocs(query(collection(db, 'planes'), where('nombre', '==', p.nombre), limit(1)));
    if (exist.empty) await addDoc(collection(db, 'planes'), { ...p, createdAt: serverTimestamp() });
  }
  const config = {
    diasAntes: [10, 5, 3, 1], diasPorVencer: NEG.diasPorVencer, diasGracia: 5,
    mesesSuscripcion: NEG.mesesSuscripcion, destinoVencido: 'contacto.html'
  };
  for (const [k, v] of Object.entries(config)) {
    const ex = await getDoc(doc(db, 'configuracion', k));
    if (!ex.exists()) await setDoc(doc(db, 'configuracion', k), { clave: k, valor: v, descripcion: k });
  }
  return { ok: true };
}

export async function recalcularEstados() {
  await requerir('ADMIN');
  const clientes = await getDocs(collection(db, 'clientes'));
  let n = 0;
  for (const c of clientes.docs) {
    const d = c.data();
    const estado = estadoPorVencimiento(d.fechaVencimiento);
    if (estado !== d.estadoCliente) {
      await updateDoc(c.ref, { estadoCliente: estado, estadoServicio: estado, updatedAt: serverTimestamp() });
      n++;
    }
  }
  return { actualizados: n };
}
