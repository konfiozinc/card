/* ═══════════════════════════════════════════════════════════
   KONFÍO ZINC · scripts.js
   Agencia de marketing digital.
   - Partículas de fondo
   - Animaciones al hacer scroll (reveal)
   - Contadores animados
   - Menú móvil, header con sombra
   - Modales (portafolio + video)
   - FAQ acordeón
   - Formulario con validación y envío simulado
   - Botón volver arriba
   - Agente IA flotante (backend Gemini + respaldo local)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  var normalize = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. PARTÍCULAS DE FONDO ─────────────────────────── */
  var canvas = $('#particles');
  if (canvas && !reducedMotion) {
    var ctx = canvas.getContext('2d');
    var W, H, particles = [];
    var COLORS = ['rgba(240,180,41,', 'rgba(0,229,255,', 'rgba(249,115,22,'];

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    function init() {
      resize();
      var count = Math.min(70, Math.floor(W / 18));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.6 + 0.4,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
          a: Math.random() * 0.5 + 0.15
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c + p.a + ')';
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    init();
    window.addEventListener('resize', init);
    draw();
  }

  /* ── 2. REVEAL ON SCROLL ───────────────────────────── */
  var revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('vis'); revealObs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('vis'); });
  }

  /* ── 3. CONTADORES ANIMADOS ────────────────────────── */
  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var dur = 1600, start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var counterObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCounter(e.target); counterObs.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    $$('.counter').forEach(function (el) { counterObs.observe(el); });
  }

  /* ── 4. HEADER Y MENÚ MÓVIL ────────────────────────── */
  var header = $('#header');
  var navToggle = $('#navToggle');
  var navLinks = $('#navLinks');
  window.addEventListener('scroll', function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 20);
    var backTop = $('#backTop');
    if (backTop) backTop.classList.toggle('show', window.scrollY > 500);
  }, { passive: true });

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── 5. MODAL (portafolio + video) ─────────────────── */
  var modal = $('#modal');
  var modalTitle = $('#modalTitle');
  var modalBody = $('#modalBody');
  var modalClose = $('#modalClose');
  var lastFocused = null;

  function openModal(html, title) {
    lastFocused = document.activeElement;
    modalBody.innerHTML = html;
    modalTitle.textContent = title || 'Proyecto';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalBody.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  // Abrir caso de portafolio
  $$('[data-open-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var title = btn.getAttribute('data-title') || 'Proyecto';
      var img = btn.getAttribute('data-img') || '';
      var url = btn.getAttribute('data-url') || '#';
      openModal(
        '<img src="' + img + '" alt="' + escapeHtml(title) + '">' +
        '<div style="padding:1rem;text-align:center;">' +
        '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Ver proyecto en vivo <i class="fas fa-arrow-up-right-from-square"></i></a>' +
        '</div>',
        title
      );
    });
  });

  // Abrir video promocional
  var videoBtn = $('#videoBtn');
  if (videoBtn) {
    videoBtn.addEventListener('click', function () {
      openModal('<iframe src="https://www.youtube.com/embed/ndRhGLFUlLA?autoplay=1" title="Video promocional KONFÍO ZINC" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>', 'Video promocional');
    });
  }

  // Ver todos los proyectos
  var PROJECTS = [
    ['EL TITI — Comidas rápidas', 'https://konfiozinc.github.io/eltiti/'],
    ['Abogados DTA — Jurídico', 'https://konfiozinc.github.io/abogados-dta/'],
    ['FRC Alianza Legal — Abogado', 'https://konfiozinc.github.io/fcr_alianza_legal/'],
    ['DTA Chanclas', 'https://konfiozinc.github.io/proyecto-dta/'],
    ['Colsabor — Comida sana', 'https://konfiozinc.github.io/colsabor/'],
    ['Dulce Delicia — Pastelería', 'https://konfiozinc.github.io/pasteleria_artesanal/'],
    ['Carnicería La Milagrosa', 'https://konfiozinc.github.io/carniceria_la_milagrosa/'],
    ['Nandy Nails — Uñas', 'https://konfiozinc.github.io/nandy_nails/'],
    ['Makeup Artist', 'https://konfiozinc.github.io/makeup_artist/'],
    ['NP Style — Salón', 'https://konfiozinc.github.io/np-style/'],
    ['La Cañada Style — Barbería', 'https://konfiozinc.github.io/ca-ada_style/'],
    ['Lizeth Lozano — Contadora', 'https://konfiozinc.github.io/lizeth_lozano/'],
    ['Nutricionista', 'https://konfiozinc.github.io/nutricionista/'],
    ['Nutrición funcional', 'https://konfiozinc.github.io/nutricion_funcional/'],
    ['NutriDrink — Productos nutricionales', 'https://konfiozinc.github.io/nutridrink/'],
    ['Servicios odontológicos', 'https://konfiozinc.github.io/servicios_odontologicos/'],
    ['Cirujana dentista', 'https://konfiozinc.github.io/cirujana_dentista/'],
    ['Diseño gráfico', 'https://konfiozinc.github.io/diseno_grafico/'],
    ['Decoradora de fiestas', 'https://konfiozinc.github.io/decoradora_de_fiestas/'],
    ['Fumigaciones Monterrey', 'https://konfiozinc.github.io/fumigaciones-monterrey/'],
    ['Fumig Master', 'https://konfiozinc.github.io/fumig_master/'],
    ['Mega Express — Transporte', 'https://konfiozinc.github.io/mega-express/'],
    ['Grúas GYR Arias', 'https://konfiozinc.github.io/gruas_gyr_arias/'],
    ['Century 21 Radial — Inmobiliaria', 'https://konfiozinc.github.io/century_21_radial/'],
    ['GP — Multiservicios y lotes', 'https://konfiozinc.github.io/gp/'],
    ['DG Avalúos', 'https://konfiozinc.github.io/dg_ventas_avaluos/'],
    ['DondeCompro — Tienda', 'https://konfiozinc.github.io/dondecompro/'],
    ['NBC Company — Utensilios', 'https://konfiozinc.github.io/nbccompany/'],
    ['UneFibra — Internet', 'https://konfiozinc.github.io/unefibra/'],
    ['Quiromasajes GAP', 'https://konfiozinc.github.io/quiromasajes-gap/'],
    ['Calixto Acordeón Mágico', 'https://konfiozinc.github.io/calixto_acordeon_magico/'],
    ['The Big Bang Carranga', 'https://konfiozinc.github.io/the-big-bang-carranga/'],
    ['Deicy Buitrago', 'https://konfiozinc.github.io/deicy-buitrago/'],
    ['Nómina Centinela', 'https://konfiozinc.github.io/nomina_centinela/'],
    ['PRORED Fedpazco', 'https://konfiozinc.github.io/prored_fedpazco/'],
    ['Konfío Sports', 'https://konfiozinc.github.io/konfio-sports/']
  ];

  var verTodosBtn = $('#verTodosBtn');
  if (verTodosBtn) {
    verTodosBtn.addEventListener('click', function () {
      var html = '<div style="padding:1.2rem;display:grid;gap:.5rem;">';
      PROJECTS.forEach(function (p) {
        html += '<a href="' + p[1] + '" target="_blank" rel="noopener noreferrer" style="display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02);font-size:.9rem;color:var(--fg);">' + escapeHtml(p[0]) + ' <i class="fas fa-arrow-up-right-from-square" style="color:var(--gold);flex-shrink:0;"></i></a>';
      });
      html += '</div>';
      openModal(html, 'Todos los proyectos (' + PROJECTS.length + ')');
    });
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') {
        var focusable = modal.querySelectorAll('button, [href], iframe');
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ── 6. FAQ ACORDEÓN ───────────────────────────────── */
  $$('.faq-question').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.closest('.faq-item');
      var wasOpen = item.classList.contains('open');
      $$('.faq-item.open').forEach(function (i) { i.classList.remove('open'); i.querySelector('.faq-question').setAttribute('aria-expanded', 'false'); });
      if (!wasOpen) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ── 7. FORMULARIO DE CONTACTO ─────────────────────── */
  var form = $('#contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valid = true;
      var fields = [
        { el: $('#nombre'), test: function (v) { return v.trim().length >= 2; } },
        { el: $('#telefono'), test: function (v) { return v.trim().length >= 7; } },
        { el: $('#email'), test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); } },
        { el: $('#mensaje'), test: function (v) { return v.trim().length >= 5; } }
      ];

      fields.forEach(function (f) {
        var ok = f.el && f.test(f.el.value);
        if (f.el) f.el.classList.toggle('invalid', !ok);
        if (!ok) valid = false;
      });

      if (!valid) return;

      // Envío simulado (aquí puedes integrar Formspree más adelante)
      var btn = form.querySelector('button[type="submit"]');
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

      setTimeout(function () {
        btn.disabled = false;
        btn.innerHTML = original;
        var success = form.querySelector('.form-success');
        if (!success) {
          success = document.createElement('div');
          success.className = 'form-success';
          form.appendChild(success);
        }
        success.innerHTML = '✅ ¡Mensaje enviado! Te contactaremos pronto. También puedes escribirnos ya por <a href="https://wa.me/573206411340" target="_blank" rel="noopener noreferrer" style="color:var(--gold);text-decoration:underline;">WhatsApp</a>.';
        success.classList.add('show');
        form.reset();
      }, 1200);
    });
  }

  /* ── 8. VOLVER ARRIBA ──────────────────────────────── */
  var backTop = $('#backTop');
  if (backTop) {
    backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  /* ── 9. AGENTE IA FLOTANTE ─────────────────────────── */
  var chat = $('#kzFabChat');
  var toggleBtn = $('#kzFabToggle');
  var closeBtn = $('#kzFabClose');
  var resetBtn = $('#kzFabReset');
  var chatBody = $('#kzFabBody');
  var chatInput = $('#kzFabInput');
  var chatSend = $('#kzFabSend');
  var chatChips = $('#kzFabChips');

  if (chat && toggleBtn) {
    var isOpen = false;
    var history = [];
    var WA_URL = 'https://wa.me/573206411340?text=Hola%2C%20quiero%20una%20cotizaci%C3%B3n%20gratis%20para%20mi%20negocio';
    var BACKEND_URL = 'https://calm-heart-6828.konfiozinc.workers.dev';

    function formatBotText(text) {
      var s = escapeHtml(text);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\n/g, '<br>');
      s = s.replace(/(^|<br>)\s*[-•]\s+/g, '$1• ');
      s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      return s;
    }

    function addMessage(text, sender) {
      var div = document.createElement('div');
      div.className = 'kz-msg ' + (sender === 'user' ? 'kz-msg-user' : 'kz-msg-bot');
      if (sender === 'bot') { div.innerHTML = formatBotText(text); }
      else { div.textContent = text; }
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    function showTyping() {
      var div = document.createElement('div');
      div.className = 'kz-msg-typing';
      div.id = 'kzTyping';
      div.innerHTML = '<span></span><span></span><span></span>';
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    function hideTyping() { var el = document.getElementById('kzTyping'); if (el) el.remove(); }

    function showWhatsAppButton() {
      if (document.querySelector('.kz-wa-btn')) return;
      var a = document.createElement('a');
      a.href = WA_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.className = 'kz-wa-btn'; a.textContent = '💬 CONTINUAR POR WHATSAPP';
      var wrap = document.createElement('div');
      wrap.style.cssText = 'align-self:flex-start;margin-top:4px;';
      wrap.appendChild(a);
      chatBody.appendChild(wrap);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    /* Respaldo local (reglas) por si el backend no responde */
    function getLocalResponse(userMsg) {
      var q = normalize(userMsg);
      var has = function (arr) { return arr.some(function (k) { return q.indexOf(k) !== -1; }); };

      if (/(^|\s)unas(\s|$)/.test(q) && !/dudas/.test(q)) {
        return { text: '¡Perfecto! 👋 Para tu sector tenemos este ejemplo real:\nhttps://konfiozinc.github.io/nandy_nails/\n\n📌 ¿Ya manejas redes sociales para tu negocio?', cta: false };
      }
      if (has(['tarjeta', 'tarjetas', 'tarjeta digital', 'tarjetas digitales'])) {
        return { text: 'La tarjeta digital es tu presentación en un solo enlace 💳: contacto, redes, WhatsApp, ubicación y galería. Se actualiza al instante y reemplaza el papel.\n\n¿Quieres ver un ejemplo o cotizarla?', cta: true };
      }
      if (has(['landing', 'pagina', 'landing page', 'landing pages'])) {
        return { text: 'Creamos landing pages rápidas y enfocadas en conversión 🚀, ideales para promocionar tu negocio o un producto.\n\nCuéntame qué quieres promocionar y te cotizo.', cta: true };
      }
      if (has(['catalogo', 'catalogos', 'catalogo digital', 'catalogos digitales'])) {
        return { text: 'Tu catálogo digital te permite mostrar productos o servicios con precios y compartirlo por WhatsApp o redes 📖.\n\n¿Qué tipo de productos o servicios ofreces?', cta: true };
      }
      if (has(['menu', 'menus', 'menu digital', 'menus digitales'])) {
        return { text: 'Los menús digitales con QR son perfectos para restaurantes 🍽️: tus clientes ven platos y precios, y piden directo.\n\n¿Quieres un menú digital para tu negocio?', cta: true };
      }
      if (has(['asistente', 'asistentes', 'agente', 'agentes', 'chatbot']) || /\bia\b/.test(q)) {
        return { text: 'Creamos asistentes con IA que responden a tus clientes 24/7 🤖, con la información de tu negocio, en tu web o WhatsApp.\n\n¿Quieres uno para tu negocio?', cta: true };
      }
      if (has(['qr', 'codigo qr', 'codigos qr'])) {
        return { text: 'Creamos códigos QR personalizados con tu marca 📱, ideales para imprimir en mesas, stickers, empaques o facturas.\n\nLlevan a tus clientes directo a tu menú, catálogo, WhatsApp o ubicación.\n\n¿Para qué lo necesitas?', cta: true };
      }
      if (has(['servicio', 'servicios', 'producto', 'productos', 'que ofrecen', 'que hacen', 'que venden'])) {
        return { text: 'Creamos productos digitales para tu negocio 📱:\n\n• Tarjetas digitales interactivas\n• Landing pages\n• Catálogos digitales\n• Menús digitales\n• Asistentes con IA\n\n¿Cuál te interesa?', cta: true };
      }
      if (has(['precio', 'cuanto', 'cuesta', 'costo', 'valor', 'tarifa', 'presupuesto', 'cotiza', 'cotizacion', 'cotizar'])) {
        return { text: 'Cada proyecto se cotiza según lo que necesites 📊. Escríbeme por WhatsApp y te envío una cotización gratis, sin compromiso.\n\n¿Quieres que te cotice ahora?', cta: true };
      }
      /* Ejemplos reales por sector (hasta 2 enlaces) */
      var sectores = [
        [['restaurante', 'restaurantes', 'comida', 'comidas', 'cafeteria', 'pizzeria', 'hamburgues'], ['https://konfiozinc.github.io/eltiti/', 'https://konfiozinc.github.io/colsabor/']],
        [['pasteleria', 'reposteria', 'tortas', 'postres'], ['https://konfiozinc.github.io/pasteleria_artesanal/']],
        [['carniceria', 'carnes'], ['https://konfiozinc.github.io/carniceria_la_milagrosa/']],
        [['abogado', 'abogados', 'juridico', 'legal', 'derecho', 'firma'], ['https://konfiozinc.github.io/abogados-dta/', 'https://konfiozinc.github.io/fcr_alianza_legal/']],
        [['belleza', 'salon', 'peluqueria', 'estilista'], ['https://konfiozinc.github.io/np-style/']],
        [['barberia', 'barbero'], ['https://konfiozinc.github.io/ca-ada_style/']],
        [['unas', 'manicure', 'pedicure', 'nail'], ['https://konfiozinc.github.io/nandy_nails/']],
        [['maquillaje', 'makeup'], ['https://konfiozinc.github.io/makeup_artist/']],
        [['contador', 'contadora', 'contabilidad'], ['https://konfiozinc.github.io/lizeth_lozano/']],
        [['nutricion funcional'], ['https://konfiozinc.github.io/nutricion_funcional/']],
        [['productos nutricionales', 'suplementos'], ['https://konfiozinc.github.io/nutridrink/']],
        [['nutricionista', 'nutricion', 'dietista'], ['https://konfiozinc.github.io/nutricionista/']],
        [['odontologo', 'odontologia', 'dentista', 'dental'], ['https://konfiozinc.github.io/servicios_odontologicos/', 'https://konfiozinc.github.io/cirujana_dentista/']],
        [['diseno', 'disenador', 'branding'], ['https://konfiozinc.github.io/diseno_grafico/']],
        [['eventos', 'decoracion', 'fiestas'], ['https://konfiozinc.github.io/decoradora_de_fiestas/']],
        [['fumigacion', 'plagas'], ['https://konfiozinc.github.io/fumigaciones-monterrey/', 'https://konfiozinc.github.io/fumig_master/']],
        [['transporte', 'mensajeria', 'envios', 'logistica'], ['https://konfiozinc.github.io/mega-express/']],
        [['grua', 'gruas', 'remolque'], ['https://konfiozinc.github.io/gruas_gyr_arias/']],
        [['inmobiliaria', 'bienes raices', 'finca raiz', 'avaluos'], ['https://konfiozinc.github.io/century_21_radial/', 'https://konfiozinc.github.io/dg_ventas_avaluos/']],
        [['tienda', 'comercio', 'almacen'], ['https://konfiozinc.github.io/dondecompro/', 'https://konfiozinc.github.io/nbccompany/']],
        [['internet', 'fibra', 'telecomunicaciones', 'tv hogar'], ['https://konfiozinc.github.io/unefibra/']],
        [['musica', 'cantante', 'cantar', 'voz', 'artista', 'banda'], ['https://konfiozinc.github.io/calixto_acordeon_magico/', 'https://konfiozinc.github.io/the-big-bang-carranga/']],
        [['masaje', 'masajes', 'quiromasaje', 'terapia'], ['https://konfiozinc.github.io/quiromasajes-gap/']]
      ];
      for (var si = 0; si < sectores.length; si++) {
        if (has(sectores[si][0])) {
          var enlaces = sectores[si][1];
          return { text: '¡Perfecto! 👋 Para tu sector tenemos ' + (enlaces.length > 1 ? 'estos ejemplos reales:' : 'este ejemplo real:') + '\n' + enlaces.join('\n') + '\n\n📌 ¿Ya manejas redes sociales para tu negocio?', cta: false };
        }
      }
      if (has(['portafolio', 'ejemplo', 'ejemplos', 'trabajo', 'trabajos', 'casos', 'resultados', 'proyectos'])) {
        return { text: 'Tenemos proyectos en restaurantes, salud, belleza, inmobiliaria, transporte, música y más 💼.\n\nPuedes ver el portafolio oficial aquí:\nhttps://konfiozinc.github.io/card/\n\n¿De qué sector es tu negocio? Así te muestro un ejemplo parecido.', cta: false };
      }
      if (has(['entrega', 'tiempo', 'cuanto tarda', 'cuando', 'demora', 'rapido', 'tarda'])) {
        return { text: '⏱️ Entregamos en 24 a 48 horas hábiles la mayoría de proyectos, una vez recibimos tu información y el pago.', cta: true };
      }
      if (has(['contacto', 'whatsapp', 'telefono', 'numero', 'correo', 'email', 'hablar'])) {
        return { text: '📞 Contáctanos por:\n• WhatsApp: +57 320 641 1340\n• Email: konfiozinc@gmail.com\n\nO usa el botón verde de WhatsApp. ¡Te respondemos al instante!', cta: true };
      }
      if (has(['hola', 'buenas', 'buenos dias', 'saludo', 'hey'])) {
        return { text: '¡Hola! 👋 Soy el asesor de KONFÍO ZINC.\n\nCreamos tarjetas digitales, landing pages, catálogos, menús digitales y asistentes con IA.\n\nCuéntame, ¿qué te gustaría crear para tu negocio?', cta: false };
      }
      return { text: 'Buena pregunta 😊. Para darte una respuesta exacta, escríbeme por WhatsApp y te atiendo al instante.\n\nAquí puedo ayudarte con: productos, precios, portafolio o cotizar tu proyecto. Toca un botón de abajo 👇', cta: true };
    }

    function callBackend(message) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 30000);
      var chatHistory = history.slice(-8);
      while (chatHistory.length && chatHistory[0].role === 'assistant') { chatHistory = chatHistory.slice(1); }
      return fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, history: chatHistory }),
        signal: ctrl.signal
      }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        var reply = (data && data.reply ? String(data.reply) : '').trim();
        if (!reply) throw new Error('respuesta vacia');
        return reply;
      }).catch(function (e) {
        clearTimeout(timer);
        throw e;
      });
    }

    function sendMessage(text) {
      if (!text || !text.trim()) return;
      var userMsg = text.trim();
      addMessage(userMsg, 'user');
      chatInput.value = '';
      history.push({ role: 'user', content: userMsg });
      showTyping();

      callBackend(userMsg)
        .then(function (reply) {
          hideTyping();
          addMessage(reply, 'bot');
          history.push({ role: 'assistant', content: reply });
          showWhatsAppButton();
        })
        .catch(function () {
          hideTyping();
          var res = getLocalResponse(userMsg);
          addMessage(res.text, 'bot');
          history.push({ role: 'assistant', content: res.text });
          if (res.cta) showWhatsAppButton();
        });
    }

    function showWelcome() {
      var welcome = '¡Hola! 👋 Bienvenido a KONFÍO ZINC.\n\nCreamos tarjetas digitales, landing pages, catálogos y menús digitales, y asistentes con IA para tu negocio.\n\nCuéntame, ¿qué te gustaría crear?';
      addMessage(welcome, 'bot');
      history.push({ role: 'assistant', content: welcome });
    }

    function toggleChat(force) {
      isOpen = (typeof force === 'boolean') ? force : !isOpen;
      chat.classList.toggle('open', isOpen);
      chat.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        chatInput.focus();
        if (chatBody.children.length === 0) showWelcome();
      }
    }

    toggleBtn.addEventListener('click', function () { toggleChat(); });
    closeBtn.addEventListener('click', function () { toggleChat(false); });
    resetBtn.addEventListener('click', function () { history = []; chatBody.innerHTML = ''; showWelcome(); });
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput.value); }
    });
    chatSend.addEventListener('click', function () { sendMessage(chatInput.value); });
    chatChips.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var msg = btn.getAttribute('data-msg');
      if (!isOpen) toggleChat(true);
      setTimeout(function () { sendMessage(msg); }, 300);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) toggleChat(false);
    });
  }
})();
