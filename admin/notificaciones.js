/* ── notificaciones.js · historial y envío manual ─────────────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarNotificaciones, cargarClientes, escrituras, fechaLarga } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('notificaciones');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Notificaciones');
const cont = document.getElementById('app-content');

const [notifs, clientes] = await Promise.all([cargarNotificaciones(), cargarClientes()]);

cont.innerHTML = `
  <div class="page-head"><div><h2>Notificaciones</h2>
    <p class="celda-suave">${notifs.length} envíos. El motor automático (<code>processDueDates</code>) corre a las 8:00 a.m. y avisa ${CFG.negocio.diasAntes.join(', ')} días antes. Requiere el plan Blaze.</p></div></div>

  <div class="card"><h3>Enviar aviso manual</h3>
    <form id="notif-form">
      <div class="grid-2">
        <div class="campo"><label>Cliente</label><select id="n-cliente">${clientes.map(c => `<option value="${c.id}">${esc(c.nombre)} — ${esc(c.servicio)}</option>`).join('')}</select></div>
        <div class="campo"><label>Mensaje</label><input id="n-mensaje" value="Tu servicio con KONFÍO ZINC requiere atención. Escríbenos para renovarlo."></div>
      </div>
      <button class="btn btn--primary" type="submit"><i class="fas fa-paper-plane"></i> Enviar por push</button>
      <div class="aviso aviso--error" id="n-error" hidden></div>
    </form>
  </div>

  <div class="tabla__wrap"><table class="tabla"><thead><tr>
    <th>Cliente</th><th>Tipo</th><th>Mensaje</th><th>Estado</th><th>Enviado</th>
  </tr></thead><tbody>${notifs.map(n => `<tr>
    <td>${esc(n.clienteNombre || n.clienteId)}</td>
    <td><span class="badge badge--servicio">${esc(n.tipo)}</span></td>
    <td>${esc(n.mensaje || '—')}</td>
    <td>${esc(n.estado)}</td><td>${fechaLarga(n.fechaEnvio)}</td>
  </tr>`).join('')}</tbody></table>
  ${notifs.length ? '' : '<p class="tabla__vacia">Aún no hay notificaciones.</p>'}</div>`;

document.getElementById('notif-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('n-error');
  err.hidden = true;
  try {
    await escrituras.enviarNotificacion(
      document.getElementById('n-cliente').value,
      'MANUAL',
      document.getElementById('n-mensaje').value.trim()
    );
    toast('Aviso enviado');
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
