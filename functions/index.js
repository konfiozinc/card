/**
 * ═══════════════════════════════════════════════════════════════════
 * KONFÍO ZINC · Cloud Functions
 *
 * Función programada que revisa cada día los vencimientos de los servicios
 * de los clientes y envía notificaciones push (Firebase Cloud Messaging)
 * 10, 5, 3 y 1 día antes del vencimiento.
 *
 * Suscripción por defecto: 12 meses (1 año) desde la fecha de activación.
 *
 * Además:
 *   - Marca como `inactivo` a quien ya venció.
 *   - Recalcula el estado `por_vencer` de toda la base.
 *   - Deja un registro de auditoría de cada envío en `notificaciones_log`.
 *   - Expone `enviarRecordatorio` (callable) para que el panel de
 *     administración pueda lanzar un recordatorio manual a un cliente.
 *
 * Desplegar:
 *   cd functions && npm install
 *   firebase deploy --only functions
 *
 * ⚠️ Las funciones programadas requieren el plan Blaze (pago por uso).
 *    Para un proyecto de este tamaño el costo es de centavos al mes.
 * ═══════════════════════════════════════════════════════════════════
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/* ── Configuración ─────────────────────────────────────────────────── */

const COLECCION_CLIENTES = 'clientes';
const COLECCION_LOG = 'notificaciones_log';
const SUBCOLECCION_PAGOS = 'pagos';

const ZONA_HORARIA = 'America/Bogota';

/** Días de antelación con los que se avisa. Debe coincidir con DIAS_AVISO en firebase-config.js */
const DIAS_AVISO = [10, 5, 3, 1];

/** Umbral (en días) para considerar un servicio "por vencer" en el panel */
const DIAS_POR_VENCER = 15;

/** Duración por defecto de una suscripción, en meses */
const MESES_SUSCRIPCION = 12;

/** Textos de cada aviso. La clave es el número de días restantes. */
const MENSAJES = {
  10: {
    title: '⏰ Tu servicio vence en 10 días',
    body: 'Tu servicio con KONFÍO ZINC vence pronto. Renueva ahora y sigue sin interrupciones.'
  },
  5: {
    title: '⚠️ Quedan 5 días de servicio',
    body: 'Tu servicio vence en 5 días. Renueva para no perder tus beneficios ni tu enlace.'
  },
  3: {
    title: '🚨 Últimos 3 días',
    body: 'Tu servicio vence en 3 días. Escríbenos y lo renovamos hoy mismo.'
  },
  1: {
    title: '🔔 Último día de servicio',
    body: 'Hoy es el último día de tu servicio. Renueva ahora para mantener todo activo.'
  }
};

const URL_RENOVACION = 'https://konfiozinc.github.io/card/contacto.html';
const WHATSAPP = 'https://wa.me/573206411340';

/* ── Utilidades de fecha ───────────────────────────────────────────── */

/**
 * Convierte un Timestamp de Firestore (o Date, o string) a Date.
 * @param {*} valor
 * @returns {Date|null}
 */
function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (valor instanceof Date) return valor;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/** Devuelve una copia de la fecha a las 00:00:00 (para comparar por días). */
function soloDia(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Diferencia en días completos entre dos fechas (positivo si `hasta` es futuro). */
function diasEntre(desde, hasta) {
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((soloDia(hasta) - soloDia(desde)) / MS_DIA);
}

/** Suma meses a una fecha respetando el fin de mes. */
function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return d;
}

/**
 * Normaliza el campo `notificacionesEnviadas`, que puede venir como array
 * de objetos ({tipo, fecha}) en el formato nuevo o como array de strings en
 * un formato antiguo. Devuelve siempre un array de objetos.
 * @param {*} campo
 * @returns {Array<{tipo:string, fecha:*}>}
 */
function normalizarNotificaciones(campo) {
  if (!Array.isArray(campo)) return [];
  return campo.map((n) => (typeof n === 'string' ? { tipo: n, fecha: null } : n));
}

/** ¿Ya se envió un aviso de este tipo para este cliente? */
function yaEnviada(notificaciones, tipo) {
  return notificaciones.some((n) => n && n.tipo === tipo);
}

/* ── Envío de notificaciones ───────────────────────────────────────── */

/**
 * Envía una notificación push a un token FCM.
 * Devuelve true si se envió; si el token ya no es válido, lo limpia del
 * documento del cliente para no volver a intentarlo.
 */
