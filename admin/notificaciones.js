/* ── notificaciones.js · historial y envío manual ─────────────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarNotificaciones, cargarClientes, escrituras, fechaLarga, CFG } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('notificaciones');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Notificaciones');
const cont = document.getElementById('app-content');

const [notifs, clientes] = await Promise.all([cargarNotificaciones(), cargarClientes()]);

/* Filas de la tabla, en una función aparte para poder repintar solo el cuerpo
   después de enviar un aviso, sin recargar la página. */
function filasNotif(lista) {
  return lista.map(n => `<tr>
    <td>${esc(n.clienteNombre || n.clienteId)}</td>
    <td><span class="badge badge--servicio">${esc(n.tipo)}</span></td>
    <td>${esc(n.mensaje || '—')}</td>
    <td>${esc(n.estado)}</td><td>${fechaLarga(n.fechaEnvio)}</td>
  </tr>`).join('');
}

cont.innerHTML = `
  <div class="page-head"><div><h2>Notificaciones</h2>
    <p class="celda-suave"><span id="n-total">${notifs.length}</span> envíos. El motor automático (<code>processDueDates</code>) corre a las 8:00 a.m. y avisa ${CFG.negocio.diasAntes.join(', ')} días antes. Requiere el plan Blaze.</p></div></div>

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
  </tr></thead><tbody id="n-filas">${filasNotif(notifs)}</tbody></table>
  <p class="tabla__vacia" id="n-vacia"${notifs.length ? ' hidden' : ''}>Aún no hay notificaciones.</p></div>`;

/* Un envío a la vez: un doble clic no debe crear dos registros. */
let enviando = false;

document.getElementById('notif-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviando) return;
  const err = document.getElementById('n-error');
  const boton = e.target.querySelector('button[type="submit"]');
  err.hidden = true;
  enviando = true;
  if (boton) boton.disabled = true;
  try {
    await escrituras.enviarNotificacion(
      document.getElementById('n-cliente').value,
      'MANUAL',
      document.getElementById('n-mensaje').value.trim()
    );
    /* Se repinta la tabla con lo que hay ahora en Firestore: así no se
       duplica la fila ni hace falta recargar. */
    const lista = await cargarNotificaciones();
    document.getElementById('n-filas').innerHTML = filasNotif(lista);
    document.getElementById('n-vacia').hidden = lista.length > 0;
    document.getElementById('n-total').textContent = lista.length;
    toast('Aviso enviado');
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally {
    enviando = false;
    if (boton) boton.disabled = false;
  }
});
