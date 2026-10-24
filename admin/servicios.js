/* ── servicios.js · instancias de servicio por cliente (KZ-OPS-001) ───
   Un cliente puede tener VARIOS servicios (CARD-SPARK-002) y cada uno tiene su
   propia vigencia, su propio precio y su propio estado. Por eso todo lo de esta
   página opera sobre el SERVICIO seleccionado en su fila, nunca sobre el
   cliente: antes los botones llamaban a suspenderServicio/reactivarServicio con
   el id del cliente, de modo que suspender un servicio suspendía todos y el
   cliente entero, mientras el `estado` del servicio no cambiaba nunca.

   Permisos (los mismos que firestore.rules):
     · OPERADOR: ve la lista y puede corregir el nombre del cliente en el servicio.
     · ADMIN+:    edita los campos comerciales y cambia el ciclo de vida. */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, badgeEstado, esc } from '../assets/js/admin/ui.js';
import {
  cargarServicios, escrituras, cop, fechaLarga, dias, obligacionServicio, CFG
} from '../assets/js/admin/datos.js';

const sesion = await requireAuth('servicios');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Servicios');
const cont = document.getElementById('app-content');
const esAdmin = canAccess(sesion.rol, 'ADMIN');

const ESTADOS = ['ACTIVO', 'POR_VENCER', 'PENDIENTE_PAGO', 'SUSPENDIDO',
  'INACTIVO', 'INHABILITADO', 'PENDIENTE_CONFIGURACION'];

let servicios = [];
let filtros = { q: '', estado: '' };

function coincide(s) {
  if (filtros.estado && (s.estado || 'ACTIVO') !== filtros.estado) return false;
  if (!filtros.q) return true;
  const bolsa = [s.clienteNombre, s.clienteId, s.servicio, s.categoria].join(' ').toLowerCase();
  return bolsa.includes(filtros.q.toLowerCase());
}

function textoVencimiento(s) {
  if (!s.fechaVencimiento) return '<span class="celda-suave">sin fecha</span>';
  const d = dias(s.fechaVencimiento);
  if (d === null) return fechaLarga(s.fechaVencimiento);
  const cuando = d < 0 ? `venció hace ${Math.abs(d)} d` : d === 0 ? 'vence hoy' : `en ${d} d`;
  return `${fechaLarga(s.fechaVencimiento)}<div class="celda-suave">${cuando}</div>`;
}

