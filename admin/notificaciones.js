/* ── notificaciones.js · avisos PREPARADOS y envío manual ──────────────
   Modo Spark: no hay servidor que envíe nada. El panel prepara el texto, deja
   el registro (PREPARADA, con quién y cuándo), ofrece el enlace de WhatsApp
   para que el operador lo envíe desde su teléfono y, cuando lo haya hecho,
   marca el aviso como enviado. Ningún aviso sale solo. */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarNotificaciones, cargarClientes, escrituras, fechaLarga, CFG } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('notificaciones');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Notificaciones');
const cont = document.getElementById('app-content');

const [notifs, clientes] = await Promise.all([cargarNotificaciones(), cargarClientes()]);

/* Filas de la tabla, en una función aparte para poder repintar solo el cuerpo
   después de preparar un aviso, sin recargar la página. */
function filasNotif(lista) {
  return lista.map(n => `<tr>
    <td>${esc(n.clienteNombre || n.clienteId)}</td>
    <td><span class="badge badge--servicio">${esc(n.tipo || 'MANUAL')}</span></td>
    <td>${esc(n.mensaje || '—')}</td>
    <td>${esc(n.estado)}</td>
    <td>${fechaLarga(n.fechaEnvio || n.preparadaEn)}${n.estado === 'PREPARADA' ? ` <button class="btn btn--ghost btn--mini" data-marcar="${esc(n.id)}">Marcar enviado</button>` : ''}</td>
  </tr>`).join('');
}

cont.innerHTML = `
  <div class="page-head"><div><h2>Notificaciones</h2>
    <p class="celda-suave"><span id="n-total">${notifs.length}</span> avisos registrados.
    En el plan Spark <strong>no hay envío automático</strong>: el panel prepara el texto y el envío lo hace una persona por WhatsApp.
    Los avisos programados (${CFG.negocio.diasAntes.join(', ')} días antes) requieren el motor, que necesita Blaze y no está activo.</p></div></div>

  <div class="card"><h3>Preparar aviso manual</h3>
    <form id="notif-form">
      <div class="grid-2">
        <div class="campo"><label>Cliente</label><select id="n-cliente">${clientes.map(c => `<option value="${c.id}">${esc(c.nombre)} — ${esc(c.servicio)}</option>`).join('')}</select></div>
        <div class="campo"><label>Mensaje</label><input id="n-mensaje" value="Tu servicio con KONFÍO ZINC requiere atención. Escríbenos para renovarlo."></div>
      </div>
      <button class="btn btn--primary" type="submit"><i class="fas fa-clipboard-check"></i> Preparar aviso</button>
      <div class="aviso aviso--ok" id="n-ok" hidden></div>
      <div class="aviso aviso--error" id="n-error" hidden></div>
    </form>
  </div>

  <div class="tabla__wrap"><table class="tabla"><thead><tr>
    <th>Cliente</th><th>Tipo</th><th>Mensaje</th><th>Estado</th><th>Fecha</th>
  </tr></thead><tbody id="n-filas">${filasNotif(notifs)}</tbody></table>
  <p class="tabla__vacia" id="n-vacia"${notifs.length ? ' hidden' : ''}>Aún no hay avisos.</p></div>`;

/* Un envío a la vez: un doble clic no debe crear dos registros. */
let preparando = false;

async function refrescar() {
  const lista = await cargarNotificaciones();
  document.getElementById('n-filas').innerHTML = filasNotif(lista);
  document.getElementById('n-vacia').hidden = lista.length > 0;
  document.getElementById('n-total').textContent = lista.length;
}

document.getElementById('notif-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (preparando) return;
  const err = document.getElementById('n-error');
  const ok = document.getElementById('n-ok');
  const boton = e.target.querySelector('button[type="submit"]');
  err.hidden = true;
  ok.hidden = true;
  preparando = true;
  if (boton) boton.disabled = true;
  try {
    const r = await escrituras.prepararNotificacion(
      document.getElementById('n-cliente').value,
      'MANUAL',
      document.getElementById('n-mensaje').value.trim()
    );
    await refrescar();
    ok.innerHTML = r.enlaceWhatsApp
      ? `Aviso preparado. <a href="${esc(r.enlaceWhatsApp)}" target="_blank" rel="noopener">Abrir WhatsApp con el mensaje</a> y, cuando lo hayas enviado, márcalo como enviado.`
      : 'Aviso preparado. Este cliente no tiene teléfono registrado: envíalo por el canal que uses habitualmente y márcalo como enviado.';
    ok.hidden = false;
    toast('Aviso preparado');
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally {
    preparando = false;
    if (boton) boton.disabled = false;
  }
});

/* Marcar como enviado: acto explícito del operador, con su registro. */
cont.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-marcar]');
  if (!btn) return;
  btn.disabled = true;
  try {
    await escrituras.marcarNotificacionEnviada(btn.dataset.marcar);
    await refrescar();
    toast('Aviso marcado como enviado');
  } catch (ex) {
    const err = document.getElementById('n-error');
    err.textContent = ex.message; err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
