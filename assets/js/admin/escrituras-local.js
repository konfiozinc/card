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
/* KZ-OPS-001 · Las fechas de negocio se guardan como texto 'YYYY-MM-DD'.
   `new Date('2027-10-24')` NO las interpreta como fecha local: las toma como
   medianoche UTC, que en Colombia (UTC-5) es el día ANTERIOR a las 19:00. Al
   sumar meses y volver a formatear en local, cada renovación caía un día antes
   de lo debido. Una fecha de calendario se parsea como fecha local. */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const aFecha = (v) => {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (typeof v === 'string' && FECHA_ISO.test(v)) return new Date(v + 'T00:00:00');
  const d = new Date(v);
  return isNaN(d) ? null : d;
};
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

  /* KZ-OPS-001: el cliente y su PRIMER SERVICIO se escriben en un solo lote.
     Antes el servicio se creaba en una llamada aparte envuelta en
     `.catch(() => {})`. Cuando las reglas lo denegaban —porque `createdAt` no
     estaba en la lista de claves permitidas, y el panel lo escribía— el cliente
     se guardaba SIN ningún servicio y la pantalla decía «creado». De ahí salían
     tres síntomas que se veían como fallos distintos: el detalle del cliente
     sin servicios, el selector «Servicio asociado» vacío en el cobro (que
     bloqueaba las renovaciones) y Vencimientos sin obligación por servicio.
     Con el lote, o se guardan los dos documentos o no se guarda ninguno. */
  const clienteRef = doc(collection(db, 'clientes'));
  const servicioRef = doc(collection(db, 'servicios'));
  const lote = writeBatch(db);
  lote.set(clienteRef, cliente);
  lote.set(servicioRef, {
    clienteId: clienteRef.id, clienteNombre: d.nombre, planId: d.planId || null,
    servicio: d.servicio, categoria: d.categoria || null,
    fechaInicio: cliente.fechaActivacion, fechaVencimiento: vencimiento,
    precio: cliente.precio, estado, activo: true, createdAt: serverTimestamp()
  });
  await lote.commit();

  /* Los registros de bitácora van DESPUÉS del lote: si fallaran, el cliente ya
     existe y no se puede informar «no se creó». Se devuelve el aviso en vez de
     tragárselo. */
  let aviso = null;
  try {
    await historial(c, clienteRef.id, null, estado, 'Cliente creado');
    await auditar(c, 'CREAR_CLIENTE', 'clientes', clienteRef.id, null, cliente);
  } catch (e) {
    aviso = 'El cliente y su servicio se guardaron, pero el registro de auditoría falló: ' + e.message;
  }
  return { id: clienteRef.id, servicioId: servicioRef.id, estado, aviso };
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

/* CARD-SPARK-002 · Servicios independientes por cliente (1 cliente → N). */
export const ESTADOS_SERVICIO = ['ACTIVO', 'POR_VENCER', 'PENDIENTE_PAGO',
  'SUSPENDIDO', 'INACTIVO', 'INHABILITADO', 'PENDIENTE_CONFIGURACION'];

function validarFechasServicio(inicio, vence) {
  if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(String(inicio))) throw new Error('La fecha de inicio no es válida.');
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(String(vence))) throw new Error('La fecha de vencimiento no es válida.');
  if (inicio && vence && String(vence) < String(inicio)) {
    throw new Error('La fecha de vencimiento no puede ser anterior a la de inicio.');
  }
}

