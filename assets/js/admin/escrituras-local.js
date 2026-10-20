/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/escrituras-local.js
   Reemplazo de las Cloud Functions para el plan SPARK.

   Misma firma que las antiguas Cloud Functions, pero implementa la lógica en el cliente
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
  writeBatch, serverTimestamp, query, where, limit, runTransaction
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

/** Contexto del usuario actual (uid, rol, nombre).
 *  Compatibilidad Spark: si la ficha por UID no existe, se busca la ficha
 *  heredada `usuarios/{correo}` (así funcionaba el panel antes de vincular).
 *  Las reglas permiten leerla solo a su dueño. Es de solo lectura: escribir
 *  roles desde el navegador está prohibido. */
async function ctx() {
  const u = auth.currentUser;
  if (!u) throw new Error('No hay sesión.');
  let snap = await getDoc(doc(db, 'usuarios', u.uid));
  if (!snap.exists() && u.email) snap = await getDoc(doc(db, 'usuarios', u.email));
  if (!snap.exists()) {
    throw new Error('Tu usuario no tiene ficha en el panel. Pide a un administrador que la cree con la herramienta local (herramientas/admin-spark.js).');
  }
  const d = snap.data();
  if (d.activo !== true) throw new Error('Tu usuario está desactivado. Pide a un administrador que lo reactive con la herramienta local.');
  return {
    uid: u.uid, rol: d.rol || 'OPERADOR', nombre: d.nombre || u.email || u.uid,
    email: u.email || '', fichaId: snap.id, fichaHeredada: snap.id !== u.uid
  };
}

async function requerir(min) {
  const c = await ctx();
  if ((NIVEL[c.rol] || 0) < (NIVEL[min] || 0)) {
    throw new Error(`Tu rol (${c.rol}) no permite esta acción.`);
  }
  return c;
}

/* Auditoría e historial: NO se ocultan los errores. Antes se tragaban con
   .catch(() => {}): si las reglas denegaban el registro, la operación seguía
   adelante sin rastro y nadie se enteraba. Ahora el fallo se ve. */
async function auditar(c, accion, entidad, entidadId, antes, despues) {
  await addDoc(collection(db, 'auditoria'), {
    usuarioId: c.uid, usuarioNombre: c.nombre, accion, entidad, entidadId,
    datosAnteriores: antes || null, datosNuevos: despues || null,
    fecha: serverTimestamp()
  });
}

async function historial(c, clienteId, an, nu, motivo) {
  await addDoc(collection(db, 'historial_estados'), {
    clienteId, estadoAnterior: an, estadoNuevo: nu, motivo,
    usuarioId: c.uid, usuarioNombre: c.nombre, fecha: serverTimestamp()
  });
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
  const referencia = String(d.referencia || '').trim();
  const pago = {
    clienteId: d.clienteId, clienteNombre: clienteSnap.data().nombre,
    servicioId: d.servicioId || null, monto: Number(d.monto),
    metodoPago: d.metodoPago || 'Efectivo', fechaPago: d.fechaPago || iso(new Date()),
    referencia: referencia || null, comprobanteUrl: d.comprobanteUrl || null,
    estado: 'PENDIENTE', registradoPor: c.uid, registradoPorNombre: c.nombre,
    createdAt: serverTimestamp()
  };

  /* IDEMPOTENCIA: si el operador escribe la referencia del comprobante, el
     documento se crea con un id derivado de ella. Si se corta la red y vuelve a
     intentarlo, el segundo intento NO duplica el pago: avisa. */
  const ref = referencia
    ? doc(db, 'pagos', 'ref_' + referencia.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60))
    : doc(collection(db, 'pagos'));

  const id = await runTransaction(db, async (tx) => {
    const ya = await tx.get(ref);
    if (ya.exists()) throw new Error('Ya existe un pago con esa referencia. Revísalo en la lista antes de registrarlo otra vez.');
    tx.set(ref, pago);
    return ref.id;
  });

  await auditar(c, 'REGISTRAR_PAGO', 'pagos', id, null, pago);
  return { id, estado: 'PENDIENTE', idempotente: !!referencia };
}