async function enviarPush(clienteRef, cliente, tipo, diasRestantes) {
  const mensaje = MENSAJES[diasRestantes];
  if (!mensaje) return false;

  try {
    await admin.messaging().send({
      token: cliente.fcmToken,
      notification: { title: mensaje.title, body: mensaje.body },
      webpush: {
        fcmOptions: { link: URL_RENOVACION },
        notification: {
          icon: 'https://konfiozinc.github.io/card/assets/img/logos/logo.jpeg',
          badge: 'https://konfiozinc.github.io/card/assets/img/logos/logo.jpeg',
          requireInteraction: true,
          actions: [{ action: 'renovar', title: 'Renovar ahora' }]
        }
      },
      data: {
        tipo,
        clienteId: clienteRef.id,
        nombre: String(cliente.nombre || ''),
        servicio: String(cliente.servicio || ''),
        diasRestantes: String(diasRestantes),
        url: URL_RENOVACION,
        whatsapp: WHATSAPP
      }
    });

    logger.info('Push enviado', { clienteId: clienteRef.id, tipo });
    return true;

  } catch (error) {
    /* Token inválido o caducado: se limpia para no acumular errores */
    if (error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/invalid-argument') {
      logger.warn('Token FCM inválido, se elimina del cliente', { clienteId: clienteRef.id });
      await clienteRef.update({ fcmToken: admin.firestore.FieldValue.delete() });
    } else {
      logger.error('Error enviando push', { clienteId: clienteRef.id, error: error.message });
    }
    return false;
  }
}

/** Registra el envío en el propio cliente y en la colección de auditoría. */
async function registrarEnvio(clienteRef, cliente, tipo, diasRestantes) {
  await clienteRef.update({
    notificacionesEnviadas: admin.firestore.FieldValue.arrayUnion({
      tipo,
      diasRestantes,
      fecha: admin.firestore.FieldValue.serverTimestamp()
    })
  });

  await db.collection(COLECCION_LOG).add({
    clienteId: clienteRef.id,
    nombre: cliente.nombre || '',
    email: cliente.email || '',
    servicio: cliente.servicio || '',
    tipo,
    diasRestantes,
    fechaVencimiento: cliente.fechaVencimiento || null,
    enviadoEn: admin.firestore.FieldValue.serverTimestamp()
  });
}

/* ── Función programada principal ──────────────────────────────────── */

/**
 * Se ejecuta todos los días a las 8:00 a.m. (hora de Colombia).
 * - Envía los avisos de 10, 5, 3 y 1 día antes del vencimiento.
 * - Marca como inactivos a los clientes ya vencidos.
 * - Actualiza el estado por_vencer / activo del resto.
 */
exports.verificarVencimientos = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: ZONA_HORARIA,
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 300
  },
  async () => {
    const hoy = new Date();
    logger.info('Iniciando verificación de vencimientos', { hoy: hoy.toISOString() });

    const snapshot = await db.collection(COLECCION_CLIENTES).get();

    let avisosEnviados = 0;
    let marcadosInactivos = 0;
    let marcadosPorVencer = 0;
    let reactivados = 0;

    for (const doc of snapshot.docs) {
      const cliente = doc.data();
      const vencimiento = aFecha(cliente.fechaVencimiento);

      /* Sin fecha de vencimiento válida no hay nada que calcular */
      if (!vencimiento) {
        logger.warn('Cliente sin fechaVencimiento válida', { clienteId: doc.id });
        continue;
      }

      const restantes = diasEntre(hoy, vencimiento);

      /* 1. Ya venció → inactivo */
      if (restantes < 0) {
        if (cliente.estado !== 'inactivo') {
          await doc.ref.update({
            estado: 'inactivo',
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
          });
          marcadosInactivos++;
          logger.info('Cliente marcado como inactivo', { clienteId: doc.id, restantes });
        }
        continue;
      }

      /* 2. ¿Toca enviar algún aviso hoy? */
      const notificaciones = normalizarNotificaciones(cliente.notificacionesEnviadas);

      if (DIAS_AVISO.includes(restantes) && cliente.fcmToken && !yaEnviada(notificaciones, `${restantes}dias`)) {
        const enviado = await enviarPush(doc.ref, cliente, `${restantes}dias`, restantes);
        if (enviado) {
          await registrarEnvio(doc.ref, cliente, `${restantes}dias`, restantes);
          avisosEnviados++;
        }
      }

      /* 3. Actualizar estado según los días restantes */
      const estadoNuevo = restantes <= DIAS_POR_VENCER ? 'por_vencer' : 'activo';
      if (cliente.estado !== estadoNuevo) {
        await doc.ref.update({
          estado: estadoNuevo,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
        });
        if (estadoNuevo === 'por_vencer') marcadosPorVencer++;
        if (estadoNuevo === 'activo' && cliente.estado === 'inactivo') reactivados++;
      }
    }

    const resumen = {
      clientesRevisados: snapshot.size,
      avisosEnviados,
      marcadosInactivos,
      marcadosPorVencer,
      reactivados
    };
    logger.info('Verificación de vencimientos finalizada', resumen);
    return resumen;
  }
);

