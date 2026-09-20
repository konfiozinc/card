/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/ui.js
   Utilidades de interfaz compartidas por todas las páginas del panel:
   formato de moneda y fechas, badges de estado, avisos (toast), diálogo
   de confirmación, tablas, exportación a CSV y campos de formulario.
   ═══════════════════════════════════════════════════════════════════ */

import { logout } from './shell.js';

const CFG = window.KZ_CONFIG || {};
const ETIQUETAS = CFG.etiquetasEstado || {};

/* ── Formato ───────────────────────────────────────────────────────── */

/** Formatea un número como pesos colombianos: 49900 → "$49.900". */
export function fmtCOP(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-CO');
}

/** Formatea "2026-09-16" o Timestamp como "16 sep 2026". */
export function fmtFecha(valor) {
  if (!valor) return '—';
  try {
    const d = valor.toDate ? valor.toDate() : new Date(String(valor).length === 10 ? valor + 'T00:00:00' : valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return String(valor); }
}

/** Convierte un Date a "YYYY-MM-DD". */
export function fechaISO(d) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dia = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${dia}`;
}

/** Suma meses a una fecha respetando el fin de mes. */
export function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return d;
}

/** Días que faltan para una fecha (negativo si ya pasó). */
export function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(String(fecha).length === 10 ? fecha + 'T00:00:00' : fecha);
  f.setHours(0, 0, 0, 0);
  return Math.round((f - hoy) / 86400000);
}

/** Escapa texto para insertarlo en HTML sin riesgo de inyección. */
export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Etiqueta legible de un estado. */
export function etiquetaEstado(estado) {
  return ETIQUETAS[estado] || estado || '—';
}

/* ── Componentes ───────────────────────────────────────────────────── */

/** Badge HTML según estado. Clase CSS: badge--activo, badge--pendiente_pago, … */
export function badgeEstado(estado) {
  const clave = String(estado || '').toLowerCase();
  return `<span class="badge badge--${esc(clave)}">${esc(etiquetaEstado(estado))}</span>`;
}

/** Cambia el título de la barra superior. */
export function setTitulo(t) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = t;
  document.title = t + ' — Panel KONFÍO ZINC';
}

/** Aviso flotante. tipo: 'ok' | 'error' | 'info' */
export function toast(mensaje, tipo) {
  let cont = document.getElementById('kz-toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'kz-toasts';
    cont.className = 'toasts';
    document.body.appendChild(cont);
  }
  const div = document.createElement('div');
  div.className = 'toast toast--' + (tipo || 'info');
  div.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  div.innerHTML = `<i class="fas ${tipo === 'ok' ? 'fa-circle-check' : tipo === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}" aria-hidden="true"></i><span>${esc(mensaje)}</span>`;
  cont.appendChild(div);
  setTimeout(() => { div.classList.add('is-out'); setTimeout(() => div.remove(), 300); }, tipo === 'error' ? 7000 : 4000);
}

/** Diálogo de confirmación. Devuelve Promise<boolean>. */
export function confirmar(mensaje, textoBoton) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal is-open';
    overlay.innerHTML = `
      <div class="modal__box" role="dialog" aria-modal="true">
        <div class="modal__body">
          <p class="modal__msg">${esc(mensaje)}</p>
        </div>
        <div class="modal__foot">
          <div class="modal__actions">
            <button class="btn btn--ghost" data-r="0" type="button">Cancelar</button>
            <button class="btn btn--primary" data-r="1" type="button">${esc(textoBoton || 'Confirmar')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cerrar = (v) => { overlay.remove(); resolve(v); };
    overlay.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-r]');
      if (b) cerrar(b.dataset.r === '1');
      else if (e.target === overlay) cerrar(false);
    });
    document.addEventListener('keydown', function esc_(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc_); cerrar(false); }
    });
    const primero = overlay.querySelector('button[data-r="1"]');
    if (primero) primero.focus();
  });
}

/* ── Tablas ────────────────────────────────────────────────────────── */

/**
 * Construye una tabla HTML.
 * @param {Array<{clave:string,titulo:string,ancho?:string,sortable?:boolean}>} columnas
 * @param {Array<object>} filas
 * @param {(fila:object)=>string} renderFila Devuelve las celdas <td>…</td>
 * @param {string} mensajeVacio
 */
export function tablaHTML(columnas, filas, renderFila, mensajeVacio) {
  if (!filas.length) {
    return `<p class="tabla__vacia">${esc(mensajeVacio || 'No hay registros que mostrar.')}</p>`;
  }
  const th = columnas.map((c) => {
    const attr = c.sortable ? ` class="is-sortable" data-sort="${esc(c.clave)}" tabindex="0" role="button"` : '';
    return `<th${attr}${c.ancho ? ` style="width:${esc(c.ancho)}"` : ''}>${esc(c.titulo)}</th>`;
  }).join('');
  const tr = filas.map((f) => `<tr data-id="${esc(f.id)}">${renderFila(f)}</tr>`).join('');
  return `<div class="tabla__wrap"><table class="tabla"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/**
 * Descarga un CSV compatible con Excel (separador ';' y BOM UTF-8).
 * @param {string} nombre nombre del archivo sin extensión
 * @param {Array<{clave:string,titulo:string}>} columnas
 * @param {Array<object>} filas
 */
export function descargarCSV(nombre, columnas, filas) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lineas = [columnas.map((c) => q(c.titulo)).join(';')];
  for (const f of filas) lineas.push(columnas.map((c) => q(f[c.clave])).join(';'));
  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}-${fechaISO(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── Formularios y estado de carga ─────────────────────────────────── */

/** Lee y limpia el valor de un campo por id. */
export function val(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

/** Marca un campo como inválido y devuelve false (para encadenar validaciones). */
export function marcarInvalido(id, mensaje) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('is-invalid');
    el.focus();
    el.addEventListener('input', () => el.classList.remove('is-invalid'), { once: true });
  }
  toast(mensaje || 'Revisa los campos marcados.', 'error');
  return false;
}

/** Bloquea un botón mientras dura una operación asíncrona. */
export async function conCarga(botonId, textoCarga, fn) {
  const b = document.getElementById(botonId);
  const original = b ? b.innerHTML : '';
  if (b) { b.disabled = true; b.innerHTML = `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ${esc(textoCarga || 'Procesando…')}`; }
  try {
    return await fn();
  } finally {
    if (b) { b.disabled = false; b.innerHTML = original; }
  }
}

/** Botón de cerrar sesión en cualquier página. */
export function wireLogout() {
  const b = document.getElementById('btn-logout-extra');
  if (b) b.addEventListener('click', logout);
}

/* ── Tarjetas de resumen (KPI) ─────────────────────────────────────── */

/** Dibuja una rejilla de KPIs. */
export function kpisHTML(items) {
  return `<div class="kpis">${items.map((k) => `
    <div class="kpi kpi--${esc(k.tono || 'neutro')}">
      <span class="kpi__label">${esc(k.label)}</span>
      <strong class="kpi__valor">${esc(k.valor)}</strong>
      ${k.nota ? `<span class="kpi__nota">${esc(k.nota)}</span>` : ''}
    </div>`).join('')}</div>`;
}
