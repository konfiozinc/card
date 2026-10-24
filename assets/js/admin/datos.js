/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/datos.js
   Capa de datos del panel. ÚNICA puerta de entrada a Firestore:
   - Las LECTURAS van directas (getDocs/query/onSnapshot).
   - Las ESCRITURAS con lógica de negocio van por escrituras-local.js
     (modo Spark): así se mantienen auditoría, historial de estados y
     anti-duplicado de notificaciones.

   Cada página importa lo que necesita de aquí, con lo que las páginas
   quedan cortas y toda la lógica de datos vive en un solo lugar.
   ═══════════════════════════════════════════════════════════════════ */

import { db } from './core.js';
import {
  collection, query, orderBy, limit, getDocs, doc, getDoc,
  onSnapshot, where, Timestamp
} from 'firebase/firestore';
import {
  crearCliente, actualizarCliente, registrarPago, confirmarPago, anularPago,
  activarServicio, suspenderServicio, desactivarServicio, reactivarServicio,
  inhabilitarServicio, eliminarCliente, crearServicio, cargarServiciosDeCliente,
  prepararNotificacion, marcarNotificacionEnviada, registrarToken,
  seedInicial, recalcularEstados
} from './escrituras-local.js';
/* MODO SPARK: no hay Cloud Functions. Todo se escribe desde el cliente y la
   única autoridad son las reglas de Firestore. La gestión de usuarios es la
   excepción: crear cuentas y cambiar roles exige el Admin SDK, así que se hace
   con la herramienta local privilegiada (herramientas/admin-spark.js); desde
   aquí solo se explica cómo, con un error claro en vez de un fallo mudo. */
import { crearUsuario, actualizarUsuario } from './escrituras-local.js';

const CFG = window.KZ_CONFIG || {};
const NEG = CFG.negocio || { mesesSuscripcion: 12, diasAntes: [10, 5, 3, 1], diasPorVencer: 15, diasGracia: 5 };

export { CFG, NEG };

/* ── Utilidades de fecha y dinero ──────────────────────────────────── */
export function cop(n) { return '$' + (Number(n) || 0).toLocaleString('es-CO'); }

