/* ── cotizaciones.js · lista y gestión (KZ-CRM-COTIZACIONES-002/004) ──
   Crear y enviar: OPERADOR y ADMIN. Reabrir/anular: solo ADMIN (lo imponen
   las reglas; aquí solo se oculta el botón y se avisa antes).

   KZ-CRM-COTIZACIONES-004 · TIEMPO REAL
   Antes la página leía una vez y había que pulsar F5 para ver si el cliente
   había respondido. Ahora se escuchan dos colecciones con `onSnapshot`:
     · `cotizaciones`          → el registro interno (lo que pinta la tabla)
     · `cotizaciones_publicas` → la proyección que el cliente modifica al
                                 aceptar o rechazar en su enlace
   Cuando el cliente responde, el segundo aviso trae la respuesta al registro
   interno y el primero repinta la fila al instante, con un aviso flotante.
   Sin recargar nada. */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc, fmtCOP, confirmar } from '../assets/js/admin/ui.js';
import { db } from '../assets/js/admin/core.js';
import { collection, onSnapshot } from 'firebase/firestore';
import { cargarCotizaciones, etiquetaCotizacion, escrituras } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('cotizaciones');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Cotizaciones');
const cont = document.getElementById('app-content');
const esAdmin = ['ADMIN', 'SUPERADMIN'].includes(sesion.rol);

let cotizaciones = [];
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

/* ── Botones de la columna de acciones ────────────────────────────────
   KZ-CRM-COTIZACIONES-004: van con texto, no solo icono, y con la clase
   `acciones-fila--texto` para que no hereden el 30x30 px del resto del panel
   (con ese ancho el texto se desbordaba encima del botón vecino). */
const boton = (accion, id, icono, texto, primario = false) =>
  `<button type="button" class="${primario ? 'is-primario' : ''}" data-accion="${accion}" data-id="${esc(id)}" title="${esc(texto)}">
     <i class="fas ${icono}" aria-hidden="true"></i><span>${esc(texto)}</span>
   </button>`;

function accionesDe(c) {
  const b = [];
  b.push(boton('ver', c.id, 'fa-eye', 'Ver'));
  if (c.estado === 'BORRADOR') {
    b.push(boton('editar', c.id, 'fa-pen', 'Editar'));
    b.push(boton('enviar', c.id, 'fa-paper-plane', 'Enviar', true));
  }
  if (c.estado === 'ENVIADA') {
    b.push(boton('aceptar', c.id, 'fa-check', 'Aceptada'));
    b.push(boton('rechazar', c.id, 'fa-xmark', 'Rechazada'));
  }
  if (c.estado === 'ACEPTADA' && !c.clienteId) {
    b.push(boton('convertir', c.id, 'fa-user-check', 'Convertir en cliente', true));
  }
  if (esAdmin && !['ENVIADA', 'BORRADOR'].includes(c.estado)) {
    b.push(boton('reabrir', c.id, 'fa-rotate-left', 'Reabrir'));
  }
  return b.join('');
}

