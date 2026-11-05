/* ── cotizaciones.js · lista y gestión (KZ-CRM-COTIZACIONES-002) ──────
   Crear y enviar: OPERADOR y ADMIN. Reabrir/anular: solo ADMIN (lo imponen
   las reglas; aquí solo se oculta el botón y se avisa antes).

   Spark no tiene procesos en segundo plano, así que la respuesta que el
   cliente da en el enlace público se trae al registro interno al abrir esta
   página (igual que Vencimientos deriva el estado al cargar). */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc, fmtCOP, confirmar, conCarga } from '../assets/js/admin/ui.js';
import { cargarCotizaciones, cargarContactos, etiquetaCotizacion, escrituras } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('cotizaciones');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Cotizaciones');
const cont = document.getElementById('app-content');
const esAdmin = ['ADMIN', 'SUPERADMIN'].includes(sesion.rol);

let cotizaciones = [];
let contactos = [];
const filtro = { texto: '', estado: 'TODOS' };

/** Enlace público de una cotización, sea cual sea la carpeta donde esté publicada. */
function enlacePublico(token) {
  if (!token) return '';
  const base = location.pathname.split('/admin/')[0] || '';
  return `${location.origin}${base}/cotizacion.html?id=${token}`;
}

const badge = (estado) => {
  const clase = { BORRADOR: 'inactivo', ENVIADA: 'pendiente', ACEPTADA: 'activo', RECHAZADA: 'suspendido' }[estado] || 'inactivo';
  return `<span class="badge badge--${clase}">${esc(etiquetaCotizacion(estado))}</span>`;
};

const vigente = (c) => c.estado === 'ENVIADA' || c.estado === 'BORRADOR';

function pintar() {
  const txt = filtro.texto.trim().toLowerCase();
  const visibles = cotizaciones.filter((c) => {
    if (filtro.estado !== 'TODOS' && c.estado !== filtro.estado) return false;
    if (!txt) return true;
    return `${c.numero || ''} ${c.prospectoNombre || ''} ${c.prospectoTelefono || ''}`.toLowerCase().includes(txt);
  });

  const filas = visibles.map((c) => {
    const acciones = [];
    acciones.push(`<button class="btn btn--ghost accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="ver" data-id="${esc(c.id)}"><i class="fas fa-eye"></i> Ver</button>`);
    if (c.estado === 'BORRADOR') {
      acciones.push(`<button class="btn btn--ghost accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="editar" data-id="${esc(c.id)}"><i class="fas fa-pen"></i> Editar</button>`);
      acciones.push(`<button class="btn btn--primary accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="enviar" data-id="${esc(c.id)}"><i class="fas fa-paper-plane"></i> Enviar</button>`);
    }
    if (c.estado === 'ENVIADA') {
      acciones.push(`<button class="btn btn--ghost accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="aceptar" data-id="${esc(c.id)}"><i class="fas fa-check"></i> Aceptada</button>`);
      acciones.push(`<button class="btn btn--ghost accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="rechazar" data-id="${esc(c.id)}"><i class="fas fa-xmark"></i> Rechazada</button>`);
    }
    if (c.estado === 'ACEPTADA' && !c.clienteId) {
      acciones.push(`<button class="btn btn--primary accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="convertir" data-id="${esc(c.id)}"><i class="fas fa-user-check"></i> Convertir en cliente</button>`);
    }
    if (esAdmin && !vigente(c)) {
      acciones.push(`<button class="btn btn--ghost accion" style="font-size:.74rem;padding:.3rem .6rem" data-accion="reabrir" data-id="${esc(c.id)}"><i class="fas fa-rotate-left"></i> Reabrir</button>`);
    }
    return `<tr data-id="${esc(c.id)}">
      <td><span class="celda-suave" style="font-family:ui-monospace,monospace">${esc(c.numero || '—')}</span></td>
      <td><b>${esc(c.prospectoNombre || '(sin nombre)')}</b><br><span class="celda-suave">${esc(c.prospectoTelefono || '')}</span></td>
      <td class="celda-suave">${esc(c.validaHasta || '—')}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${c.descuento ? `<span class="celda-suave" style="display:block;font-size:.7rem">− ${esc(fmtCOP(c.descuento))}</span>` : ''}<b>${esc(fmtCOP(c.total))}</b></td>
      <td>${badge(c.estado)}</td>
      <td><div class="acciones-fila">${acciones.join('')}</div></td>
    </tr>`;
  }).join('');

  const conteo = {
    BORRADOR: cotizaciones.filter((c) => c.estado === 'BORRADOR').length,
    ENVIADA: cotizaciones.filter((c) => c.estado === 'ENVIADA').length,
    ACEPTADA: cotizaciones.filter((c) => c.estado === 'ACEPTADA').length,
    RECHAZADA: cotizaciones.filter((c) => c.estado === 'RECHAZADA').length,
  };

  cont.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Cotizaciones</h2>
        <p class="celda-suave">${conteo.BORRADOR} borrador(es) · ${conteo.ENVIADA} enviada(s) ·
          ${conteo.ACEPTADA} aceptada(s) · ${conteo.RECHAZADA} rechazada(s)</p>
      </div>
      <div style="display:flex;gap:.5rem">
        <a class="btn btn--primary" href="cotizacion-nueva.html"><i class="fas fa-plus"></i> Nueva cotización</a>
      </div>
    </div>

    <div class="card" style="padding:1rem 1.3rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:end">
      <div class="campo" style="margin:0;flex:1 1 240px"><label>Buscar</label>
        <input id="f-texto" type="search" placeholder="Número, prospecto o teléfono" value="${esc(filtro.texto)}"></div>
      <div class="campo" style="margin:0;flex:0 0 190px"><label>Estado</label>
        <select id="f-estado">
          <option value="TODOS">Todos</option>
          ${['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA'].map((e) => `<option value="${e}" ${filtro.estado === e ? 'selected' : ''}>${esc(etiquetaCotizacion(e))}</option>`).join('')}
        </select></div>
      <span class="celda-suave" style="padding-bottom:.55rem">${visibles.length} de ${cotizaciones.length}</span>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      ${visibles.length === 0
        ? `<p class="tabla__vacia" style="padding:2rem 1.3rem">Todavía no hay cotizaciones. Crea la primera con el botón de arriba,
             o desde <a href="contactos.html">Contactos</a> con el botón <b>Cotizar</b>.</p>`
        : `<div class="tabla__wrap" style="overflow-x:auto"><table class="tabla" style="min-width:880px">
            <thead><tr><th>Número</th><th>Prospecto</th><th>Válida hasta</th><th style="text-align:right">Total</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${filas}</tbody></table></div>`}
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('f-texto')?.addEventListener('input', (e) => { filtro.texto = e.target.value; pintar(); });
  $('f-estado')?.addEventListener('change', (e) => { filtro.estado = e.target.value; pintar(); });
  cont.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => accion(b.dataset.accion, b.dataset.id)));
}

