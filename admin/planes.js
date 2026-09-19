/* ── planes.js · catálogo de planes y paquetes ─────────────────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarPlanes, escrituras, cop, CFG } from '../assets/js/admin/datos.js';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../assets/js/admin/core.js';

const sesion = await requireAuth('planes');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Planes');
const cont = document.getElementById('app-content');

async function pintar() {
  const planes = await cargarPlanes();
  cont.innerHTML = `
    <div class="page-head"><div><h2>Planes y paquetes</h2><p class="celda-suave">${planes.length} en catálogo</p></div>
      <div class="page-head__acciones"><button class="btn btn--primary" id="btn-seed"><i class="fas fa-wand-magic-sparkles"></i> Cargar catálogo inicial</button></div></div>
    <div class="tabla__wrap"><table class="tabla"><thead><tr>
      <th>Nombre</th><th>Servicio</th><th>Precio</th><th>Duración</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody>${planes.map(p => `<tr data-id="${esc(p.id)}">
      <td><div class="celda-fuerte">${esc(p.nombre)}</div><div class="celda-suave">${esc(p.descripcion || '')}</div></td>
      <td>${esc(p.servicio || '—')}${p.categoria ? ` · ${esc(p.categoria)}` : ''}</td>
      <td>${cop(p.precio)}</td><td>${p.duracionMeses || 12} meses</td>
      <td>${p.estado === 'INACTIVO' ? '<span class="badge badge--inactivo">Inactivo</span>' : '<span class="badge badge--activo">Activo</span>'}</td>
      <td><div class="acciones-fila"><button data-a="edit" title="Editar"><i class="fas fa-pen"></i></button>
      <button data-a="toggle" title="Activar/desactivar"><i class="fas fa-toggle-on"></i></button>
      <button data-a="del" title="Eliminar"><i class="fas fa-trash"></i></button></div></td></tr>`).join('')}</tbody></table>
    ${planes.length ? '' : '<p class="tabla__vacia">Catálogo vacío: pulsa "Cargar catálogo inicial".</p>'}</div>`;

  document.getElementById('btn-seed').addEventListener('click', async () => {
    try { await escrituras.seedInicial(); toast('Catálogo inicial cargado'); pintar(); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  cont.querySelector('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const id = b.closest('tr').dataset.id;
    const p = (await cargarPlanes()).find(x => x.id === id);
    if (b.dataset.a === 'del') {
      if (!confirm(`¿Eliminar el plan ${p.nombre}?`)) return;
      await deleteDoc(doc(db, 'planes', id)); toast('Plan eliminado'); pintar();
    } else if (b.dataset.a === 'toggle') {
      await setDoc(doc(db, 'planes', id), { estado: p.estado === 'INACTIVO' ? 'ACTIVO' : 'INACTIVO' }, { merge: true });
      toast('Estado actualizado'); pintar();
    } else {
      editarPlan(p);
    }
  });
}

function editarPlan(p) {
  cont.insertAdjacentHTML('beforeend', `<div class="modal is-open"><div class="modal__box">
    <h3>Editar plan</h3>
    <form id="plan-form">
      <div class="campo"><label>Nombre</label><input id="pl-nombre" value="${esc(p.nombre)}"></div>
      <div class="campo"><label>Precio (COP)</label><input id="pl-precio" type="number" value="${p.precio}"></div>
      <div class="campo"><label>Descripción</label><textarea id="pl-desc">${esc(p.descripcion || '')}</textarea></div>
      <div class="modal__actions"><button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
      <button type="submit" class="btn btn--primary">Guardar</button></div>
    </form></div></div>`);
  const modal = cont.querySelector('.modal');
  modal.querySelector('[data-cerrar]').addEventListener('click', () => modal.remove());
  modal.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'planes', p.id), {
      nombre: document.getElementById('pl-nombre').value.trim(),
      precio: Number(document.getElementById('pl-precio').value) || 0,
      descripcion: document.getElementById('pl-desc').value.trim()
    }, { merge: true });
    toast('Plan actualizado'); pintar();
  });
}
pintar();
