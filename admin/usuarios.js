/* ── usuarios.js · usuarios del panel en MODO SPARK ────────────────────
   Crear una cuenta de Authentication, cambiar un rol o vincular un UID exige
   el Admin SDK, y en el plan Spark no hay servidor donde ejecutarlo. Las reglas
   cierran `usuarios` a escritura desde el navegador (allow write: if false), así
   que esta página es SOLO DE LECTURA: muestra quién hay y cómo gestionarlo con
   la herramienta local del ASUS autorizado. */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarUsuarios } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('usuarios');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Usuarios');
const cont = document.getElementById('app-content');

const usuarios = await cargarUsuarios();
const esSuper = canAccess(sesion.rol, 'SUPERADMIN');

const esHeredada = (u) => String(u.id).includes('@');

function filas(lista) {
  return lista.map(u => `<tr>
    <td>${esc(u.nombre || '—')}<div class="celda-suave">${esc(u.email || '')}</div></td>
    <td><span class="badge badge--servicio">${esc(u.rol || 'SIN ROL')}</span></td>
    <td>${u.activo === true ? 'Activo' : 'Desactivado'}</td>
    <td>${esHeredada(u)
      ? '<span class="celda-suave">ficha heredada por correo</span>'
      : '<span class="celda-suave">vinculada al UID</span>'}</td>
  </tr>`).join('');
}

cont.innerHTML = `
  <div class="page-head"><div><h2>Usuarios</h2>
    <p class="celda-suave">${usuarios.length} ficha(s). En el plan Spark el panel
    <strong>no puede crear cuentas ni cambiar roles</strong>: eso exige el Admin SDK.
    Aquí solo se consulta; los cambios se hacen con la herramienta local del ASUS autorizado.</p></div></div>

  ${esSuper ? `<div class="card"><h3>Gestión privilegiada (Admin SDK, en el ASUS autorizado)</h3>
    <p class="celda-suave">La herramienta simula primero y solo actúa con <code>--aplicar --autorizado-por "nombre"</code>.</p>
    <pre style="overflow:auto;background:rgba(0,0,0,.25);padding:12px;border-radius:8px;font-size:12px"># ver el estado sin tocar nada
node herramientas/admin-spark.js --diagnostico

# crear cuenta + ficha vinculada al UID
node herramientas/admin-spark.js --crear-cuenta --email persona@dominio.com --rol OPERADOR --nombre "Nombre" --aplicar --autorizado-por "tu nombre"

# cambiar el rol de alguien
node herramientas/admin-spark.js --rol --email persona@dominio.com --valor ADMIN --aplicar --autorizado-por "tu nombre"

# deshabilitar una cuenta
node herramientas/admin-spark.js --deshabilitar --email persona@dominio.com --aplicar --autorizado-por "tu nombre"

# vincular una ficha heredada (usuarios/correo) con su UID real
node herramientas/admin-spark.js --vincular --email persona@dominio.com --aplicar --autorizado-por "tu nombre"</pre>
    <div class="aviso aviso--error" id="u-error" hidden></div>
  </div>` : '<div class="aviso">Solo un SUPERADMIN ve la lista completa de usuarios.</div>'}

  <div class="tabla__wrap"><table class="tabla"><thead><tr>
    <th>Usuario</th><th>Rol</th><th>Estado</th><th>Identificador</th>
  </tr></thead><tbody>${filas(usuarios)}</tbody></table>
  <p class="tabla__vacia" ${usuarios.length ? 'hidden' : ''}>No hay fichas de usuario.</p></div>`;

/* Ninguna escritura: se deja constancia explícita para quien lea el código. */
cont.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  const err = document.getElementById('u-error');
  if (err) { err.textContent = 'Los usuarios no se modifican desde el panel: usa la herramienta local (herramientas/admin-spark.js).'; err.hidden = false; }
}));

toast(usuarios.length + ' usuario(s)');
