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

function aviso(msg, tipo) {
  const caja = document.getElementById('vg-aviso');
  if (!caja) return;
  caja.textContent = msg || '';
  caja.className = 'vg-aviso' + (tipo ? ' ' + tipo : '');
}

export async function iniciarSeguimiento() {
  /* Sesion REAL del panel: misma autenticacion y mismos roles que el resto. */
  const sesion = await requireAuth('seguimiento');
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

  async function pintar() {
    const caja = document.getElementById('vg-lista');
    caja.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
    try {
      const snap = await getDocs(query(collection(db, 'crm_prospectos'), orderBy('actualizadoEn', 'desc')));
      if (snap.empty) { caja.innerHTML = '<tr><td colspan="5">Sin prospectos todavía.</td></tr>'; return; }
      caja.innerHTML = snap.docs.map((d) => {
        const p = d.data();
        const siguiente = (TRANSICIONES[p.estado] || [])[0] || '';
        return '<tr><td>' + esc(p.nombre) + '</td><td>' + esc(p.estado) + '</td><td>' + esc(p.servicio) +
          '</td><td>' + esc(p.proximaFecha || '—') + '</td><td>' +
          (siguiente ? '<button data-mover="' + d.id + '" data-hacia="' + siguiente + '">Pasar a ' + siguiente + '</button>' : '—') +
          ' <button data-nota="' + d.id + '">Nota</button></td></tr>';
      }).join('');
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
          proximaFecha: '', notas: [],
          creadoPor: sesion.uid, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(), version: 1,
        });
        tx.set(doc(collection(db, 'crm_prospectos', idDuplicado, 'acciones')), {
          tipo: 'alta', autor: sesion.uid, fecha: serverTimestamp(),
        });
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
