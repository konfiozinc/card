/* ── auditoria.js · trazabilidad de acciones (SUPERADMIN) ─────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, esc } from '../assets/js/admin/ui.js';
import { cargarAuditoria, fechaLarga } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('auditoria');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Auditoría');
const cont = document.getElementById('app-content');

const filas = await cargarAuditoria();

cont.innerHTML = `
  <div class="page-head"><div><h2>Auditoría</h2><p class="celda-suave">Últimas ${filas.length} acciones. Toda escritura de las Cloud Functions deja rastro aquí.</p></div></div>
  <div class="tabla__wrap"><table class="tabla"><thead><tr>
    <th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th>
  </tr></thead><tbody>${filas.map(a => `<tr data-id="${esc(a.id)}">
    <td>${fechaLarga(a.fecha)}</td><td>${esc(a.usuarioNombre || a.usuarioId || 'sistema')}</td>
    <td><span class="badge badge--servicio">${esc(a.accion)}</span></td>
    <td>${esc(a.entidad || '—')} ${a.entidadId ? '· ' + esc(a.entidadId) : ''}</td>
    <td><button class="btn btn--ghost btn--sm" data-ver="${esc(a.id)}"><i class="fas fa-eye"></i> Ver cambios</button></td>
  </tr>`).join('')}</tbody></table>
  ${filas.length ? '' : '<p class="tabla__vacia">Sin registros de auditoría.</p>'}</div>
  <div class="modal" id="modal-aud"><div class="modal__box modal--ancho"></div></div>`;

cont.querySelector('tbody').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ver]');
  if (!b) return;
  const a = filas.find(x => x.id === b.dataset.ver);
  document.getElementById('modal-aud').classList.add('is-open');
  document.querySelector('#modal-aud .modal__box').innerHTML = `
    <div class="modal__head">
      <h3>${esc(a.accion)} — ${esc(a.entidad)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <div class="modal__body">
      <h4>Antes</h4><pre class="celda-suave" style="white-space:pre-wrap">${esc(JSON.stringify(a.datosAnteriores || {}, null, 2))}</pre>
      <h4>Después</h4><pre class="celda-suave" style="white-space:pre-wrap">${esc(JSON.stringify(a.datosNuevos || {}, null, 2))}</pre>
    </div>
    <div class="modal__foot">
      <div class="modal__actions"><button class="btn btn--ghost" data-cerrar>Cerrar</button></div>
    </div>`;
  document.querySelectorAll('#modal-aud [data-cerrar]').forEach(b => b.addEventListener('click', () => document.getElementById('modal-aud').classList.remove('is-open')));
});