async function pintar() {
  servicios = await cargarServicios();
  const visibles = servicios.filter(coincide);

  const filas = visibles.map((s) => {
    const est = s.estado || 'ACTIVO';
    const obl = obligacionServicio(s.servicio, s.categoria);
    return `<tr data-id="${esc(s.id)}">
      <td><div class="celda-fuerte">${esc(s.clienteNombre || s.clienteId)}</div>
        <div class="celda-suave">${esc(s.clienteId)}</div></td>
      <td>${esc(s.servicio)}${s.categoria ? ` <span class="badge badge--servicio">${esc(s.categoria)}</span>` : ''}
        <div class="celda-suave">${esc(obl.etiqueta)}</div></td>
      <td>${fechaLarga(s.fechaInicio)} → ${textoVencimiento(s)}</td>
      <td>${cop(s.precio)}</td>
      <td>${badgeEstado(est)}</td>
      <td><div class="acciones-fila">
        ${esAdmin ? `<button data-a="editar" title="Editar servicio" aria-label="Editar servicio"><i class="fas fa-pen" aria-hidden="true"></i></button>` : ''}
        ${esAdmin && est !== 'ACTIVO' ? `<button data-a="activar" title="Activar" aria-label="Activar"><i class="fas fa-play" aria-hidden="true"></i></button>` : ''}
        ${esAdmin && est === 'ACTIVO' ? `<button data-a="suspender" title="Suspender" aria-label="Suspender"><i class="fas fa-pause" aria-hidden="true"></i></button>` : ''}
        ${esAdmin && est !== 'INACTIVO' && est !== 'INHABILITADO' ? `<button data-a="desactivar" title="Desactivar" aria-label="Desactivar"><i class="fas fa-ban" aria-hidden="true"></i></button>` : ''}
        ${esAdmin && est === 'INACTIVO' ? `<button data-a="inhabilitar" title="Inhabilitar" aria-label="Inhabilitar"><i class="fas fa-lock" aria-hidden="true"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');

  const renovables = visibles.filter((s) => obligacionServicio(s.servicio, s.categoria).renovable).length;

  cont.innerHTML = `
    <div class="page-head"><div><h2>Servicios contratados</h2>
      <p class="celda-suave">${servicios.length} en base · ${visibles.length} mostrados · ${renovables} con obligación renovable</p></div>
      <div class="page-head__acciones">
        <a class="btn btn--ghost" href="clientes.html"><i class="fas fa-user-plus" aria-hidden="true"></i> Añadir desde un cliente</a>
      </div>
    </div>

    <div class="filtros">
      <div class="campo"><label for="s-q">Buscar</label>
        <input id="s-q" type="search" placeholder="Cliente, servicio o categoría" value="${esc(filtros.q)}"></div>
      <div class="campo"><label for="s-estado">Estado</label>
        <select id="s-estado"><option value="">Todos</option>
          ${ESTADOS.map((e) => `<option value="${e}" ${filtros.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
        </select></div>
    </div>

    <div class="aviso aviso--error" id="s-error" hidden></div>

    <div class="tabla__wrap">
      <table class="tabla"><thead><tr>
        <th>Cliente</th><th>Servicio</th><th>Periodo</th><th>Precio</th><th>Estado</th><th>Acciones</th>
      </tr></thead><tbody>${filas}</tbody></table>
      ${visibles.length ? '' : `<p class="tabla__vacia">${servicios.length
        ? 'Ningún servicio coincide con el filtro.'
        : 'Aún no hay servicios registrados. Se crean al dar de alta un cliente o desde su ficha.'}</p>`}
    </div>

    <p class="celda-suave" style="margin-top:.75rem">
      El estado es POR SERVICIO: suspender uno no afecta a los demás servicios del mismo cliente.
      Las renovaciones se aplican solo al servicio que identifica el pago; reactivar no extiende la vigencia.
    </p>`;

  document.getElementById('s-q').addEventListener('input', (e) => { filtros.q = e.target.value; pintar(); });
  document.getElementById('s-estado').addEventListener('change', (e) => { filtros.estado = e.target.value; pintar(); });
  cont.querySelector('tbody').addEventListener('click', manejarAccion);
}

async function manejarAccion(e) {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const id = b.closest('tr').dataset.id;
  const s = servicios.find((x) => x.id === id);
  if (!s) return;
  const err = document.getElementById('s-error');
  err.hidden = true;
  const a = b.dataset.a;
  b.disabled = true;

  try {
    if (a === 'editar') { abrirEditor(s); return; }

    const MOTIVO = {
      activar: 'Activación manual del servicio',
      suspender: 'Suspensión manual del servicio',
      desactivar: 'Desactivación manual del servicio',
      inhabilitar: 'Inhabilitación manual del servicio'
    };
    const NUEVO = { activar: 'ACTIVO', suspender: 'SUSPENDIDO', desactivar: 'INACTIVO', inhabilitar: 'INHABILITADO' };
    const verbo = { activar: 'activar', suspender: 'suspender', desactivar: 'desactivar', inhabilitar: 'inhabilitar' }[a];
    const aviso = a === 'activar'
      ? `¿Activar «${s.servicio}» de ${s.clienteNombre || s.clienteId}? La vigencia NO se extiende: para renovarla hay que registrar y confirmar un pago.`
      : `¿${verbo[0].toUpperCase() + verbo.slice(1)} «${s.servicio}» de ${s.clienteNombre || s.clienteId}? Solo afecta a este servicio y queda en el historial del cliente.`;
    if (!await confirmar(aviso, verbo[0].toUpperCase() + verbo.slice(1))) { b.disabled = false; return; }

    await escrituras.cambiarEstadoServicio(id, NUEVO[a], MOTIVO[a]);
    toast('Servicio ' + verbo + 'do');
    await pintar();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    b.disabled = false;
  }
}

/* ── Editor individual de servicio ─────────────────────────────────── */
function abrirEditor(s) {
  const categorias = (CFG.categoriasTarjeta || []).map((x) => x.codigo);
  const modal = document.getElementById('modal-editor-servicio');
  const caja = modal.querySelector('.modal__box');
  caja.innerHTML = `
    <div class="modal__head">
      <h3>Editar servicio — ${esc(s.clienteNombre || s.clienteId)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <form id="sv-form" class="modal__body">
      <div class="grid-2">
        <div class="campo"><label for="sv-servicio">Servicio *</label>
          <select id="sv-servicio">
            ${(CFG.servicios || []).map((x) => `<option value="${esc(x.etiqueta)}" ${x.etiqueta === s.servicio ? 'selected' : ''}>${esc(x.etiqueta)}</option>`).join('')}
            ${(CFG.servicios || []).some((x) => x.etiqueta === s.servicio) ? '' : `<option value="${esc(s.servicio)}" selected>${esc(s.servicio)} (actual)</option>`}
          </select></div>
        <div class="campo"><label for="sv-categoria">Categoría</label>
          <select id="sv-categoria">
            <option value="">— (sin categoría) —</option>
            ${categorias.map((x) => `<option value="${esc(x)}" ${x === s.categoria ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            ${s.categoria && !categorias.includes(s.categoria) ? `<option value="${esc(s.categoria)}" selected>${esc(s.categoria)} (actual)</option>` : ''}
          </select></div>
        <div class="campo"><label for="sv-precio">Precio (COP) *</label>
          <input id="sv-precio" type="number" min="0" step="100" value="${Number(s.precio) || 0}" required></div>
        <div class="campo"><label for="sv-estado">Estado</label>
          <select id="sv-estado">
            ${ESTADOS.map((e) => `<option value="${e}" ${e === (s.estado || 'ACTIVO') ? 'selected' : ''}>${e}</option>`).join('')}
          </select></div>
        <div class="campo"><label for="sv-inicio">Inicio</label>
          <input id="sv-inicio" type="date" value="${esc(s.fechaInicio || '')}"></div>
        <div class="campo"><label for="sv-vence">Vencimiento</label>
          <input id="sv-vence" type="date" value="${esc(s.fechaVencimiento || '')}"></div>
      </div>
      <p class="celda-suave">Obligación derivada: <strong>${esc(obligacionServicio(s.servicio, s.categoria).etiqueta)}</strong>.
        Editar la fecha aquí corrige un dato; para RENOVAR hay que registrar y confirmar un pago del concepto que corresponda.</p>
      <div class="aviso aviso--error" id="sv-error" hidden></div>
    </form>
    <div class="modal__foot">
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
        <button type="submit" form="sv-form" class="btn btn--primary">Guardar cambios</button>
      </div>
    </div>`;

  modal.classList.add('is-open');
  modal.querySelectorAll('[data-cerrar]').forEach((x) => x.addEventListener('click', () => modal.classList.remove('is-open')));

  const err = document.getElementById('sv-error');
  document.getElementById('sv-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    const datos = {
      servicio: document.getElementById('sv-servicio').value,
      categoria: document.getElementById('sv-categoria').value || null,
      precio: Number(document.getElementById('sv-precio').value),
      estado: document.getElementById('sv-estado').value,
      fechaInicio: document.getElementById('sv-inicio').value || null,
      fechaVencimiento: document.getElementById('sv-vence').value || null
    };
    if (!datos.fechaInicio) { err.textContent = 'La fecha de inicio es obligatoria.'; err.hidden = false; return; }
    try {
      await escrituras.actualizarServicio(s.id, datos);
      modal.classList.remove('is-open');
      toast('Servicio actualizado');
      await pintar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* Modal base del editor (el contenido se rellena en cada apertura). */
if (!document.getElementById('modal-editor-servicio')) {
  const m = document.createElement('div');
  m.id = 'modal-editor-servicio';
  m.className = 'modal';
  m.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true"></div>';
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('is-open'); });
  document.body.appendChild(m);
}

await pintar();