async function recargar() {
  cotizaciones = await cargarCotizaciones();
}

async function accion(nombre, id) {
  const c = cotizaciones.find((x) => x.id === id);
  if (!c) return;
  try {
    if (nombre === 'ver') { await verCotizacion(c); return; }
    if (nombre === 'editar') { location.href = `cotizacion-nueva.html?id=${encodeURIComponent(id)}`; return; }

    if (nombre === 'enviar') {
      await conCarga(null, '', async () => {
        const r = await escrituras.enviarCotizacion(id);
        await recargar(); pintar();
        await verCotizacion(cotizaciones.find((x) => x.id === id) || c, { recienEnviada: true, numero: r.numero });
      });
      return;
    }
    if (nombre === 'aceptar' || nombre === 'rechazar') {
      const ok = await confirmar(nombre === 'aceptar' ? '¿Marcar esta cotización como ACEPTADA?' : '¿Marcar como RECHAZADA?');
      if (!ok) return;
      await escrituras.responderCotizacion(id, nombre === 'aceptar' ? 'ACEPTADA' : 'RECHAZADA', '');
      toast('Cotización actualizada', 'ok');
      await recargar(); pintar(); return;
    }
    if (nombre === 'reabrir') {
      const ok = await confirmar('Reabrir deja la cotización en BORRADOR para poder cambiarla. ¿Continuar?');
      if (!ok) return;
      await escrituras.actualizarCotizacion(id, { ...c, estado: 'BORRADOR' });
      toast('Cotización reabierta', 'ok');
      await recargar(); pintar(); return;
    }
    if (nombre === 'convertir') {
      const ok = await confirmar(`Se creará un cliente con el total de ${fmtCOP(c.total)}. ¿Continuar?`);
      if (!ok) return;
      const r = await escrituras.convertirCotizacionEnCliente(id);
      toast('Cliente creado: ' + r.id, 'ok');
      await recargar(); pintar(); return;
    }
  } catch (e) {
    toast(e.message || 'No se pudo completar la acción', 'error');
  }
}

