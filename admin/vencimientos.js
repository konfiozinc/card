/* ── vencimientos.js · panel de vencimientos en MODO SPARK ─────────────
   Sustituye al motor programado (processDueDates), que exige Blaze y no está
   ni se desplegará. Aquí no se programa nada: al abrir la página se CALCULA el
   estado de cada cliente desde su fecha de vencimiento y se muestran los casos
   que requieren atención.

   Reglas de convivencia:
     · Nada se envía automáticamente: el mensaje se PREPARA y lo manda una
       persona por WhatsApp.
     · Nada se suspende automáticamente: suspender es un botón, con
       confirmación explícita y queda en historial + auditoría.
     · El estado del cliente no se toca al abrir la página: solo se lee. */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc, confirmar } from '../assets/js/admin/ui.js';
import { cargarClientes, escrituras, CFG, fechaLarga, cop } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('vencimientos');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Vencimientos');
const cont = document.getElementById('app-content');

const UMBRAL = (CFG.negocio && CFG.negocio.diasPorVencer) || 15;
const esAdmin = canAccess(sesion.rol, 'ADMIN');

let clientes = [];

function dias(c) { return (c.dias === null || c.dias === undefined ? null : Number(c.dias)); }
const vigentes = () => clientes.filter(c => !c.eliminado);
const sinVencimiento = () => vigentes().filter(c => dias(c) === null);
const vencidos = () => vigentes().filter(c => dias(c) !== null && dias(c) < 0);
const porVencer = () => vigentes().filter(c => dias(c) !== null && dias(c) >= 0 && dias(c) <= UMBRAL);
const suspendidos = () => vigentes().filter(c => c.estadoCliente === 'SUSPENDIDO' || c.estadoCliente === 'INACTIVO');

/* CARD-SPARK-002: la obligación depende del servicio contratado, no de una
   "suscripción" genérica. Un producto de pago único no genera renovación. */
function obligacion(c) {
  if (c.servicio === 'tarjetas') return 'Renovación de dominio';
  if (c.servicio === 'agentes') return 'Mantenimiento / soporte';
  return 'Sin renovación aplicable (pago único)';
}

function plantillaMensaje(c) {
  const d = dias(c);
  if (d === null) return `Hola ${c.nombre || ''}, revisamos tu servicio con KONFÍO ZINC y necesitamos confirmar la fecha de vencimiento. Escríbenos y lo dejamos al día.`;
  if (d < 0) return `Hola ${c.nombre || ''}, tu servicio con KONFÍO ZINC venció hace ${Math.abs(d)} día(s). Escríbenos y lo reactivamos hoy mismo.`;
  if (d === 0) return `Hola ${c.nombre || ''}, hoy es el último día de tu servicio con KONFÍO ZINC. Escríbenos y lo renovamos sin cortes.`;
  return `Hola ${c.nombre || ''}, tu servicio con KONFÍO ZINC vence en ${d} día(s). Escríbenos y lo renovamos sin cortes.`;
}

function fila(c, etiqueta) {
  const d = dias(c);
  const cuando = d === null ? 'sin fecha' : d < 0 ? `venció hace ${Math.abs(d)} d` : d === 0 ? 'vence hoy' : `en ${d} d`;
  return `<tr>
    <td>${esc(c.nombre || '—')}<div class="celda-suave">${esc(c.telefono || '')}</div></td>
    <td>${esc(c.servicio || '')}</td>
    <td>${fechaLarga(c.fechaVencimiento)}<div class="celda-suave">${cuando}</div></td>
    <td><span class="badge badge--servicio">${esc(etiqueta)}</span><div class="celda-suave">${esc(obligacion(c))}</div></td>
    <td>${cop(c.precio)}
      <div class="celda-suave">
        <button class="btn btn--ghost btn--mini" data-aviso="${esc(c.id)}">Preparar aviso</button>
        ${esAdmin && c.estadoCliente !== 'SUSPENDIDO' ? `<button class="btn btn--ghost btn--mini" data-suspender="${esc(c.id)}">Suspender</button>` : ''}
        ${esAdmin && (c.estadoCliente === 'SUSPENDIDO' || c.estadoCliente === 'INACTIVO') ? `<button class="btn btn--ghost btn--mini" data-reactivar="${esc(c.id)}">Reactivar</button>` : ''}
      </div>
    </td>
  </tr>`;
}

