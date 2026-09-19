/* ── login.js · acceso al panel ────────────────────────────────────── */
import { auth, db, isConfigured, MENSAJE_NO_CONFIGURADO } from '../assets/js/admin/core.js';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const root = document.getElementById('login-root');
const form = document.getElementById('login-form');
const email = document.getElementById('login-email');
const pass = document.getElementById('login-pass');
const btn = document.getElementById('login-btn');
const err = document.getElementById('login-error');

function mostrarError(m) {
  err.textContent = m;
  err.hidden = false;
}

/* Sin Firebase: mostrar el aviso de configuración */
if (!isConfigured()) {
  root.innerHTML = `<div class="content">${MENSAJE_NO_CONFIGURADO}</div>`;
} else {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!email.value.trim() || !pass.value) return mostrarError('Escribe tu correo y contraseña.');
    err.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Entrando…';
    try {
      const cred = await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
      /* Verificación del permiso real: el usuario debe tener ficha activa */
      const snap = await getDoc(doc(db, 'usuarios', cred.user.uid));
      const data = snap.exists() ? snap.data() : null;
      if (!data || data.activo !== true) {
        await import('firebase/auth').then(m => m.signOut(auth));
        return mostrarError('Tu usuario no está autorizado. Pide a un SUPERADMIN que te active.');
      }
      location.replace('dashboard.html');
    } catch (e2) {
      const map = {
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/user-not-found': 'No existe un usuario con ese correo.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.'
      };
      mostrarError(map[e2.code] || e2.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-right-to-bracket" aria-hidden="true"></i> Entrar al panel';
    }
  });
}
