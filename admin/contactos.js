/* ── contactos.js · leads del formulario público del sitio ──────────── */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, esc, descargarCSV } from '../assets/js/admin/ui.js';
import { collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../assets/js/admin/core.js';

const sesion = await requireAuth('contactos');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Contactos');
const cont = document.getElementById('app-content');

let contactos = [];
let filtros = { q: '', estado: '' };

/* Fecha legible de recepción (createdAt es un Timestamp de Firestore) */
function fecha(c) {
  if (!c.createdAt) return '—';
  try {
    const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return '—'; }
}

/* Badge simple de estado (NUEVO / ATENDIDO) */
function badge(estado) {
  if (estado === 'ATENDIDO') {
    return '<span style="background:rgba(74,222,128,.15);color:#4ade80;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;">Atendido</span>';
  }
  return '<span style="background:rgba(240,180,41,.15);color:#F0B429;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;">Nuevo</span>';
}

function pintar() {
  const f = contactos.filter(c => {
    const est = c.estado || 'NUEVO';
    if (filtros.estado && est !== filtros.estado) return false;
    if (filtros.q) {
      const b = [c.nombre, c.email, c.telefono, c.servicio, c.mensaje].join(' ').toLowerCase();
      if (!b.includes(filtros.q.toLowerCase())) return false;
    }
    return true;
  });

  const filas = f.map(c => {
    const est = c.estado || 'NUEVO';
    return `<tr data-id="${esc(c.id)}">
      <td class="celda-suave">${esc(fecha(c))}</td>
      <td><div class="celda-fuerte">${esc(c.nombre || '—')}</div></td>
      <td><div class="celda-suave">${esc(c.telefono || '—')}</div><div class="celda-suave">${esc(c.email || '—')}</div></td>
      <td>${esc(c.servicio || '—')}</td>
      <td><div class="celda-suave" style="max-width:260px;">${esc(c.mensaje || '—')}</div></td>
      <td>${badge(est)}</td>
      <td><div class="acciones-fila">
        <button data-a="whatsapp" title="Abrir WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></button>
        ${est === 'NUEVO' ? `<button data-a="atender" title="Marcar como atendido"><i class="fas fa-check" aria-hidden="true"></i></button>` : ''}
        ${canAccess(sesion.rol, 'ADMIN') ? `<button data-a="eliminar" title="Eliminar"><i class="fas fa-trash" aria-hidden="true"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Contactos</h2>
        <p class="celda-suave">${contactos.length} en base · ${f.length} mostrados</p>
      </div>
      <div class="page-head__acciones">
        <button class="btn btn--ghost" id="btn-csv"><i class="fas fa-file-csv" aria-hidden="true"></i> Exportar</button>
      </div>
    </div>

    <div class="filtros">
      <div class="campo"><label for="f-q">Buscar</label><input id="f-q" type="search" placeholder="Nombre, email, teléfono, servicio o mensaje" value="${esc(filtros.q)}"></div>
      <div class="campo"><label for="f-estado">Estado</label><select id="f-estado">
        <option value="">Todos</option>
        <option value="NUEVO" ${filtros.estado === 'NUEVO' ? 'selected' : ''}>Nuevos</option>
        <option value="ATENDIDO" ${filtros.estado === 'ATENDIDO' ? 'selected' : ''}>Atendidos</option>
      </select></div>
    </div>

    <div class="tabla__wrap">
      <table class="tabla"><thead><tr>
        <th>Recibido</th><th>Nombre</th><th>Contacto</th><th>Servicio</th><th>Mensaje</th><th>Estado</th><th>Acciones</th>
      </tr></thead><tbody>${filas || ''}</tbody></table>
      ${f.length ? '' : '<p class="tabla__vacia">No hay contactos todavía. Cuando alguien envíe el formulario del sitio, aparecerán aquí.</p>'}
    </div>`;

  document.getElementById('f-q').addEventListener('input', e => { filtros.q = e.target.value; pintar(); });
  document.getElementById('f-estado').addEventListener('change', e => { filtros.estado = e.target.value; pintar(); });
  document.getElementById('btn-csv').addEventListener('click', exportar);
  cont.querySelector('tbody').addEventListener('click', manejarAccion);
}

async function manejarAccion(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;
  const c = contactos.find(x => x.id === id);
  if (!c) return;
  const a = btn.dataset.a;

  if (a === 'whatsapp') {
    const tel = String(c.telefono || '').replace(/\D/g, '');
    if (tel) window.open('https://wa.me/' + tel, '_blank');
    else toast('Este contacto no dejó teléfono.');
    return;
  }
  if (a === 'atender') {
    await updateDoc(doc(db, 'contactos', id), { estado: 'ATENDIDO', atendidoEn: serverTimestamp() });
    toast('Marcado como atendido');
    return recargar();
  }
  if (a === 'eliminar') {
    if (!await confirmar('¿Eliminar este contacto? Esta acción no se puede deshacer.')) return;
    await deleteDoc(doc(db, 'contactos', id));
    toast('Contacto eliminado');
    return recargar();
  }
}

function exportar() {
  descargarCSV('contactos-konfio-zinc', [
    { clave: 'fecha', titulo: 'Recibido' },
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'telefono', titulo: 'Telefono' },
    { clave: 'email', titulo: 'Email' },
    { clave: 'servicio', titulo: 'Servicio' },
    { clave: 'mensaje', titulo: 'Mensaje' },
    { clave: 'estado', titulo: 'Estado' }
  ], contactos.map(c => ({ ...c, fecha: fecha(c) })));
}

async function recargar() {
  const q = query(collection(db, 'contactos'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  contactos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  pintar();
}

await recargar();
