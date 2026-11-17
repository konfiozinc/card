/* KZ-SEGUIMIENTO-001 · Cálculo del próximo contacto.
 *
 * Vive aparte de seguimiento.js a propósito: ese módulo importa Firebase desde
 * el CDN, así que no se puede cargar en Node para probarlo. Aquí no hay
 * dependencias: solo fechas. Las fechas de negocio son texto 'AAAA-MM-DD' en
 * hora local, el mismo criterio que clientes y servicios; `new Date('2026-11-20')`
 * se interpretaría como medianoche UTC y en Colombia restaría un día.
 */

export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en formato 'AAAA-MM-DD', hora local. */
export function hoyISO(ahora = new Date()) {
  return ahora.getFullYear() + '-'
    + String(ahora.getMonth() + 1).padStart(2, '0') + '-'
    + String(ahora.getDate()).padStart(2, '0');
}

/** Días de calendario que faltan hasta `fecha` (negativo = ya pasó). null si no hay fecha válida. */
export function diasPara(fecha, ahora = new Date()) {
  const f = String(fecha || '');
  if (!FECHA_ISO.test(f)) return null;
  const [a, m, d] = f.split('-').map(Number);
  const objetivo = new Date(a, m - 1, d);
  if (Number.isNaN(objetivo.getTime()) || objetivo.getMonth() !== m - 1) return null; // 2026-02-31
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.round((objetivo - hoy) / 86400000);
}

/** 'sin' | 'vencido' | 'hoy' | 'aldia' — lo que decide el badge y la alerta. */
export function estadoAgenda(fecha, ahora = new Date()) {
  const dias = diasPara(fecha, ahora);
  if (dias === null) return 'sin';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  return 'aldia';
}

/** Normaliza y valida antes de escribir. Cadena vacía = sin agendar.
 *  Lanza FECHA_INVALIDA o FECHA_FUERA_DE_RANGO (un año atrás … dos adelante). */
export function validarProxima(valor, ahora = new Date()) {
  const v = String(valor || '').trim();
  if (!v) return '';
  if (!FECHA_ISO.test(v)) throw new Error('FECHA_INVALIDA');
  const dias = diasPara(v, ahora);
  if (dias === null) throw new Error('FECHA_INVALIDA');
  if (dias < -365 || dias > 730) throw new Error('FECHA_FUERA_DE_RANGO');
  return v;
}
