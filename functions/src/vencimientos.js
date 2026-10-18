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
}

module.exports = {
  procesarVencimientos,
  DIAS_ANTES,
  DIAS_POR_VENCER,
  DIAS_GRACIA,
  diasEntre,
  iso,
};