/** Ficha de la cotización: datos, enlace público y mensaje para WhatsApp. */
async function verCotizacion(c, opciones = {}) {
  const enlace = enlacePublico(c.token);
  const wa = c.prospectoTelefono
    ? `https://wa.me/57${c.prospectoTelefono}?text=${encodeURIComponent(
        `Hola ${c.prospectoNombre}. Te dejo la cotización ${c.numero || ''} de KONFÍO ZINC: ${fmtCOP(c.total)}. ` +
        (enlace ? `Puedes verla y aceptarla aquí: ${enlace}` : ''))}`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal is-open';
  overlay.innerHTML = `
    <div class="modal__box" role="dialog" aria-modal="true" style="max-width:640px">
      <div class="modal__body">
        <h3 style="margin:0 0 .3rem">${esc(c.numero || 'Borrador')} · ${esc(c.prospectoNombre || '')}</h3>
        <p class="celda-suave" style="margin:0 0 1rem">${esc(etiquetaCotizacion(c.estado))} · válida hasta ${esc(c.validaHasta || '—')}</p>
        <table class="tabla" style="min-width:0">
          <thead><tr><th>Concepto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Valor</th><th style="text-align:right">Subtotal</th></tr></thead>
          <tbody>${(c.items || []).map((i) => `<tr>
            <td>${esc(i.concepto)}${i.detalle ? `<br><span class="celda-suave">${esc(i.detalle)}</span>` : ''}</td>
            <td style="text-align:right">${i.cantidad}</td>
            <td style="text-align:right">${esc(fmtCOP(i.valorUnitario))}</td>
            <td style="text-align:right">${esc(fmtCOP(i.subtotal))}</td></tr>`).join('')}</tbody>
        </table>
        <div style="margin-left:auto;width:260px;margin-top:.6rem">
          <div style="display:flex;justify-content:space-between"><span class="celda-suave">Subtotal</span><span>${esc(fmtCOP(c.subtotal))}</span></div>
          <div style="display:flex;justify-content:space-between"><span class="celda-suave">Descuento</span><span>− ${esc(fmtCOP(c.descuento))}</span></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:.3rem;padding-top:.4rem"><b>Total</b><b>${esc(fmtCOP(c.total))}</b></div>
        </div>
        ${enlace ? `<div class="campo" style="margin-top:1rem"><label>Enlace para el cliente</label>
           <input id="cot-enlace" readonly value="${esc(enlace)}">
           <span class="campo__nota">Se abre sin contraseña. Cualquiera con este enlace puede verla y responder.</span></div>` : ''}
      </div>
      <div class="modal__foot"><div class="modal__actions">
        ${enlace ? `<button class="btn btn--ghost" data-r="copiar" type="button"><i class="fas fa-copy"></i> Copiar enlace</button>` : ''}
        ${wa ? `<a class="btn btn--primary" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Enviar por WhatsApp</a>` : ''}
        <button class="btn btn--ghost" data-r="0" type="button">Cerrar</button>
      </div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]');
    if (b && b.dataset.r === 'copiar') {
      navigator.clipboard?.writeText(enlace).then(() => toast('Enlace copiado', 'ok')).catch(() => {});
      return;
    }
    if (b || e.target === overlay) overlay.remove();
  });
  if (opciones.recienEnviada) toast('Cotización enviada: ' + (opciones.numero || ''), 'ok');
}

/* ── Arranque ─────────────────────────────────────────────────────────── */
await recargar();

/* Traer las respuestas dadas desde el enlace público (máx. 20 para no alargar). */
const pendientes = cotizaciones.filter((c) => c.estado === 'ENVIADA' && c.token).slice(0, 20);
let sincronizadas = 0;
for (const c of pendientes) {
  try {
    const r = await escrituras.sincronizarRespuestaCotizacion(c.id);
    if (r.sincronizada) sincronizadas++;
  } catch { /* si falla, la lista se muestra igual */ }
}
if (sincronizadas > 0) {
  await recargar();
  toast(`${sincronizadas} respuesta(s) del cliente traídas al panel`, 'ok');
}

try { contactos = await cargarContactos(); } catch { contactos = []; }
pintar();
