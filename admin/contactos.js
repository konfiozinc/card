/* ── contactos.js · leads del sitio y su seguimiento comercial (KZ-OPS-001) ──
   El lead lo escribe el Worker de captación (`/leads`) con cuenta de servicio;
   el navegador NO puede crearlos ni reescribir sus datos de origen: nombre,
   teléfono, correo, mensaje, servicio y fecha de recepción son inmutables por
   regla de Firestore. Lo que el panel gestiona es el SEGUIMIENTO: estado
   comercial, notas con historial y la conversión a cliente, que siempre es un
   acto explícito, nunca automático. */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, esc, descargarCSV, badgeEstado } from '../assets/js/admin/ui.js';
import { cargarContactos, escrituras, CFG } from '../assets/js/admin/datos.js';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../assets/js/admin/core.js';

const sesion = await requireAuth('contactos');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Contactos');
const cont = document.getElementById('app-content');
const esAdmin = canAccess(sesion.rol, 'ADMIN');

const ESTADOS = ['NUEVO', 'CONTACTADO', 'ATENDIDO', 'DESCARTADO', 'CONVERTIDO'];
const ETIQUETA_ESTADO = {
  NUEVO: 'Nuevo', CONTACTADO: 'Contactado', ATENDIDO: 'Atendido',
  DESCARTADO: 'Descartado', CONVERTIDO: 'Convertido en cliente'
};

let contactos = [];
let filtros = { q: '', estado: '' };

const estadoDe = (c) => (ESTADOS.includes(c.estado) ? c.estado : 'NUEVO');

function fecha(c) {
  const v = c.createdAt;
  if (!v) return '—';
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d) ? '—' : d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return '—'; }
}

function badge(estado) {
  if (estado === 'NUEVO') {
    return '<span style="background:rgba(240,180,41,.15);color:#F0B429;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;">Nuevo</span>';
  }
  return badgeEstado(estado);
}

function seguimientoDe(c) {
  return Array.isArray(c.seguimiento) ? c.seguimiento : [];
}