export async function confirmarPago(pagoId) {
  const c = await requerir('ADMIN');
  const pagoRef = doc(db, 'pagos', pagoId);

  /* En una transacción: se relee el pago y se decide con el estado REAL en el
     servidor, no con lo que vio la pantalla. Confirmar dos veces (dos clics,
     dos pestañas, un reintento tras un corte) es imposible: la segunda
     transacción ve CONFIRMADO y aborta antes de renovar nada. */
  const hecho = await runTransaction(db, async (tx) => {
    const pagoSnap = await tx.get(pagoRef);
    if (!pagoSnap.exists()) throw new Error('Pago no encontrado.');
    const pago = pagoSnap.data();
    if (pago.estado === 'CONFIRMADO') throw new Error('Este pago ya está confirmado. No se renueva dos veces.');
    if (pago.estado === 'ANULADO') throw new Error('Este pago está anulado.');

    const clienteRef = doc(db, 'clientes', pago.clienteId);
    const clienteSnap = await tx.get(clienteRef);
    if (!clienteSnap.exists()) throw new Error('Cliente no encontrado.');

    const vencAnt = clienteSnap.data().fechaVencimiento;
    const hoy = new Date();
    const base = vencAnt && Math.round((aFecha(vencAnt) - hoy) / 86400000) > 0 ? aFecha(vencAnt) : hoy;
    const nuevoVenc = iso(sumarMeses(base, NEG.mesesSuscripcion));
    const estado = estadoPorVencimiento(nuevoVenc);

    tx.update(clienteRef, {
      fechaVencimiento: nuevoVenc, estadoCliente: estado, estadoServicio: estado,
      updatedAt: serverTimestamp()
    });
    tx.update(pagoRef, {
      estado: 'CONFIRMADO', confirmadoPor: c.uid, confirmadoPorNombre: c.nombre,
      periodoInicio: iso(hoy), periodoFin: nuevoVenc, confirmadoEn: serverTimestamp()
    });
    return { estado, nuevoVenc, clienteId: pago.clienteId };
  });

  /* Los servicios del cliente se actualizan aparte: consultar una colección no
     cabe en la transacción. Si fallara, el pago y el vencimiento ya están
     aplicados, y el operador se entera en vez de quedar con datos divergentes. */
  let aviso = null;
  try {
    const servicios = await getDocs(query(collection(db, 'servicios'), where('clienteId', '==', hecho.clienteId)));
    if (!servicios.empty) {
      const lote = writeBatch(db);
      servicios.forEach(s => lote.update(s.ref, {
        fechaVencimiento: hecho.nuevoVenc, estado: hecho.estado, fechaInicio: iso(new Date()), updatedAt: serverTimestamp()
      }));
      await lote.commit();
    }
  } catch (e) {
    aviso = 'El pago quedó confirmado y el vencimiento aplicado, pero los servicios del cliente no se pudieron actualizar: ' + e.message;
  }

  await historial(c, hecho.clienteId, 'PENDIENTE_PAGO', hecho.estado,
    'Pago confirmado: renovación +' + NEG.mesesSuscripcion + ' meses');
  await auditar(c, 'CONFIRMAR_PAGO', 'pagos', pagoId,
    { estado: 'PENDIENTE' }, { estado: 'CONFIRMADO', nuevoVenc: hecho.nuevoVenc });
  return { id: pagoId, estado: 'CONFIRMADO', nuevoVencimiento: hecho.nuevoVenc, aviso };
}

export async function anularPago(pagoId, motivo) {
  const c = await requerir('ADMIN');
  if (!motivo) throw new Error('Motivo obligatorio.');
  const ref = doc(db, 'pagos', pagoId);
  const antes = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Pago no encontrado.');
    const p = snap.data();
    if (p.estado === 'ANULADO') throw new Error('Este pago ya está anulado.');
    tx.update(ref, { estado: 'ANULADO', anuladoPor: c.uid, motivo, anuladoEn: serverTimestamp() });
    return { estado: p.estado, monto: p.monto };
  });
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
  await updateDoc(ref, {
    estadoCliente: nuevo, estadoServicio: nuevo,
    /* Volver a ACTIVO saca al cliente de la baja lógica. Sin esto, reactivar
       un cliente eliminado lo dejaba activo en los datos pero invisible en
       las listas para siempre (eliminado seguía en true). */
    ...(nuevo === 'ACTIVO' ? { eliminado: false } : {}),
    fechaCambioEstado: serverTimestamp(), motivoCambio: motivo, cambiadoPor: c.email || c.nombre,
    ...extra, updatedAt: serverTimestamp()
  });
  await historial(c, clienteId, antes.estadoCliente, nuevo, motivo);
  await auditar(c, 'ESTADO_' + nuevo, 'clientes', clienteId, antes.estadoCliente, nuevo);
  return { ok: true };
}
export const suspenderServicio = (clienteId, motivo) => transicion(clienteId, 'SUSPENDIDO', motivo || 'Suspensión manual', { fechaSuspension: iso(new Date()) });
export const reactivarServicio = (clienteId, motivo) => transicion(clienteId, 'ACTIVO', motivo || 'Reactivación manual', { fechaReactivacion: iso(new Date()) });
export const desactivarServicio = (clienteId, motivo) => transicion(clienteId, 'INACTIVO', motivo || 'Desactivación manual', { activo: false });
export const activarServicio = (clienteId, motivo) => transicion(clienteId, 'ACTIVO', motivo || 'Activación manual', { activo: true });
export const inhabilitarServicio = (clienteId, motivo) => transicion(clienteId, 'INHABILITADO', motivo || 'Inhabilitación manual', { activo: false, fechaInhabilitacion: iso(new Date()) });

/** Baja lógica (las reglas no permiten borrado físico de clientes): marca
    el cliente como eliminado y lo saca de las listas, conservando el historial. */
