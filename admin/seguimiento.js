/* KZ-UNIFICACION-002 · Seguimiento comercial dentro de Card Spark.
 * Reutiliza la sesión y los roles del panel (sesion/canAccess), el SDK de Firebase
 * ya cargado y la colección nueva crm_prospectos. No abre otro panel ni otro login.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, query, where, orderBy, getDocs, doc, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';

const ESTADOS = ['NUEVO', 'PENDIENTE_CONTACTAR', 'CONTACTADO', 'COTIZACION_ENVIADA', 'NEGOCIACION', 'GANADO', 'PERDIDO'];
const TRANSICIONES = {
  NUEVO: ['PENDIENTE_CONTACTAR', 'CONTACTADO', 'PERDIDO'],
  PENDIENTE_CONTACTAR: ['CONTACTADO', 'PERDIDO'],
  CONTACTADO: ['COTIZACION_ENVIADA', 'NEGOCIACION', 'PERDIDO'],
  COTIZACION_ENVIADA: ['NEGOCIACION', 'GANADO', 'PERDIDO'],
  NEGOCIACION: ['GANADO', 'PERDIDO'],
  GANADO: [],
  PERDIDO: ['PENDIENTE_CONTACTAR'],
};
const SERVICIOS = ['Mini Web Básica', 'Mini Web Pro', 'Catálogo', 'Menú digital', 'Landing page', 'Otro'];
const digitos = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const huella = (n, t, s) => (norm(n) + '|' + digitos(t) + '|' + norm(s)).slice(0, 180);

/* ── Próximo contacto (KZ-SEGUIMIENTO-001) ────────────────────────────────
   El cálculo vive en seguimiento-fechas.js: sin dependencias, para poder
   probarlo en Node. Aquí solo se usa. */
import { hoyISO, diasPara, estadoAgenda, validarProxima } from './seguimiento-fechas.js';

function aviso(msg, tipo) {
  const caja = document.getElementById('vg-aviso');
  if (!caja) return;
  /* Clases REALES del panel: `.vg-aviso` no existe en ninguna hoja del
     repositorio, así que el mensaje se veía sin estilo. `.aviso` y
     `.aviso--error` sí están definidas en assets/css/admin.css. */
  caja.textContent = msg || '';
  caja.className = 'aviso' + (tipo === 'error' ? ' aviso--error' : '');
  caja.hidden = !msg;
}

