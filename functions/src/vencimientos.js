/* ═══════════════════════════════════════════════════════════════════
   vencimientos.js · KONFÍO ZINC — CARD
   MOTOR DE VENCIMIENTOS, separado de su programación.

   Vive aparte de index.js por una razón concreta: la función programada
   (onSchedule) no se puede disparar desde el emulador en este entorno, así
   que tener la lógica aquí permite probarla de verdad (fechas, avisos,
   idempotencia, duplicados y fallos parciales) sin depender del disparador.
   La programación sigue en index.js, que solo delega en esta función.

   El cuerpo es EXACTAMENTE el que tenía processDueDates: se extrajo del
   archivo original para no cambiar comportamiento.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const DIAS_ANTES = [10, 5, 3, 1];
const DIAS_POR_VENCER = 15;
const DIAS_GRACIA = 5;

/* Reintentos de un aviso.
   Estados de notificaciones/{clave}:
     PENDIENTE · se volverá a intentar (dentro de la pasada o en la siguiente)
     ENVIADA   · éxito; nunca se repite (idempotencia por clave)
     ERROR     · sin tokens activos: no hay a quién enviar, terminal
     FALLIDA   · agotó los intentos: requiere revisión humana
   El tope es total entre ejecuciones, no por pasada. */
const MAX_INTENTOS = 5;
const INTENTOS_POR_EJECUCION = 3;
const ESPERA_ENTRE_INTENTOS_MS = 200;

/**
 * Crea el aviso si no existe y lo intenta enviar, con reintentos acotados.
 * Es idempotente: la clave `cliente_fecha_tipo` impide duplicados y un aviso
 * ya ENVIADA no se vuelve a mandar.
 */
async function procesarAviso(deps) {
  const { db, FieldValue, pushACliente, logger, aviso } = deps;
  const ref = db.doc(`notificaciones/${aviso.clave}`);

  let datos;
  try {
    await ref.create(aviso.registro);
    datos = aviso.registro;
  } catch (e) {
    const snap = await ref.get();
    if (!snap.exists) throw e;          /* error real de escritura, no un duplicado */
    datos = snap.data();                 /* ya existía: anti-duplicado */
  }

  if (datos.estado === 'ENVIADA') return { enviada: false, motivo: 'ya enviada' };
  if (datos.estado === 'ERROR') return { enviada: false, motivo: 'sin tokens' };

  let intentos = Number(datos.intentos) || 0;
  if (intentos >= MAX_INTENTOS) {
    if (datos.estado !== 'FALLIDA') {
      await ref.update({ estado: 'FALLIDA', updatedAt: FieldValue.serverTimestamp() });
    }
    return { enviada: false, motivo: 'agotado' };
  }

  for (let i = 0; i < INTENTOS_POR_EJECUCION && intentos < MAX_INTENTOS; i++) {
    intentos++;
    try {
      const enviados = await pushACliente(aviso.clienteId, aviso.tipo);
      if (enviados > 0) {
        await ref.update({
          estado: 'ENVIADA', intentos, ultimoError: null,
          fechaEnvio: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        return { enviada: true, intentos };
      }
      /* Sin tokens: no es un fallo transitorio, no tiene sentido reintentar. */
      await ref.update({
        estado: 'ERROR', intentos, ultimoError: 'Sin tokens activos',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { enviada: false, motivo: 'sin tokens' };
    } catch (e) {
      const mensaje = (e && e.message) || 'error desconocido';
      const agotado = intentos >= MAX_INTENTOS;
      /* El fallo queda escrito: estado, nº de intento y el último error. */
      await ref.update({
        estado: agotado ? 'FALLIDA' : 'PENDIENTE',
        intentos,
        ultimoError: mensaje,
        ultimoIntentoEn: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.error('aviso fallido', { clave: aviso.clave, intento: intentos, error: mensaje });
      if (agotado) return { enviada: false, motivo: 'agotado', intentos };
      if (i + 1 < INTENTOS_POR_EJECUCION) {
        await new Promise((ok) => setTimeout(ok, ESPERA_ENTRE_INTENTOS_MS));
      }
    }
  }
  return { enviada: false, motivo: 'reintentando', intentos };
}

const aFecha = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const iso = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dia = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${dia}`;
};
const diasEntre = (desde, hasta) => Math.round((aFecha(hasta) - aFecha(desde)) / 86400000);

/**
 * Recorre los clientes activos y aplica el ciclo de vencimientos.
 * @param {object} deps  { db, FieldValue, pushACliente, logger, mensajes, hoy }
 * @returns {Promise<{revisados:number,avisados:number,suspendidos:number,porVencer:number,vencidos:number}>}
 */
async function procesarVencimientos(deps) {
  const { db, FieldValue, pushACliente, logger, mensajes } = deps;
  const MENSAJES = mensajes || {};
  const hoy = deps.hoy || new Date();

    let avisados = 0, suspendidos = 0, porVencer = 0, vencidos = 0, fallidos = 0;

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

      /* 3. Avisos 10/5/3/1 día: con reintentos acotados y estado final */
      if (DIAS_ANTES.includes(dias)) {
        const tipo = `VENCIMIENTO_${dias}D`;
        const clave = `${c.id}_${d.fechaVencimiento}_${tipo}`;
        try {
          const r = await procesarAviso({
            db, FieldValue, pushACliente, logger,
            aviso: {
              clave, clienteId: c.id, tipo,
              registro: {
                clienteId: c.id, tipo, mensaje: MENSAJES[tipo].body,
                estado: 'PENDIENTE', intentos: 0, ultimoError: null,
                periodoServicio: d.fechaVencimiento,
                fechaProgramada: FieldValue.serverTimestamp(),
              },
            },
          });
          if (r.enviada) avisados++;
          else if (r.motivo === 'agotado' || r.motivo === 'reintentando') fallidos++;
        } catch (e) {
          /* Un aviso que falla no debe abortar el resto de la pasada. */
          fallidos++;
          logger.error('aviso no procesado', { cliente: c.id, error: (e && e.message) || 'error' });
        }
      }
    }

    const resumen = { revisados: clientes.size, avisados, fallidos, suspendidos, porVencer, vencidos };
    logger.info('processDueDates', resumen);
    return resumen;
}

module.exports = {
  procesarVencimientos,
  DIAS_ANTES,
  DIAS_POR_VENCER,
  DIAS_GRACIA,
  diasEntre,
  iso,
};
