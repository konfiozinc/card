/* ── vencimientos.js · obligaciones reales en MODO SPARK (KZ-OPS-001) ──
   Sustituye al motor programado (processDueDates), que exige Blaze y no está
   ni se desplegará. Aquí no se programa nada: al abrir la página se CALCULA la
   obligación de cada servicio desde su propia fecha de vencimiento.

   KZ-OPS-001 · La obligación es POR SERVICIO, no por cliente. Antes se derivaba
   del campo único `servicio` del cliente, así que un cliente con dominio y
   landing mostraba una sola obligación y la del landing se perdía. Ahora cada
   servicio aporta su fila; los clientes sin servicios registrados siguen
   apareciendo con su fecha genérica, marcados como tales.

   Reglas de convivencia (no cambian):
     · Nada se envía automáticamente: el mensaje se PREPARA y lo manda una
       persona por WhatsApp.
     · Nada se suspende automáticamente: suspender es un botón, con
       confirmación explícita, y queda en historial + auditoría.
     · El estado no se toca al abrir la página: solo se lee. */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc, confirmar, badgeEstado } from '../assets/js/admin/ui.js';
import {
  cargarClientes, cargarTodosLosServicios, agruparServiciosPorCliente,
  escrituras, CFG, fechaLarga, cop, dias, obligacionServicio
} from '../assets/js/admin/datos.js';

const sesion = await requireAuth('vencimientos');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Vencimientos');
const cont = document.getElementById('app-content');

const UMBRAL = (CFG.negocio && CFG.negocio.diasPorVencer) || 15;
const esAdmin = canAccess(sesion.rol, 'ADMIN');
const ESTADOS_INACTIVOS = ['SUSPENDIDO', 'INACTIVO', 'INHABILITADO'];

/* Cada fila es una OBLIGACIÓN: un servicio concreto (o el cliente cuando no
   tiene servicios registrados). */
let filas = [];

function construir(clientes, servicios) {
  const porCliente = agruparServiciosPorCliente(servicios);
  const salida = [];
  for (const c of clientes.filter((x) => !x.eliminado)) {
    const suyos = porCliente.get(c.id) || [];
    if (!suyos.length) {
      salida.push({
        clave: 'cli:' + c.id, clienteId: c.id, clienteNombre: c.nombre,
        telefono: c.telefono || c.whatsapp || '', servicio: c.servicio || '—',
        categoria: c.categoria || null, fechaVencimiento: c.fechaVencimiento || null,
        precio: c.precio, estado: c.estadoCliente || 'ACTIVO', servicioId: null,
        d: dias(c.fechaVencimiento), huerfano: true,
        obligacion: obligacionServicio(c.servicio, c.categoria)
      });
      continue;
    }
    for (const s of suyos) {
      salida.push({
        clave: 'sv:' + s.id, clienteId: c.id, clienteNombre: s.clienteNombre || c.nombre,
        telefono: c.telefono || c.whatsapp || '', servicio: s.servicio,
        categoria: s.categoria || null, fechaVencimiento: s.fechaVencimiento || null,
        precio: s.precio, estado: s.estado || 'ACTIVO', servicioId: s.id,
        d: dias(s.fechaVencimiento), huerfano: false,
        obligacion: obligacionServicio(s.servicio, s.categoria)
      });
    }
  }
  return salida.sort((a, b) => {
    if (a.d === null && b.d === null) return 0;
    if (a.d === null) return 1;
    if (b.d === null) return -1;
    return a.d - b.d;
  });
}

const vencidos = () => filas.filter((f) => !ESTADOS_INACTIVOS.includes(f.estado) && f.d !== null && f.d < 0);
const porVencer = () => filas.filter((f) => !ESTADOS_INACTIVOS.includes(f.estado) && f.d !== null && f.d >= 0 && f.d <= UMBRAL);
const sinFecha = () => filas.filter((f) => !ESTADOS_INACTIVOS.includes(f.estado) && f.d === null);
const inactivos = () => filas.filter((f) => ESTADOS_INACTIVOS.includes(f.estado));
const sinObligacion = () => filas.filter((f) => !f.obligacion.renovable && !ESTADOS_INACTIVOS.includes(f.estado));

