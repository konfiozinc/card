/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/admin/shell.js
   Shell del panel: sidebar, topbar y guard de autenticación.

   - requireAuth(activeKey): verifica sesión, lee el ROL desde Firestore
     (usuarios/{uid}) y dibuja el shell. Si no hay sesión, si el usuario
     no está activo o si no tiene el rol mínimo, redirige al login.
   - El rol vive en Firestore, NUNCA en el frontend: aquí solo se usa
     para pintar el menú. La autoridad real son firestore.rules y las
     Cloud Functions.
   ═══════════════════════════════════════════════════════════════════ */

import { auth, db, isConfigured, MENSAJE_NO_CONFIGURADO } from './core.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const CFG = window.KZ_CONFIG || {};
const NIVEL = (CFG.roles && CFG.roles.niveles) || { OPERADOR: 1, ADMIN: 2, SUPERADMIN: 3 };

/* Menú del panel. `min` es el rol mínimo para verlo. */
const NAV = [
  { key: 'dashboard',      label: 'Dashboard',      href: 'dashboard.html',      icono: 'fa-chart-pie',   min: 'OPERADOR' },
  { key: 'clientes',       label: 'Clientes',       href: 'clientes.html',       icono: 'fa-users',       min: 'OPERADOR' },
  { key: 'servicios',      label: 'Servicios',      href: 'servicios.html',      icono: 'fa-layer-group', min: 'OPERADOR' },
  { key: 'pagos',          label: 'Pagos',          href: 'pagos.html',          icono: 'fa-money-bill',  min: 'OPERADOR' },
  { key: 'planes',         label: 'Planes',         href: 'planes.html',         icono: 'fa-tags',        min: 'ADMIN' },
  { key: 'notificaciones', label: 'Notificaciones', href: 'notificaciones.html', icono: 'fa-bell',        min: 'ADMIN' },
  { key: 'configuracion',  label: 'Configuración',  href: 'configuracion.html',  icono: 'fa-gear',        min: 'SUPERADMIN' },
  { key: 'usuarios',       label: 'Usuarios',       href: 'usuarios.html',       icono: 'fa-user-shield', min: 'SUPERADMIN' },
  { key: 'auditoria',      label: 'Auditoría',      href: 'auditoria.html',      icono: 'fa-clipboard-list', min: 'SUPERADMIN' }
];

/**
 * ¿El rol alcanza el nivel mínimo?
 * @param {string} rol Rol del usuario
 * @param {string} min Rol mínimo exigido
 * @returns {boolean}
 */
export function canAccess(rol, min) {
  return (NIVEL[rol] || 0) >= (NIVEL[min] || 0);
}

/** Dibuja el shell completo (sidebar + topbar + contenedor de contenido). */
function renderShell(activeKey, rol, nombre) {
  const shell = document.getElementById('app-shell');
  if (!shell) return;

  const enlaces = NAV
    .filter((n) => canAccess(rol, n.min))
    .map((n) => `<a href="${n.href}" class="side__link ${n.key === activeKey ? 'is-active' : ''}">
        <i class="fas ${n.icono}" aria-hidden="true"></i><span>${n.label}</span></a>`)
    .join('');

  const activo = NAV.find((n) => n.key === activeKey);
  const titulo = activo ? activo.label : 'Panel';

  shell.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <a class="side__brand" href="dashboard.html">
        <span class="side__brand-kz">KZ</span>
        <span class="side__brand-txt">KONFÍO<small>ZINC</small></span>
      </a>
      <nav class="side__nav" aria-label="Secciones del panel">${enlaces}</nav>
      <div class="side__foot">
        <span class="side__rol" title="${(CFG.roles && CFG.roles.descripcion && CFG.roles.descripcion[rol]) || ''}">${rol}</span>
        <a class="side__link" href="../index.html" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Ver el sitio</span></a>
        <button class="btn btn--ghost btn--block" id="btn-logout" type="button">Cerrar sesión</button>
      </div>
    </aside>
    <div class="layout">
      <header class="topbar">
        <button class="topbar__burger" id="btn-burger" aria-label="Abrir menú" aria-expanded="false"><i class="fas fa-bars" aria-hidden="true"></i></button>
        <span class="topbar__title" id="topbar-title">${titulo}</span>
        <span class="topbar__user" title="${nombre}">${nombre}</span>
      </header>
      <main class="content" id="app-content"></main>
    </div>`;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
    location.replace('index.html');
  });

  /* Menú lateral en móvil */
  const burger = document.getElementById('btn-burger');
  const sidebar = document.getElementById('sidebar');
  if (burger && sidebar) {
    burger.addEventListener('click', () => {
      const abierto = sidebar.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
  }
}

/**
 * Guard de autenticación y autorización.
 * @param {string} activeKey Clave de la sección actual (para el menú).
 * @returns {Promise<{uid:string, rol:string, nombre:string, email:string}|null>}
 *          null si no hay sesión válida (y ya redirigió o mostró el aviso).
 */
export function requireAuth(activeKey) {
  if (!isConfigured()) {
    const shell = document.getElementById('app-shell');
    if (shell) shell.innerHTML = `<div class="content">${MENSAJE_NO_CONFIGURADO}</div>`;
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        location.replace('index.html');
        resolve(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const data = snap.exists() ? snap.data() : null;

        /* Sin ficha o inactivo: fuera. Un usuario autenticado en Firebase Auth
           que no tenga documento en `usuarios` no puede entrar al panel. */
        if (!data || data.activo !== true) {
          await signOut(auth);
          location.replace('index.html?motivo=sin-permiso');
          resolve(null);
          return;
        }

        /* La sección pedida exige un rol que este usuario no tiene */
        const seccion = NAV.find((n) => n.key === activeKey);
        if (seccion && !canAccess(data.rol, seccion.min)) {
          location.replace('dashboard.html?motivo=sin-permiso');
          resolve(null);
          return;
        }

        renderShell(activeKey, data.rol, data.nombre || user.email);

        /* Marca de último acceso (no bloquea la carga si falla) */
        updateDoc(doc(db, 'usuarios', user.uid), { ultimoAcceso: serverTimestamp() }).catch(() => {});

        resolve({ uid: user.uid, rol: data.rol, nombre: data.nombre || '', email: user.email || '' });
      } catch (err) {
        console.error('[KZ] Error al verificar el rol:', err);
        const shell = document.getElementById('app-shell');
        if (shell) {
          shell.innerHTML = `<div class="content"><div class="nocfg">
            <h1>No se pudo verificar tu acceso</h1>
            <p>${String(err.message || err)}</p>
            <p>Si acabas de configurar Firebase, revisa que las reglas de Firestore estén desplegadas
            (<code>firebase deploy --only firestore:rules</code>) y que tu documento exista en la
            colección <code>usuarios</code> con <code>activo: true</code>.</p>
            <a class="btn btn--ghost" href="index.html">Volver al inicio del panel</a>
          </div></div>`;
        }
        resolve(null);
      }
    });
  });
}

/** Cierra la sesión (útil desde cualquier página). */
export async function logout() {
  await signOut(auth);
  location.replace('index.html');
}
