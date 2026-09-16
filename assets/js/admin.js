/**
 * ═══════════════════════════════════════════════════════════════════
 * admin.js · KONFÍO ZINC — Panel de administración de clientes
 *
 * Módulo ES (se carga con <script type="module">). Usa el SDK modular de
 * Firebase v10 desde CDN (esm.run) para no necesitar build ni npm en el
 * navegador, lo que permite seguir desplegando el sitio en GitHub Pages.
 *
 * Funcionalidades:
 *   - Autenticación con Firebase Auth (email/contraseña) + lista blanca `admins`
 *   - Dashboard: totales, clientes por servicio e ingresos del mes
 *   - CRUD de clientes con validación
 *   - Filtros por estado, servicio y categoría + búsqueda por nombre/email/teléfono
 *   - Ordenamiento (fecha de vencimiento, nombre, precio)
 *   - Renovación de servicio (recalcula el vencimiento +12 meses)
 *   - Historial de pagos en la subcolección `pagos`
 *   - Exportación a CSV
 *   - Suscripción a notificaciones push (FCM) y guardado del token
 *   - Recordatorio manual invocando la Cloud Function `enviarRecordatorio`
 * ═══════════════════════════════════════════════════════════════════
 */

import { firebaseConfig, vapidKey, COLECCION_CLIENTES, SUBCOLECCION_PAGOS,
         SERVICIOS, CATEGORIAS_TARJETA, ESTADOS, METODOS_PAGO,
         DIAS_AVISO, MESES_SUSCRIPCION, PRECIOS_REFERENCIA,
         configuracionPendiente } from './firebase-config.js';

import { initializeApp } from 'https://esm.run/firebase@10.12.2/app';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp, onSnapshot
} from 'https://esm.run/firebase@10.12.2/firestore';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://esm.run/firebase@10.12.2/auth';
import { getMessaging, getToken, onMessage, isSupported } from 'https://esm.run/firebase@10.12.2/messaging';
import { getFunctions, httpsCallable } from 'https://esm.run/firebase@10.12.2/functions';

/* ── Atajos DOM ────────────────────────────────────────────────────── */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

/* ── Estado en memoria ─────────────────────────────────────────────── */
const estado = {
  app: null,
  db: null,
  auth: null,
  messaging: null,
  functions: null,
  usuario: null,
  clientes: [],       // todos los documentos, ya normalizados
  filtrados: [],      // resultado de filtros + búsqueda + orden
  orden: { campo: 'fechaVencimiento', dir: 'asc' },
  edicionId: null     // id del cliente en edición (null = nuevo)
};

/* ═══════════════════════════════════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════════════════════════════════ */