/* ── Recordatorio manual (lo usa el panel de administración) ───────── */

/**
 * Callable: envía un recordatorio inmediato a un cliente concreto.
 * Solo usuarios autenticados con documento en `admins` pueden invocarla.
 *
 * Uso desde admin.js:
 *   const fn = getFunctions(app);
 *   await httpsCallable(fn, 'enviarRecordatorio')({ clienteId: 'abc123' });
 */
exports.enviarRecordatorio = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    /* 1. Autenticación */
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión para enviar recordatorios.');
    }

    /* 2. Autorización: debe existir en la colección de administradores */
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Tu usuario no tiene permisos de administrador.');
    }

    /* 3. Datos de entrada */
    const clienteId = request.data && request.data.clienteId;
    if (!clienteId || typeof clienteId !== 'string') {
      throw new HttpsError('invalid-argument', 'Falta el clienteId.');
    }

    const clienteRef = db.collection(COLECCION_CLIENTES).doc(clienteId);
    const clienteDoc = await clienteRef.get();
    if (!clienteDoc.exists) {
      throw new HttpsError('not-found', 'El cliente no existe.');
    }

    const cliente = clienteDoc.data();
    if (!cliente.fcmToken) {
      throw new HttpsError(
        'failed-precondition',
        'Este cliente todavía no tiene un dispositivo suscrito a las notificaciones push.'
      );
    }

    const vencimiento = aFecha(cliente.fechaVencimiento);
    const restantes = vencimiento ? Math.max(0, diasEntre(new Date(), vencimiento)) : 0;

    const enviado = await enviarPush(clienteRef, cliente, 'manual', restantes || 1);
    if (!enviado) {
      throw new HttpsError('internal', 'No se pudo enviar la notificación.');
    }

    await registrarEnvio(clienteRef, cliente, 'manual', restantes);
    return { ok: true, clienteId, diasRestantes: restantes };
  }
);

/* ── Utilidad de mantenimiento: recalcular fechas de vencimiento ───── */

/**
 * Callable: recalcula `fechaVencimiento` como fechaActivacion + 12 meses
 * y reinicia el historial de notificaciones (útil al renovar en lote).
 * Recibe opcionalmente { clienteIds: [...] }; sin argumentos procesa todos.
 */
exports.recalcularVencimientos = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Tu usuario no tiene permisos de administrador.');
    }

    const ids = (request.data && request.data.clienteIds) || null;
    const refs = ids
      ? ids.map((id) => db.collection(COLECCION_CLIENTES).doc(id))
      : (await db.collection(COLECCION_CLIENTES).get()).docs.map((d) => d.ref);

    let actualizados = 0;
    for (const ref of refs) {
      const doc = await ref.get();
      if (!doc.exists) continue;
      const data = doc.data();
      const activacion = aFecha(data.fechaActivacion) || new Date();
      const vencimiento = sumarMeses(activacion, MESES_SUSCRIPCION);

      await ref.update({
        fechaVencimiento: admin.firestore.Timestamp.fromDate(vencimiento),
        notificacionesEnviadas: [],
        estado: diasEntre(new Date(), vencimiento) <= DIAS_POR_VENCER ? 'por_vencer' : 'activo',
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
      });
      actualizados++;
    }

    logger.info('Vencimientos recalculados', { actualizados });
    return { ok: true, actualizados };
  }
);

/* Exportado para pruebas unitarias opcionales */
exports._internos = { diasEntre, sumarMeses, normalizarNotificaciones, aFecha, MESES_SUSCRIPCION };
