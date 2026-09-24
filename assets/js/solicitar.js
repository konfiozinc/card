/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/solicitar.js
   Formulario "Solicitar información" compartido por los 6 servicios.

   Cómo se usa (en la página, dentro de <main>):
     <div id="kz-solicitar" data-prioritarios="Servicio A|Servicio B"></div>
     <script src="../assets/js/solicitar.js"></script>   ← ANTES de main.js
     <script src="../assets/js/main.js" defer></script>

   · Inyecta el formulario (una sola fuente de verdad para todos los servicios).
   · main.js se encarga de validar nombre, email, teléfono, servicio y mensaje
     (busca #contactForm) y de redirigir a gracias.html.
   · Este script añade la validación de tipo de cliente, términos y reCAPTCHA.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var mount = document.getElementById('kz-solicitar');
  if (!mount) return;

  /* Catálogo completo de servicios */
  var TODOS = [
    'Tarjeta Digital Star', 'Tarjeta Digital Pro', 'Tarjeta Digital Elite',
    'Catálogo Digital', 'Menú Digital',
    'Landing Page ECO', 'Landing Page SMART', 'Landing Page POWER',
    'Código QR', 'Agente IA', 'Otro / no estoy seguro'
  ];

  /* Servicios que esta página pone primero (opcional) */
  var prioritarios = (mount.getAttribute('data-prioritarios') || '')
    .split('|').map(function (s) { return s.trim(); })
    .filter(function (s) { return s && TODOS.indexOf(s) !== -1; });
  var resto = TODOS.filter(function (s) { return prioritarios.indexOf(s) === -1; });

  var gracias = mount.getAttribute('data-gracias') || '../gracias.html';
  var terminos = mount.getAttribute('data-terminos') || '../politica-privacidad.html';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function opciones(lista) {
    return lista.map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    }).join('');
  }

  var selectHtml =
    '<option value="">--- Selecciona ---</option>' +
    (prioritarios.length
      ? '<optgroup label="Este servicio">' + opciones(prioritarios) + '</optgroup>'
      : '') +
    '<optgroup label="' + (prioritarios.length ? 'Otros servicios' : 'Servicios') + '">' +
      opciones(resto) + '</optgroup>';

  mount.innerHTML =
    '<div class="form-card">' +
      '<h3>Solicitar información</h3>' +
      '<p class="solicitar-sub">Si está interesado en nuestros planes, diligencie el formulario y nuestro equipo atenderá su solicitud.</p>' +
      '<form id="contactForm" data-thanks="' + esc(gracias) + '" novalidate>' +

        '<div class="form-row">' +
          '<div class="form-group">' +
            '<label for="nombre">Nombre y apellido *</label>' +
            '<div class="campo-icono"><i class="fas fa-user" aria-hidden="true"></i>' +
            '<input type="text" id="nombre" name="nombre" placeholder="Tu nombre completo" required autocomplete="name"></div>' +
            '<span class="field-error"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="email">Correo electrónico *</label>' +
            '<div class="campo-icono"><i class="fas fa-envelope" aria-hidden="true"></i>' +
            '<input type="email" id="email" name="email" placeholder="tucorreo@ejemplo.com" required autocomplete="email"></div>' +
            '<span class="field-error"></span>' +
          '</div>' +
        '</div>' +

        '<div class="form-row">' +
          '<div class="form-group">' +
            '<label for="telefono">Teléfono *</label>' +
            '<div class="campo-icono"><i class="fas fa-phone" aria-hidden="true"></i>' +
            '<input type="tel" id="telefono" name="telefono" placeholder="+57 300 000 0000" required autocomplete="tel"></div>' +
            '<span class="field-error"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="servicio">Tipo de servicio *</label>' +
            '<div class="campo-icono"><i class="fas fa-list-check" aria-hidden="true"></i>' +
            '<select id="servicio" name="servicio" required>' + selectHtml + '</select></div>' +
            '<span class="field-error"></span>' +
          '</div>' +
        '</div>' +

        '<div class="form-group">' +
          '<label id="lbl-tipo-cliente">Tipo de cliente *</label>' +
          '<div class="grupo-radio" role="radiogroup" aria-labelledby="lbl-tipo-cliente">' +
            '<label><input type="radio" name="tipo_cliente" value="Emprendedor" required> Emprendedor</label>' +
            '<label><input type="radio" name="tipo_cliente" value="Empresa"> Empresa</label>' +
            '<label><input type="radio" name="tipo_cliente" value="Organización y/o institución"> Organización y/o institución</label>' +
          '</div>' +
          '<span class="field-error"></span>' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="mensaje">Mensaje *</label>' +
          '<div class="campo-icono"><i class="fas fa-comment-dots arriba" aria-hidden="true"></i>' +
          '<textarea id="mensaje" name="mensaje" rows="4" placeholder="Cuéntanos qué quieres lograr, a quién le vendes y si ya tienes sitio web o redes sociales." required></textarea></div>' +
          '<span class="field-error"></span>' +
        '</div>' +

        '<label class="campo-check">' +
          '<input type="checkbox" name="acepto" required>' +
          '<span>He leído y acepto los <a href="' + esc(terminos) + '">términos y condiciones de uso</a> y el tratamiento de mis datos personales.</span>' +
        '</label>' +

        '<div class="recaptcha-wrap">' +
          /* ⚠️ Clave de PRUEBA de Google (siempre valida). Reemplázala por la tuya real. */
          '<div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div>' +
          '<p class="captcha-nota">Marca la casilla «No soy un robot» para poder enviar el formulario.</p>' +
        '</div>' +

        '<button type="submit" class="btn btn-wa btn-lg btn-block"><i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar solicitud</button>' +

        '<p class="form-note">También puedes escribirnos directo por ' +
          '<a href="https://wa.me/573206411340?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20sus%20servicios%20digitales" target="_blank" rel="noopener noreferrer">WhatsApp</a> ' +
          'al +57 320 641 1340 o al correo <a href="mailto:konfiozinc@gmail.com">konfiozinc@gmail.com</a>. ' +
          'Al enviar el formulario serás redirigido a nuestra página de confirmación; tus datos solo se usan para contactarte y nunca los compartimos con terceros.</p>' +

        '<div class="form-success" role="status"></div>' +
        '<div class="form-error-box" role="alert"></div>' +
      '</form>' +
    '</div>';

  var form = mount.querySelector('#contactForm');
  if (!form) return;

  /* Carga reCAPTCHA DESPUÉS de inyectar el widget, para que lo detecte */
  if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
    var rc = document.createElement('script');
    rc.src = 'https://www.google.com/recaptcha/api.js';
    rc.async = true;
    rc.defer = true;
    document.head.appendChild(rc);
  }

  /* Validación propia: tipo de cliente, términos y reCAPTCHA.
     Se ejecuta en fase de captura, antes del handler de main.js. */
  form.addEventListener('submit', function (e) {
    var tipo = form.querySelector('input[name="tipo_cliente"]:checked');
    var acepto = form.querySelector('input[name="acepto"]');
    var captcha = form.querySelector('.g-recaptcha-response');
    var errores = [];

    if (!tipo) errores.push('Selecciona el tipo de cliente.');
    if (acepto && !acepto.checked) errores.push('Debes aceptar los términos y condiciones de uso.');
    /* El widget llena este textarea; si no cargó, no lo exigimos. */
    if (captcha && !captcha.value) errores.push('Marca la casilla «No soy un robot».');

    if (errores.length) {
      e.preventDefault();
      e.stopImmediatePropagation();

      var box = form.querySelector('.form-error-box');
      if (box) { box.innerHTML = '⚠️ ' + errores.join(' '); box.classList.add('show'); }

      if (!tipo) {
        var grupo = form.querySelector('.grupo-radio');
        if (grupo) {
          var g = grupo.closest('.form-group');
          if (g) {
            g.classList.add('has-error');
            var fe = g.querySelector('.field-error');
            if (fe) fe.textContent = 'Selecciona el tipo de cliente.';
          }
          grupo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (acepto && !acepto.checked) {
        acepto.closest('.campo-check').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }
  }, true);
})();
