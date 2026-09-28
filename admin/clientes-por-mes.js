/* ── clientes-por-mes.js · vista de clientes agrupados por mes ─────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, esc } from '../assets/js/admin/ui.js';
import { cargarClientes, fechaLarga } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('clientes-mes');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Clientes por mes');
const cont = document.getElementById('app-content');

const clientes = await cargarClientes();

function mesLabel(ym) {
  const [y, m] = ym.split('-');
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${nombres[Number(m) - 1]} ${y}`;
}

/* Agrupa por mes de activación (YYYY-MM), ignorando los de baja lógica. */
const grupos = {};
clientes.filter(c => !c.eliminado).forEach(c => {
  const clave = c.fechaActivacion ? String(c.fechaActivacion).slice(0, 7) : 'sin-fecha';
  (grupos[clave] = grupos[clave] || []).push(c);
});

const meses = Object.keys(grupos).sort().reverse();

const items = meses.map(m => {
  const lista = grupos[m].slice().sort((a, b) => String(a.fechaActivacion || '').localeCompare(String(b.fechaActivacion || '')));
  const titulo = m === 'sin-fecha' ? 'Sin fecha de activación' : mesLabel(m);
  return `<section class="mes-grupo" data-mes="${esc(m)}">
    <button type="button" class="mes-grupo__head" aria-expanded="true">
      <span>${esc(titulo)} <span class="celda-suave">(${lista.length} cliente${lista.length === 1 ? '' : 's'})</span></span>
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>
    <ul class="mes-grupo__lista">
      ${lista.map(c => `<li><span class="celda-fuerte">${esc(c.nombre)}</span> <span class="celda-suave">· ${esc(c.servicio || '—')} · activado el ${fechaLarga(c.fechaActivacion)}</span></li>`).join('')}
    </ul>
  </section>`;
}).join('');

cont.innerHTML = `
  <div class="page-head">
    <div><h2>Clientes por mes</h2><p class="celda-suave">${clientes.filter(c => !c.eliminado).length} clientes agrupados por mes de activación</p></div>
  </div>
  ${items || '<p class="tabla__vacia">No hay clientes registrados.</p>'}`;

cont.querySelectorAll('.mes-grupo__head').forEach(b => b.addEventListener('click', () => {
  const g = b.closest('.mes-grupo');
  const colapsado = g.classList.toggle('is-collapsed');
  b.setAttribute('aria-expanded', String(!colapsado));
}));
