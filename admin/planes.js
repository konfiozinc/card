/* ── planes.js · catálogo de planes y paquetes ─────────────────────── */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarPlanes, escrituras, cop, CFG } from '../assets/js/admin/datos.js';
import { doc, setDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../assets/js/admin/core.js';

const sesion = await requireAuth('planes');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Planes');
const cont = document.getElementById('app-content');

/* El catálogo inicial lo siembra `seedInicial`, que exige SUPERADMIN. */
const puedeSembrar = canAccess(sesion.rol, 'SUPERADMIN');

async function pintar() {
  const planes = await cargarPlanes();
  cont.innerHTML = `
    <div class="page-head"><div><h2>Planes y paquetes</h2><p class="celda-suave">${planes.length} en catálogo</p></div>
      <div class="page-head__acciones">
        <button class="btn btn--primary" id="btn-nuevo"><i class="fas fa-plus"></i> Nuevo plan</button>
        ${puedeSembrar ? '<button class="btn btn--ghost" id="btn-seed"><i class="fas fa-wand-magic-sparkles"></i> Cargar catálogo inicial</button>' : ''}
      </div></div>
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
    ${planes.length ? '' : '<p class="tabla__vacia">Catálogo vacío: pulsa "Nuevo plan".</p>'}</div>`;

  document.getElementById('btn-nuevo').addEventListener('click', () => formularioPlan(null, planes));

  const btnSeed = document.getElementById('btn-seed');
  if (btnSeed) {
    btnSeed.addEventListener('click', async () => {
      try { await escrituras.seedInicial(); toast('Catálogo inicial cargado'); pintar(); }
      catch (ex) { toast(ex.message, 'error'); }
    });
  }

  cont.querySelector('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const id = b.closest('tr').dataset.id;
    const p = (await cargarPlanes()).find(x => x.id === id);
    if (!p) return;
    if (b.dataset.a === 'del') {
      if (!confirm(`¿Eliminar el plan ${p.nombre}?`)) return;
      await deleteDoc(doc(db, 'planes', id)); toast('Plan eliminado'); pintar();
    } else if (b.dataset.a === 'toggle') {
      await setDoc(doc(db, 'planes', id), { estado: p.estado === 'INACTIVO' ? 'ACTIVO' : 'INACTIVO' }, { merge: true });
      toast('Estado actualizado'); pintar();
    } else {
      formularioPlan(p, planes);
    }
  });
}

/** Formulario de plan: sirve para crear (p = null) y para editar. */
function formularioPlan(p, planes) {
  const esNuevo = !p;
  const servicios = (CFG.servicios || []).map(s => s.etiqueta || s.slug);
  cont.insertAdjacentHTML('beforeend', `<div class="modal is-open"><div class="modal__box">
    <div class="modal__head">
      <h3>${esNuevo ? 'Nuevo plan' : 'Editar plan'}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <form id="plan-form" class="modal__body">
      <div class="campo"><label>Nombre *</label><input id="pl-nombre" required value="${esNuevo ? '' : esc(p.nombre)}"></div>
      <div class="campo"><label>Servicio *</label><select id="pl-servicio">
        ${servicios.map(s => `<option ${!esNuevo && p.servicio === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select></div>
      <div class="grid-2">
        <div class="campo"><label>Precio (COP) *</label><input id="pl-precio" type="number" min="1" required value="${esNuevo ? '' : (p.precio || '')}"></div>
        <div class="campo"><label>Duración (meses) *</label><input id="pl-duracion" type="number" min="1" required value="${esNuevo ? 12 : (p.duracionMeses || 12)}"></div>
      </div>
      <div class="campo"><label>Descripción</label><textarea id="pl-desc">${esNuevo ? '' : esc(p.descripcion || '')}</textarea></div>
      <div class="aviso aviso--error" id="pl-error" hidden></div>
    </form>
    <div class="modal__foot">
      <div class="modal__actions"><button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
      <button type="submit" form="plan-form" class="btn btn--primary">${esNuevo ? 'Crear plan' : 'Guardar'}</button></div>
    </div>
  </div></div>`);

  const modal = cont.querySelector('.modal');
  const cerrar = () => modal.remove();
  modal.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrar));

  modal.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('pl-error');
    err.hidden = true;
    const nombre = document.getElementById('pl-nombre').value.trim();
    const servicio = document.getElementById('pl-servicio').value;
    const precio = Number(document.getElementById('pl-precio').value);
    const duracionMeses = Number(document.getElementById('pl-duracion').value);
    const descripcion = document.getElementById('pl-desc').value.trim();

    /* Validación en el cliente; las reglas vuelven a exigir rol ADMIN. */
    if (nombre.length < 2) { err.textContent = 'El nombre del plan es obligatorio (mínimo 2 caracteres).'; err.hidden = false; return; }
    if (!Number.isFinite(precio) || precio <= 0) { err.textContent = 'El precio debe ser mayor que cero.'; err.hidden = false; return; }
    if (!Number.isFinite(duracionMeses) || duracionMeses <= 0) { err.textContent = 'La duración debe ser de al menos 1 mes.'; err.hidden = false; return; }

    try {
      if (esNuevo) {
        const orden = Math.max(0, ...planes.map(x => Number(x.orden) || 0)) + 1;
        await addDoc(collection(db, 'planes'), {
          nombre, servicio, precio, duracionMeses, descripcion,
          orden, estado: 'ACTIVO', createdAt: serverTimestamp(),
        });
        toast('Plan creado');
      } else {
        await setDoc(doc(db, 'planes', p.id), {
          nombre, servicio, precio, duracionMeses, descripcion,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        toast('Plan actualizado');
      }
      cerrar();
      pintar();
    } catch (ex) {
      err.textContent = ex.message || 'No se pudo guardar el plan.';
      err.hidden = false;
    }
  });
}

pintar();
