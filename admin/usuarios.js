/* ── usuarios.js · administradores (SUPERADMIN) ──────────────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, esc } from '../assets/js/admin/ui.js';
import { cargarUsuarios, escrituras, fechaLarga } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('usuarios');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Usuarios');
const cont = document.getElementById('app-content');

const ROLES = ['OPERADOR', 'ADMIN', 'SUPERADMIN'];

async function pintar() {
  const usuarios = await cargarUsuarios();
  cont.innerHTML = `
    <div class="page-head"><div><h2>Usuarios del panel</h2><p class="celda-suave">Permisos: OPERADOR (ve y registra) · ADMIN (confirma pagos y gestiona planes) · SUPERADMIN (todo + configuración y usuarios)</p></div>
      <button class="btn btn--primary" id="btn-nuevo"><i class="fas fa-user-plus"></i> Nuevo usuario</button></div>
    <div class="tabla__wrap"><table class="tabla"><thead><tr>
      <th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th>
    </tr></thead><tbody>${usuarios.map(u => `<tr data-id="${esc(u.id)}">
      <td class="celda-fuerte">${esc(u.nombre || '—')}</td><td>${esc(u.email)}</td>
      <td><span class="badge badge--servicio">${esc(u.rol)}</span></td>
      <td>${u.activo ? '<span class="badge badge--activo">Activo</span>' : '<span class="badge badge--inactivo">Inactivo</span>'}</td>
      <td>${fechaLarga(u.ultimoAcceso)}</td>
      <td><div class="acciones-fila">
        <button data-a="rol" title="Cambiar rol"><i class="fas fa-user-shield"></i></button>
        <button data-a="toggle" title="Activar/desactivar"><i class="fas fa-toggle-on"></i></button>
      </div></td></tr>`).join('')}</tbody></table></div>`;

  document.getElementById('btn-nuevo').addEventListener('click', nuevoUsuario);
  cont.querySelector('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const id = b.closest('tr').dataset.id;
    const u = (await cargarUsuarios()).find(x => x.id === id);
    if (b.dataset.a === 'toggle') {
      if (!await confirmar(`¿${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}?`)) return;
      await escrituras.actualizarUsuario(id, { activo: !u.activo });
      toast('Usuario actualizado'); pintar();
    } else {
      const rol = prompt('Nuevo rol (' + ROLES.join(', ') + '):', u.rol);
      if (!ROLES.includes(rol)) return toast('Rol inválido', 'error');
      await escrituras.actualizarUsuario(id, { rol });
      toast('Rol actualizado'); pintar();
    }
  });
}

function nuevoUsuario() {
  cont.insertAdjacentHTML('beforeend', `<div class="modal is-open"><div class="modal__box">
    <h3>Nuevo usuario</h3>
    <form id="usr-form">
      <div class="campo"><label>Nombre</label><input id="u-nombre" required></div>
      <div class="campo"><label>Email</label><input id="u-email" type="email" required></div>
      <div class="campo"><label>Contraseña (mín. 6)</label><input id="u-pass" type="password" required></div>
      <div class="campo"><label>Rol</label><select id="u-rol">${ROLES.map(r => `<option>${r}</option>`).join('')}</select></div>
      <div class="aviso aviso--error" id="u-error" hidden></div>
      <div class="modal__actions"><button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
      <button type="submit" class="btn btn--primary">Crear usuario</button></div>
    </form></div></div>`);
  const modal = cont.querySelector('.modal');
  modal.querySelector('[data-cerrar]').addEventListener('click', () => modal.remove());
  modal.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('u-error');
    err.hidden = true;
    try {
      await escrituras.crearUsuario({
        nombre: document.getElementById('u-nombre').value.trim(),
        email: document.getElementById('u-email').value.trim(),
        password: document.getElementById('u-pass').value,
        rol: document.getElementById('u-rol').value
      });
      toast('Usuario creado'); pintar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}
pintar();