export function aFecha(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
export function iso(d) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dia = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${dia}`;
}
export function hoyISO() { return iso(new Date()); }
export function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return d;
}
export function dias(fecha) {
  if (!fecha) return null;
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const f = new Date(String(fecha).length === 10 ? fecha + 'T00:00:00' : fecha); f.setHours(0, 0, 0, 0);
  return Math.round((f - h) / 86400000);
}
export function fechaLarga(v) {
  const d = aFecha(v);
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── Estados derivados ─────────────────────────────────────────────── */
export function estadoPorVencimiento(vencimiento) {
  const d = dias(vencimiento);
  if (d === null) return 'ACTIVO';
  if (d < 0) return 'PENDIENTE_PAGO';
  if (d <= NEG.diasPorVencer) return 'POR_VENCER';
  return 'ACTIVO';
}

/* ── Lecturas ──────────────────────────────────────────────────────── */

/** Carga todos los clientes (una sola lectura). */
export async function cargarClientes() {
  const snap = await getDocs(query(collection(db, 'clientes'), orderBy('nombre')));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), dias: dias(d.data().fechaVencimiento) }));
}

/** Carga un cliente por id. */
export async function cargarCliente(id) {
  const snap = await getDoc(doc(db, 'clientes', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Pagos de un cliente (para el detalle).
 *
 *  Los pagos viven en la colección RAÍZ `pagos` con el campo `clienteId`:
 *  así los escriben `registrarPago()` (escrituras-local.js) y la función
 *  equivalente de los antiguos servicios del servidor. La subcolección `clientes/{id}/pagos`
 *  no la escribe nadie y las reglas la cierran con el comodín final, así
 *  que la consulta anterior devolvía siempre PERMISSION_DENIED y el
 *  historial del cliente aparecía vacío.
 *
 *  Se filtra SOLO por `clienteId` (índice de un campo, automático) y se
 *  ordena en memoria a propósito: un `where` + `orderBy` sobre campos
 *  distintos exigiría un índice compuesto en producción, y no se quiere
 *  depender de un despliegue de índices para arreglar esto.
 */
export async function pagosDe(clienteId) {
  const snap = await getDocs(query(collection(db, 'pagos'), where('clienteId', '==', clienteId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.fechaPago || '').localeCompare(String(a.fechaPago || '')))
    .slice(0, 20);
}

/** Historial de estados de un cliente. */
export async function historialDe(clienteId) {
  const snap = await getDocs(query(collection(db, 'historial_estados'), where('clienteId', '==', clienteId), orderBy('fecha', 'desc'), limit(15)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Todos los pagos. */
export async function cargarPagos() {
  const snap = await getDocs(query(collection(db, 'pagos'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Todos los servicios (instancias por cliente). */
export async function cargarServicios() {
  const snap = await getDocs(query(collection(db, 'servicios'), orderBy('fechaVencimiento')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Catálogo de planes. */
export async function cargarPlanes() {
  const snap = await getDocs(query(collection(db, 'planes'), orderBy('orden')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Configuración clave/valor. */
export async function cargarConfig() {
  const snap = await getDocs(collection(db, 'configuracion'));
  const out = {};
  snap.docs.forEach(d => { out[d.id] = d.data().valor; });
  return out;
}

/** Usuarios administradores. */
export async function cargarUsuarios() {
  const snap = await getDocs(query(collection(db, 'usuarios'), orderBy('nombre')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Auditoría reciente. */
export async function cargarAuditoria() {
  const snap = await getDocs(query(collection(db, 'auditoria'), orderBy('fecha', 'desc'), limit(200)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Notificaciones recientes. */
export async function cargarNotificaciones() {
  /* Sin orderBy en la consulta, a propósito: en Spark los avisos nacen con
     `preparadaEn` (no `fechaEnvio`), y una consulta ordenada por un campo que
     falta EXCLUYE el documento. La lista salía vacía y con ella desaparecía el
     botón de «marcar enviado». Se ordena en memoria y se admiten ambos campos
     para no perder los avisos antiguos. */
  const snap = await getDocs(query(collection(db, 'notificaciones'), limit(200)));
  const aMs = (v) => {
    if (!v) return 0;
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    const d = new Date(v);
    return isNaN(d) ? 0 : d.getTime();
  };
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((x, y) => aMs(y.preparadaEn || y.fechaEnvio) - aMs(x.preparadaEn || x.fechaEnvio));
}

/** Suscripción en tiempo real a clientes (el panel se actualiza solo). */
export function suscribirClientes(cb) {
  return onSnapshot(query(collection(db, 'clientes'), orderBy('nombre')), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data(), dias: dias(d.data().fechaVencimiento) })));
  });
}

/* ── Escrituras (cliente + reglas, modo Spark) ─────────────────────── */
export const escrituras = {
  crearCliente, actualizarCliente, registrarPago, confirmarPago, anularPago,
  activarServicio, suspenderServicio, desactivarServicio, reactivarServicio,
  inhabilitarServicio, eliminarCliente, crearServicio, cargarServiciosDeCliente,
  prepararNotificacion, marcarNotificacionEnviada, registrarToken, crearUsuario, actualizarUsuario,
  seedInicial, recalcularEstados
};

/* ── Precio sugerido por servicio (para autocompletar) ─────────────── */
export function precioSugerido(servicio, categoria) {
  if (servicio === 'Tarjetas Digitales' && categoria) {
    const c = CFG.categoriasTarjeta.find(x => x.codigo === categoria);
    if (c) return c.precio;
  }
  const s = CFG.servicios.find(x => x.etiqueta === servicio);
  return s ? s.precioDesde : 0;
}

/* ── Timestamp de Firestore para las pocas escrituras directas ─────── */
export { Timestamp };