/** Escapa texto para insertarlo en HTML sin riesgo de inyección. */
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Convierte un valor de Firestore (Timestamp/Date/string) a Date. */
function aFecha(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Formatea una fecha como AAAA-MM-DD (para inputs type=date y CSV). */
function fechaISO(d) {
  if (!d) return '';
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dia = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${dia}`;
}

/** Formatea una fecha en español de Colombia. */
function fechaLarga(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Formatea un monto en pesos colombianos. */
function pesos(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-CO');
}

/** Días que faltan para una fecha (negativo si ya pasó). */
function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha); f.setHours(0, 0, 0, 0);
  return Math.round((f - hoy) / 86400000);
}

/** Suma meses a una fecha respetando el fin de mes. */
function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return d;
}

/** Normaliza el campo notificacionesEnviadas (admite strings antiguos). */
function normalizarNotificaciones(campo) {
  if (!Array.isArray(campo)) return [];
  return campo.map((n) => (typeof n === 'string' ? { tipo: n, fecha: null } : n)).filter(Boolean);
}

/** Muestra un aviso en la parte superior del panel. */
function aviso(mensaje, tipo = 'info') {
  const caja = $('#adminAlerts');
  if (!caja) return;
  const div = document.createElement('div');
  div.className = 'admin-alert' + (tipo === 'warn' ? ' warn' : tipo === 'pending' ? ' pending' : '');
  div.innerHTML = mensaje;
  caja.appendChild(div);
  if (tipo === 'info') setTimeout(() => div.remove(), 6000);
}

/** Activa una pestaña del panel. */
function irAPestana(nombre) {
  $$('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === nombre));
  $$('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + nombre));
}

/* ═══════════════════════════════════════════════════════════════════
   ARRANQUE
   ═══════════════════════════════════════════════════════════════════ */

function init() {
  /* Si la configuración sigue con placeholders, se avisa y no se inicializa
     Firebase: evita errores crípticos en consola. */
  if (configuracionPendiente()) {
    $('#loginView').hidden = true;
    $('#panelView').hidden = true;
    const pend = $('#configPendiente');
    if (pend) pend.hidden = false;
    return;
  }

  estado.app = initializeApp(firebaseConfig);
  estado.db = getFirestore(estado.app);
  estado.auth = getAuth(estado.app);
  estado.functions = getFunctions(estado.app, 'us-central1');

  setPersistence(estado.auth, browserLocalPersistence).catch(() => {});

  /* Login */
  $('#loginForm').addEventListener('submit', manejarLogin);
  $('#logoutBtn').addEventListener('click', () => signOut(estado.auth));

  /* Sesión */
  onAuthStateChanged(estado.auth, async (user) => {
    estado.usuario = user;
    if (!user) {
      $('#loginView').hidden = false;
      $('#panelView').hidden = true;
      $('#whoBox').hidden = true;
      $('#logoutBtn').hidden = true;
      return;
    }
    /* Verifica que el usuario esté en la lista blanca de administradores */
    try {
      const adminDoc = await getDoc(doc(estado.db, 'admins', user.uid));
      if (!adminDoc.exists()) {
        await signOut(estado.auth);
        aviso('Tu usuario no está autorizado como administrador. Pide que agreguen tu UID a la colección <code>admins</code>.', 'warn');
        return;
      }
    } catch (e) {
      aviso('No se pudo verificar tus permisos: ' + esc(e.message), 'warn');
      return;
    }

    $('#loginView').hidden = true;
    $('#panelView').hidden = false;
    /* El correo se muestra en el header y en el encabezado del panel */
    const correo = user.email || user.uid;
    $('#whoUserHeader').textContent = correo;
    $('#whoUserInline').textContent = correo;
    $('#whoBox').hidden = false;
    $('#logoutBtn').hidden = false;
    arrancarPanel();
  });
}

async function manejarLogin(e) {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const pass = $('#loginPassword').value;
  const btn = $('#loginBtn');
  const error = $('#loginError');
  error.classList.remove('show');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || pass.length < 6) {
    error.textContent = 'Escribe un correo válido y una contraseña de al menos 6 caracteres.';
    error.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando…';
  try {
    await signInWithEmailAndPassword(estado.auth, email, pass);
  } catch (err) {
    const mensajes = {
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/user-not-found': 'No existe un usuario con ese correo.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
    };
    error.textContent = mensajes[err.code] || 'No se pudo iniciar sesión: ' + err.message;
    error.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Entrar al panel';
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PANEL
   ═══════════════════════════════════════════════════════════════════ */

function arrancarPanel() {
  construirSelectores();
  conectarEventos();
  suscribirPush();
  /* Escucha en tiempo real: el panel se actualiza solo cuando cambia Firestore */
  onSnapshot(
    collection(estado.db, COLECCION_CLIENTES),
    (snap) => {
      estado.clientes = snap.docs.map((d) => normalizarCliente(d.id, d.data()));
      aplicarFiltros();
      pintarDashboard();
    },
    (err) => aviso('Error leyendo clientes: ' + esc(err.message), 'warn')
  );
}

/** Rellena los <select> del panel con los catálogos de firebase-config.js. */
function construirSelectores() {
  const opts = (arr) => arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');

  $('#formServicio').innerHTML = '<option value="">Selecciona…</option>' + opts(SERVICIOS);
  $('#formCategoria').innerHTML = '<option value="">No aplica</option>' + opts(CATEGORIAS_TARJETA);
  $('#formMetodoPago').innerHTML = '<option value="">Selecciona…</option>' + opts(METODOS_PAGO);
  $('#formEstado').innerHTML = opts(ESTADOS);

  $('#filtroServicio').innerHTML = '<option value="">Todos los servicios</option>' + opts(SERVICIOS);
  $('#filtroCategoria').innerHTML = '<option value="">Todas las categorías</option>' + opts(CATEGORIAS_TARJETA);
  $('#filtroEstado').innerHTML = '<option value="">Todos los estados</option>' +
    '<option value="activo">Activos</option>' +
    '<option value="inactivo">Inactivos</option>' +
    '<option value="por_vencer">Por vencer</option>';
}

/** Normaliza un documento de Firestore a un objeto plano del panel. */
function normalizarCliente(id, data) {
  const venc = aFecha(data.fechaVencimiento);
  const activ = aFecha(data.fechaActivacion);
  const dias = diasRestantes(venc);

  /* El estado se recalcula al vuelo para no mostrar datos obsoletos aunque la
     Cloud Function todavía no haya corrido ese día. */
  let estadoCalc = data.estado || 'activo';
  if (dias !== null) {
    if (dias < 0) estadoCalc = 'inactivo';
    else if (dias <= 15) estadoCalc = 'por_vencer';
    else estadoCalc = 'activo';
  }

  return {
    id,
    nombre: data.nombre || '',
    email: data.email || '',
    telefono: data.telefono || '',
    empresa: data.empresa || '',
    servicio: data.servicio || '',
    categoria: data.categoria || '',
    descripcion: data.descripcion || '',
    fechaActivacion: activ,
    fechaVencimiento: venc,
    dias,
    estado: estadoCalc,
    precio: Number(data.precio) || 0,
    metodoPago: data.metodoPago || '',
    fcmToken: data.fcmToken || '',
    notificacionesEnviadas: normalizarNotificaciones(data.notificacionesEnviadas),
    notas: data.notas || '',
    creadoEn: aFecha(data.creadoEn),
    actualizadoEn: aFecha(data.actualizadoEn)
  };
}

/** Conecta todos los eventos de la interfaz. */
function conectarEventos() {
  /* Pestañas */
  $$('.admin-tab').forEach((t) => t.addEventListener('click', () => irAPestana(t.dataset.tab)));

  /* Filtros y búsqueda */
  $('#buscar').addEventListener('input', aplicarFiltros);
  $('#filtroEstado').addEventListener('change', aplicarFiltros);
  $('#filtroServicio').addEventListener('change', aplicarFiltros);
  $('#filtroCategoria').addEventListener('change', aplicarFiltros);
  $('#limpiarFiltros').addEventListener('click', () => {
    $('#buscar').value = '';
    $('#filtroEstado').value = '';
    $('#filtroServicio').value = '';
    $('#filtroCategoria').value = '';
    aplicarFiltros();
  });

  /* Ordenamiento por columnas */
  $$('.admin-table th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const campo = th.dataset.sort;
      if (estado.orden.campo === campo) {
        estado.orden.dir = estado.orden.dir === 'asc' ? 'desc' : 'asc';
      } else {
        estado.orden = { campo, dir: 'asc' };
      }
      aplicarFiltros();
    });
  });

  /* Exportar */
  $('#exportarCsv').addEventListener('click', exportarCSV);

  /* Formulario de cliente */
  $('#clienteForm').addEventListener('submit', guardarCliente);
  $('#cancelarEdicion').addEventListener('click', () => {
    estado.edicionId = null;
    $('#clienteForm').reset();
    $('#formTitulo').textContent = 'Nuevo cliente';
    $('#btnGuardar').innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cliente';
    irAPestana('clientes');
  });
  /* Autocompletar precio según el servicio y autocalcular el vencimiento */
  $('#formServicio').addEventListener('change', (e) => {
    const ref = PRECIOS_REFERENCIA[e.target.value];
    const campoPrecio = $('#formPrecio');
    if (ref && (!campoPrecio.value || campoPrecio.dataset.auto === '1')) {
      campoPrecio.value = ref;
      campoPrecio.dataset.auto = '1';
    }
    /* La categoría solo aplica a Tarjetas Digitales */
    const esTarjeta = e.target.value === 'Tarjetas Digitales';
    $('#formCategoria').disabled = !esTarjeta;
    if (!esTarjeta) $('#formCategoria').value = '';
  });
  $('#formPrecio').addEventListener('input', (e) => { e.target.dataset.auto = '0'; });
  $('#formFechaActivacion').addEventListener('change', autocalcularVencimiento);

  /* Cerrar modales */
  $$('.admin-modal [data-close]').forEach((b) => b.addEventListener('click', () => {
    b.closest('.admin-modal').classList.remove('open');
  }));
  $$('.admin-modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('open');
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.admin-modal.open').forEach((m) => m.classList.remove('open'));
  });

  /* Botón de suscripción push */
  $('#activarPush').addEventListener('click', activarPush);
}

/** Calcula fechaVencimiento = fechaActivacion + 12 meses. */
function autocalcularVencimiento() {
  const activ = $('#formFechaActivacion').value;
  if (!activ) return;
  const venc = sumarMeses(new Date(activ + 'T00:00:00'), MESES_SUSCRIPCION);
  $('#formFechaVencimiento').value = fechaISO(venc);
}

/* ═══════════════════════════════════════════════════════════════════
   FILTROS, BÚSQUEDA Y ORDEN
   ═══════════════════════════════════════════════════════════════════ */

function aplicarFiltros() {
  const texto = $('#buscar').value.trim().toLowerCase();
  const fEstado = $('#filtroEstado').value;
  const fServicio = $('#filtroServicio').value;
  const fCategoria = $('#filtroCategoria').value;

  estado.filtrados = estado.clientes.filter((c) => {
    if (fEstado && c.estado !== fEstado) return false;
    if (fServicio && c.servicio !== fServicio) return false;
    if (fCategoria && c.categoria !== fCategoria) return false;
    if (texto) {
      const blob = [c.nombre, c.email, c.telefono, c.empresa].join(' ').toLowerCase();
      if (!blob.includes(texto)) return false;
    }
    return true;
  });

  const { campo, dir } = estado.orden;
  const signo = dir === 'asc' ? 1 : -1;
  estado.filtrados.sort((a, b) => {
    let va = a[campo];
    let vb = b[campo];
    if (campo === 'fechaVencimiento') { va = a.fechaVencimiento ? a.fechaVencimiento.getTime() : 0; vb = b.fechaVencimiento ? b.fechaVencimiento.getTime() : 0; }
    else if (campo === 'precio') { va = a.precio; vb = b.precio; }
    else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
    if (va < vb) return -1 * signo;
    if (va > vb) return 1 * signo;
    return 0;
  });

  pintarTabla();
}

function pintarTabla() {
  const cuerpo = $('#tablaClientes');
  const vacio = $('#tablaVacia');
  cuerpo.innerHTML = '';

  if (!estado.filtrados.length) {
    vacio.hidden = false;
    vacio.textContent = estado.clientes.length
      ? 'Ningún cliente coincide con los filtros aplicados.'
      : 'Todavía no hay clientes registrados. Empieza creando el primero.';
    return;
  }
  vacio.hidden = true;

  const frag = document.createDocumentFragment();
  for (const c of estado.filtrados) {
    const tr = document.createElement('tr');
    const etiquetaEstado = { activo: 'Activo', inactivo: 'Inactivo', por_vencer: 'Por vencer' }[c.estado] || c.estado;
    const vencTxt = c.fechaVencimiento
      ? `${fechaLarga(c.fechaVencimiento)}${c.dias !== null ? ` <span class="cell-muted">(${c.dias >= 0 ? 'en ' + c.dias + ' d' : 'hace ' + Math.abs(c.dias) + ' d'})</span>` : ''}`
      : '—';

    tr.innerHTML =
      `<td><span class="cell-strong">${esc(c.nombre)}</span><div class="cell-muted">${esc(c.empresa || '')}</div></td>` +
      `<td><span class="cell-muted">${esc(c.telefono || '—')}</span><div class="cell-muted">${esc(c.email || '')}</div></td>` +
      `<td><span class="badge badge-servicio">${esc(c.servicio)}</span>${c.categoria ? ' <span class="badge badge-categoria">' + esc(c.categoria) + '</span>' : ''}</td>` +
      `<td>${vencTxt}</td>` +
      `<td><span class="badge badge-${c.estado}">${esc(etiquetaEstado)}</span></td>` +
      `<td class="cell-strong">${pesos(c.precio)}</td>` +
      `<td><div class="row-actions">` +
        `<button data-accion="ver" data-id="${c.id}" title="Ver detalle" aria-label="Ver detalle de ${esc(c.nombre)}"><i class="fas fa-eye"></i></button>` +
        `<button data-accion="editar" data-id="${c.id}" title="Editar" aria-label="Editar ${esc(c.nombre)}"><i class="fas fa-pen"></i></button>` +
        `<button data-accion="renovar" data-id="${c.id}" title="Renovar 12 meses" aria-label="Renovar servicio de ${esc(c.nombre)}"><i class="fas fa-rotate"></i></button>` +
        `<button data-accion="recordar" data-id="${c.id}" title="Enviar recordatorio push" aria-label="Enviar recordatorio a ${esc(c.nombre)}"><i class="fas fa-bell"></i></button>` +
        `<button data-accion="pago" data-id="${c.id}" title="Registrar pago" aria-label="Registrar pago de ${esc(c.nombre)}"><i class="fas fa-money-bill"></i></button>` +
        `<button data-accion="eliminar" data-id="${c.id}" title="Eliminar" aria-label="Eliminar ${esc(c.nombre)}"><i class="fas fa-trash"></i></button>` +
      `</div></td>`;
    frag.appendChild(tr);
  }
  cuerpo.appendChild(frag);

  /* Delegación de eventos para las acciones de fila */
  cuerpo.onclick = (e) => {
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    const { accion, id } = btn.dataset;
    if (accion === 'ver') verCliente(id);
    if (accion === 'editar') editarCliente(id);
    if (accion === 'renovar') renovarCliente(id);
    if (accion === 'recordar') enviarRecordatorio(id);
    if (accion === 'pago') abrirModalPago(id);
    if (accion === 'eliminar') eliminarCliente(id);
  };
}

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */

function pintarDashboard() {
  const todos = estado.clientes;
  const activos = todos.filter((c) => c.estado === 'activo').length;
  const inactivos = todos.filter((c) => c.estado === 'inactivo').length;
  const porVencer = todos.filter((c) => c.estado === 'por_vencer').length;

  /* Ingresos del mes en curso (según fecha de activación) */
  const hoy = new Date();
  const ingresosMes = todos
    .filter((c) => c.fechaActivacion &&
      c.fechaActivacion.getMonth() === hoy.getMonth() &&
      c.fechaActivacion.getFullYear() === hoy.getFullYear())
    .reduce((s, c) => s + c.precio, 0);

  $('#kpiActivos').textContent = activos;
  $('#kpiInactivos').textContent = inactivos;
  $('#kpiPorVencer').textContent = porVencer;
  $('#kpiIngresos').textContent = pesos(ingresosMes);
  $('#kpiTotal').textContent = todos.length;

  /* Clientes por servicio (barras) */
  const conteo = {};
  SERVICIOS.forEach((s) => { conteo[s] = 0; });
  todos.forEach((c) => { if (conteo[c.servicio] !== undefined) conteo[c.servicio]++; });
  const maximo = Math.max(1, ...Object.values(conteo));

  $('#barrasServicio').innerHTML = SERVICIOS.map((s) => {
    const n = conteo[s];
    const pct = Math.round((n / maximo) * 100);
    return `<div class="admin-bar-row">
      <div class="row-head"><span>${esc(s)}</span><span class="cell-muted">${n} cliente${n === 1 ? '' : 's'}</span></div>
      <div class="row-track"><div class="row-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  /* Próximos vencimientos (siguientes 30 días) */
  const proximos = todos
    .filter((c) => c.dias !== null && c.dias >= 0 && c.dias <= 30)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 8);

  $('#listaProximos').innerHTML = proximos.length
    ? proximos.map((c) => `<div class="admin-bar-row">
        <div class="row-head">
          <span>${esc(c.nombre)} <span class="cell-muted">· ${esc(c.servicio)}</span></span>
          <span class="badge ${c.dias <= 5 ? 'badge-inactivo' : 'badge-por_vencer'}">${c.dias === 0 ? 'Vence hoy' : 'en ' + c.dias + ' d'}</span>
        </div>
        <div class="row-track"><div class="row-fill" style="width:${Math.max(4, 100 - (c.dias / 30) * 100)}%"></div></div>
      </div>`).join('')
    : '<p class="cell-muted">No hay vencimientos en los próximos 30 días.</p>';

  /* Estado del push */
  const conToken = todos.filter((c) => c.fcmToken).length;
  $('#pushResumen').textContent = `${conToken} de ${todos.length} clientes tienen dispositivo suscrito a notificaciones.`;
}