export async function eliminarCliente(clienteId, motivo) {
  const c = await requerir('SUPERADMIN');
  if (!clienteId) throw new Error('Cliente obligatorio.');
  const ref = doc(db, 'clientes', clienteId);
  const antes = (await getDoc(ref)).data();
  if (!antes) throw new Error('Cliente no encontrado.');
  const razon = motivo || 'Eliminado desde el panel';
  await updateDoc(ref, {
    estadoCliente: 'INHABILITADO', estadoServicio: 'INHABILITADO',
    activo: false, eliminado: true, fechaEliminacion: iso(new Date()),
    motivoCambio: razon, fechaCambioEstado: serverTimestamp(),
    cambiadoPor: c.email || c.nombre, updatedAt: serverTimestamp()
  });
  await historial(c, clienteId, antes.estadoCliente, 'INHABILITADO', 'ELIMINADO (baja lógica): ' + razon);
  await auditar(c, 'ELIMINAR_CLIENTE', 'clientes', clienteId, antes, { eliminado: true, estadoCliente: 'INHABILITADO' });
  return { ok: true };
}

/* ── Notificaciones: NADA se envía solo ────────────────────────────────
   En Spark no hay servidor de envío ni motor programado. El panel PREPARA el
   aviso (queda registrado, con quién y cuándo) y el operador lo envía a mano
   por WhatsApp desde su teléfono. Después marca el aviso como enviado: ese es
   el único acto que dice «enviada», y también queda registrado. */
export async function prepararNotificacion(clienteId, tipo, mensaje) {
  const c = await requerir('OPERADOR');
  if (!clienteId) throw new Error('Falta cliente.');
  if (!mensaje || !String(mensaje).trim()) throw new Error('El mensaje no puede estar vacío.');
  const cli = await getDoc(doc(db, 'clientes', clienteId));
  if (!cli.exists()) throw new Error('Cliente no encontrado.');
  const cliData = cli.data();
  const registro = {
    clienteId, clienteNombre: cliData.nombre || '', tipo: tipo || 'MANUAL',
    mensaje: String(mensaje).trim(), estado: 'PREPARADA', canal: 'WHATSAPP',
    usuarioId: c.uid, usuarioNombre: c.nombre, preparadaEn: serverTimestamp()
  };
  const ref = await addDoc(collection(db, 'notificaciones'), registro);
  await auditar(c, 'PREPARAR_NOTIFICACION', 'notificaciones', ref.id, null, { clienteId, tipo });
  const tel = String(cliData.whatsapp || cliData.telefono || '').replace(/\D/g, '');
  return {
    id: ref.id,
    estado: 'PREPARADA',
    enlaceWhatsApp: tel ? 'https://wa.me/57' + tel.replace(/^57/, '') + '?text=' + encodeURIComponent(registro.mensaje) : null
  };
}

/** Marca un aviso preparado como enviado a mano. Es un acto explícito. */
export async function marcarNotificacionEnviada(id) {
  const c = await requerir('OPERADOR');
  const ref = doc(db, 'notificaciones', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Aviso no encontrado.');
  if (snap.data().estado !== 'PREPARADA') throw new Error('Solo se marca como enviado un aviso que esté preparado.');
  await updateDoc(ref, { estado: 'ENVIADA', enviadoPor: c.uid, enviadoEn: serverTimestamp() });
  await auditar(c, 'MARCAR_AVISO_ENVIADO', 'notificaciones', id, { estado: 'PREPARADA' }, { estado: 'ENVIADA' });
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

/* ── Usuarios: NO desde el navegador ───────────────────────────────────
   Crear una cuenta de Authentication, cambiar un rol o vincular un UID exige
   el Admin SDK, y en el plan Spark no hay servidor donde ejecutarlo. Las reglas
   cierran `usuarios` a escritura desde el cliente (allow write: if false), así
   que ni un SUPERADMIN puede auto-promoverse ni promover a otro desde la web.
   La vía correcta es la herramienta local privilegiada del ASUS autorizado:
       node herramientas/admin-spark.js --diagnostico
       node herramientas/admin-spark.js --crear-cuenta --email … --rol ADMIN
   (simulación por omisión; requiere --aplicar --autorizado-por "…"). */
const SIN_ADMIN_SDK = 'La gestión de usuarios necesita el Admin SDK, que no existe en el plan Spark. ' +
  'Se hace con la herramienta local del ASUS autorizado: node herramientas/admin-spark.js';

export async function crearUsuario() { throw new Error(SIN_ADMIN_SDK + ' --crear-cuenta'); }
export async function actualizarUsuario() { throw new Error(SIN_ADMIN_SDK + ' --rol / --deshabilitar'); }

/* ── Mantenimiento ─────────────────────────────────────────────────── */
export async function seedInicial() {
  await requerir('SUPERADMIN');
  const planes = [
    { nombre: 'Mini Web Básica', precio: 49900, servicio: 'tarjetas', categoria: 'MINI WEB BÁSICA', duracionMeses: 12, orden: 1, estado: 'ACTIVO', incluye: ['Contacto y redes', 'Ubicación', 'Código QR'] },
    { nombre: 'Mini Web Pro', precio: 99900, servicio: 'tarjetas', categoria: 'MINI WEB PRO', duracionMeses: 12, orden: 2, estado: 'ACTIVO', incluye: ['Todo Mini Web Básica', 'Catálogo o menú', 'Código QR'] },
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
