/* ═══════════════════════════════════════════════════════════════════
   firebase-messaging-sw.js · KONFÍO ZINC
   Service Worker de Firebase Cloud Messaging (FCM) para notificaciones
   push en segundo plano: avisos 10, 5, 3 y 1 día antes del vencimiento.

   ⚠️ IMPORTANTE: un service worker no puede usar `import` de módulos ES, así
   que la configuración debe repetirse aquí en formato "compat". Si cambias
   `assets/js/firebase-config.js`, actualiza TAMBIÉN este archivo con los
   mismos valores (deben ser idénticos).

   Este archivo debe estar en la RAÍZ del sitio para que su ámbito (scope)
   cubra todas las páginas:  /card/firebase-messaging-sw.js
   ═══════════════════════════════════════════════════════════════════ */

/* SDK de Firebase en modo compat (obligatorio dentro de un service worker) */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

/* ── Configuración de Firebase (duplicada de assets/js/firebase-config.js) ── */
const firebaseConfig = {
  apiKey: 'PENDIENTE_API_KEY',
  authDomain: 'PENDIENTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PENDIENTE_PROJECT_ID',
  storageBucket: 'PENDIENTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PENDIENTE_SENDER_ID',
  appId: 'PENDIENTE_APP_ID'
};

/* Rutas absolutas del sitio (un service worker no tiene rutas relativas claras) */
const SITIO = 'https://konfiozinc.github.io/card/';
const ICONO = SITIO + 'assets/img/logos/logo.jpeg';

let messaging = null;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  messaging = firebase.messaging();
} catch (e) {
  /* Si la configuración aún está pendiente, el worker queda inerte en vez de
     romper el registro del service worker. */
  console.warn('[KZ] FCM no inicializado: revisa la configuración en firebase-messaging-sw.js');
}

/* ── Notificaciones recibidas con la app en segundo plano ──────────── */
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const notificacion = (payload && payload.notification) || {};
    const datos = (payload && payload.data) || {};

    const titulo = notificacion.title || 'KONFÍO ZINC';
    const opciones = {
      body: notificacion.body || 'Tienes una novedad sobre tu servicio.',
      icon: notificacion.icon || ICONO,
      badge: ICONO,
      data: datos,
      tag: datos.tipo ? 'kz-' + datos.tipo : 'kz-aviso',
      requireInteraction: true,
      actions: [{ action: 'renovar', title: 'Renovar ahora' }]
    };

    self.registration.showNotification(titulo, opciones);
  });
}

/* ── Clic en la notificación: abrir (o enfocar) la página de contacto ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  /* El destino puede venir en los datos del push; si no, se usa contacto.html */
  const destino = (event.notification.data && event.notification.data.url) || (SITIO + 'contacto.html');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      /* Si el sitio ya está abierto, se reutiliza esa pestaña */
      for (const cliente of lista) {
        if (cliente.url.indexOf(SITIO) === 0 && 'focus' in cliente) {
          cliente.navigate(destino);
          return cliente.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(destino);
    })
  );
});

/* ── Ciclo de vida: activar de inmediato la versión nueva ──────────── */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