/* ═══════════════════════════════════════════════════════════════════
   CRUD DE CLIENTES
   ═══════════════════════════════════════════════════════════════════ */

/** Lee y valida el formulario. Devuelve un objeto o null si hay errores. */
function leerFormulario() {
  const errores = [];
  const v = (id) => $(id).value.trim();

  const datos = {
    nombre: v('#formNombre'),
    email: v('#formEmail'),
    telefono: v('#formTelefono'),
    empresa: v('#formEmpresa'),
    servicio: v('#formServicio'),
    categoria: $('#formCategoria').disabled ? '' : $('#formCategoria').value,
    descripcion: v('#formDescripcion'),
    estado: $('#formEstado').value || 'activo',
    precio: Number(v('#formPrecio')) || 0,
    metodoPago: $('#formMetodoPago').value,
    notas: v('#formNotas')
  };

  if (datos.nombre.length < 2) errores.push('El nombre debe tener al menos 2 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.email)) errores.push('El correo no es válido.');
  if (datos.telefono.replace(/\D/g, '').length < 7) errores.push('El teléfono debe tener al menos 7 dígitos.');
  if (!SERVICIOS.includes(datos.servicio)) errores.push('Selecciona un servicio válido.');

  const activacion = $('#formFechaActivacion').value;
  const vencimiento = $('#formFechaVencimiento').value;
  if (!activacion) errores.push('Indica la fecha de activación.');
  if (!vencimiento) errores.push('Indica la fecha de vencimiento.');
  if (activacion && vencimiento && new Date(vencimiento) <= new Date(activacion)) {
    errores.push('La fecha de vencimiento debe ser posterior a la de activación.');
  }

  if (errores.length) {
    $('#formError').innerHTML = '⚠️ ' + errores.map(esc).join('<br>⚠️ ');
    $('#formError').classList.add('show');
    return null;
  }
  $('#formError').classList.remove('show');

  datos.fechaActivacion = Timestamp.fromDate(new Date(activacion + 'T00:00:00'));
  datos.fechaVencimiento = Timestamp.fromDate(new Date(vencimiento + 'T00:00:00'));
  return datos;
}

async function guardarCliente(e) {
  e.preventDefault();
  const datos = leerFormulario();
  if (!datos) return;

  const btn = $('#btnGuardar');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';

  try {
    if (estado.edicionId) {
      /* En edición se conserva el historial de notificaciones y el token FCM */
      await updateDoc(doc(estado.db, COLECCION_CLIENTES, estado.edicionId), {
        ...datos,
        actualizadoEn: serverTimestamp()
      });
      aviso('Cliente actualizado correctamente.');
    } else {
      await addDoc(collection(estado.db, COLECCION_CLIENTES), {
        ...datos,
        fcmToken: '',
        notificacionesEnviadas: [],
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp()
      });
      aviso('Cliente creado correctamente.');
    }
    estado.edicionId = null;
    $('#clienteForm').reset();
    $('#formTitulo').textContent = 'Nuevo cliente';
    btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cliente';
    irAPestana('clientes');

  } catch (err) {
    $('#formError').innerHTML = '⚠️ No se pudo guardar: ' + esc(err.message);
    $('#formError').classList.add('show');
  } finally {
    btn.disabled = false;
    if (estado.edicionId === null) btn.innerHTML = original;
  }
}

function editarCliente(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;
  estado.edicionId = id;

  $('#formNombre').value = c.nombre;
  $('#formEmail').value = c.email;
  $('#formTelefono').value = c.telefono;
  $('#formEmpresa').value = c.empresa;
  $('#formServicio').value = c.servicio;
  $('#formCategoria').disabled = c.servicio !== 'Tarjetas Digitales';
  $('#formCategoria').value = c.categoria || '';
  $('#formDescripcion').value = c.descripcion;
  $('#formEstado').value = c.estado;
  $('#formPrecio').value = c.precio;
  $('#formMetodoPago').value = c.metodoPago || '';
  $('#formNotas').value = c.notas;
  $('#formFechaActivacion').value = fechaISO(c.fechaActivacion);
  $('#formFechaVencimiento').value = fechaISO(c.fechaVencimiento);

  $('#formTitulo').textContent = 'Editar cliente: ' + c.nombre;
  $('#btnGuardar').innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cambios';
  $('#formError').classList.remove('show');
  irAPestana('nuevo');
}

async function eliminarCliente(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar definitivamente a "${c.nombre}"?\n\nSe borrará su ficha y su historial de pagos. Esta acción no se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(estado.db, COLECCION_CLIENTES, id));
    aviso('Cliente eliminado.');
  } catch (err) {
    aviso('No se pudo eliminar: ' + esc(err.message), 'warn');
  }
}

