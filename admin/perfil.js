/* ── perfil.js · Mi perfil y cambio de contraseña ─────────────────────
   Misión KZ-CRM-PASSWORD-UI-001.

   Permite que cualquier usuario con sesión abierta cambie su propia
   contraseña desde el panel, sin scripts externos ni correos.

   Cómo funciona (todo en el navegador, sin backend: el plan Spark no
   permite Cloud Functions):
     1. Reautenticación con la contraseña ACTUAL (Firebase exige un inicio
        de sesión reciente para operaciones sensibles).
     2. updatePassword con la contraseña NUEVA.
     3. Refresco del token de esta sesión.

   LÍMITE DECLARADO: el SDK de cliente de Firebase no puede revocar los
   tokens de actualización de otros equipos; `revokeRefreshTokens` es una
   operación EXCLUSIVA del Admin SDK (https://firebase.google.com/docs/auth/admin/manage-sessions).
   Cambiar la contraseña, por sí solo, no expulsa a quien ya esté dentro.
   La página lo dice en voz alta y remite a la herramienta local que sí
   puede hacerlo: herramientas/admin-spark.js --revocar-sesiones.
   ──────────────────────────────────────────────────────────────────── */

import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { auth } from '../assets/js/admin/core.js';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from 'firebase/auth';

const MINIMO = 8;

const sesion = await requireAuth('perfil');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Mi perfil');

const cont = document.getElementById('app-content');

cont.innerHTML = `
  <div class="page-head">
    <div>
      <h2>Mi perfil</h2>
      <p class="celda-suave">Sesión abierta como <strong>${esc(sesion.email || '')}</strong> · rol ${esc(sesion.rol)}</p>
    </div>
  </div>

  <div class="card">
    <h3>Cambiar mi contraseña</h3>
    <p class="celda-suave">Escribe tu contraseña actual (Firebase la exige para autorizar el cambio)
      y la nueva dos veces. Mínimo ${MINIMO} caracteres.</p>
    <form id="pw-form" novalidate autocomplete="on">
      <div class="campo">
        <label for="pw-actual">Contraseña actual</label>
        <input type="password" id="pw-actual" autocomplete="current-password" placeholder="••••••••" required />
      </div>
      <div class="campo">
        <label for="pw-nueva">Nueva contraseña</label>
        <input type="password" id="pw-nueva" autocomplete="new-password" placeholder="••••••••" required />
        <span class="campo__nota">Al menos ${MINIMO} caracteres. Puedes usar letras, números y símbolos.</span>
      </div>
      <div class="campo">
        <label for="pw-confirmar">Confirmar nueva contraseña</label>
        <input type="password" id="pw-confirmar" autocomplete="new-password" placeholder="••••••••" required />
        <span class="campo__nota" id="pw-coincide"></span>
      </div>
      <div class="campo campo--check">
        <input type="checkbox" id="pw-ver" />
        <label for="pw-ver">Mostrar las contraseñas</label>
      </div>
      <div class="aviso aviso--error" id="pw-error" hidden></div>
      <div class="aviso aviso--ok" id="pw-ok" hidden></div>
      <button class="btn btn--primary" type="submit" id="pw-btn">
        <i class="fas fa-key" aria-hidden="true"></i> Cambiar contraseña
      </button>
      <button class="btn btn--ghost" type="button" id="pw-salir" hidden>
        <i class="fas fa-right-from-bracket" aria-hidden="true"></i> Salir y volver a entrar
      </button>
    </form>
  </div>

  <div class="card">
    <h3>Sobre las sesiones abiertas en otros equipos</h3>
    <p class="celda-suave">Cambiar la contraseña <strong>no cierra</strong> las sesiones que ya estén
      abiertas en otros dispositivos: Firebase las mantiene hasta que se revocan sus tokens de
      actualización, y esa revocación solo puede hacerla el Admin SDK (este panel es estático y el
      plan Spark no permite Cloud Functions).</p>
    <p class="celda-suave">Si necesitas cerrarlas de verdad, el administrador puede ejecutar en el
      ASUS autorizado:</p>
    <pre class="celda-suave" style="white-space:pre-wrap;margin:.4rem 0 0;">node herramientas/admin-spark.js --revocar-sesiones --email ${esc(sesion.email || 'tu@correo.com')} --aplicar --autorizado-por "Nombre Apellido"</pre>
  </div>`;

const $ = (id) => document.getElementById(id);
/** Lee el valor tal cual: en una contraseña los espacios cuentan, no se recortan. */
const leer = (id) => { const el = $(id); return el ? el.value : ''; };

function mostrarError(mensaje) {
  const e = $('pw-error');
  e.textContent = mensaje;
  e.hidden = false;
  $('pw-ok').hidden = true;
}

function mostrarOk(mensaje) {
  const o = $('pw-ok');
  o.textContent = mensaje;
  o.hidden = false;
  $('pw-error').hidden = true;
}

