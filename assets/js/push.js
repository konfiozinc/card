/* ═══════════════════════════════════════════════════════════════════
   push.js · KONFÍO ZINC — Avisos push para los visitantes del sitio

   Qué hace:
     1. Muestra un botón discreto "🔔 Recibir avisos" (solo después de
        que la persona interactúa con la página, nunca de entrada).
     2. Pide permiso, obtiene el token de Firebase Cloud Messaging y lo
        guarda en Firestore (colección `suscriptores_web`).
     3. Con eso, los avisos se envían desde la consola de Firebase →
        Messaging (plan gratuito, sin Cloud Functions).

   Cómo se instala en una página nueva:
     <script src="assets/js/push.js" defer></script>   (antes de </body>)

   Requisitos ya cumplidos en este sitio:
     - firebase-messaging-sw.js en la RAÍZ (recibe los avisos en segundo plano)
     - Clave VAPID real en firebase-config.js / config.js
     - Reglas de Firestore que permiten crear la suscripción
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Ruta de assets/, deducida de la URL de este script ──
     El sitio carga push.js desde la raíz («assets/js/push.js») y desde un nivel
     («../assets/js/push.js»), así que sus recursos se resuelven a partir de su
     propio src y no de la ruta de la página. */
  var BASE_ASSETS = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/js\/push\.js(\?.*)?$/, '');
    return 'assets/';
  })();

  /* ── Configuración (pública, igual que firebase-config.js) ── */
  var PROYECTO = 'konfio-zinc';
  var FIREBASE = {
    apiKey: 'AIzaSyDbwAk9APwP2SeaEfWxeQG_bdL9eatciEA',
    authDomain: 'konfio-zinc.firebaseapp.com',
    projectId: 'konfio-zinc',
    storageBucket: 'konfio-zinc.firebasestorage.app',
    messagingSenderId: '1096915735255',
    appId: '1:1096915735255:web:00e3d896c266293cced692'
  };
  var VAPID = 'BPndo_kPLxKCCLHPR7w0qoFIWLRm78IGx6p5O-15jVDLgDuA3m5PAh0n_qfh4kG4YsM5Q_aSaJ0QWfB5vOWxpbs';
  var SDK = 'https://esm.run/firebase@10.12.2/';
  var COLECCION = 'suscriptores_web';

  var K_OK = 'kz_avisos_ok';          // ya suscrito
  var K_CERRADO = 'kz_avisos_cerrado';// cerró el botón (fecha en ms)
  var DIAS_REINTENTO = 30;

  /* ── Raíz del sitio (sirve igual en /card/ o en un dominio propio) ── */
  var etiqueta = document.currentScript;
  if (!etiqueta) {
    var todas = document.getElementsByTagName('script');
    for (var i = todas.length - 1; i >= 0; i--) {
      if (/push\.js/.test(todas[i].src)) { etiqueta = todas[i]; break; }
    }
  }
  var RAIZ = etiqueta && etiqueta.src ? etiqueta.src.replace(/assets\/js\/push\.js.*$/, '') : '/';

  /* ── Utilidades ── */
  function guardado(clave, valor) {
    try {
      if (valor === undefined) return localStorage.getItem(clave);
      localStorage.setItem(clave, valor);
    } catch (e) { return null; }
  }
  function esIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function instalado() {
    return window.navigator.standalone === true ||
           (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function soportado() {
    return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  }

  /* ── Estilos ──
     Se cargan como hoja aparte (assets/css/kz-push.css). NO se inyectan como
     <style>: la portada declara `style-src 'self'` y el navegador bloqueaba el
     bloque en línea, dejando el chip «Recibir avisos» sin formato y escribiendo
     un error en la consola (medido en Chrome 156, KZ-QA-GLOBAL-003). Una hoja
     del propio dominio sí está permitida por ese CSP. */
  function ponerEstilos() {
    if (document.getElementById('kz-push-css')) return;
    var hoja = document.createElement('link');
    hoja.id = 'kz-push-css';
    hoja.rel = 'stylesheet';
    hoja.href = BASE_ASSETS + 'css/kz-push.css';
    document.head.appendChild(hoja);
  }

  /* ── Aviso flotante dentro de la página (mientras se explica o confirma) ── */
  function panel(titulo, html, cerrarTexto) {
    ponerEstilos();
    var fondo = document.createElement('div');
    fondo.className = 'kz-tel';
    var caja = document.createElement('div');
    caja.className = 'kz-panel';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.innerHTML = '<h4>' + titulo + '</h4>' + html +
      '<button class="kz-cerrar" type="button">' + (cerrarTexto || 'Entendido') + '</button>';
    document.body.appendChild(fondo);
    document.body.appendChild(caja);
    requestAnimationFrame(function () { fondo.classList.add('kz-visible'); caja.classList.add('kz-visible'); });
    function quitar() {
      fondo.classList.remove('kz-visible'); caja.classList.remove('kz-visible');
      setTimeout(function () { fondo.remove(); caja.remove(); }, 220);
    }
    caja.querySelector('.kz-cerrar').addEventListener('click', quitar);
    fondo.addEventListener('click', quitar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') quitar(); }, { once: true });
  }

  /* ── Guardar la suscripción en Firestore (REST, sin cargar más SDK) ── */
  function guardarSuscripcion(token) {
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO +
              '/databases/(default)/documents/' + COLECCION +
              '?documentId=' + encodeURIComponent(token);
    var cuerpo = {
      fields: {
        token: { stringValue: token },
        creadoEn: { timestampValue: new Date().toISOString() },
        origen: { stringValue: 'sitio-web' },
        pagina: { stringValue: location.pathname },
        idioma: { stringValue: navigator.language || '' },
        plataforma: { stringValue: (navigator.userAgent || '').slice(0, 180) },
        activo: { booleanValue: true }
      }
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('Firestore ' + r.status + ': ' + t.slice(0, 160)); });
      return true;
    });
  }

  /* ── Flujo de suscripción ── */
  function activar(boton, chip) {
    if (Notification.permission === 'denied') {
      panel('Avisos bloqueados', '<p>Tu navegador tiene bloqueadas las notificaciones para este sitio. ' +
        'Para activarlas: toca el candado 🔒 junto a la dirección y permite las notificaciones.</p>');
      return;
    }
    if (esIOS() && !instalado()) {
      panel('Activa los avisos en iPhone',
        '<p>En iPhone las notificaciones solo funcionan si el sitio queda instalado. Son 3 pasos:</p>' +
        '<ol><li>Toca el botón <strong>Compartir</strong> (el cuadro con la flecha ↑).</li>' +
        '<li>Elige <strong>Agregar a pantalla de inicio</strong>.</li>' +
        '<li>Abre el ícono que se creó y toca de nuevo <strong>🔔 Recibir avisos</strong>.</li></ol>' +
        '<p>En Android o computador funciona directo, sin instalar nada.</p>');
      return;
    }

    // El navegador exige pedir permiso directamente dentro del gesto del clic.
    // Si se espera a importar Firebase o registrar el worker, puede perderse
    // la activación del usuario y la solicitud se rechaza.
    var permisoPromise = Notification.permission === 'granted'
      ? Promise.resolve('granted')
      : Notification.requestPermission();

    boton.disabled = true;
    boton.innerHTML = '<span>⏳</span> Activando…';

    Promise.all([
      import(SDK + 'app'),
      import(SDK + 'messaging'),
      permisoPromise
    ]).then(function (mods) {
      var appMod = mods[0], msgMod = mods[1], permiso = mods[2];
      if (permiso !== 'granted') throw new Error('NO_PERMISO');
      var app = appMod.getApps && appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE);
      var messaging = msgMod.getMessaging(app);
      return msgMod.isSupported().then(function (ok) {
        if (!ok) throw new Error('Este navegador no soporta notificaciones push.');
        return navigator.serviceWorker.register(RAIZ + 'firebase-messaging-sw.js', { scope: RAIZ });
      }).then(function (registro) {
        return navigator.serviceWorker.ready.then(function () { return registro; });
      }).then(function (registro) {
        return msgMod.getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: registro })
          .then(function (token) {
            if (!token) throw new Error('Sin token de notificaciones.');
            return guardarSuscripcion(token).then(function () {
              /* Avisos con la pestaña abierta */
              msgMod.onMessage(messaging, function (payload) {
                var n = (payload && payload.notification) || {};
                panel(n.title || 'KONFÍO ZINC', '<p>' + (n.body || '') + '</p>');
              });
              return true;
            });
          });
      });
    }).then(function () {
      guardado(K_OK, '1');
      if (chip) {
        chip.classList.add('kz-ok');
        chip.querySelector('.kz-accion').innerHTML = '<span>✅</span> Avisos activados';
        /* KZ-WEB-003: aquí se prometía «te contactaremos cuando lancemos novedades»,
           una promesa que depende de que alguien envíe una campaña desde la consola de
           Firebase. El alta queda registrada, pero no se promete una frecuencia ni una
           automatización que el sitio no pueda garantizar por sí solo. */
        panel('Quedaste en la lista',
          '<p>Los avisos son <strong>ocasionales</strong>: se envían cuando hay algo que vale la pena contar. ' +
          'No son automáticos ni tienen una frecuencia fija.</p>' +
          '<p>Si necesitas algo ahora, escríbenos por <a href="https://wa.me/573206411340" target="_blank" rel="noopener">WhatsApp</a>.</p>');
        setTimeout(function () { chip.classList.remove('kz-visible'); }, 2600);
      }
    }).catch(function (err) {
      boton.disabled = false;
      boton.innerHTML = '<span>🔔</span> Recibir avisos';
      var m = String(err && err.message || err);
      if (m === 'NO_PERMISO') {
        panel('No se activaron los avisos', '<p>No diste permiso de notificaciones. Puedes intentarlo de nuevo cuando quieras tocando el botón 🔔.</p>');
      } else if (/no soporta|not supported/i.test(m)) {
        panel('Este navegador no envía avisos',
          '<p>No permite notificaciones push. En iPhone, usa Safari y agrega el sitio a la pantalla de inicio; ' +
          'en Android o computador funcionan directamente.</p>' +
          '<p>Mientras tanto, puedes consultar novedades por <a href="https://wa.me/573206411340" target="_blank" rel="noopener">WhatsApp</a>: ' +
          'no enviamos avisos automáticos, pero te respondemos.</p>');
      } else {
        panel('No se pudieron activar', '<p>Ocurrió un detalle técnico: ' + m.slice(0, 140) + '</p><p>Vuelve a intentarlo en un momento.</p>');
        if (window.console) console.warn('[KZ push]', err);
      }
    });
  }

  /* ── Botón flotante ── */
  function crearChip() {
    ponerEstilos();
    var chip = document.createElement('div');
    chip.className = 'kz-chip';
    chip.innerHTML =
      '<button class="kz-accion" type="button" aria-label="Recibir avisos de KONFÍO ZINC">' +
        '<span aria-hidden="true">🔔</span> Recibir avisos' +
      '</button>' +
      '<button class="kz-x" type="button" aria-label="Cerrar">✕</button>';
    document.body.appendChild(chip);

    var boton = chip.querySelector('.kz-accion');
    boton.addEventListener('click', function () { activar(boton, chip); });
    chip.querySelector('.kz-x').addEventListener('click', function () {
      guardado(K_CERRADO, String(Date.now()));
      chip.classList.remove('kz-visible');
    });
    return chip;
  }

  /* ── Enlace permanente en el pie de página ── */
  function enlaceFooter(chip) {
    var destino = document.querySelector('.footer-bottom') || document.querySelector('footer');
    if (!destino || destino.querySelector('.kz-push-link')) return;
    var a = document.createElement('button');
    a.type = 'button';
    a.className = 'kz-push-link';
    a.style.cssText = 'background:none;border:0;color:inherit;opacity:.72;cursor:pointer;font:inherit;padding:6px 0;text-decoration:underline';
    var suscrito = guardado(K_OK) === '1';
    a.innerHTML = suscrito ? '🔔 Avisos activados' : '🔔 Recibir avisos de KONFÍO ZINC';
    a.addEventListener('click', function () {
      if (guardado(K_OK) === '1') {
        panel('Avisos activados',
          '<p>Ya estás en la lista. Los avisos son <strong>ocasionales</strong>: se envían cuando hay algo que vale la pena contar.</p>' +
          '<p>Si necesitas algo ahora, escríbenos por <a href="https://wa.me/573206411340" target="_blank" rel="noopener">WhatsApp</a>.</p>');
        return;
      }
      chip.classList.add('kz-visible');
      activar(chip.querySelector('.kz-accion'), chip);
    });
    destino.appendChild(a);
  }

  /* ── Arranque ── */
  function iniciar() {
    if (!soportado()) return;                       // navegador sin soporte: no molestamos
    if (Notification.permission === 'denied') return;

    var chip = crearChip();
    enlaceFooter(chip);

    if (guardado(K_OK) === '1') return;  // solo ocultar si guardamos token y suscripción

    var cerrado = Number(guardado(K_CERRADO) || 0);
    if (cerrado && (Date.now() - cerrado) < DIAS_REINTENTO * 864e5) return;

    /* Aparece solo tras interacción real: 35% de scroll o 25 segundos */
    var mostrado = false;
    function mostrar() {
      if (mostrado) return;
      mostrado = true;
      chip.classList.add('kz-visible');
      window.removeEventListener('scroll', alScroll);
      clearTimeout(temporizador);
    }
    function alScroll() {
      var alto = document.documentElement.scrollHeight - window.innerHeight;
      if (alto > 0 && (window.scrollY / alto) > 0.35) mostrar();
    }
    var temporizador = setTimeout(mostrar, 25000);
    window.addEventListener('scroll', alScroll, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
