/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/callables.js
   Puente hacia las Cloud Functions del panel.

   TODA escritura con lógica de negocio pasa por aquí y NO directamente
   desde el navegador. Motivo: las funciones validan el rol en el
   servidor, escriben auditoría, actualizan el historial de estados y
   garantizan el anti-duplicado de notificaciones. Si el panel escribiera
   directo en Firestore, esas garantías se perderían.

   Las lecturas (listados, dashboard) sí van directas a Firestore con las
   reglas de seguridad: es más rápido y no necesita lógica adicional.
   ═══════════════════════════════════════════════════════════════════ */

import { functions } from './core.js';
import { httpsCallable } from 'firebase/functions';

/** Envuelve una callable para devolver datos limpios y errores legibles. */
async function invocar(nombre, datos) {
  if (!functions) {
    throw new Error('Firebase no está configurado: no se pueden ejecutar acciones del servidor.');
  }
  try {
    const fn = httpsCallable(functions, nombre);
    const res = await fn(datos || {});
    return res.data;
  } catch (err) {
    /* Los errores de httpsCallable traen código y mensaje; se traducen. */
    const codigos = {
      'functions/unauthenticated': 'Tu sesión expiró. Vuelve a entrar.',
      'functions/permission-denied': 'Tu rol no permite esta acción.',
      'functions/not-found': 'El registro no existe o fue eliminado.',
      'functions/invalid-argument': 'Faltan datos o hay un valor inválido.',
      'functions/failed-precondition': 'La acción no es posible en el estado actual del registro.',
      'functions/internal': 'Error interno del servidor. Revisa los registros de las funciones.',
      'functions/unavailable': 'No hay conexión con el servidor. Revisa tu internet.',
      'functions/deadline-exceeded': 'La operación tardó demasiado. Inténtalo de nuevo.'
    };
    const legible = codigos[err.code] || 'No se pudo completar la acción.';
    const e = new Error(err.message && !err.message.startsWith('internal') ? err.message : legible);
    e.codigo = err.code;
    throw e;
  }
}

/* ── Clientes ──────────────────────────────────────────────────────── */

/** Crea un cliente, su servicio y el historial inicial. */
export const crearCliente = (datos) => invocar('crearCliente', datos);

/** Actualiza datos de contacto de un cliente (no toca fechas ni estados). */
export const actualizarCliente = (clienteId, datos) => invocar('actualizarCliente', { clienteId, datos });

/* ── Pagos ─────────────────────────────────────────────────────────── */

/** Registra un pago en estado PENDIENTE (no renueva todavía). */
export const registrarPago = (datos) => invocar('registrarPago', datos);

/** Confirma un pago: renueva +12 meses, reactiva el servicio y reinicia avisos. Solo ADMIN. */
export const confirmarPago = (pagoId, datos) => invocar('confirmarPago', { pagoId, ...(datos || {}) });

/** Anula un pago (con motivo). Solo ADMIN. */
export const anularPago = (pagoId, motivo) => invocar('anularPago', { pagoId, motivo });

/* ── Ciclo de vida del servicio ────────────────────────────────────── */

export const activarServicio = (clienteId, motivo) => invocar('activarServicio', { clienteId, motivo });
export const suspenderServicio = (clienteId, motivo) => invocar('suspenderServicio', { clienteId, motivo });
export const desactivarServicio = (clienteId, motivo) => invocar('desactivarServicio', { clienteId, motivo });
export const reactivarServicio = (clienteId, motivo) => invocar('reactivarServicio', { clienteId, motivo });

/* ── Notificaciones ────────────────────────────────────────────────── */

/** Envía un aviso manual por push a los dispositivos del cliente. */
export const enviarNotificacion = (clienteId, tipo, mensaje) =>
  invocar('enviarNotificacion', { clienteId, tipo: tipo || 'MANUAL', mensaje });

/** Registra el token FCM de ESTE navegador para un cliente. */
export const registrarToken = (clienteId, token, info) =>
  invocar('registrarToken', { clienteId, token, ...(info || {}) });

/* ── Usuarios (solo SUPERADMIN) ────────────────────────────────────── */

export const crearUsuario = (datos) => invocar('crearUsuario', datos);
export const actualizarUsuario = (uid, datos) => invocar('actualizarUsuario', { uid, datos });

/* ── Mantenimiento (solo SUPERADMIN) ───────────────────────────────── */

/** Carga el catálogo de planes y la configuración inicial. Idempotente. */
export const seedInicial = () => invocar('seedInicial', {});

/** Recalcula los estados de todos los clientes según su vencimiento. */
export const recalcularEstados = () => invocar('recalcularEstados', {});