export async function iniciarSeguimiento() {
  /* Sesion REAL del panel: misma autenticacion y mismos roles que el resto. */
  const sesion = await requireAuth('seguimiento');
  /* requireAuth NO resuelve cuando niega el acceso (devuelve `bloqueado()`) y la
     pagina queda suspendida tras redirigir. Si resolviera null por un fallo al
     verificar el rol, se sale aqui sin tocar la seccion, que sigue oculta: la
     pagina falla cerrada en vez de reventar con un TypeError. */
  if (!sesion) { aviso('No se pudo verificar el acceso.', 'error'); return; }
  const app = getApps()[0] || null;
  if (!app) { aviso('El panel no inicializo Firebase.', 'error'); return; }
  const db = getFirestore(app);
  const admin = canAccess(sesion.rol, 'ADMIN') || canAccess(sesion.rol, 'SUPERADMIN');
  const seccion = document.getElementById('vg-seguimiento');
  if (!seccion) return;
  /* `hidden` (atributo nativo) y no una clase: la clase `oculto` no está definida
     en ninguna hoja del repositorio, así que no ocultaba nada y la sección era
     visible sin sesión (defecto demostrado en la corrida del 15-nov-2026). */
  if (!admin) { seccion.hidden = true; return; }
  seccion.hidden = false;

  const sel = document.getElementById('vg-estado');
  if (sel) sel.innerHTML = ESTADOS.map((e) => '<option>' + e + '</option>').join('');
  const serv = document.getElementById('vg-servicio');
  if (serv) serv.innerHTML = SERVICIOS.map((s) => '<option>' + s + '</option>').join('');
  /* Señal de módulo inicializado con sesión autorizada: la prueba visual exige
     este marcador en vez de conformarse con "la sección se ve". */
  seccion.dataset.listo = '1';

  /* Alerta operativa: cuántos seguimientos están vencidos o tocan hoy.
     Spark no tiene procesos en segundo plano, así que se deriva al pintar. */
  function pintarAlertas(filas) {
    const caja = document.getElementById('vg-alertas');
    if (!caja) return;
    const vencidos = filas.filter((f) => f.agenda === 'vencido').length;
    const hoy = filas.filter((f) => f.agenda === 'hoy').length;
    if (!vencidos && !hoy) { caja.hidden = true; caja.textContent = ''; return; }
    const partes = [];
    if (vencidos) partes.push('<span class="badge badge--error">' + vencidos + (vencidos === 1 ? ' vencido' : ' vencidos') + '</span>');
    if (hoy) partes.push('<span class="badge badge--por_vencer">' + hoy + (hoy === 1 ? ' para hoy' : ' para hoy') + '</span>');
    partes.push('Hay seguimientos que reclamar: usa <strong>Agendar</strong> para reprogramar o pasa el estado.');
    caja.innerHTML = partes.join(' ');
    caja.hidden = false;
  }

  function badgeAgenda(fecha) {
    const estado = estadoAgenda(fecha);
    if (estado === 'sin') return '<span class="celda-suave">Sin agendar</span>';
    const dias = diasPara(fecha);
    if (estado === 'vencido') return '<span class="badge badge--error">Vencido hace ' + Math.abs(dias) + (Math.abs(dias) === 1 ? ' día' : ' días') + '</span>';
    if (estado === 'hoy') return '<span class="badge badge--por_vencer">Hoy</span>';
    return '<span class="badge badge--activo">En ' + dias + (dias === 1 ? ' día' : ' días') + '</span>';
  }

  async function pintar() {
    const caja = document.getElementById('vg-lista');
    caja.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
    try {
      const snap = await getDocs(query(collection(db, 'crm_prospectos'), orderBy('actualizadoEn', 'desc')));
      if (snap.empty) {
        caja.innerHTML = '<tr><td colspan="5">Sin prospectos todavía.</td></tr>';
        pintarAlertas([]);
        return;
      }
      /* Los vencidos van primero: es la lista de llamadas del día. */
      const filas = snap.docs.map((d) => {
        const p = d.data();
        return { id: d.id, p, agenda: estadoAgenda(p.proximaFecha), dias: diasPara(p.proximaFecha) };
      }).sort((a, b) => {
        const orden = { vencido: 0, hoy: 1, aldia: 2, sin: 3 };
        if (orden[a.agenda] !== orden[b.agenda]) return orden[a.agenda] - orden[b.agenda];
        return (a.dias ?? 1e9) - (b.dias ?? 1e9);
      });
      caja.innerHTML = filas.map(({ id, p }) => {
        const siguiente = (TRANSICIONES[p.estado] || [])[0] || '';
        return '<tr><td>' + esc(p.nombre) + '</td><td>' + esc(p.estado) + '</td><td>' + esc(p.servicio) +
          '</td><td>' + esc(p.proximaFecha || '—') + '<br>' + badgeAgenda(p.proximaFecha) + '</td><td>' +
          (siguiente ? '<button data-mover="' + esc(id) + '" data-hacia="' + siguiente + '">Pasar a ' + siguiente + '</button>' : '—') +
          ' <button data-agendar="' + esc(id) + '" data-fecha="' + esc(p.proximaFecha || '') + '">Agendar</button>' +
          ' <button data-nota="' + esc(id) + '">Nota</button></td></tr>';
      }).join('');
      pintarAlertas(filas);
    } catch (e) { caja.innerHTML = '<tr><td colspan="5">No se pudo leer: ' + esc(e.code || 'error') + '</td></tr>'; }
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.getElementById('vg-alta').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nombre = document.getElementById('vg-nombre').value.trim();
    const telefono = document.getElementById('vg-telefono').value.trim();
    const servicio = document.getElementById('vg-servicio').value;
    if (nombre.length < 2 || digitos(telefono).length < 7) { aviso('Nombre y teléfono son obligatorios.', 'error'); return; }
    const h = huella(nombre, telefono, servicio);
    let proxima;
    try { proxima = validarProxima(document.getElementById('vg-proxima') ? document.getElementById('vg-proxima').value : ''); }
    catch (e) {
      aviso(e.message === 'FECHA_FUERA_DE_RANGO'
        ? 'La fecha de próximo contacto debe estar entre un año atrás y dos adelante.'
        : 'La fecha de próximo contacto no es válida.', 'error');
      return;
    }
    aviso('Guardando…');
    try {
      /* Antiduplicado ATÓMICO: el id del documento deriva de la huella, así que dos
         altas simultáneas escriben el MISMO documento y Firestore serializa las
         transacciones: la segunda ve el documento y se rechaza. Transaction.get solo
         admite DocumentReference, por eso no se usa una consulta dentro del tx.
         El id es un SHA-256: no contiene el teléfono ni el nombre en claro. */
      const idDuplicado = 'p' + (await crypto.subtle.digest('SHA-256', new TextEncoder().encode(h)))
        .slice(0, 0) && await (async () => {
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(h));
          return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
        })();
      const nuevo = doc(db, 'crm_prospectos', idDuplicado);
      await runTransaction(db, async (tx) => {
        const choque = await tx.get(nuevo);
        if (choque.exists()) throw new Error('DUPLICADO');
        /* El historial NO vive en el documento: cada acción es inmutable. */
        tx.set(nuevo, {
          nombre, telefono, servicio, huella: h, origen: 'manual', estado: 'NUEVO',
          proximaFecha: proxima, notas: [],
          creadoPor: sesion.uid, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(), version: 1,
        });
        tx.set(doc(collection(db, 'crm_prospectos', idDuplicado, 'acciones')), {
          tipo: 'alta', autor: sesion.uid, fecha: serverTimestamp(),
        });
        /* Agendar es un acto con fecha propia: queda como acción inmutable,
           no se deduce del documento (que se puede editar). */
        if (proxima) {
          tx.set(doc(collection(db, 'crm_prospectos', idDuplicado, 'acciones')), {
            tipo: 'agenda', detalle: proxima, autor: sesion.uid, fecha: serverTimestamp(),
          });
        }
      });
      aviso('Prospecto registrado.', 'exito');
      ev.target.reset();
      pintar();
    } catch (e) {
      aviso(e.message === 'DUPLICADO' ? 'Ese prospecto ya existe.' : 'No se pudo guardar: ' + (e.code || e.message), 'error');
    }
  });

  document.getElementById('vg-lista').addEventListener('click', async (ev) => {
    const mover = ev.target.closest('button[data-mover]');
    const nota = ev.target.closest('button[data-nota]');
    const agendar = ev.target.closest('button[data-agendar]');
    try {
      if (mover) {
        const id = mover.getAttribute('data-mover');
        const hacia = mover.getAttribute('data-hacia');
        mover.disabled = true;
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'crm_prospectos', id);
          const actual = await tx.get(ref);
          if (!actual.exists()) throw new Error('NO_EXISTE');
          const p = actual.data();
          if (!(TRANSICIONES[p.estado] || []).includes(hacia)) throw new Error('TRANSICION_INVALIDA');
          tx.update(ref, {
            estado: hacia,
            actualizadoEn: serverTimestamp(),
            version: (p.version || 1) + 1,
          });
          tx.set(doc(collection(db, 'crm_prospectos', id, 'acciones')), {
            tipo: 'estado', desde: p.estado, hacia, autor: sesion.uid, fecha: serverTimestamp(),
          });
        });
        aviso('Estado actualizado.', 'exito');
        pintar();
      }
      if (agendar) {
        const id = agendar.getAttribute('data-agendar');
        const actual = agendar.getAttribute('data-fecha') || '';
        const entrada = prompt('Próximo contacto (AAAA-MM-DD). Déjalo vacío para quitarlo:', actual || hoyISO());
        if (entrada === null) return;
        let proxima;
        try { proxima = validarProxima(entrada); }
        catch (e) {
          aviso('Fecha no válida: usa AAAA-MM-DD, entre un año atrás y dos adelante.', 'error');
          return;
        }
        agendar.disabled = true;
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'crm_prospectos', id);
          const actual2 = await tx.get(ref);
          if (!actual2.exists()) throw new Error('NO_EXISTE');
          const p = actual2.data();
          tx.update(ref, {
            proximaFecha: proxima,
            actualizadoEn: serverTimestamp(),
            version: (p.version || 1) + 1,
          });
          /* Cada reagendado deja su acción: se puede reconstruir la historia. */
          tx.set(doc(collection(db, 'crm_prospectos', id, 'acciones')), {
            tipo: 'agenda', detalle: proxima || 'sin fecha', autor: sesion.uid, fecha: serverTimestamp(),
          });
        });
        aviso(proxima ? 'Próximo contacto agendado para el ' + proxima + '.' : 'Próximo contacto eliminado.', 'exito');
        pintar();
      }
      if (nota) {
        const id = nota.getAttribute('data-nota');
        const texto = prompt('Nota de seguimiento (máx. 300 caracteres):');
        if (!texto || texto.trim().length < 2) return;
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'crm_prospectos', id);
          const actual = await tx.get(ref);
          if (!actual.exists()) throw new Error('NO_EXISTE');
          const p = actual.data();
          tx.update(ref, {
            notas: [...(p.notas || []), texto.trim().slice(0, 300)],
            actualizadoEn: serverTimestamp(),
            version: (p.version || 1) + 1,
          });
          tx.set(doc(collection(db, 'crm_prospectos', id, 'acciones')), {
            tipo: 'nota', detalle: texto.trim().slice(0, 300), autor: sesion.uid, fecha: serverTimestamp(),
          });
        });
        aviso('Nota guardada.', 'exito');
        pintar();
      }
    } catch (e) { aviso('Operación rechazada: ' + (e.code || e.message), 'error'); pintar(); }
  });

  const buscar = document.getElementById('vg-buscar');
  if (buscar) buscar.addEventListener('input', () => {
    const q = norm(buscar.value);
    Array.prototype.forEach.call(document.querySelectorAll('#vg-lista tr'), (tr) => {
      tr.style.display = !q || norm(tr.textContent).includes(q) ? '' : 'none';
    });
  });

  pintar();
}
