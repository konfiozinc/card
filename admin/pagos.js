/* ── pagos.js · historial y confirmación de pagos ─────────────────── */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, badgeEstado, esc } from '../assets/js/admin/ui.js';
import { cargarPagos, escrituras, cop, fechaLarga, CFG } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('pagos');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Pagos');
const cont = document.getElementById('app-content');
let pagos = [];
let filtroEstado = '';

function pintar() {
  const f = pagos.filter(p => !filtroEstado || p.estado === filtroEstado);
  cont.innerHTML = `
    <div class="page-head"><div><h2>Pagos</h2><p class="celda-suave">${pagos.length} registros</p></div>
      <div class="page-head__acciones"><a class="btn btn--primary" href="clientes.html"><i class="fas fa-plus"></i> Registrar desde clientes</a></div></div>
    <div class="filtros"><div class="campo"><label>Estado</label><select id="f-estado">
      <option value="">Todos</option>${CFG.estadosPago.map(e => `<option ${filtroEstado === e ? 'selected' : ''}>${e}</option>`).join('')}
    </select></div></div>
    <div class="tabla__wrap"><table class="tabla"><thead><tr>
      <th>Cliente</th><th>Monto</th><th>Método</th><th>Fecha</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody>${f.map(p => `<tr data-id="${esc(p.id)}">
      <td>${esc(p.clienteNombre || p.clienteId)}</td><td>${cop(p.monto)}</td><td>${esc(p.metodoPago)}</td>
      <td>${fechaLarga(p.fechaPago)}</td><td>${badgeEstado(p.estado)}</td>
      <td><div class="acciones-fila">
        ${canAccess(sesion.rol, 'ADMIN') && p.estado === 'PENDIENTE' ? `<button data-a="confirmar" title="Confirmar y renovar"><i class="fas fa-check"></i></button>` : ''}
        ${canAccess(sesion.rol, 'ADMIN') && (p.estado === 'PENDIENTE' || p.estado === 'CONFIRMADO') ? `<button data-a="anular" title="Anular"><i class="fas fa-xmark"></i></button>` : ''}
      </div></td></tr>`).join('') || ''}</tbody></table>
    ${f.length ? '' : '<p class="tabla__vacia">Sin pagos que mostrar.</p>'}</div>`;

  document.getElementById('f-estado').addEventListener('change', (e) => {
    filtroEstado = e.target.value;
    pintar();
  });

  cont.querySelector('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const id = b.closest('tr').dataset.id;
    try {
      if (b.dataset.a === 'confirmar') {
        if (!await confirmar('¿Confirmar este pago? Renueva el servicio 12 meses y reinicia los avisos.', 'Confirmar')) return;
        await escrituras.confirmarPago(id);
        toast('Pago confirmado: servicio renovado 12 meses');
      } else {
        const motivo = prompt('Motivo de la anulación (obligatorio):');
        if (!motivo) return;
        await escrituras.anularPago(id, motivo);
        toast('Pago anulado');
      }
      pagos = await cargarPagos();
      pintar();
    } catch (ex) { toast(ex.message, 'error'); }
  });
}

pagos = await cargarPagos();
pintar();