function plantillaMensaje(f) {
  const nombre = f.clienteNombre || '';
  const que = f.obligacion.renovable ? f.obligacion.etiqueta.toLowerCase() : 'tu servicio';
  const d = f.d;
  if (d === null) return `Hola ${nombre}, revisamos ${que} de ${f.servicio} con KONFÍO ZINC y necesitamos confirmar la fecha de vencimiento. Escríbenos y lo dejamos al día.`;
  if (d < 0) return `Hola ${nombre}, ${que} de ${f.servicio} con KONFÍO ZINC venció hace ${Math.abs(d)} día(s). Escríbenos y lo reactivamos hoy mismo.`;
  if (d === 0) return `Hola ${nombre}, hoy es el último día de ${que} de ${f.servicio} con KONFÍO ZINC. Escríbenos y lo renovamos sin cortes.`;
  return `Hola ${nombre}, ${que} de ${f.servicio} con KONFÍO ZINC vence en ${d} día(s). Escríbenos y lo renovamos sin cortes.`;
}

function fila(f, etiqueta) {
  const cuando = f.d === null ? 'sin fecha' : f.d < 0 ? `venció hace ${Math.abs(f.d)} d` : f.d === 0 ? 'vence hoy' : `en ${f.d} d`;
  return `<tr data-clave="${esc(f.clave)}">
    <td>${esc(f.clienteNombre || '—')}<div class="celda-suave">${esc(f.telefono || '')}</div></td>
    <td>${esc(f.servicio)}${f.categoria ? ` <span class="badge badge--servicio">${esc(f.categoria)}</span>` : ''}</td>
    <td>${fechaLarga(f.fechaVencimiento)}<div class="celda-suave">${cuando}</div></td>
    <td><span class="badge badge--servicio">${esc(etiqueta)}</span>
      <div class="celda-suave">${esc(f.obligacion.etiqueta)}</div></td>
    <td>${badgeEstado(f.estado)}</td>
    <td>${cop(f.precio)}
      <div class="celda-suave">
        <button class="btn btn--ghost btn--mini" data-aviso="${esc(f.clave)}">Preparar aviso</button>
        ${esAdmin && !ESTADOS_INACTIVOS.includes(f.estado) ? `<button class="btn btn--ghost btn--mini" data-suspender="${esc(f.clave)}">Suspender</button>` : ''}
        ${esAdmin && ESTADOS_INACTIVOS.includes(f.estado) ? `<button class="btn btn--ghost btn--mini" data-reactivar="${esc(f.clave)}">Reactivar</button>` : ''}
      </div>
    </td>
  </tr>`;
}

