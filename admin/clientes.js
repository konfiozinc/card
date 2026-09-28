/* ── clientes.js · gestión de clientes ─────────────────────────────── */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, badgeEstado, esc, fmtCOP, descargarCSV } from '../assets/js/admin/ui.js';
import {
  cargarClientes, cargarCliente, pagosDe, historialDe, cargarPlanes,
  escrituras, CFG, NEG, cop, aFecha, iso, hoyISO, sumarMeses, dias, fechaLarga, precioSugerido
} from '../assets/js/admin/datos.js';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../assets/js/admin/core.js';

const sesion = await requireAuth('clientes');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Clientes');
const cont = document.getElementById('app-content');

let clientes = [];
let planes = [];
let filtros = { q: '', estado: '', servicio: '', categoria: '', mostrarEliminados: false };
let orden = 'fechaActivacion_desc';
let edicionId = null;

const SERVICIOS = CFG.servicios.map(s => s.etiqueta);
const CATS = CFG.categoriasTarjeta.map(c => c.codigo);
const METODOS = CFG.metodosPago;
const ESTADOS = CFG.estadosCliente;

/* Chips rápidos de estado */
const CHIPS_ESTADO = [
  { v: '', label: 'Todos' },
  { v: 'ACTIVO', label: 'Activos' },
  { v: 'INACTIVO', label: 'Inactivos' },
  { v: 'SUSPENDIDO', label: 'Suspendidos' },
  { v: 'INHABILITADO', label: 'Inhabilitados' },
  { v: 'POR_VENCER', label: 'Por vencer' },
  { v: 'PENDIENTE_PAGO', label: 'Pendientes' }
];

/* ── Helpers de normalización ─────────────────────────────────────── */
function estActual(c) {
  const v = c.fechaVencimiento ? estadoPorVenc(c.fechaVencimiento) : c.estadoCliente;
  return v || 'ACTIVO';
}
function estadoPorVenc(v) {
  const d = dias(v);
  if (d === null) return 'ACTIVO';
  if (d < 0) return 'PENDIENTE_PAGO';
  if (d <= NEG.diasPorVencer) return 'POR_VENCER';
  return 'ACTIVO';
}

function ordenar(lista) {
  const [campo, dir] = orden.split('_');
  const val = (c) => {
    if (campo === 'nombre') return (c.nombre || '').toLowerCase();
    if (campo === 'estado') return estActual(c);
    return c[campo] || '';
  };
  return [...lista].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va < vb) return dir === 'desc' ? 1 : -1;
    if (va > vb) return dir === 'desc' ? -1 : 1;
    return 0;
  });
}