export async function crearServicio(d) {
  const c = await requerir('OPERADOR');
  if (!d.clienteId || !d.servicio) throw new Error('Cliente y servicio son obligatorios.');
  const cli = await getDoc(doc(db, 'clientes', d.clienteId));
  if (!cli.exists()) throw new Error('El cliente indicado no existe. Recarga la lista antes de añadir un servicio.');
  const inicio = d.fechaInicio || iso(new Date());
  const vence = d.fechaVencimiento || null;
  validarFechasServicio(inicio, vence);
  const precio = Number(d.precio) || 0;
  if (precio < 0) throw new Error('El precio no puede ser negativo.');
  const estado = d.estado && ESTADOS_SERVICIO.includes(d.estado) ? d.estado : 'ACTIVO';
  const ref = await addDoc(collection(db, 'servicios'), {
    clienteId: d.clienteId, clienteNombre: d.clienteNombre || cli.data().nombre || '',
    servicio: d.servicio, categoria: d.categoria || null, planId: d.planId || null,
    precio, fechaInicio: inicio, fechaVencimiento: vence,
    estado, activo: estado === 'ACTIVO', createdAt: serverTimestamp()
  });
  await auditar(c, 'CREAR_SERVICIO', 'servicios', ref.id, null,
    { clienteId: d.clienteId, servicio: d.servicio, precio, fechaVencimiento: vence });
  return { id: ref.id };
}

/** Edición individual de un servicio (KZ-OPS-001).
 *  Solo cambia los campos comerciales del servicio indicado: nunca toca los
 *  demás servicios del cliente ni el estado global del cliente. */