function pintar() {
  const v = vencidos(), p = porVencer(), sf = sinFecha(), ina = inactivos(), sn = sinObligacion();
  cont.innerHTML = `
    <div class="page-head"><div><h2>Vencimientos y obligaciones</h2>
      <p class="celda-suave">Calculado al abrir la página, sin motor programado. Umbral de aviso: ${UMBRAL} días.
      Cada fila es una <strong>obligación de un servicio</strong>. <strong>Nada se envía ni se suspende solo</strong>.</p></div></div>

    <div class="grid-2">
      <div class="card"><h3>Vencidos · ${v.length}</h3>
        <p class="celda-suave">Requieren contacto y, si corresponde, suspensión manual.</p></div>
      <div class="card"><h3>Por vencer (≤ ${UMBRAL} días) · ${p.length}</h3>
        <p class="celda-suave">Candidatos a aviso de renovación.</p></div>
      <div class="card"><h3>Sin fecha de vencimiento · ${sf.length}</h3>
        <p class="celda-suave">Datos incompletos: conviene corregirlos en el servicio.</p></div>
      <div class="card"><h3>Sin obligación renovable · ${sn.length}</h3>
        <p class="celda-suave">Pagos únicos: no generan renovación.</p></div>
      <div class="card"><h3>Suspendidos o inactivos · ${ina.length}</h3>
        <p class="celda-suave">Pueden reactivarse a mano desde aquí.</p></div>
      <div class="card"><h3>Clientes sin servicios registrados · ${filas.filter((f) => f.huerfano && !ESTADOS_INACTIVOS.includes(f.estado)).length}</h3>
        <p class="celda-suave">Se muestran con la fecha del cliente. Conviene añadirles el servicio.</p></div>
    </div>

    <div class="aviso aviso--ok" id="v-ok" hidden></div>
    <div class="aviso aviso--error" id="v-error" hidden></div>

    <div class="card"><h3>Casos que requieren atención</h3>
      <div class="tabla__wrap"><table class="tabla"><thead><tr>
        <th>Cliente</th><th>Servicio</th><th>Vence</th><th>Situación</th><th>Estado</th><th>Precio / acciones</th>
      </tr></thead><tbody>${
        [...v.map((f) => fila(f, 'VENCIDO')),
         ...p.map((f) => fila(f, 'POR VENCER')),
         ...sf.map((f) => fila(f, 'SIN FECHA')),
         ...ina.map((f) => fila(f, 'SUSPENDIDO'))].join('')
      }</tbody></table>
      ${(v.length + p.length + sf.length + ina.length) ? '' : '<p class="tabla__vacia">Nada pendiente: todas las obligaciones están al día.</p>'}</div>
    </div>`;
}

async function recargar() {
  const [clientes, servicios] = await Promise.all([cargarClientes(), cargarTodosLosServicios()]);
  filas = construir(clientes, servicios);
  pintar();
}

pintar();
recargar().catch((e) => {
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
    const clave = btn.dataset.aviso || btn.dataset.suspender || btn.dataset.reactivar;
    const f = filas.find((x) => x.clave === clave);
    if (!f) throw new Error('Ese caso ya no está en la lista. Recarga la página.');

    if (btn.dataset.aviso) {
      const r = await escrituras.prepararNotificacion(f.clienteId, 'VENCIMIENTO', plantillaMensaje(f));
      ok.innerHTML = r.enlaceWhatsApp
        ? `Aviso preparado para ${esc(f.clienteNombre)} (${esc(f.servicio)}). <a href="${esc(r.enlaceWhatsApp)}" target="_blank" rel="noopener">Abrir WhatsApp con el mensaje</a>. Después márcalo como enviado en Notificaciones.`
        : `Aviso preparado para ${esc(f.clienteNombre)}. Sin teléfono registrado: envíalo por el canal habitual y márcalo en Notificaciones.`;
      ok.hidden = false;
      toast('Aviso preparado');
    }

    if (btn.dataset.suspender) {
      if (!await confirmar(`¿Suspender «${f.servicio}» de ${f.clienteNombre}? Solo ese servicio; queda registrado en el historial del cliente con tu usuario.`)) {
        btn.disabled = false; return;
      }
      if (f.servicioId) await escrituras.cambiarEstadoServicio(f.servicioId, 'SUSPENDIDO', 'Suspensión manual desde Vencimientos');
      else await escrituras.suspenderServicio(f.clienteId, 'Suspensión manual desde Vencimientos');
      await recargar();
      toast('Servicio suspendido');
    }

    if (btn.dataset.reactivar) {
      if (!await confirmar(`¿Reactivar «${f.servicio}» de ${f.clienteNombre}? Vuelve a ACTIVO; la vigencia NO se extiende: para renovarla hay que registrar y confirmar un pago.`)) {
        btn.disabled = false; return;
      }
      if (f.servicioId) await escrituras.cambiarEstadoServicio(f.servicioId, 'ACTIVO', 'Reactivación manual desde Vencimientos');
      else await escrituras.reactivarServicio(f.clienteId, 'Reactivación manual desde Vencimientos');
      await recargar();
      toast('Servicio reactivado');
    }
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