/* ── Renderizado ──────────────────────────────────────────────────── */
function opciones(lista, sel) {
  return `<option value="">Todos</option>` + lista.map(o => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
}

function botonesFila(c, estado) {
  const admin = canAccess(sesion.rol, 'ADMIN');
  const superAdmin = canAccess(sesion.rol, 'SUPERADMIN');
  let b = `<button data-a="ver" title="Ver detalle"><i class="fas fa-eye" aria-hidden="true"></i></button>
    <button data-a="editar" title="Editar"><i class="fas fa-pen" aria-hidden="true"></i></button>
    <button data-a="pago" title="Registrar pago"><i class="fas fa-money-bill" aria-hidden="true"></i></button>`;
  if (admin) {
    if (['ACTIVO', 'POR_VENCER', 'PENDIENTE_PAGO'].includes(estado)) {
      b += `<button data-a="suspender" class="act-suspender" title="Suspender"><i class="fas fa-pause" aria-hidden="true"></i></button>
        <button data-a="desactivar" class="act-desactivar" title="Desactivar"><i class="fas fa-circle-stop" aria-hidden="true"></i></button>
        <button data-a="inhabilitar" class="act-inhabilitar" title="Inhabilitar"><i class="fas fa-ban" aria-hidden="true"></i></button>`;
    } else if (['INACTIVO', 'SUSPENDIDO', 'INHABILITADO'].includes(estado)) {
      b += `<button data-a="activar" class="act-activar" title="Activar"><i class="fas fa-play" aria-hidden="true"></i></button>`;
    }
    if (['ACTIVO', 'POR_VENCER'].includes(estado)) {
      b += `<button data-a="renovar" title="Renovar 12 meses"><i class="fas fa-rotate" aria-hidden="true"></i></button>`;
    }
  }
  if (superAdmin) {
    b += `<button data-a="eliminar" class="act-eliminar" title="Eliminar (baja lógica)"><i class="fas fa-trash" aria-hidden="true"></i></button>`;
  }
  return b;
}

function pintar() {
  const f = ordenar(clientes).filter(c => {
    if (!filtros.mostrarEliminados && c.eliminado) return false;
    const estado = estActual(c);
    if (filtros.estado && estado !== filtros.estado) return false;
    if (filtros.servicio && c.servicio !== filtros.servicio) return false;
    if (filtros.categoria && c.categoria !== filtros.categoria) return false;
    if (filtros.q) {
      const b = [c.nombre, c.empresa, c.telefono, c.email, c.documento].join(' ').toLowerCase();
      if (!b.includes(filtros.q.toLowerCase())) return false;
    }
    return true;
  });

  const filas = f.map(c => {
    const estado = estActual(c);
    return `<tr data-id="${esc(c.id)}">
      <td><div class="celda-fuerte">${esc(c.nombre)}</div><div class="celda-suave">${esc(c.empresa || '—')}</div></td>
      <td><div class="celda-suave">${esc(c.telefono || '—')}</div><div class="celda-suave">${esc(c.email || '—')}</div></td>
      <td>${esc(c.servicio || '—')}${c.categoria ? ` <span class="badge badge--servicio">${esc(c.categoria)}</span>` : ''}</td>
      <td>${fechaLarga(c.fechaActivacion)}</td>
      <td>${fechaLarga(c.fechaVencimiento)}<div class="celda-suave">${c.dias !== null && c.dias >= 0 ? 'en ' + c.dias + ' d' : c.dias !== null ? 'vencido ' + Math.abs(c.dias) + ' d' : ''}</div></td>
      <td>${badgeEstado(estado)}</td>
      <td>${cop(c.precio)}</td>
      <td><div class="acciones-fila">${botonesFila(c, estado)}</div></td>
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Clientes</h2>
        <p class="celda-suave">${clientes.length} en base · ${f.length} mostrados</p>
      </div>
      <div class="page-head__acciones">
        <button class="btn btn--ghost" id="btn-csv"><i class="fas fa-file-csv" aria-hidden="true"></i> Exportar</button>
        <button class="btn btn--primary" id="btn-nuevo"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo cliente</button>
      </div>
    </div>

    <div class="filtros">
      <div class="campo"><label for="f-q">Buscar</label><input id="f-q" type="search" placeholder="Nombre, empresa, teléfono, email o documento" value="${esc(filtros.q)}"></div>
      <div class="campo"><label for="f-servicio">Servicio</label><select id="f-servicio">${opciones(SERVICIOS, filtros.servicio)}</select></div>
      <div class="campo"><label for="f-cat">Categoría</label><select id="f-cat">${opciones(CATS, filtros.categoria)}</select></div>
      <div class="campo"><label for="f-orden">Ordenar por</label><select id="f-orden">
        <option value="fechaActivacion_desc" ${orden === 'fechaActivacion_desc' ? 'selected' : ''}>Activación (recientes primero)</option>
        <option value="fechaActivacion_asc" ${orden === 'fechaActivacion_asc' ? 'selected' : ''}>Activación (antiguos primero)</option>
        <option value="fechaVencimiento_asc" ${orden === 'fechaVencimiento_asc' ? 'selected' : ''}>Vencimiento (próximos primero)</option>
        <option value="nombre_asc" ${orden === 'nombre_asc' ? 'selected' : ''}>Nombre (A-Z)</option>
        <option value="estado_asc" ${orden === 'estado_asc' ? 'selected' : ''}>Estado</option>
      </select></div>
    </div>

    <div class="toolbar">
      <div class="chips" role="group" aria-label="Filtrar por estado">
        ${CHIPS_ESTADO.map(ch => `<button type="button" class="chip ${filtros.estado === ch.v ? 'is-active' : ''}" data-estado="${ch.v}">${esc(ch.label)}</button>`).join('')}
      </div>
      <div class="toolbar__right">
        <label class="campo--check"><input id="f-eliminados" type="checkbox" ${filtros.mostrarEliminados ? 'checked' : ''}> Mostrar eliminados</label>
      </div>
    </div>

    <div class="tabla__wrap">
      <table class="tabla"><thead><tr>
        <th>Cliente</th><th>Contacto</th><th>Servicio</th><th>Activación</th><th>Vencimiento</th><th>Estado</th><th>Precio</th><th>Acciones</th>
      </tr></thead><tbody>${filas || ''}</tbody></table>
      ${f.length ? '' : '<p class="tabla__vacia">Ningún cliente coincide con los filtros.</p>'}
    </div>

    <div class="modal" id="modal-editor"><div class="modal__box modal--ancho"></div></div>
    <div class="modal" id="modal-detalle"><div class="modal__box modal--ancho"></div></div>`;

  /* Eventos */
  document.getElementById('f-q').addEventListener('input', e => { filtros.q = e.target.value; pintar(); });
  document.getElementById('f-servicio').addEventListener('change', e => { filtros.servicio = e.target.value; pintar(); });
  document.getElementById('f-cat').addEventListener('change', e => { filtros.categoria = e.target.value; pintar(); });
  document.getElementById('f-orden').addEventListener('change', e => { orden = e.target.value; pintar(); });
  document.getElementById('f-eliminados').addEventListener('change', e => { filtros.mostrarEliminados = e.target.checked; pintar(); });
  document.getElementById('btn-csv').addEventListener('click', exportar);
  document.getElementById('btn-nuevo').addEventListener('click', () => abrirEditor(null));

  cont.querySelectorAll('.chips .chip').forEach(ch => ch.addEventListener('click', () => {
    filtros.estado = ch.dataset.estado; pintar();
  }));

  cont.querySelector('tbody').addEventListener('click', manejarAccion);
}

/* ── Acciones de fila ────────────────────────────────────────────── */
async function manejarAccion(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  const a = btn.dataset.a;

  if (a === 'ver') return verDetalle(c);
  if (a === 'editar') return abrirEditor(c);
  if (a === 'pago') return abrirPago(c);

  if (a === 'activar') {
    const vencido = c.dias !== null && c.dias < 0;
    if (!await confirmar(`¿Activar al cliente ${c.nombre}?`)) return;
    if (vencido) {
      if (await confirmar(`El servicio de ${c.nombre} ya venció. ¿Extender su vencimiento 1 mes a partir de hoy?`)) {
        const nuevo = iso(sumarMeses(new Date(), 1));
        await updateDoc(doc(db, 'clientes', id), { fechaVencimiento: nuevo, updatedAt: serverTimestamp() });
      }
    }
    await escrituras.activarServicio(id, 'Activación desde botón');
    toast('Cliente activado'); return recargar();
  }
  if (a === 'desactivar') {
    if (!await confirmar(`¿Desactivar a ${c.nombre}? El historial se conserva.`)) return;
    await escrituras.desactivarServicio(id, 'Desactivación desde botón');
    toast('Cliente desactivado'); return recargar();
  }
  if (a === 'suspender') return abrirSuspender(c);
  if (a === 'inhabilitar') return abrirInhabilitar(c);
  if (a === 'eliminar') {
    if (!await confirmar(`¿Eliminar a ${c.nombre}? Se ocultará de las listas (baja lógica) y su historial se conserva. Solo puede revertirse manualmente en Firestore.`)) return;
    await escrituras.eliminarCliente(id, 'Eliminado desde botón');
    toast('Cliente eliminado (baja lógica)'); return recargar();
  }
  if (a === 'renovar') {
    if (!await confirmar(`¿Renovar ${c.nombre} 12 meses? Se suman ${NEG.mesesSuscripcion} meses y se reinician los avisos.`)) return;
    const base = c.dias > 0 ? new Date(c.fechaVencimiento + 'T00:00:00') : new Date();
    const nuevo = iso(sumarMeses(base, NEG.mesesSuscripcion));
    await escrituras.recalcularEstados();
    await updateDoc(doc(db, 'clientes', id), { fechaVencimiento: nuevo, estadoCliente: 'ACTIVO', updatedAt: serverTimestamp() });
    toast('Cliente renovado hasta ' + fechaLarga(nuevo));
    return recargar();
  }
}

/* ── Mini-modales de suspensión e inhabilitación ──────────────────── */
function abrirSuspender(c) {
  const box = document.querySelector('#modal-detalle .modal__box');
  document.getElementById('modal-detalle').classList.add('is-open');
  box.innerHTML = `
    <div class="modal__head">
      <h3>Suspender — ${esc(c.nombre)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <form id="susp-form" class="modal__body">
      <div class="campo"><label>Motivo *</label><select id="s-motivo">
        <option>Falta de pago</option><option>Cliente pidió pausa</option><option>Revisión</option><option>Otro</option>
      </select></div>
      <p class="celda-suave">Se registrará la fecha de hoy: ${fechaLarga(hoyISO())}.</p>
      <div class="campo"><label>Nota (opcional)</label><textarea id="s-nota" rows="2" placeholder="Detalle adicional…"></textarea></div>
      <div class="aviso aviso--error" id="s-error" hidden></div>
    </form>
    <div class="modal__foot"><div class="modal__actions">
      <button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
      <button type="submit" form="susp-form" class="btn btn--primary">Confirmar suspensión</button>
    </div></div>`;
  const err = document.getElementById('s-error');
  document.querySelectorAll('#modal-detalle [data-cerrar]').forEach(b => b.addEventListener('click', cerrarDetalle));
  document.getElementById('susp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = document.getElementById('s-motivo').value;
    const nota = document.getElementById('s-nota').value.trim();
    try {
      await escrituras.suspenderServicio(c.id, nota ? `${motivo} — ${nota}` : motivo);
      toast('Servicio suspendido'); cerrarDetalle(); recargar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function abrirInhabilitar(c) {
  const box = document.querySelector('#modal-detalle .modal__box');
  document.getElementById('modal-detalle').classList.add('is-open');
  box.innerHTML = `
    <div class="modal__head">
      <h3>Inhabilitar — ${esc(c.nombre)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <form id="inhab-form" class="modal__body">
      <div class="campo"><label>Motivo *</label><textarea id="i-motivo" rows="3" placeholder="Explica por qué se inhabilita este cliente"></textarea></div>
      <div class="campo campo--check"><label><input id="i-confirma" type="checkbox"> Entiendo que es una acción permanente hasta su reactivación manual.</label></div>
      <div class="aviso aviso--error" id="i-error" hidden></div>
    </form>
    <div class="modal__foot"><div class="modal__actions">
      <button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
      <button type="submit" form="inhab-form" class="btn btn--danger">Inhabilitar cliente</button>
    </div></div>`;
  const err = document.getElementById('i-error');
  document.querySelectorAll('#modal-detalle [data-cerrar]').forEach(b => b.addEventListener('click', cerrarDetalle));
  document.getElementById('inhab-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = document.getElementById('i-motivo').value.trim();
    if (!motivo) { err.textContent = 'El motivo es obligatorio.'; err.hidden = false; return; }
    if (!document.getElementById('i-confirma').checked) { err.textContent = 'Debes confirmar que entiendes la acción.'; err.hidden = false; return; }
    try {
      await escrituras.inhabilitarServicio(c.id, motivo);
      toast('Cliente inhabilitado'); cerrarDetalle(); recargar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ── Editor (nuevo / editar) ─────────────────────────────────────── */
function abrirEditor(c) {
  edicionId = c ? c.id : null;
  const p = planes.map(x => `<option value="${x.id}" ${c && c.planId === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  document.getElementById('modal-editor').classList.add('is-open');
  document.querySelector('#modal-editor .modal__box').innerHTML = `
    <div class="modal__head">
      <h3>${c ? 'Editar cliente' : 'Nuevo cliente'}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <form id="editor-form" class="modal__body">
      <div class="grid-2">
        <div class="campo"><label>Nombre *</label><input id="e-nombre" required value="${esc(c ? c.nombre : '')}"></div>
        <div class="campo"><label>Empresa</label><input id="e-empresa" value="${esc(c ? c.empresa : '')}"></div>
        <div class="campo"><label>Documento</label><input id="e-documento" value="${esc(c ? c.documento : '')}"></div>
        <div class="campo"><label>Teléfono *</label><input id="e-telefono" required value="${esc(c ? c.telefono : '')}"></div>
        <div class="campo"><label>WhatsApp</label><input id="e-whatsapp" value="${esc(c ? c.whatsapp : '')}"></div>
        <div class="campo"><label>Email</label><input id="e-email" type="email" value="${esc(c ? c.email : '')}"></div>
        <div class="campo"><label>Ciudad</label><input id="e-ciudad" value="${esc(c ? c.ciudad : '')}"></div>
        <div class="campo"><label>Servicio *</label><select id="e-servicio">${SERVICIOS.map(s => `<option ${c && c.servicio === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="campo"><label>Categoría (solo Tarjetas)</label><select id="e-categoria"><option value="">—</option>${CATS.map(x => `<option ${c && c.categoria === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="campo"><label>Paquete / plan</label><select id="e-plan"><option value="">Sin paquete</option>${p}</select></div>
        <div class="campo"><label>Precio (COP)</label><input id="e-precio" type="number" value="${c ? c.precio : ''}"></div>
        <div class="campo"><label>Método preferido</label><select id="e-metodo"><option value="">—</option>${METODOS.map(m => `<option ${c && c.metodoPagoPreferido === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
        <div class="campo"><label>Activación *</label><input id="e-activacion" type="date" value="${c ? c.fechaActivacion : hoyISO()}"></div>
        <div class="campo"><label>Duración del servicio</label><select id="e-duracion">
          <option value="1">1 mes</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12" selected>12 meses</option>
        </select></div>
        <div class="campo"><label>Vencimiento</label><input id="e-vencimiento" type="date" value="${c ? c.fechaVencimiento : ''}"></div>
        <div class="campo"><label>URL del servicio</label><input id="e-url" value="${esc(c ? c.urlServicio : '')}"></div>
        <div class="campo"><label>Proyecto (repo GitHub)</label><input id="e-proyecto" value="${esc(c ? c.proyectoId : '')}"></div>
      </div>
      <div class="campo"><label>Observaciones</label><textarea id="e-obs" rows="2">${esc(c ? c.observaciones : '')}</textarea></div>
      <div class="aviso aviso--error" id="e-error" hidden></div>
    </form>
    <div class="modal__foot">
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
        <button type="submit" form="editor-form" class="btn btn--primary"><i class="fas fa-floppy-disk" aria-hidden="true"></i> Guardar</button>
      </div>
    </div>`;

  const sel = document.getElementById('e-servicio');
  const cat = document.getElementById('e-categoria');
  const prec = document.getElementById('e-precio');
  const act = document.getElementById('e-activacion');
  const ven = document.getElementById('e-vencimiento');
  const dur = document.getElementById('e-duracion');
  const err = document.getElementById('e-error');

  function autocalcular() {
    const base = act.value ? new Date(act.value + 'T00:00:00') : new Date();
    const meses = Number(dur.value) || NEG.mesesSuscripcion;
    ven.value = iso(sumarMeses(base, meses));
  }
  act.addEventListener('change', autocalcular);
  dur.addEventListener('change', autocalcular);
  if (!ven.value) autocalcular();
  sel.addEventListener('change', () => {
    cat.disabled = sel.value !== 'Tarjetas Digitales';
    if (sel.value !== 'Tarjetas Digitales') cat.value = '';
    if (!prec.value) prec.value = precioSugerido(sel.value, cat.value);
  });
  cat.addEventListener('change', () => { if (!prec.value) prec.value = precioSugerido(sel.value, cat.value); });
  if (c && !c.categoria) cat.disabled = c.servicio !== 'Tarjetas Digitales';

  document.querySelectorAll('#modal-editor [data-cerrar]').forEach(b => b.addEventListener('click', cerrarEditor));
  document.getElementById('editor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const v = id => document.getElementById(id).value.trim();
    if (!v('e-nombre') || !v('e-telefono')) { err.textContent = 'Nombre y teléfono son obligatorios.'; err.hidden = false; return; }
    if (!v('e-activacion')) { err.textContent = 'La fecha de activación es obligatoria.'; err.hidden = false; return; }
    const datos = {
      nombre: v('e-nombre'), empresa: v('e-empresa'), documento: v('e-documento'),
      telefono: v('e-telefono'), whatsapp: v('e-whatsapp'), email: v('e-email'),
      ciudad: v('e-ciudad'), servicio: v('e-servicio'), categoria: v('e-categoria') || null,
      planId: v('e-plan') || null, precio: Number(v('e-precio')) || 0,
      metodoPagoPreferido: v('e-metodo') || null, fechaActivacion: v('e-activacion'),
      fechaVencimiento: v('e-vencimiento'), urlServicio: v('e-url') || null,
      proyectoId: v('e-proyecto') || null, observaciones: v('e-obs') || null
    };
    try {
      if (edicionId) await escrituras.actualizarCliente(edicionId, datos);
      else await escrituras.crearCliente(datos);
      toast(edicionId ? 'Cliente actualizado' : 'Cliente creado');
      cerrarEditor(); recargar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}
function cerrarEditor() { document.getElementById('modal-editor').classList.remove('is-open'); edicionId = null; }

/* ── Registrar pago ──────────────────────────────────────────────── */
function abrirPago(c) {
  document.getElementById('modal-detalle').classList.add('is-open');
  document.querySelector('#modal-detalle .modal__box').innerHTML = `
    <div class="modal__head">
      <h3>Registrar pago — ${esc(c.nombre)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <form id="pago-form" class="modal__body">
      <div class="grid-2">
        <div class="campo"><label>Monto (COP) *</label><input id="p-monto" type="number" value="${c.precio || ''}"></div>
        <div class="campo"><label>Método *</label><select id="p-metodo">${METODOS.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
        <div class="campo"><label>Fecha</label><input id="p-fecha" type="date" value="${hoyISO()}"></div>
        <div class="campo"><label>Referencia</label><input id="p-ref"></div>
        <div class="campo"><label>Comprobante (URL)</label><input id="p-comp"></div>
      </div>
      <div class="aviso aviso--error" id="p-error" hidden></div>
    </form>
    <div class="modal__foot">
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-cerrar>Cancelar</button>
        <button type="submit" form="pago-form" class="btn btn--primary">Registrar pago</button>
      </div>
    </div>`;
  const err = document.getElementById('p-error');
  document.querySelectorAll('#modal-detalle [data-cerrar]').forEach(b => b.addEventListener('click', cerrarDetalle));
  document.getElementById('pago-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = Number(document.getElementById('p-monto').value);
    if (!monto || monto <= 0) { err.textContent = 'El monto debe ser mayor a cero.'; err.hidden = false; return; }
    try {
      await escrituras.registrarPago({
        clienteId: c.id, monto, metodoPago: document.getElementById('p-metodo').value,
        fechaPago: document.getElementById('p-fecha').value,
        referencia: document.getElementById('p-ref').value.trim() || null,
        comprobanteUrl: document.getElementById('p-comp').value.trim() || null
      });
      toast('Pago registrado como PENDIENTE. Un ADMIN debe confirmarlo para renovar.');
      cerrarDetalle(); recargar();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ── Detalle ─────────────────────────────────────────────────────── */
async function verDetalle(c) {
  const [pagos, hist] = await Promise.all([pagosDe(c.id), historialDe(c.id)]);
  document.getElementById('modal-detalle').classList.add('is-open');
  document.querySelector('#modal-detalle .modal__box').innerHTML = `
    <div class="modal__head">
      <h3>${esc(c.nombre)}</h3>
      <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <div class="modal__body">
      <dl class="detalle">
        <div class="detalle__fila"><dt>Empresa</dt><dd>${esc(c.empresa || '—')}</dd></div>
        <div class="detalle__fila"><dt>Servicio</dt><dd>${esc(c.servicio)}${c.categoria ? ' · ' + esc(c.categoria) : ''}</dd></div>
        <div class="detalle__fila"><dt>Contacto</dt><dd>${esc(c.telefono)} · ${esc(c.email || '—')}</dd></div>
        <div class="detalle__fila"><dt>Activación</dt><dd>${fechaLarga(c.fechaActivacion)}</dd></div>
        <div class="detalle__fila"><dt>Vencimiento</dt><dd>${fechaLarga(c.fechaVencimiento)} (${c.dias >= 0 ? 'en ' + c.dias + ' d' : 'vencido ' + Math.abs(c.dias) + ' d'})</dd></div>
        <div class="detalle__fila"><dt>Precio</dt><dd>${cop(c.precio)} ${c.metodoPagoPreferido ? '· ' + esc(c.metodoPagoPreferido) : ''}</dd></div>
        <div class="detalle__fila"><dt>URL / Proyecto</dt><dd>${c.urlServicio ? esc(c.urlServicio) : '—'} ${c.proyectoId ? '· ' + esc(c.proyectoId) : ''}</dd></div>
        <div class="detalle__fila"><dt>Observaciones</dt><dd>${esc(c.observaciones || '—')}</dd></div>
      </dl>
      <h4>Pagos</h4>
      ${pagos.length ? `<table class="tabla"><thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Estado</th></tr></thead><tbody>
        ${pagos.map(p => `<tr><td>${fechaLarga(p.fechaPago)}</td><td>${cop(p.monto)}</td><td>${esc(p.metodoPago)}</td><td>${badgeEstado(p.estado)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="celda-suave">Sin pagos registrados.</p>'}
      <h4>Historial de estados</h4>
      ${hist.length ? hist.map(h => `<div class="celda-suave">${fechaLarga(h.fecha)} — ${esc(h.estadoAnterior || '—')} → ${esc(h.estadoNuevo)} (${esc(h.motivo || '')})</div>`).join('') : '<p class="celda-suave">Sin cambios registrados.</p>'}
    </div>
    <div class="modal__foot">
      <div class="modal__actions"><button type="button" class="btn btn--ghost" data-cerrar>Cerrar</button></div>
    </div>`;
  document.querySelectorAll('#modal-detalle [data-cerrar]').forEach(b => b.addEventListener('click', cerrarDetalle));
}
function cerrarDetalle() { document.getElementById('modal-detalle').classList.remove('is-open'); }

/* ── Exportar CSV ────────────────────────────────────────────────── */
function exportar() {
  descargarCSV('clientes-konfio-zinc', [
    { clave: 'nombre', titulo: 'Nombre' }, { clave: 'empresa', titulo: 'Empresa' },
    { clave: 'telefono', titulo: 'Telefono' }, { clave: 'email', titulo: 'Email' },
    { clave: 'servicio', titulo: 'Servicio' }, { clave: 'categoria', titulo: 'Categoria' },
    { clave: 'fechaActivacion', titulo: 'Activacion' }, { clave: 'fechaVencimiento', titulo: 'Vencimiento' },
    { clave: 'estadoCliente', titulo: 'Estado' }, { clave: 'precio', titulo: 'Precio' }
  ], clientes);
}

/* ── Carga inicial ───────────────────────────────────────────────── */
async function recargar() {
  clientes = await cargarClientes();
  pintar();
}
await recargar();
