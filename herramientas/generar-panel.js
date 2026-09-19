#!/usr/bin/env node
/**
 * Genera el esqueleto HTML de las páginas del panel /admin/.
 * Idempotente: si el archivo ya existe, lo respeta (no pisa trabajo).
 * El login (index.html) tiene su propio layout; el resto comparte shell.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const DIR = path.join(REPO, 'admin');
fs.mkdirSync(DIR, { recursive: true });

const PAGES = [
  ['dashboard.html',      'Dashboard',      'dashboard.js'],
  ['clientes.html',       'Clientes',       'clientes.js'],
  ['servicios.html',      'Servicios',      'servicios.js'],
  ['pagos.html',          'Pagos',          'pagos.js'],
  ['planes.html',         'Planes',         'planes.js'],
  ['notificaciones.html', 'Notificaciones', 'notificaciones.js'],
  ['configuracion.html',  'Configuración',  'configuracion.js'],
  ['usuarios.html',       'Usuarios',       'usuarios.js'],
  ['auditoria.html',      'Auditoría',      'auditoria.js']
];

function pageHTML(titulo, script) {
  return `<!DOCTYPE html>
<html lang="es-CO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${titulo} — Panel KONFÍO ZINC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" href="../assets/css/admin.css" />
  <link rel="icon" href="../assets/img/logos/logo.jpeg" type="image/jpeg" />
  <script type="importmap">
  { "imports": {
      "firebase/app": "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
      "firebase/auth": "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
      "firebase/firestore": "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
      "firebase/functions": "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js",
      "firebase/messaging": "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js"
  } }
  </script>
</head>
<body>
  <div id="app-shell"></div>
  <script src="../assets/js/config.js"></script>
  <script type="module" src="${script}"></script>
</body>
</html>
`;
}

function loginHTML() {
  return `<!DOCTYPE html>
<html lang="es-CO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Acceso — Panel KONFÍO ZINC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" href="../assets/css/admin.css" />
  <link rel="icon" href="../assets/img/logos/logo.jpeg" type="image/jpeg" />
  <script type="importmap">
  { "imports": {
      "firebase/app": "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
      "firebase/auth": "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
      "firebase/firestore": "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
      "firebase/functions": "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"
  } }
  </script>
</head>
<body>
  <main class="login" id="login-root">
    <section class="login__card">
      <div class="login__logo">
        <span class="login__logo-kz" aria-hidden="true">KZ</span>
        <span class="login__logo-txt">KONFÍO ZINC<small>Panel de administración</small></span>
      </div>
      <p class="login__sub">Acceso exclusivo del equipo. No hay registro público: los usuarios los crea un SUPERADMIN.</p>
      <form id="login-form" novalidate>
        <div class="campo">
          <label for="login-email">Correo electrónico</label>
          <input type="email" id="login-email" autocomplete="username" placeholder="tu@correo.com" required />
        </div>
        <div class="campo">
          <label for="login-pass">Contraseña</label>
          <input type="password" id="login-pass" autocomplete="current-password" placeholder="••••••••" required />
        </div>
        <div class="aviso aviso--error" id="login-error" hidden></div>
        <button class="btn btn--primary btn--block" type="submit" id="login-btn"><i class="fas fa-right-to-bracket" aria-hidden="true"></i> Entrar al panel</button>
      </form>
      <p class="campo__nota" style="margin-top:1rem;">Si olvidaste tu contraseña, un SUPERADMIN la restablece desde Firebase Console → Authentication.</p>
    </section>
  </main>
  <script src="../assets/js/config.js"></script>
  <script type="module" src="login.js"></script>
</body>
</html>
`;
}

const creados = [];
if (!fs.existsSync(path.join(DIR, 'index.html'))) {
  fs.writeFileSync(path.join(DIR, 'index.html'), loginHTML());
  creados.push('admin/index.html (login)');
} else { creados.push('admin/index.html (ya existía)'); }

for (const [archivo, titulo, script] of PAGES) {
  const p = path.join(DIR, archivo);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, pageHTML(titulo, script));
    creados.push('admin/' + archivo);
  }
}

console.log('Páginas del panel:');
creados.forEach(c => console.log('  · ' + c));