/** Renueva 12 meses desde hoy (o desde el vencimiento si aún es futuro). */
async function renovarCliente(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;

  const base = (c.fechaVencimiento && c.dias > 0) ? c.fechaVencimiento : new Date();
  const nuevoVenc = sumarMeses(base, MESES_SUSCRIPCION);
  if (!confirm(`¿Renovar el servicio de "${c.nombre}"?\n\nNuevo vencimiento: ${fechaLarga(nuevoVenc)}`)) return;

  try {
    await updateDoc(doc(estado.db, COLECCION_CLIENTES, id), {
      fechaVencimiento: Timestamp.fromDate(nuevoVenc),
      estado: 'activo',
      notificacionesEnviadas: [],   // se reinician los avisos para el nuevo ciclo
      actualizadoEn: serverTimestamp()
    });
    aviso(`Servicio renovado. Nuevo vencimiento: ${fechaLarga(nuevoVenc)}.`);
  } catch (err) {
    aviso('No se pudo renovar: ' + esc(err.message), 'warn');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   DETALLE Y PAGOS
   ═══════════════════════════════════════════════════════════════════ */

async function verCliente(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;

  const notifs = c.notificacionesEnviadas.length
    ? c.notificacionesEnviadas.map((n) => `<li>${esc(n.tipo)} — ${n.fecha ? fechaLarga(aFecha(n.fecha)) : 'sin fecha'}</li>`).join('')
    : '<li>Todavía no se han enviado avisos.</li>';

  $('#detalleTitulo').textContent = c.nombre;
  $('#detalleBody').innerHTML =
    `<dl class="detail-grid">
      <div class="detail-row"><dt>Empresa</dt><dd>${esc(c.empresa || '—')}</dd></div>
      <div class="detail-row"><dt>Servicio</dt><dd>${esc(c.servicio)}${c.categoria ? ' · ' + esc(c.categoria) : ''}</dd></div>
      <div class="detail-row"><dt>Estado</dt><dd><span class="badge badge-${c.estado}">${esc(c.estado)}</span></dd></div>
      <div class="detail-row"><dt>Email</dt><dd>${esc(c.email)}</dd></div>
      <div class="detail-row"><dt>Teléfono</dt><dd><a href="https://wa.me/57${esc(c.telefono.replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan)">${esc(c.telefono)}</a></dd></div>
      <div class="detail-row"><dt>Activación</dt><dd>${fechaLarga(c.fechaActivacion)}</dd></div>
      <div class="detail-row"><dt>Vencimiento</dt><dd>${fechaLarga(c.fechaVencimiento)} ${c.dias !== null ? `(${c.dias >= 0 ? 'en ' + c.dias + ' días' : 'vencido hace ' + Math.abs(c.dias) + ' días'})` : ''}</dd></div>
      <div class="detail-row"><dt>Precio</dt><dd>${pesos(c.precio)} ${c.metodoPago ? '· ' + esc(c.metodoPago) : ''}</dd></div>
      <div class="detail-row"><dt>Push</dt><dd>${c.fcmToken ? '✅ Dispositivo suscrito' : '— Sin dispositivo suscrito'}</dd></div>
      <div class="detail-row"><dt>Notas</dt><dd>${esc(c.notas || '—')}</dd></div>
    </dl>
    <h4 style="font-family:var(--font-title);font-size:.8rem;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold);margin-bottom:.5rem;">Avisos enviados</h4>
    <ul style="font-size:.84rem;color:var(--muted);margin-bottom:1.4rem;">${notifs}</ul>
    <h4 style="font-family:var(--font-title);font-size:.8rem;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold);margin-bottom:.5rem;">Historial de pagos</h4>
    <div id="detallePagos"><p class="cell-muted">Cargando pagos…</p></div>`;

  abrirModal('#detalleModal');
  await cargarPagos(id);
}

/** Lee la subcolección `pagos` de un cliente. */
async function cargarPagos(clienteId) {
  const cont = $('#detallePagos');
  if (!cont) return;
  try {
    const snap = await getDocs(collection(estado.db, COLECCION_CLIENTES, clienteId, SUBCOLECCION_PAGOS));
    if (snap.empty) {
      cont.innerHTML = '<p class="cell-muted">Sin pagos registrados.</p>';
      return;
    }
    const pagos = snap.docs
      .map((d) => d.data())
      .sort((a, b) => (aFecha(b.fecha) || 0) - (aFecha(a.fecha) || 0));

    const total = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    cont.innerHTML =
      `<table class="detail-pagos"><thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Notas</th></tr></thead><tbody>` +
      pagos.map((p) => `<tr>
        <td>${fechaLarga(aFecha(p.fecha))}</td>
        <td>${pesos(p.monto)}</td>
        <td>${esc(p.metodo || '—')}</td>
        <td>${esc(p.notas || '—')}</td>
      </tr>`).join('') +
      `</tbody></table><p class="cell-muted" style="margin-top:.6rem;">Total registrado: <strong style="color:var(--cyan)">${pesos(total)}</strong></p>`;
  } catch (err) {
    cont.innerHTML = `<p class="cell-muted">No se pudieron cargar los pagos: ${esc(err.message)}</p>`;
  }
}

/** Abre el modal para registrar un pago en la subcolección. */
function abrirModalPago(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;
  $('#pagoClienteId').value = id;
  $('#pagoTitulo').textContent = 'Registrar pago — ' + c.nombre;
  $('#pagoForm').reset();
  $('#pagoFecha').value = fechaISO(new Date());
  $('#pagoMonto').value = c.precio || '';
  $('#pagoError').classList.remove('show');
  abrirModal('#pagoModal');
}

async function guardarPago(e) {
  e.preventDefault();
  const clienteId = $('#pagoClienteId').value;
  const monto = Number($('#pagoMonto').value) || 0;
  const fecha = $('#pagoFecha').value;
  const metodo = $('#pagoMetodo').value;
  const notas = $('#pagoNotas').value.trim();

  if (monto <= 0 || !fecha || !metodo) {
    $('#pagoError').textContent = '⚠️ El monto debe ser mayor a cero e indica fecha y método de pago.';
    $('#pagoError').classList.add('show');
    return;
  }

  try {
    await addDoc(collection(estado.db, COLECCION_CLIENTES, clienteId, SUBCOLECCION_PAGOS), {
      fecha: Timestamp.fromDate(new Date(fecha + 'T00:00:00')),
      monto,
      metodo,
      notas,
      registradoEn: serverTimestamp()
    });
    $('#pagoModal').classList.remove('open');
    aviso('Pago registrado correctamente.');
    /* Si el detalle está abierto, se refresca */
    if ($('#detalleModal').classList.contains('open')) await cargarPagos(clienteId);
  } catch (err) {
    $('#pagoError').textContent = '⚠️ No se pudo registrar el pago: ' + err.message;
    $('#pagoError').classList.add('show');
  }
}

function abrirModal(sel) {
  const m = $(sel);
  m.classList.add('open');
  const primero = m.querySelector('input, select, textarea, button');
  if (primero) primero.focus();
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORTACIÓN CSV
   ═══════════════════════════════════════════════════════════════════ */

function exportarCSV() {
  const filas = estado.filtrados.length ? estado.filtrados : estado.clientes;
  if (!filas.length) {
    aviso('No hay clientes para exportar.', 'warn');
    return;
  }

  const columnas = ['nombre', 'email', 'telefono', 'empresa', 'servicio', 'categoria',
                    'estado', 'fechaActivacion', 'fechaVencimiento', 'diasRestantes',
                    'precio', 'metodoPago', 'notas'];

  /* Excel interpreta bien el BOM UTF-8 y el separador ';' en configuración regional es-CO */
  const escapar = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

  const lineas = [columnas.map(escapar).join(';')];
  for (const c of filas) {
    lineas.push([
      c.nombre, c.email, c.telefono, c.empresa, c.servicio, c.categoria,
      c.estado, fechaISO(c.fechaActivacion), fechaISO(c.fechaVencimiento),
      c.dias === null ? '' : c.dias, c.precio, c.metodoPago, c.notas
    ].map(escapar).join(';'));
  }

  const contenido = '\uFEFF' + lineas.join('\r\n');
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `konfio-zinc-clientes-${fechaISO(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  aviso(`Exportados ${filas.length} clientes a CSV.`);
}

/* ═══════════════════════════════════════════════════════════════════
   NOTIFICACIONES PUSH (FCM)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Suscribe ESTE navegador a las notificaciones push y guarda el token en el
 * documento del cliente seleccionado.
 *
 * Nota de arquitectura: el sitio es estático (GitHub Pages), así que no hay
 * un "cliente logueado" al que asociar el token automáticamente. Por eso el
 * panel pide elegir a qué cliente pertenece el dispositivo: es la forma de
 * vincular un celular concreto (por ejemplo el del dueño del negocio) con su
 * ficha. Alternativa documentada en el README: página pública de suscripción
 * que use un enlace con el id del cliente.
 */
async function suscribirPush() {
  const cont = $('#pushEstado');
  const btn = $('#activarPush');

  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    cont.className = 'push-status err';
    cont.textContent = 'Este navegador no soporta notificaciones push.';
    btn.disabled = true;
    return;
  }

  try {
    const soportado = await isSupported();
    if (!soportado) {
      cont.className = 'push-status err';
      cont.textContent = 'Firebase Messaging no está disponible en este navegador.';
      btn.disabled = true;
      return;
    }
  } catch (e) {
    cont.className = 'push-status err';
    cont.textContent = 'No se pudo comprobar el soporte de push.';
    return;
  }

  if (Notification.permission === 'granted') {
    cont.className = 'push-status on';
    cont.textContent = '✅ Este navegador tiene permiso para recibir notificaciones.';
  } else if (Notification.permission === 'denied') {
    cont.className = 'push-status err';
    cont.textContent = '❌ Las notificaciones están bloqueadas en este navegador. Habilítalas en la configuración del sitio.';
  } else {
    cont.className = 'push-status off';
    cont.textContent = 'Este navegador aún no está suscrito a las notificaciones.';
  }

  /* Rellena el selector de cliente para vincular el dispositivo */
  const sel = $('#pushCliente');
  sel.innerHTML = '<option value="">Selecciona un cliente…</option>' +
    estado.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)} — ${esc(c.servicio)}</option>`).join('');
}

async function activarPush() {
  const clienteId = $('#pushCliente').value;
  const cont = $('#pushEstado');
  if (!clienteId) {
    cont.className = 'push-status err';
    cont.textContent = 'Selecciona primero a qué cliente pertenece este dispositivo.';
    return;
  }

  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      cont.className = 'push-status err';
      cont.textContent = 'No se concedió el permiso de notificaciones.';
      return;
    }

    if (!estado.messaging) estado.messaging = getMessaging(estado.app);

    const registro = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;

    const token = await getToken(estado.messaging, {
      vapidKey,
      serviceWorkerRegistration: registro
    });

    if (!token) {
      cont.className = 'push-status err';
      cont.textContent = 'No se obtuvo el token de notificaciones. Revisa la VAPID key en firebase-config.js.';
      return;
    }

    await updateDoc(doc(estado.db, COLECCION_CLIENTES, clienteId), {
      fcmToken: token,
      actualizadoEn: serverTimestamp()
    });

    cont.className = 'push-status on';
    cont.textContent = '✅ Dispositivo suscrito. Guardamos el token en la ficha del cliente.';
    aviso('Dispositivo suscrito a las notificaciones push.');

    /* Notificaciones con la pestaña en primer plano */
    onMessage(estado.messaging, (payload) => {
      const n = payload.notification || {};
      aviso(`🔔 <strong>${esc(n.title || 'Aviso')}</strong><br>${esc(n.body || '')}`);
    });

  } catch (err) {
    cont.className = 'push-status err';
    cont.textContent = 'Error al suscribir: ' + err.message;
  }
}

/** Envía un recordatorio push inmediato invocando la Cloud Function. */
async function enviarRecordatorio(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;
  if (!c.fcmToken) {
    aviso(`"${esc(c.nombre)}" no tiene ningún dispositivo suscrito. Pídele que abra el sitio y active las notificaciones, o escríbele por WhatsApp.`, 'warn');
    return;
  }
  try {
    const fn = httpsCallable(estado.functions, 'enviarRecordatorio');
    const res = await fn({ clienteId: id });
    aviso(`Recordatorio enviado a ${esc(c.nombre)} (${res.data.diasRestantes || 0} días restantes).`);
  } catch (err) {
    aviso('No se pudo enviar el recordatorio: ' + esc(err.message), 'warn');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   INICIO
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  init();
  /* El formulario de pago se conecta aparte porque su modal se abre después */
  const pf = $('#pagoForm');
  if (pf) pf.addEventListener('submit', guardarPago);
});
