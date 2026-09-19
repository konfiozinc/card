/* ── servicios.js · instancias de servicio por cliente ─────────────── */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, badgeEstado, esc } from '../assets/js/admin/ui.js';
import { cargarServicios, escrituras, cop, fechaLarga, dias } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('servicios');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Servicios');
const cont = document.getElementById('app-content');

async function pintar() {
  const servicios = await cargarServicios();
  const filas = servicios.map(s => {
    const d = dias(s.fechaVencimiento);
    return `<tr data-id="${esc(s.id)}" data-cliente="${esc(s.clienteId)}">
      <td><div class="celda-fuerte">${esc(s.clienteNombre || s.clienteId)}</div></td>
      <td>${esc(s.servicio)}${s.categoria ? ` <span class="badge badge--servicio">${esc(s.categoria)}</span>` : ''}</td>
      <td>${fechaLarga(s.fechaInicio)} → ${fechaLarga(s.fechaVencimiento)}</td>
      <td>${cop(s.precio)}</td>
      <td>${badgeEstado(s.estado)}</td>
      <td><div class="acciones-fila">
        <button data-a="activar" title="Activar"><i class="fas fa-play"></i></button>
        ${canAccess(sesion.rol, 'ADMIN') ? `<button data-a="suspender" title="Suspender"><i class="fas fa-pause"></i></button>
        <button data-a="desactivar" title="Desactivar"><i class="fas fa-ban"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="page-head"><div><h2>Servicios contratados</h2>
      <p class="celda-suave">${servicios.length} instancias activas o históricas</p></div></div>
    <div class="tabla__wrap"><table class="tabla"><thead><tr>
      <th>Cliente</th><th>Servicio</th><th>Periodo</th><th>Precio</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody>${filas || ''}</tbody></table>
    ${servicios.length ? '' : '<p class="tabla__vacia">Aún no hay servicios registrados.</p>'}</div>`;

  cont.querySelector('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const tr = b.closest('tr');
    const id = tr.dataset.id, cliente = tr.dataset.cliente;
    const a = b.dataset.a;
    const motivos = { activar: 'Activación manual', suspender: 'Suspensión manual', desactivar: 'Desactivación manual' };
    if (!await confirmar(`¿${a} este servicio?`)) return;
    try {
      if (a === 'activar') await escrituras.reactivarServicio(cliente, motivos[a]);
      if (a === 'suspender') await escrituras.suspenderServicio(cliente, motivos[a]);
      if (a === 'desactivar') await escrituras.desactivarServicio(cliente, motivos[a]);
      toast('Acción ejecutada');
      pintar();
    } catch (ex) { toast(ex.message, 'error'); }
  });
}
pintar();
