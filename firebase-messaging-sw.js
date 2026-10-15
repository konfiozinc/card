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
  apiKey: 'AIzaSyDbwAk9APwP2SeaEfWxeQG_bdL9eatciEA',
  authDomain: 'konfio-zinc.firebaseapp.com',
  projectId: 'konfio-zinc',
  storageBucket: 'konfio-zinc.firebasestorage.app',
  messagingSenderId: '1096915735255',
  appId: '1:1096915735255:web:00e3d896c266293cced692'
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

/* ══════════════════════════════════════════════════════════════════════════
   CACHE PWA (parte 2). Se agrega AL FINAL a proposito: no se toca ni una linea
   de las notificaciones push de arriba. Varios addEventListener('install'|
   'activate') son legales, asi que este bloque trae los suyos.
   Estrategia: HTML network-first (con pagina de sin conexion sintetizada),
   CSS/JS stale-while-revalidate (los assets no llevan version en la URL).
   Excluidos siempre: Firebase/FCM, Google, analitica, Cloudinary y el panel.
   ══════════════════════════════════════════════════════════════════════════ */
const KZ_CACHE = 'kz-card-v1';
const KZ_PRECACHE = [
  './',
  'index.html',
  'assets/css/styles.css',
  'assets/js/main.js',
  'manifest.json'
];
const KZ_EXCLUIDOS = [
  '/admin', '/panel', 'push.js', 'firebase-messaging-sw.js',
  'firebaseio.com', 'googleapis.com', 'gstatic.com', 'firebaseapp.com',
  'fcm.googleapis.com', 'google-analytics.com', 'googletagmanager.com',
  'cloudinary.com', 'res.cloudinary.com'
];
const KZ_OFFLINE = '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Sin conexion - KONFIO ZINC</title>' +
  '<style>body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;' +
  'display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}' +
  'h1{color:#F0B429;font-size:22px;margin:0 0 10px}p{margin:0 0 18px;opacity:.85}' +
  'a{color:#F0B429}</style></head><body><div><h1>Sin conexion</h1>' +
  '<p>No pudimos cargar la pagina. Revisa tu internet e intentalo otra vez.</p>' +
  '<a href="./">Reintentar</a></div></body></html>';

function kzExcluido(url) {
  return KZ_EXCLUIDOS.some(function (fragmento) { return url.indexOf(fragmento) !== -1; });
}

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(KZ_CACHE).then(function (cache) {
      return Promise.all(KZ_PRECACHE.map(function (ruta) {
        return cache.add(new Request(ruta, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        if (n.indexOf('kz-card-') === 0 && n !== KZ_CACHE) return caches.delete(n);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (kzExcluido(url.pathname) || kzExcluido(url.href)) return;

  const esHTML = peticion.mode === 'navigate' ||
    (peticion.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (esHTML) {
    evento.respondWith(
      fetch(peticion).then(function (respuesta) {
        const copia = respuesta.clone();
        caches.open(KZ_CACHE).then(function (c) { c.put(peticion, copia); });
        return respuesta;
      }).catch(function () {
        return caches.match(peticion).then(function (guardada) {
          if (guardada) return guardada;
          return new Response(KZ_OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        });
      })
    );
    return;
  }

  evento.respondWith(
    caches.match(peticion).then(function (guardada) {
      const red = fetch(peticion).then(function (respuesta) {
        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(KZ_CACHE).then(function (c) { c.put(peticion, copia); });
        }
        return respuesta;
      }).catch(function () { return guardada; });
      return guardada || red;
    })
  );
});