function pintar() {
  /* Al repintar en tiempo real no se debe perder el foco del buscador. */
  const focoId = document.activeElement && document.activeElement.id;
  const caret = focoId === 'f-texto' ? document.activeElement.selectionStart : null;

  const txt = filtro.texto.trim().toLowerCase();
  const visibles = cotizaciones.filter((c) => {
    if (filtro.estado !== 'TODOS' && c.estado !== filtro.estado) return false;
    if (!txt) return true;
    return `${c.numero || ''} ${c.prospectoNombre || ''} ${c.prospectoTelefono || ''}`.toLowerCase().includes(txt);
  });

  const filas = visibles.map((c) => `<tr data-id="${esc(c.id)}">
      <td><span class="celda-suave" style="font-family:ui-monospace,monospace">${esc(c.numero || '—')}</span></td>
      <td><b>${esc(c.prospectoNombre || '(sin nombre)')}</b><br><span class="celda-suave">${esc(c.prospectoTelefono || '')}</span></td>
      <td class="celda-suave">${esc(c.validaHasta || '—')}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${c.descuento ? `<span class="celda-suave" style="display:block;font-size:.7rem">− ${esc(fmtCOP(c.descuento))}</span>` : ''}<b>${esc(fmtCOP(c.total))}</b></td>
      <td>${badge(c.estado)}</td>
      <td class="col-acciones"><div class="acciones-fila acciones-fila--texto">${accionesDe(c)}</div></td>
    </tr>`).join('');

  const conteo = {
    BORRADOR: cotizaciones.filter((c) => c.estado === 'BORRADOR').length,
    ENVIADA: cotizaciones.filter((c) => c.estado === 'ENVIADA').length,
    ACEPTADA: cotizaciones.filter((c) => c.estado === 'ACEPTADA').length,
    RECHAZADA: cotizaciones.filter((c) => c.estado === 'RECHAZADA').length,
  };

  cont.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Cotizaciones <span class="badge badge--activo" id="vivo" title="La tabla se actualiza sola"><i class="fas fa-circle" style="font-size:.5rem"></i> en vivo</span></h2>
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
        : `<div class="tabla__wrap" style="overflow-x:auto"><table class="tabla" style="min-width:900px">
            <thead><tr><th>Número</th><th>Prospecto</th><th>Válida hasta</th><th style="text-align:right">Total</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${filas}</tbody></table></div>`}
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('f-texto')?.addEventListener('input', (e) => { filtro.texto = e.target.value; pintar(); });
  $('f-estado')?.addEventListener('change', (e) => { filtro.estado = e.target.value; pintar(); });
  cont.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => accion(b.dataset.accion, b.dataset.id)));

  if (focoId === 'f-texto' && $('f-texto')) {
    const el = $('f-texto');
    el.focus();
    if (caret !== null) el.setSelectionRange(caret, caret);
  }
}

/* ── Tiempo real ─────────────────────────────────────────────────────── */
const respuestasVistas = new Set(); // tokens cuya respuesta ya se procesó
let primeraFotoPublicas = true;

function arrancarTiempoReal() {
  /* 1 · El registro interno: repinta la tabla al instante. */
  onSnapshot(collection(db, 'cotizaciones'), (snap) => {
    cotizaciones = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ms = (v) => (v && v.toDate ? v.toDate().getTime() : 0);
        return ms(b.creadoEn) - ms(a.creadoEn);
      });
    pintar();
  }, (e) => {
    console.warn('[cotizaciones] no se pudo escuchar la colección:', e.code || e.message);
  });

  /* 2 · La proyección pública: aquí escribe el cliente cuando responde. */
  onSnapshot(collection(db, 'cotizaciones_publicas'), (snap) => {
    const primeras = primeraFotoPublicas;
    primeraFotoPublicas = false;
    snap.docs.forEach(async (d) => {
      const p = d.data();
      if (!['ACEPTADA', 'RECHAZADA'].includes(p.estado)) return;
      if (respuestasVistas.has(d.id)) return;
      respuestasVistas.add(d.id);
      const cot = cotizaciones.find((c) => c.id === p.cotizacionId);
      /* Solo interesa si el registro interno aún no lo sabe. */
      if (!cot || cot.estado !== 'ENVIADA') return;
      try {
        const r = await escrituras.sincronizarRespuestaCotizacion(p.cotizacionId);
        if (r.sincronizada) {
          /* El aviso se muestra salvo en la primera foto (respuestas antiguas). */
          if (!primeras) {
            toast(`Cotización ${cot.numero || ''} actualizada por el cliente: ${etiquetaCotizacion(p.estado)}`, 'ok');
          }
        }
      } catch (e) {
        console.warn('[cotizaciones] no se pudo traer la respuesta:', e.message);
      }
    });
  }, (e) => {
    console.warn('[cotizaciones] no se pudo escuchar las públicas:', e.code || e.message);
  });
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
      const r = await escrituras.enviarCotizacion(id);
      await recargar(); pintar();
      await verCotizacion(cotizaciones.find((x) => x.id === id) || c, { recienEnviada: true, numero: r.numero });
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

/* ── Arranque ────────────────────────────────────────────────────────── */
await recargar();
pintar();
arrancarTiempoReal();