function pintar() {
  const f = contactos.filter((c) => {
    const est = estadoDe(c);
    if (filtros.estado && est !== filtros.estado) return false;
    if (filtros.q) {
      const bolsa = [c.nombre, c.email, c.telefono, c.servicio, c.mensaje, c.nota]
        .join(' ').toLowerCase();
      if (!bolsa.includes(filtros.q.toLowerCase())) return false;
    }
    return true;
  });

  const filas = f.map((c) => {
    const est = estadoDe(c);
    const seg = seguimientoDe(c);
    const ultima = seg.length ? seg[seg.length - 1] : null;
    return `<tr data-id="${esc(c.id)}">
      <td class="celda-suave">${esc(fecha(c))}</td>
      <td><div class="celda-fuerte">${esc(c.nombre || '—')}</div></td>
      <td><div class="celda-suave">${esc(c.telefono || '—')}</div><div class="celda-suave">${esc(c.email || '—')}</div></td>
      <td>${esc(c.servicio || '—')}</td>
      <td><div class="celda-suave" style="max-width:240px;">${esc(c.mensaje || '—')}</div></td>
      <td>${badge(est)}${c.clienteId ? `<div class="celda-suave">cliente ${esc(c.clienteId)}</div>` : ''}
        ${ultima ? `<div class="celda-suave">${esc(String(ultima.nota || '').slice(0, 60))}</div>` : ''}</td>
      <td><div class="acciones-fila">
        <button data-a="detalle" title="Ver seguimiento" aria-label="Ver seguimiento"><i class="fas fa-eye" aria-hidden="true"></i></button>
        <button data-a="whatsapp" title="Abrir WhatsApp" aria-label="Abrir WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></button>
        <button data-a="seguimiento" title="Añadir seguimiento" aria-label="Añadir seguimiento"><i class="fas fa-note-sticky" aria-hidden="true"></i></button>
        ${est !== 'CONVERTIDO' && !c.clienteId ? `<button data-a="convertir" title="Convertir en cliente" aria-label="Convertir en cliente"><i class="fas fa-user-plus" aria-hidden="true"></i></button>` : ''}
        ${esAdmin ? `<button data-a="eliminar" title="Eliminar" aria-label="Eliminar"><i class="fas fa-trash" aria-hidden="true"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');

  const conteo = ESTADOS.map((e) => `${contactos.filter((c) => estadoDe(c) === e).length} ${ETIQUETA_ESTADO[e].toLowerCase()}`).join(' · ');

  cont.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Contactos</h2>
        <p class="celda-suave">${contactos.length} en base · ${f.length} mostrados</p>
        <p class="celda-suave">${esc(conteo)}</p>
      </div>
      <div class="page-head__acciones">
        <button class="btn btn--ghost" id="btn-csv"><i class="fas fa-file-csv" aria-hidden="true"></i> Exportar</button>
      </div>
    </div>

    <div class="filtros">
      <div class="campo"><label for="f-q">Buscar</label><input id="f-q" type="search" placeholder="Nombre, email, teléfono, servicio o mensaje" value="${esc(filtros.q)}"></div>
      <div class="campo"><label for="f-estado">Estado</label><select id="f-estado">
        <option value="">Todos</option>
        ${ESTADOS.map((e) => `<option value="${e}" ${filtros.estado === e ? 'selected' : ''}>${esc(ETIQUETA_ESTADO[e])}</option>`).join('')}
      </select></div>
    </div>

    <div class="tabla__wrap">
      <table class="tabla"><thead><tr>
        <th>Recibido</th><th>Nombre</th><th>Contacto</th><th>Servicio</th><th>Mensaje</th><th>Estado</th><th>Acciones</th>
      </tr></thead><tbody>${filas || ''}</tbody></table>
      ${f.length ? '' : '<p class="tabla__vacia">No hay contactos que coincidan. Cuando alguien envíe el formulario del sitio, aparecerán aquí.</p>'}
    </div>`;

  document.getElementById('f-q').addEventListener('input', (e) => { filtros.q = e.target.value; pintar(); });
  document.getElementById('f-estado').addEventListener('change', (e) => { filtros.estado = e.target.value; pintar(); });
  document.getElementById('btn-csv').addEventListener('click', exportar);
  cont.querySelector('tbody').addEventListener('click', manejarAccion);
}

function caja(titulo, cuerpo, submitTexto) {
  const modal = document.getElementById('modal-contacto');
  modal.querySelector('.modal__box').innerHTML = `
    <div class="modal__head">
      <h3>${esc(titulo)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    ${cuerpo}
    <div class="modal__foot"><div class="modal__actions">
      <button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
      ${submitTexto ? `<button type="submit" form="ct-form" class="btn btn--primary">${esc(submitTexto)}</button>` : ''}
    </div></div>`;
  modal.classList.add('is-open');
  modal.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => modal.classList.remove('is-open')));
  return modal;
}

function verDetalle(c) {
  const seg = seguimientoDe(c);
  caja('Seguimiento — ' + (c.nombre || 'contacto'), `
    <div class="modal__body">
      <dl class="detalle">
        <div class="detalle__fila"><dt>Recibido</dt><dd>${esc(fecha(c))}</dd></div>
        <div class="detalle__fila"><dt>Contacto</dt><dd>${esc(c.telefono || '—')} · ${esc(c.email || '—')}</dd></div>
        <div class="detalle__fila"><dt>Servicio pedido</dt><dd>${esc(c.servicio || '—')}</dd></div>
        <div class="detalle__fila"><dt>Mensaje</dt><dd>${esc(c.mensaje || '—')}</dd></div>
        <div class="detalle__fila"><dt>Estado</dt><dd>${badge(estadoDe(c))}</dd></div>
        ${c.clienteId ? `<div class="detalle__fila"><dt>Cliente</dt><dd><a href="clientes.html">${esc(c.clienteId)}</a></dd></div>` : ''}
      </dl>
      <h4>Historial de atención (${seg.length})</h4>
      ${seg.length
        ? seg.map((s) => `<div class="celda-suave">${esc(String(s.fecha || '').slice(0, 16).replace('T', ' '))} — ${esc(s.nota || '')} <em>(${esc(s.usuario || '—')})</em></div>`).join('')
        : '<p class="celda-suave">Sin gestiones registradas todavía.</p>'}
    </div>`, null);
}

function abrirSeguimiento(c) {
  caja('Añadir seguimiento — ' + (c.nombre || 'contacto'), `
    <form id="ct-form" class="modal__body">
      <div class="campo"><label for="ct-nota">Nota *</label>
        <textarea id="ct-nota" rows="3" maxlength="500" placeholder="Llamada, respuesta, acuerdo, próximo paso…" required></textarea></div>
      <div class="campo"><label for="ct-estado">Dejar el estado en</label>
        <select id="ct-estado">
          ${ESTADOS.filter((e) => e !== 'CONVERTIDO').map((e) => `<option value="${e}" ${e === estadoDe(c) ? 'selected' : ''}>${esc(ETIQUETA_ESTADO[e])}</option>`).join('')}
        </select></div>
      <div class="aviso aviso--error" id="ct-error" hidden></div>
    </form>`, 'Guardar seguimiento');

  const err = document.getElementById('ct-error');
  document.getElementById('ct-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const nota = document.getElementById('ct-nota').value.trim();
    const estado = document.getElementById('ct-estado').value;
    if (!nota) { err.textContent = 'La nota no puede estar vacía.'; err.hidden = false; return; }
    try {
      await escrituras.agregarSeguimientoContacto(c.id, nota, estado);
      document.getElementById('modal-contacto').classList.remove('is-open');
      toast('Seguimiento guardado');
      await recargar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function abrirConversion(c) {
  const sugerido = (CFG.servicios || []).find((x) => x.etiqueta === c.servicio);
  caja('Convertir en cliente — ' + (c.nombre || 'contacto'), `
    <form id="ct-form" class="modal__body">
      <p class="celda-suave">Se creará el cliente <strong>y su primer servicio</strong> en una sola operación.
        El contacto quedará marcado como <strong>convertido</strong> y vinculado al cliente nuevo.</p>
      <div class="grid-2">
        <div class="campo"><label for="ct-servicio">Servicio *</label>
          <select id="ct-servicio">
            ${(CFG.servicios || []).map((x) => `<option value="${esc(x.etiqueta)}" ${x.etiqueta === (sugerido ? sugerido.etiqueta : c.servicio) ? 'selected' : ''}>${esc(x.etiqueta)}</option>`).join('')}
          </select></div>
        <div class="campo"><label for="ct-precio">Precio (COP) *</label>
          <input id="ct-precio" type="number" min="0" step="100" value="${Number(sugerido ? sugerido.precioDesde : 0) || 0}" required></div>
      </div>
      <div class="aviso aviso--error" id="ct-error" hidden></div>
    </form>`, 'Crear cliente');

  const err = document.getElementById('ct-error');
  document.getElementById('ct-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    try {
      const r = await escrituras.convertirContactoEnCliente(c.id, {
        servicio: document.getElementById('ct-servicio').value,
        precio: Number(document.getElementById('ct-precio').value) || 0
      });
      document.getElementById('modal-contacto').classList.remove('is-open');
      toast(r.aviso ? 'Cliente creado. ' + r.aviso : 'Contacto convertido en cliente');
      await recargar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

async function manejarAccion(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const c = contactos.find((x) => x.id === id);
  if (!c) return;
  const a = btn.dataset.a;

  if (a === 'detalle') return verDetalle(c);
  if (a === 'seguimiento') return abrirSeguimiento(c);
  if (a === 'convertir') return abrirConversion(c);

  if (a === 'whatsapp') {
    const tel = String(c.telefono || '').replace(/\D/g, '');
    if (tel) window.open('https://wa.me/' + tel, '_blank');
    else toast('Este contacto no dejó teléfono.');
    return;
  }
  if (a === 'eliminar') {
    if (!await confirmar('¿Eliminar este contacto? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'contactos', id));
      toast('Contacto eliminado');
      await recargar();
    } catch (ex) { toast(ex.message, 'error'); }
  }
}

function exportar() {
  descargarCSV('contactos-konfio-zinc', [
    { clave: 'fecha', titulo: 'Recibido' },
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'telefono', titulo: 'Telefono' },
    { clave: 'email', titulo: 'Email' },
    { clave: 'servicio', titulo: 'Servicio' },
    { clave: 'mensaje', titulo: 'Mensaje' },
    { clave: 'estado', titulo: 'Estado' },
    { clave: 'seguimiento', titulo: 'Gestiones' },
    { clave: 'clienteId', titulo: 'Cliente' }
  ], contactos.map((c) => ({
    ...c, estado: estadoDe(c), fecha: fecha(c),
    seguimiento: seguimientoDe(c).map((s) => String(s.nota || '')).join(' | ')
  })));
}

async function recargar() {
  contactos = await cargarContactos();
  pintar();
}

if (!document.getElementById('modal-contacto')) {
  const m = document.createElement('div');
  m.id = 'modal-contacto';
  m.className = 'modal';
  m.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true"></div>';
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('is-open'); });
  document.body.appendChild(m);
}

await recargar();
