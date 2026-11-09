/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/reglas-cotizacion.js
   KZ-CRM-007 · reglas de negocio de la cotización, sin dependencias

   Se aíslan aquí por dos razones:
     1. Las usan DOS sitios (el formulario y `escrituras-local.js`) y así no se
        pueden desincronizar.
     2. Al no importar Firebase, se pueden probar sin sesión ni base de datos:
        la prueba las ejecuta tal cual, no una copia.

   ORIGEN (8-nov-2026): se envió una cotización con Total $0 porque
   `normalizarItems` hace `Math.max(0, Math.round(Number(valor) || 0))` y nada
   comprobaba el resultado. El cliente recibió un documento con «Total $ 0» y,
   como la proyección pública se sobrescribe al reenviar, corregirlo costó un
   número de cotización.
   ═══════════════════════════════════════════════════════════════════════ */

export const MENSAJE_TOTAL_CERO =
  'El valor de la cotización no puede ser cero: escribe el valor de los conceptos antes de enviarla.';

/**
 * Comprueba si una cotización puede enviarse al cliente.
 * @param {number} subtotal  suma de (cantidad × valor unitario)
 * @param {number} total     subtotal − descuento
 * @returns {string|null}    null si puede enviarse; el mensaje de error si no
 */
export function revisarImportes(subtotal, total) {
  const t = Number(total);
  const s = Number(subtotal);
  if (!Number.isFinite(t) || t <= 0) return MENSAJE_TOTAL_CERO;
  if (!Number.isFinite(s) || s <= 0) return MENSAJE_TOTAL_CERO;
  return null;
}