export async function actualizarServicio(servicioId, datos) {
  const c = await requerir('ADMIN');
  if (!servicioId) throw new Error('Servicio obligatorio.');
  const ref = doc(db, 'servicios', servicioId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Servicio no encontrado.');
  const antes = snap.data();

  const permitidos = ['clienteNombre', 'planId', 'servicio', 'categoria',
    'fechaInicio', 'fechaVencimiento', 'precio', 'estado', 'activo'];
  const limpio = {};
  for (const k of permitidos) if (datos[k] !== undefined) limpio[k] = datos[k];
  if (!Object.keys(limpio).length) throw new Error('No hay cambios que guardar.');

  if (limpio.servicio !== undefined && !String(limpio.servicio).trim()) {
    throw new Error('El nombre del servicio no puede quedar vacío.');
  }
  if (limpio.precio !== undefined) {
    limpio.precio = Number(limpio.precio) || 0;
    if (limpio.precio < 0) throw new Error('El precio no puede ser negativo.');
  }
  if (limpio.estado !== undefined && !ESTADOS_SERVICIO.includes(limpio.estado)) {
    throw new Error('Estado de servicio no válido.');
  }
  const inicio = limpio.fechaInicio !== undefined ? limpio.fechaInicio : antes.fechaInicio;
  const vence = limpio.fechaVencimiento !== undefined ? limpio.fechaVencimiento : antes.fechaVencimiento;
  validarFechasServicio(inicio, vence);
  /* `activo` se deriva del estado: dejarlo a criterio del formulario producía
     servicios «INACTIVO con activo: true» que las listas mostraban como vivos. */
  if (limpio.estado !== undefined) limpio.activo = limpio.estado === 'ACTIVO';

  limpio.updatedAt = serverTimestamp();
  await updateDoc(ref, limpio);
  await auditar(c, 'ACTUALIZAR_SERVICIO', 'servicios', servicioId,
    { precio: antes.precio, servicio: antes.servicio, estado: antes.estado,
      fechaVencimiento: antes.fechaVencimiento },
    { precio: limpio.precio, servicio: limpio.servicio, estado: limpio.estado,
      fechaVencimiento: limpio.fechaVencimiento });
  return { ok: true };
}

/** Cambia el estado de UN servicio, no del cliente (KZ-OPS-001).
 *  Antes, los botones de la página Servicios llamaban a suspenderServicio /
 *  reactivarServicio pasando el id del CLIENTE: con varios servicios por
 *  cliente, suspender uno suspendía todos y el cliente entero, mientras el
 *  `estado` del servicio no cambiaba nunca. Aquí la transición se escribe en el
 *  documento del servicio y queda en historial y auditoría con su clienteId. */
export async function cambiarEstadoServicio(servicioId, nuevo, motivo) {
  const c = await requerir('ADMIN');
  if (!motivo) throw new Error('El motivo es obligatorio.');
  if (!ESTADOS_SERVICIO.includes(nuevo)) throw new Error('Estado de servicio no válido.');
  const ref = doc(db, 'servicios', servicioId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Servicio no encontrado.');
  const s = snap.data();
  if (s.estado === nuevo) throw new Error('El servicio ya está en ese estado.');
  await updateDoc(ref, {
    estado: nuevo, activo: nuevo === 'ACTIVO', updatedAt: serverTimestamp()
  });
  await historial(c, s.clienteId, s.estado || null, nuevo,
    motivo + ' · servicio: ' + (s.servicio || servicioId));
  await auditar(c, 'ESTADO_SERVICIO_' + nuevo, 'servicios', servicioId,
    { estado: s.estado }, { estado: nuevo, motivo });
  return { ok: true };
}

export async function cargarServiciosDeCliente(clienteId) {
  const snap = await getDocs(query(collection(db, 'servicios'), where('clienteId', '==', clienteId)));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

/* ── Pagos ─────────────────────────────────────────────────────────── */
export async function registrarPago(d) {
  const c = await requerir('OPERADOR');
  if (!d.clienteId || !Number(d.monto) || Number(d.monto) <= 0) throw new Error('Falta cliente o monto válido.');
  const concepto = String(d.concepto || '').trim();
  if (!concepto) throw new Error('Selecciona un concepto de cobro. No se asume «DESARROLLO» por omisión.');
  if (!(CFG.conceptosPago || []).some((x) => x.codigo === concepto)) throw new Error('Concepto de cobro no válido.');
  const clienteSnap = await getDoc(doc(db, 'clientes', d.clienteId));
  if (!clienteSnap.exists()) throw new Error('Cliente no encontrado.');

  /* KZ-OPS-001 · Un pago renovable DEBE apuntar a un servicio del MISMO
     cliente. Sin esta comprobación se podía registrar una renovación contra el
     servicio de otro cliente y, al confirmarla, extender la vigencia ajena. */
  const defConcepto = (CFG.conceptosPago || []).find((x) => x.codigo === concepto);
  let servicioId = d.servicioId || null;
  if (servicioId) {
    const sv = await getDoc(doc(db, 'servicios', servicioId));
    if (!sv.exists()) throw new Error('El servicio asociado al pago no existe.');
    if (sv.data().clienteId !== d.clienteId) {
      throw new Error('El servicio asociado pertenece a otro cliente. Elige un servicio de este cliente.');
    }
  } else if (defConcepto && defConcepto.extensible) {
    throw new Error('Un cobro renovable necesita el servicio que renueva. Añade primero el servicio al cliente y vuelve a registrar el pago.');
  }

  const referencia = String(d.referencia || '').trim();
  const descripcion = String(d.descripcion || '').trim();
  const pago = {
    clienteId: d.clienteId, clienteNombre: clienteSnap.data().nombre,
    servicioId: servicioId, monto: Number(d.monto),
    concepto: concepto,
    metodoPago: d.metodoPago || 'Efectivo', fechaPago: d.fechaPago || iso(new Date()),
    referencia: referencia || null, comprobanteUrl: d.comprobanteUrl || null,
    estado: 'PENDIENTE', registradoPor: c.uid, registradoPorNombre: c.nombre,
    createdAt: serverTimestamp()
  };
  /* La descripción es OPCIONAL: si está vacía no se escribe la clave. Enviar
     `descripcion: null` hacía que la regla de creación rechazara el pago entero
     (exigía `is string`), así que registrar un cobro sin detalle fallaba siempre
     con un mensaje de reglas ilegible. */
  if (descripcion) pago.descripcion = descripcion;

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

  /* KZ-OPS-001 · Lectura previa de los OTROS servicios del cliente.
     Una transacción del SDK web solo puede leer documentos POR REFERENCIA: un
     `tx.get(query)` no está soportado y hacía abortar la transacción entera, de
     modo que la confirmación de una renovación no escribía NADA (ni el pago ni
     la fecha) y la pantalla solo mostraba un error de reglas. Los hermanos se
     leen aquí y se usan únicamente para recalcular la fecha genérica del
     cliente; la decisión sigue tomándose dentro de la transacción con el estado
     real del servidor. */
  const pagoPrevio = await getDoc(pagoRef);
  if (!pagoPrevio.exists()) throw new Error('Pago no encontrado.');
  const datosPrevios = pagoPrevio.data();
  let fechasHermanas = [];
  if (datosPrevios.clienteId) {
    const hermanos = await getDocs(query(collection(db, 'servicios'),
      where('clienteId', '==', datosPrevios.clienteId)));
    fechasHermanas = hermanos.docs
      .filter((x) => x.id !== datosPrevios.servicioId)
      .map((x) => x.data().fechaVencimiento)
      .filter((f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f));
  }

  /* En una transacción: se relee el pago y se decide con el estado REAL en el
     servidor, no con lo que vio la pantalla. Confirmar dos veces (dos clics,
     dos pestañas, un reintento tras un corte) es imposible: la segunda
     transacción ve CONFIRMADO y aborta antes de renovar nada.

     CARD-SPARK-002: el efecto depende del CONCEPTO. Un pago de DESARROLLO
     (pago único) NO renueva ni toca vencimientos; solo un concepto renovable
     (dominio/hosting/mantenimiento/servicio periódico) extiende su fecha. */
  const hecho = await runTransaction(db, async (tx) => {
    const pagoSnap = await tx.get(pagoRef);
    if (!pagoSnap.exists()) throw new Error('Pago no encontrado.');
    const pago = pagoSnap.data();
    if (pago.estado === 'CONFIRMADO') throw new Error('Este pago ya está confirmado. No se renueva dos veces.');
    if (pago.estado === 'ANULADO') throw new Error('Este pago está anulado.');
    if (!pago.concepto) throw new Error('Este pago no tiene concepto (registro histórico). Clasifícalo antes de confirmarlo; no se asume «DESARROLLO».');

    const clienteRef = doc(db, 'clientes', pago.clienteId);
    const clienteSnap = await tx.get(clienteRef);
    if (!clienteSnap.exists()) throw new Error('Cliente no encontrado.');

    const concepto = (CFG.conceptosPago || []).find((x) => x.codigo === (pago.concepto || 'DESARROLLO'))
      || { codigo: 'DESARROLLO', extensible: false, meses: 0 };
    /* Una renovación DEBE identificar su servicio. Sin servicioId no se
       modifica ninguna fecha (ni genérica): se bloquea con error claro. */
    if (concepto.extensible && !pago.servicioId) {
      throw new Error('Esta renovación no tiene servicio asociado. Asígnale el servicio en el pago antes de confirmar (no se modifica la fecha genérica del cliente).');
    }
    const hoy = new Date();
    let nuevoVenc = null;
    let servicioRef = null;
    let servicioAntes = null;

    /* KZ-OPS-001 · La nueva vigencia se calcula desde el vencimiento DEL
       SERVICIO que se renueva, no desde la fecha genérica del cliente. Antes se
       usaba `clientes.fechaVencimiento`, que solo refleja uno de los servicios:
       con dos servicios de vencimientos distintos, renovar el segundo saltaba a
       una fecha calculada sobre el primero. */
    if (concepto.extensible) {
      servicioRef = doc(db, 'servicios', pago.servicioId);
      const svSnap = await tx.get(servicioRef);
      if (!svSnap.exists()) {
        throw new Error('El servicio asociado a esta renovación ya no existe. Corrige el pago antes de confirmar.');
      }
      servicioAntes = svSnap.data();
      if (servicioAntes.clienteId !== pago.clienteId) {
        throw new Error('El servicio asociado pertenece a otro cliente. Corrige el pago antes de confirmar.');
      }
      const vencServicio = aFecha(servicioAntes.fechaVencimiento);
      const vigente = vencServicio && Math.round((vencServicio - hoy) / 86400000) > 0;
      nuevoVenc = iso(sumarMeses(vigente ? vencServicio : hoy, concepto.meses || NEG.mesesSuscripcion));
    }

    if (nuevoVenc) {
      const estado = estadoPorVencimiento(nuevoVenc);
      tx.update(servicioRef, {
        fechaVencimiento: nuevoVenc, estado, activo: estado === 'ACTIVO',
        updatedAt: serverTimestamp()
      });
      /* La fecha genérica del cliente pasa a ser la obligación MÁS LEJANA entre
         sus servicios: es la que usa el dashboard y evita que el cliente
         aparezca «vencido» por un servicio ya renovado. Los demás servicios se
         leyeron antes de la transacción (aquí no se pueden consultar). */
      const fechas = fechasHermanas.slice();
      fechas.push(nuevoVenc);
      const vencCliente = fechas.sort().slice(-1)[0];
      const estadoCliente = estadoPorVencimiento(vencCliente);
      tx.update(clienteRef, {
        fechaVencimiento: vencCliente, estadoCliente, estadoServicio: estadoCliente,
        updatedAt: serverTimestamp()
      });
      tx.update(pagoRef, {
        estado: 'CONFIRMADO', confirmadoPor: c.uid, confirmadoPorNombre: c.nombre,
        periodoInicio: iso(hoy), periodoFin: nuevoVenc, confirmadoEn: serverTimestamp()
      });
      return {
        concepto: concepto.codigo, estado, nuevoVenc, clienteId: pago.clienteId,
        servicioId: pago.servicioId || null, vencCliente, servicioRef: true
      };
    }

    /* Pago no renovable (desarrollo/ampliación/otro): solo se confirma. */
    tx.update(pagoRef, {
      estado: 'CONFIRMADO', confirmadoPor: c.uid, confirmadoPorNombre: c.nombre,
      confirmadoEn: serverTimestamp()
    });
    return { concepto: concepto.codigo, estado: null, nuevoVenc: null, clienteId: pago.clienteId, servicioId: pago.servicioId || null };
  });

  /* La renovación afecta SOLO el servicio del pago (`pago.servicioId`), nunca a
     todos los servicios del cliente. Desde KZ-OPS-001 el servicio se actualiza
     dentro de la misma transacción; este bloque queda como red de seguridad
     para el caso en que la transacción se completara sin él. */
  let aviso = null;
  if (hecho.nuevoVenc && hecho.servicioId && !hecho.servicioRef) {
    try {
      await updateDoc(doc(db, 'servicios', hecho.servicioId), {
        fechaVencimiento: hecho.nuevoVenc, estado: hecho.estado, updatedAt: serverTimestamp()
      });
    } catch (e) {
      aviso = 'El pago quedó confirmado y el vencimiento aplicado, pero el servicio del pago no se pudo actualizar: ' + e.message;
    }
  }

  await historial(c, hecho.clienteId, 'PENDIENTE_PAGO', hecho.estado || 'ACTIVO',
    hecho.nuevoVenc
      ? 'Pago confirmado (' + hecho.concepto + '): vigencia extendida a ' + hecho.nuevoVenc
      : 'Pago confirmado (' + hecho.concepto + '): pago único, sin cambios de vigencia');
  await auditar(c, 'CONFIRMAR_PAGO', 'pagos', pagoId,
    { estado: 'PENDIENTE' }, { estado: 'CONFIRMADO', concepto: hecho.concepto, nuevoVenc: hecho.nuevoVenc });
  return { id: pagoId, estado: 'CONFIRMADO', concepto: hecho.concepto, nuevoVencimiento: hecho.nuevoVenc, aviso };
}

/** Clasifica un pago HISTÓRICO que se registró sin concepto (KZ-OPS-001).
 *  Un solo uso por pago, con motivo y auditoría. No reclasifica: si el pago ya
 *  tiene concepto, se rechaza. El dinero (monto, cliente, quién lo registró) no
 *  se toca nunca. */
export async function clasificarPago(pagoId, concepto, motivo, descripcion) {
  const c = await requerir('ADMIN');
  if (!pagoId) throw new Error('Pago obligatorio.');
  if (!concepto) throw new Error('Selecciona el concepto real de este cobro.');
  if (!(CFG.conceptosPago || []).some((x) => x.codigo === concepto)) {
    throw new Error('Concepto de cobro no válido.');
  }
  if (!String(motivo || '').trim()) throw new Error('El motivo de la clasificación es obligatorio.');
  const ref = doc(db, 'pagos', pagoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Pago no encontrado.');
  const p = snap.data();
  if (p.estado !== 'PENDIENTE') throw new Error('Solo se clasifican pagos pendientes. Este ya está ' + p.estado + '.');
  if (p.concepto) throw new Error('Este pago ya tiene concepto (' + p.concepto + '). No se reclasifica.');

  const parche = {
    concepto,
    clasificadoPor: c.uid, clasificadoEn: serverTimestamp(),
    motivoClasificacion: String(motivo).trim().slice(0, 300)
  };
  if (descripcion !== undefined && descripcion !== null && String(descripcion).trim()) {
    parche.descripcion = String(descripcion).trim().slice(0, 300);
  }
  await updateDoc(ref, parche);
  await auditar(c, 'CLASIFICAR_PAGO', 'pagos', pagoId,
    { concepto: null }, { concepto, motivo: parche.motivoClasificacion });
  return { ok: true, concepto };
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

/* ── Contactos: seguimiento comercial (KZ-OPS-001) ─────────────────────
   El lead llega por el Worker de captación y es un registro probatorio: sus
   datos de origen (nombre, teléfono, correo, mensaje, servicio y fecha) NO se
   tocan nunca desde el panel; las reglas lo impiden. Lo que sí se gestiona es
   el seguimiento: estado comercial, notas e historial de atención, y la
   conversión a cliente, que es siempre un acto EXPLÍCITO y autorizado. */
export const ESTADOS_CONTACTO = ['NUEVO', 'CONTACTADO', 'ATENDIDO', 'DESCARTADO', 'CONVERTIDO'];

function normalizarEstadoContacto(e) {
  const up = String(e || '').toUpperCase();
  if (ESTADOS_CONTACTO.includes(up)) return up;
  throw new Error('Estado de contacto no válido: ' + e);
}

/** Cambia el estado comercial de un lead y/o deja constancia de la gestión. */
export async function actualizarContacto(contactoId, cambios) {
  const c = await requerir('OPERADOR');
  if (!contactoId) throw new Error('Contacto obligatorio.');
  const ref = doc(db, 'contactos', contactoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Ese contacto ya no existe. Recarga la lista.');
  const antes = snap.data();

  const parche = { actualizadoEn: serverTimestamp(), actualizadoPor: c.uid };
  if (cambios.estado !== undefined) {
    const nuevo = normalizarEstadoContacto(cambios.estado);
    parche.estado = nuevo;
    const marca = { CONTACTADO: 'contactadoEn', ATENDIDO: 'atendidoEn',
      DESCARTADO: 'descartadoEn', CONVERTIDO: 'convertidoEn' }[nuevo];
    if (marca && !antes[marca]) parche[marca] = serverTimestamp();
  }
  for (const k of ['nota', 'asignadoA']) {
    if (cambios[k] !== undefined) parche[k] = cambios[k] === null ? null : String(cambios[k]).slice(0, 500);
  }
  if (cambios.clienteId !== undefined) parche.clienteId = cambios.clienteId || null;

  if (parche.estado === 'CONVERTIDO' && !(parche.clienteId || antes.clienteId)) {
    throw new Error('Para marcar un contacto como convertido hay que asociarle un cliente.');
  }

  await updateDoc(ref, parche);
  await auditar(c, 'GESTIONAR_CONTACTO', 'contactos', contactoId,
    { estado: antes.estado || 'NUEVO' }, { estado: parche.estado || antes.estado || 'NUEVO' });
  return { ok: true, estado: parche.estado || antes.estado || 'NUEVO' };
}

/** Añade una entrada al historial de atención del lead (append, nunca sobrescribe). */
export async function agregarSeguimientoContacto(contactoId, nota, estado) {
  const c = await requerir('OPERADOR');
  const texto = String(nota || '').trim();
  if (!texto) throw new Error('La nota de seguimiento no puede estar vacía.');
  const ref = doc(db, 'contactos', contactoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Ese contacto ya no existe. Recarga la lista.');
  const antes = snap.data();
  const historialPrevio = Array.isArray(antes.seguimiento) ? antes.seguimiento : [];
  const entrada = {
    fecha: new Date().toISOString(),
    nota: texto.slice(0, 500),
    usuario: c.nombre,
    usuarioId: c.uid,
    estado: estado || antes.estado || 'NUEVO'
  };
  const parche = {
    seguimiento: [...historialPrevio, entrada].slice(-100),
    actualizadoEn: serverTimestamp(), actualizadoPor: c.uid
  };
  if (estado) {
    const nuevo = normalizarEstadoContacto(estado);
    if (nuevo === 'CONVERTIDO' && !antes.clienteId) {
      throw new Error('Para marcar un contacto como convertido hay que asociarle un cliente.');
    }
    parche.estado = nuevo;
    const marca = { CONTACTADO: 'contactadoEn', ATENDIDO: 'atendidoEn',
      DESCARTADO: 'descartadoEn', CONVERTIDO: 'convertidoEn' }[nuevo];
    if (marca && !antes[marca]) parche[marca] = serverTimestamp();
  }
  await updateDoc(ref, parche);
  await auditar(c, 'SEGUIMIENTO_CONTACTO', 'contactos', contactoId, null,
    { nota: entrada.nota, estado: parche.estado || antes.estado || 'NUEVO' });
  return { ok: true, seguimiento: parche.seguimiento };
}

/** Convierte un lead en cliente. Operación EXPLÍCITA: crea el cliente (y su
 *  servicio) con crearCliente y deja el vínculo en el contacto. No ocurre sola
 *  en ningún otro camino del panel. */
export async function convertirContactoEnCliente(contactoId, datos) {
  await requerir('OPERADOR');
  const ref = doc(db, 'contactos', contactoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Ese contacto ya no existe. Recarga la lista.');
  const lead = snap.data();
  if (lead.clienteId) throw new Error('Este contacto ya está vinculado a un cliente.');
  if (!String(lead.telefono || '').replace(/\D/g, '')) {
    throw new Error('El contacto no dejó teléfono: no se puede crear el cliente sin un medio de contacto.');
  }

  const catalogo = CFG.servicios || [];
  const porEtiqueta = catalogo.find((x) => x.etiqueta === lead.servicio);
  const servicio = (datos && datos.servicio) || (porEtiqueta ? porEtiqueta.etiqueta : (lead.servicio || 'Tarjetas Digitales'));
  const precio = datos && datos.precio !== undefined && datos.precio !== '' && datos.precio !== null
    ? Number(datos.precio)
    : (porEtiqueta ? porEtiqueta.precioDesde : 0);

  const creado = await crearCliente({
    nombre: lead.nombre || 'Contacto sin nombre',
    telefono: lead.telefono,
    email: lead.email || '',
    servicio,
    precio,
    observaciones: 'Alta desde el contacto del sitio del ' +
      (lead.createdAt && lead.createdAt.toDate ? lead.createdAt.toDate().toLocaleDateString('es-CO') : 'formulario web') +
      (lead.mensaje ? ' · Mensaje original: ' + String(lead.mensaje).slice(0, 300) : '')
  });

  const c = await requerir('OPERADOR');
  const previo = Array.isArray(lead.seguimiento) ? lead.seguimiento : [];
  await updateDoc(ref, {
    estado: 'CONVERTIDO',
    clienteId: creado.id,
    convertidoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    actualizadoPor: c.uid,
    seguimiento: [...previo, {
      fecha: new Date().toISOString(),
      nota: 'Convertido en cliente · ' + servicio + ' · ' + (Number(precio) || 0) + ' COP',
      usuario: c.nombre, usuarioId: c.uid, estado: 'CONVERTIDO'
    }].slice(-100)
  });
  await auditar(c, 'CONVERTIR_CONTACTO', 'contactos', contactoId, null,
    { clienteId: creado.id, servicio });
  return { clienteId: creado.id, servicioId: creado.servicioId, aviso: creado.aviso || null };
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