/** Marca un campo, lo enfoca y explica el motivo. */
function marcar(id, mensaje) {
  const el = $(id);
  if (el) {
    el.classList.add('is-invalid');
    el.focus();
    el.addEventListener('input', () => el.classList.remove('is-invalid'), { once: true });
  }
  mostrarError(mensaje);
  toast(mensaje, 'error');
  return false;
}

function limpiarCampos() {
  for (const id of ['pw-actual', 'pw-nueva', 'pw-confirmar']) {
    const el = $(id);
    if (el) el.value = '';
  }
  $('pw-ver').checked = false;
  aplicarVisibilidad();
  $('pw-coincide').textContent = '';
}

function aplicarVisibilidad() {
  const ver = $('pw-ver').checked;
  for (const id of ['pw-actual', 'pw-nueva', 'pw-confirmar']) {
    const el = $(id);
    if (el) el.type = ver ? 'text' : 'password';
  }
}

/* Aviso en vivo de coincidencia mientras se escribe la confirmación */
$('pw-confirmar').addEventListener('input', () => {
  const nueva = leer('pw-nueva');
  const conf = leer('pw-confirmar');
  const nota = $('pw-coincide');
  if (!conf) { nota.textContent = ''; $('pw-confirmar').classList.remove('is-invalid'); return; }
  if (nueva === conf) {
    nota.textContent = '✓ Coinciden.';
    $('pw-confirmar').classList.remove('is-invalid');
  } else {
    nota.textContent = '✗ Todavía no coinciden.';
    $('pw-confirmar').classList.add('is-invalid');
  }
});

$('pw-ver').addEventListener('change', aplicarVisibilidad);

$('pw-salir').addEventListener('click', async () => {
  await signOut(auth);
  location.replace('index.html');
});

/* Traducción de los errores de Firebase a algo que se entienda */
const MENSAJES = {
  'auth/wrong-password': 'La contraseña actual no es correcta.',
  'auth/invalid-credential': 'La contraseña actual no es correcta.',
  'auth/invalid-login-credentials': 'La contraseña actual no es correcta.',
  'auth/weak-password': 'Firebase rechaza la contraseña nueva por débil. Usa al menos 8 caracteres, con letras y números.',
  'auth/requires-recent-login': 'Por seguridad hay que volver a entrar antes de cambiarla. Cierra sesión, entra otra vez e inténtalo de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
  'auth/network-request-failed': 'Sin conexión con Firebase. Revisa tu internet e inténtalo otra vez.',
  'auth/user-token-expired': 'La sesión caducó. Vuelve a entrar al panel.',
  'auth/user-disabled': 'La cuenta está deshabilitada. Habla con el administrador.'
};

$('pw-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('pw-error').hidden = true;
  $('pw-ok').hidden = true;
  $('pw-salir').hidden = true;

  const actual = leer('pw-actual');
  const nueva = leer('pw-nueva');
  const confirmar = leer('pw-confirmar');

  /* 1 · Validación en el navegador, antes de molestar a Firebase */
  if (!actual) return marcar('pw-actual', 'Escribe tu contraseña actual.');
  if (!nueva) return marcar('pw-nueva', 'Escribe la contraseña nueva.');
  if (nueva.length < MINIMO) return marcar('pw-nueva', `La contraseña nueva debe tener al menos ${MINIMO} caracteres.`);
  if (nueva === actual) return marcar('pw-nueva', 'La contraseña nueva debe ser distinta de la actual.');
  if (!confirmar) return marcar('pw-confirmar', 'Repite la contraseña nueva en el campo de confirmación.');
  if (nueva !== confirmar) return marcar('pw-confirmar', 'Las contraseñas nuevas no coinciden. Escríbelas igual en los dos campos.');

  const btn = $('pw-btn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Cambiando…';

  try {
    const user = auth.currentUser;
    if (!user) {
      const e = new Error('No hay una sesión abierta.');
      e.code = 'kz/sin-sesion';
      throw e;
    }

    /* 2 · Reautenticación: Firebase exige credencial reciente */
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, actual));

    /* 3 · Cambio de contraseña */
    await updatePassword(user, nueva);

    /* 4 · Token de esta sesión al día (si falla, no invalida el cambio) */
    await user.getIdToken(true).catch(() => {});

    mostrarOk('Contraseña actualizada. Desde ahora entra con la nueva. Tu sesión aquí sigue abierta.');
    toast('Contraseña actualizada', 'ok');
    limpiarCampos();
    $('pw-salir').hidden = false;
  } catch (err) {
    const codigo = err && err.code ? String(err.code) : '';
    mostrarError(MENSAJES[codigo] || (codigo ? `No se pudo cambiar (${codigo}): ${err.message}` : (err.message || 'No se pudo cambiar la contraseña.')));
    toast('No se pudo cambiar la contraseña', 'error');
    if (codigo === 'auth/wrong-password' || codigo === 'auth/invalid-credential' || codigo === 'auth/invalid-login-credentials') {
      const el = $('pw-actual');
      el.classList.add('is-invalid');
      el.focus();
      el.addEventListener('input', () => el.classList.remove('is-invalid'), { once: true });
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});