function pintar() {
  const v = vencidos(), p = porVencer(), s = sinVencimiento(), sus = suspendidos();
  cont.innerHTML = `
    <div class="page-head"><div><h2>Vencimientos</h2>
      <p class="celda-suave">Calculado al abrir la página, sin motor programado.
      Umbral de aviso: ${UMBRAL} días. <strong>Nada se envía ni se suspende solo</strong>.</p></div></div>

    <div class="grid-2">
      <div class="card"><h3>Vencidos · ${v.length}</h3>
        <p class="celda-suave">Requieren contacto y, si corresponde, suspensión manual.</p></div>
      <div class="card"><h3>Por vencer (≤ ${UMBRAL} días) · ${p.length}</h3>
        <p class="celda-suave">Candidatos a aviso de renovación.</p></div>
      <div class="card"><h3>Sin fecha de vencimiento · ${s.length}</h3>
        <p class="celda-suave">Datos incompletos: conviene corregirlos en el cliente.</p></div>
      <div class="card"><h3>Suspendidos o inactivos · ${sus.length}</h3>
        <p class="celda-suave">Pueden reactivarse a mano desde aquí.</p></div>
    </div>

    <div class="aviso aviso--ok" id="v-ok" hidden></div>
    <div class="aviso aviso--error" id="v-error" hidden></div>

    <div class="card"><h3>Casos que requieren atención</h3>
      <div class="tabla__wrap"><table class="tabla"><thead><tr>
        <th>Cliente</th><th>Servicio</th><th>Vence</th><th>Situación</th><th>Precio / acciones</th>
      </tr></thead><tbody id="v-filas">${
        [...v.map(c => fila(c, 'VENCIDO')),
         ...p.map(c => fila(c, 'POR VENCER')),
         ...s.map(c => fila(c, 'SIN FECHA')),
         ...sus.map(c => fila(c, 'SUSPENDIDO'))].join('')
      }</tbody></table>
      <p class="tabla__vacia" ${(v.length + p.length + s.length + sus.length) ? 'hidden' : ''}>Nada pendiente: todos los clientes están al día.</p></div>
    </div>`;
}

async function recargar() {
  clientes = await cargarClientes();
  pintar();
}

pintar();
recargar().catch(e => {
  const err = document.getElementById('v-error');
  if (err) { err.textContent = e.message; err.hidden = false; }
});

cont.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-aviso],button[data-suspender],button[data-reactivar]');
  if (!btn) return;
  const ok = document.getElementById('v-ok');
  const err = document.getElementById('v-error');
  ok.hidden = true; err.hidden = true;
  btn.disabled = true;
  try {
    const c = clientes.find(x => x.id === (btn.dataset.aviso || btn.dataset.suspender || btn.dataset.reactivar));
    if (!c) throw new Error('Cliente no encontrado en la lista actual. Recarga la página.');

    if (btn.dataset.aviso) {
      const r = await escrituras.prepararNotificacion(c.id, 'VENCIMIENTO', plantillaMensaje(c));
      ok.innerHTML = r.enlaceWhatsApp
        ? `Aviso preparado para ${esc(c.nombre)}. <a href="${esc(r.enlaceWhatsApp)}" target="_blank" rel="noopener">Abrir WhatsApp con el mensaje</a>. Después márcalo como enviado en Notificaciones.`
        : `Aviso preparado para ${esc(c.nombre)}. Sin teléfono registrado: envíalo por el canal habitual y márcalo en Notificaciones.`;
      ok.hidden = false;
      toast('Aviso preparado');
    }

    if (btn.dataset.suspender) {
      if (!await confirmar(`¿Suspender a ${c.nombre}? Queda registrado en el historial con tu usuario.`)) { btn.disabled = false; return; }
      await escrituras.suspenderServicio(c.id, 'Suspensión manual desde Vencimientos');
      await recargar();
      toast('Cliente suspendido');
    }

    if (btn.dataset.reactivar) {
      if (!await confirmar(`¿Reactivar a ${c.nombre}? El servicio vuelve a ACTIVO; el vencimiento NO se extiende: para renovarlo hay que registrar y confirmar un pago.`)) { btn.disabled = false; return; }
      await escrituras.reactivarServicio(c.id, 'Reactivación manual desde Vencimientos');
      await recargar();
      toast('Cliente reactivado');
    }
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
