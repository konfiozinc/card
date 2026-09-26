/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/main.js
   JavaScript GLOBAL compartido por todas las páginas del sitio.

   Módulos:
     00. Utilidades (selector, escape, rutas relativas, analytics)
     01. Partículas de fondo (canvas del hero)
     02. Header con efecto scroll + menú móvil + desplegable de servicios
     03. Animaciones al hacer scroll (reveal con IntersectionObserver)
     04. Contadores animados para métricas
     05. Modales (caso de portafolio con caso de estudio, video, listado)
     06. FAQ acordeón
     07. Filtros de portafolio
     08. Video promocional "lite" (el iframe se inyecta al hacer clic)
     09. Formulario de contacto (validación + Formspree o envío simulado)
     10. Botón "volver arriba"
     11. Eventos de tracking (CTA WhatsApp, formulario) para GA4
     12. Agente IA flotante (backend Gemini + respaldo local por reglas)

   No usa librerías externas. Debe cargarse con <script defer>.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 00. UTILIDADES ────────────────────────────────────────────────── */

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  var normalize = function (s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Raíz del sitio: "." en la raíz y ".." en subcarpetas (servicios/, blog/, portafolio/).
     Permite que el mismo JS construya enlaces internos correctos desde cualquier página. */
  var BASE = document.documentElement.getAttribute('data-base') || '.';
  var siteUrl = function (p) { return BASE + '/' + String(p).replace(/^\/+/, ''); };

  /* URL absoluta de una página (para canonical, compartir, etc.) */
  var SITE_ORIGIN = 'https://konfiozinc.github.io/card/';
  var absoluteUrl = function (p) { return SITE_ORIGIN + String(p).replace(/^\/+/, ''); };

  var WHATSAPP = 'https://wa.me/573206411340';

  /* ── 11-A. TRACKING (GA4) ───────────────────────────────────────────
     Envía eventos a Google Analytics 4 si gtag está disponible.
     No falla si GA4 no está cargado (los placeholders están comentados). */
  var track = function (eventName, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, Object.assign({ transport_type: 'beacon' }, params || {}));
      }
    } catch (e) { /* silencioso: el tracking nunca debe romper la página */ }
  };
  window.kzTrack = track;

  /* Marca los clics en enlaces de WhatsApp como conversión/evento */
  $$('a[href*="wa.me"], .wa-float').forEach(function (a) {
    a.addEventListener('click', function () {
      track('click_whatsapp', { link_url: a.getAttribute('href') || '', link_text: (a.textContent || '').trim().slice(0, 80) });
    });
  });

  /* ── 01. PARTÍCULAS DE FONDO ───────────────────────────────────────── */
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

  /* ── 02. HEADER, MENÚ MÓVIL Y SUBMENÚ DE SERVICIOS ─────────────────── */
  var header = $('#header');
  var navToggle = $('#navToggle');
  var navLinks = $('#navLinks');

  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 20);
    var backTop = $('#backTop');
    if (backTop) backTop.classList.toggle('show', window.scrollY > 500);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      var icon = navToggle.querySelector('i');
      if (icon) icon.className = open ? 'fas fa-times' : 'fas fa-bars';
    });
    /* Cierra el menú al elegir un enlace (excepto el que abre el submenú) */
    $$('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        var icon = navToggle.querySelector('i');
        if (icon) icon.className = 'fas fa-bars';
      });
    });
  }

  /* Desplegable de servicios: en móvil se abre con el botón de la flecha */
  $$('.nav-sub-toggle').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var item = btn.closest('.nav-item');
      if (!item) return;
      var isOpen = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      /* En escritorio el submenú se muestra con hover; aquí forzamos visibilidad */
      var sub = item.querySelector('.nav-sub');
      if (sub && window.innerWidth >= 1024) sub.style.display = isOpen ? 'block' : '';
    });
  });
  /* Cierra el submenú de escritorio al hacer clic fuera */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.nav-item')) return;
    $$('.nav-sub').forEach(function (s) { s.style.display = ''; });
  });

  /* ── 03. REVEAL ON SCROLL ──────────────────────────────────────────── */
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

  /* ── 04. CONTADORES ANIMADOS ───────────────────────────────────────── */
  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var dur = 1600, start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target).toLocaleString('es-CO');
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
  } else {
    $$('.counter').forEach(function (el) {
      el.textContent = (parseInt(el.getAttribute('data-count'), 10) || 0).toLocaleString('es-CO');
    });
  }

  /* ── 05. MODALES ───────────────────────────────────────────────────── */
  var modal = $('#modal');
  var modalTitle = $('#modalTitle');
  var modalBody = $('#modalBody');
  var modalClose = $('#modalClose');
  var lastFocused = null;

  function openModal(html, title) {
    if (!modal) return;
    lastFocused = document.activeElement;
    modalBody.innerHTML = html;
    modalTitle.textContent = title || 'Proyecto';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (modalClose) modalClose.focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalBody.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  /* Expone openModal para otros módulos del propio archivo */
  window.kzOpenModal = openModal;

  /* Casos de portafolio: ficha de caso de estudio completa.
     Atributos soportados en el botón:
       data-title, data-img, data-url   (básicos)
       data-sector, data-challenge, data-solution, data-result, data-testimonial, data-metrics */
  $$('[data-open-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var title = btn.getAttribute('data-title') || 'Proyecto';
      var img = btn.getAttribute('data-img') || '';
      var url = btn.getAttribute('data-url') || '';
      var sector = btn.getAttribute('data-sector') || '';
      var challenge = btn.getAttribute('data-challenge') || '';
      var solution = btn.getAttribute('data-solution') || '';
      var result = btn.getAttribute('data-result') || '';
      var testimonial = btn.getAttribute('data-testimonial') || '';
      var metrics = (btn.getAttribute('data-metrics') || '').split('|').filter(Boolean);

      var html = '';
      if (img) html += '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(title) + '" loading="lazy">';

      if (challenge || solution || result || testimonial || metrics.length) {
        html += '<div class="modal-case">';
        if (sector) html += '<p class="case-study-sector">' + escapeHtml(sector) + '</p>';
        if (metrics.length) {
          html += '<div class="case-metrics">';
          metrics.forEach(function (m) { html += '<span class="chip">' + escapeHtml(m.trim()) + '</span>'; });
          html += '</div>';
        }
        if (challenge) html += '<h4>El desafío</h4><p>' + escapeHtml(challenge) + '</p>';
        if (solution) html += '<h4>La solución</h4><p>' + escapeHtml(solution) + '</p>';
        if (result) html += '<h4>El resultado</h4><p>' + escapeHtml(result) + '</p>';
        if (testimonial) html += '<blockquote>“' + escapeHtml(testimonial) + '”</blockquote>';
        html += '</div>';
      }

      if (url) {
        html += '<div class="modal-actions"><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Ver proyecto en vivo <i class="fas fa-arrow-up-right-from-square"></i></a></div>';
      }
      openModal(html, title);
    });
  });

  /* Video promocional en modal (botones con id="videoBtn" o [data-video]) */
  function videoModal() {
    openModal(
      '<iframe src="https://www.youtube.com/embed/ndRhGLFUlLA?autoplay=1" title="Video promocional KONFÍO ZINC" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>',
      'Video promocional'
    );
  }
  $$('#videoBtn, [data-video]').forEach(function (b) { b.addEventListener('click', videoModal); });

  /* Listado completo de proyectos publicados (botón "Ver todos") */
  var PROJECTS = [
    ['EL TITI — Comidas rápidas', 'https://konfiozinc.github.io/eltiti/'],
    ['Abogados DTA — Jurídico', 'https://konfiozinc.github.io/abogados-dta/'],
    ['FRC Alianza Legal — Abogado', 'https://konfiozinc.github.io/fcr_alianza_legal/'],
    ['DTA Chanclas', 'https://konfiozinc.github.io/proyecto-dta/'],
    ['Colsabor — Comida sana', 'https://konfiozinc.github.io/colsabor/'],
    ['Dulce Delicia — Pastelería', 'https://konfiozinc.github.io/pasteleria_artesanal/'],
    ['Carnicería La Milagrosa', 'https://konfiozinc.github.io/carniceria_la_milagrosa/'],
    ['Nandy Nails — Uñas', 'https://konfiozinc.github.io/nandy_nails/'],
    ['Makeup Artist — Nicole Montalvo', 'https://konfiozinc.github.io/makeup_artist/'],
    ['NP Style — Salón', 'https://konfiozinc.github.io/np-style/'],
    ['La Cañada Style — Barbería', 'https://konfiozinc.github.io/ca-ada_style/'],
    ['Lizeth Lozano — Contadora', 'https://konfiozinc.github.io/lizeth_lozano/'],
    ['Dra. Sofía Rodríguez — Nutricionista', 'https://konfiozinc.github.io/nutricionista/'],
    ['Dra. Ana Pérez — Nutrición funcional', 'https://konfiozinc.github.io/nutricion_funcional/'],
    ['NutriDrink — Productos nutricionales', 'https://konfiozinc.github.io/nutridrink/'],
    ['Dra. Isabela Rojas — Odontología', 'https://konfiozinc.github.io/servicios_odontologicos/'],
    ['Dra. Amanda Méndez — Cirujana dentista', 'https://konfiozinc.github.io/cirujana_dentista/'],
    ['Juan Pérez — Diseño gráfico', 'https://konfiozinc.github.io/diseno_grafico/'],
    ['Carolina Carelli — Decoradora de fiestas', 'https://konfiozinc.github.io/decoradora_de_fiestas/'],
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
    ['Konfío Sports — Mundial 2026', 'https://konfiozinc.github.io/konfio-sports/'],
    ['PANGEA — Coordinación sin conexión', 'https://konfiozinc.github.io/pangea/'],
    ['Regina Pereira — Nails Academy', 'https://konfiozinc.github.io/card/']
  ];

  $$('#verTodosBtn, [data-all-projects]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var html = '<div style="display:grid;gap:.5rem;">';
      PROJECTS.forEach(function (p) {
        html += '<a href="' + p[1] + '" target="_blank" rel="noopener noreferrer" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.7rem 1rem;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02);font-size:.9rem;color:var(--fg);">' +
          escapeHtml(p[0]) + ' <i class="fas fa-arrow-up-right-from-square" style="color:var(--gold);flex-shrink:0;"></i></a>';
      });
      html += '</div>';
      openModal(html, 'Todos los proyectos (' + PROJECTS.length + ')');
    });
  });

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

  /* ── 06. FAQ ACORDEÓN ──────────────────────────────────────────────── */
  $$('.faq-question').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.closest('.faq-item');
      if (!item) return;
      var wasOpen = item.classList.contains('open');
      $$('.faq-item.open').forEach(function (i) {
        i.classList.remove('open');
        var iq = i.querySelector('.faq-question');
        if (iq) iq.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ── 07. FILTROS DE PORTAFOLIO ─────────────────────────────────────── */
  var filterBtns = $$('[data-filter]');
  if (filterBtns.length) {
    var items = $$('[data-category]');
    var empty = $('.portfolio-empty');

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        filterBtns.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');

        var visible = 0;
        items.forEach(function (it) {
          var cats = (it.getAttribute('data-category') || '').split(/\s+/);
          var show = (f === 'all' || cats.indexOf(f) !== -1);
          it.hidden = !show;
          if (show) visible++;
        });
        if (empty) empty.hidden = visible !== 0;
        track('filter_portfolio', { filter: f, results: visible });
      });
    });
  }

  /* ── 08. VIDEO PROMOCIONAL "LITE" ──────────────────────────────────────
     El iframe de YouTube solo se carga cuando el usuario hace clic en el
     póster: mejora el rendimiento (Core Web Vitals) sin perder el video. */
  $$('.video-poster').forEach(function (poster) {
    poster.addEventListener('click', function () {
      var id = poster.getAttribute('data-video-id') || 'ndRhGLFUlLA';
      var title = poster.getAttribute('data-video-title') || 'Video promocional KONFÍO ZINC';
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0';
      iframe.title = title;
      iframe.setAttribute('allow', 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      poster.parentNode.appendChild(iframe);
      poster.remove();
      track('play_video', { video_id: id });
    });
  });

  /* ── 09. FORMULARIO DE CONTACTO ────────────────────────────────────────
     Validación en JS + envío a Formspree (si el atributo action está
     configurado) o envío simulado con redirección a gracias.html. */
  var form = $('#contactForm');
  if (form) {
    var successBox = form.querySelector('.form-success');
    var errorBox = form.querySelector('.form-error-box');

    function showBox(box, html) {
      if (!box) return;
      box.innerHTML = html;
      box.classList.add('show');
    }
    function clearErrors() {
      $$('.form-group', form).forEach(function (g) { g.classList.remove('has-error'); });
      $$('.invalid', form).forEach(function (i) { i.classList.remove('invalid'); });
      if (successBox) successBox.classList.remove('show');
      if (errorBox) errorBox.classList.remove('show');
    }

    /* Campos obligatorios y su regla de validación */
    var RULES = [
      { id: 'nombre', test: function (v) { return v.trim().length >= 2; }, msg: 'Escribe tu nombre completo.' },
      { id: 'email', test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }, msg: 'Escribe un correo válido.' },
      { id: 'telefono', test: function (v) { return v.replace(/[^0-9]/g, '').length >= 7; }, msg: 'Escribe un teléfono válido (mínimo 7 dígitos).' },
      { id: 'servicio', test: function (v) { return v.trim().length > 0; }, msg: 'Selecciona el servicio que te interesa.' },
      { id: 'mensaje', test: function (v) { return v.trim().length >= 10; }, msg: 'Cuéntanos un poco más (mínimo 10 caracteres).' }
    ];

    /* Validación en vivo: limpia el error en cuanto el campo es correcto */
    RULES.forEach(function (r) {
      var el = document.getElementById(r.id);
      if (!el) return;
      el.addEventListener('input', function () {
        var group = el.closest('.form-group');
        if (r.test(el.value)) {
          el.classList.remove('invalid');
          if (group) group.classList.remove('has-error');
        }
      });
      el.addEventListener('blur', function () {
        if (el.value.trim() === '') return;
        var group = el.closest('.form-group');
        var ok = r.test(el.value);
        el.classList.toggle('invalid', !ok);
        if (group) group.classList.toggle('has-error', !ok);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();

      var valid = true, firstBad = null;
      RULES.forEach(function (r) {
        var el = document.getElementById(r.id);
        if (!el) return;
        var ok = r.test(el.value);
        el.classList.toggle('invalid', !ok);
        var group = el.closest('.form-group');
        if (group) {
          group.classList.toggle('has-error', !ok);
          var err = group.querySelector('.field-error');
          if (err) err.textContent = r.msg;
        }
        if (!ok) { valid = false; if (!firstBad) firstBad = el; }
      });

      if (!valid) {
        if (firstBad) firstBad.focus();
        showBox(errorBox, '⚠️ Revisa los campos marcados en rojo para poder enviar tu mensaje.');
        track('form_error', { form: 'contacto' });
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…'; }

      var action = (form.getAttribute('action') || '').trim();
      var isPlaceholder = !action || action.indexOf('xxxxx') !== -1;
      var next = form.getAttribute('data-thanks') || siteUrl('gracias.html');

      /* Envío real con Formspree */
      if (!isPlaceholder) {
        fetch(action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          track('form_submit', { form: 'contacto', method: 'formspree' });
          window.location.href = next;
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          showBox(errorBox, 'No pudimos enviar el formulario. Escríbenos directo por <a href="' + WHATSAPP + '" target="_blank" rel="noopener noreferrer" style="color:var(--gold);text-decoration:underline;">WhatsApp</a> o al correo konfiozinc@gmail.com.');
          track('form_error', { form: 'contacto', reason: 'network' });
        });
        return;
      }

      /* Envío a Firebase (colección `contactos`) con respaldo local */
      var lead = {
        fecha: new Date().toISOString(),
        nombre: (document.getElementById('nombre') || {}).value || '',
        email: (document.getElementById('email') || {}).value || '',
        telefono: (document.getElementById('telefono') || {}).value || '',
        servicio: (document.getElementById('servicio') || {}).value || '',
        mensaje: (document.getElementById('mensaje') || {}).value || ''
      };

      function guardarLocal() {
        try {
          var prev = JSON.parse(localStorage.getItem('kz_leads') || '[]');
          prev.push(lead);
          localStorage.setItem('kz_leads', JSON.stringify(prev));
        } catch (err) { /* sin almacenamiento: continuamos */ }
      }

      var envio = Promise.resolve();
      if (window.KZ_DB && window.firebase) {
        envio = window.KZ_DB.collection('contactos').add({
          nombre: lead.nombre,
          email: lead.email,
          telefono: lead.telefono,
          servicio: lead.servicio,
          mensaje: lead.mensaje,
          origen: 'contacto',
          estado: 'NUEVO',
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          track('form_submit', { form: 'contacto', method: 'firebase' });
        }).catch(function () {
          guardarLocal();
          track('form_submit', { form: 'contacto', method: 'local' });
        });
      } else {
        guardarLocal();
        track('form_submit', { form: 'contacto', method: 'local' });
      }

      envio.then(function () {
        setTimeout(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          showBox(successBox, '✅ ¡Mensaje enviado! Te contactaremos muy pronto. También puedes escribirnos ya por <a href="' + WHATSAPP + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>.');
          form.reset();
          /* Redirige a la página de confirmación (configurable con data-redirect="false") */
          if (form.getAttribute('data-redirect') !== 'false') {
            setTimeout(function () { window.location.href = next; }, 1400);
          }
        }, 500);
      });
    });
  }

  /* ── 10. VOLVER ARRIBA ─────────────────────────────────────────────── */
  $$('#backTop, [data-back-top]').forEach(function (b) {
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); });
  });

  /* ── 12. AGENTE IA FLOTANTE ────────────────────────────────────────── */
  var chat = $('#kzFabChat');
  var toggleBtn = $('#kzFabToggle');
  var closeBtn = $('#kzFabClose');
  var resetBtn = $('#kzFabReset');
  var chatBody = $('#kzFabBody');
  var chatInput = $('#kzFabInput');
  var chatSend = $('#kzFabSend');
  var chatChips = $('#kzFabChips');

  if (chat && toggleBtn && chatBody) {
    var isOpen = false;
    var history = [];
    var WA_URL = WHATSAPP + '?text=Hola%2C%20quiero%20una%20cotizaci%C3%B3n%20gratis%20para%20mi%20negocio';
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
      track('ia_whatsapp_cta');
    }

    /* Respaldo local por reglas si el backend no responde */
    function getLocalResponse(userMsg) {
      var q = normalize(userMsg);
      var has = function (arr) { return arr.some(function (k) { return q.indexOf(k) !== -1; }); };

      if (/(^|\s)unas(\s|$)/.test(q) && !/dudas/.test(q)) {
        return { text: '¡Perfecto! 👋 Para tu sector tenemos este ejemplo real:\nhttps://konfiozinc.github.io/nandy_nails/\n\n📌 ¿Ya manejas redes sociales para tu negocio?', cta: false };
      }
      /* ── Paquetes todo en uno ───────────────────────────────────────
         Debe ir ANTES de la regla de tarjetas: "cuánto cuesta" + "tarjeta"
         es una pregunta de precio, no de producto. */
      if (has(['cuanto cuesta', 'cuanto vale', 'precio', 'precios', 'cuesta', 'costo', 'valor', 'tarifa', 'presupuesto'])
          && has(['tarjeta', 'tarjetas'])) {
        return { text: 'Las tarjetas digitales van desde $49.900 💳:\n\n• STAR $49.900 — tu presentación: contacto, WhatsApp, redes, ubicación y QR.\n• PRO $99.900 — añade catálogo o menú, precios y galería.\n• ELITE $149.900 — suma agenda de citas, formularios, varias sedes y agente IA.\n\n¿Te recomiendo una según tu negocio?', cta: true };
      }
      if (has(['paquete', 'paquetes', 'todo en uno', 'combo'])) {
        return { text: 'Tenemos 3 tarjetas digitales 🎯:\n\n• Star $49.900 — contacto, redes, ubicación y QR.\n• Pro $99.900 ⭐ la más pedida — catálogo o menú, galería y botón de pedido.\n• Elite $149.900 — agenda de citas, formularios y mini landing.\n\n\nPago único, con dominio incluido el primer año. Otros servicios (landing, catálogo, menú, QR o agente IA) se cotizan.\n\n¿Cuál encaja mejor con tu negocio?', cta: true };
      }

      /* ── Programa de aliados ────────────────────────────────────────
         Va DESPUÉS de las reglas de producto (para no secuestrar consultas
         de cliente) pero ANTES de las de sector: así "quiero ganar
         recomendando tarjetas" o "cuánto gano si vendo una tarjeta" caen
         aquí y no en la ficha del producto.
         Fuente: PROGRAMA_ALIADOS.md. Las tablas públicas están en aliados.html.
         Regla del documento: las comisiones NO se negocian en el chat; toda
         negociación se deriva a Darwin por WhatsApp. */
      if (has(['aliado', 'aliados', 'distribuidor', 'distribuidores', 'revender', 'reventa',
               'referido', 'referidos', 'comision', 'comisiones', 'ingreso extra',
               'ganar dinero', 'gano dinero', 'ganar plata', 'ganar con', 'ser socio',
               'marca blanca', 'afiliado', 'afiliados',
               'comprar al por mayor', 'al por mayor', 'por mayor'])
          || (has(['ganar', 'ganancia', 'gano', 'margen']) && has(['tarjeta', 'tarjetas', 'vender', 'venda', 'vendo', 'vendiendo']))) {
        return { text: '¡Sí! Tenemos un programa de aliados para que ganes vendiendo nuestras tarjetas digitales 🤝\n\n*Opción 1 · Distribuidor* (la más rentable)\nCompras a precio de aliado y vendes al precio que quieras:\n• Bronce (1 a 4 ventas/mes) · 30% → Star $34.930 · Pro $69.930 · Elite $104.930\n• Plata (5 a 9) · 40% → Star $29.940 · Pro $59.940 · Elite $89.940\n• Oro (10 o más) · 50% → Star $24.950 · Pro $49.950 · Elite $74.950\n\n*Opción 2 · Referido* (sin invertir nada)\nSolo presentas el cliente y ganas el 20%: $9.980 (Star), $19.980 (Pro) o $29.980 (Elite).\n\n🎁 Al activarte te llevas una tarjeta PRO de muestra con 50% de descuento ($49.950), y gratis si cierras tus primeras 3 ventas.\n\nNosotros hacemos el diseño, el hosting y el soporte: tú te concentras en vender.\n\nVer tablas completas: https://konfiozinc.github.io/card/aliados.html\n\n¿Quieres que te active como aliado?', cta: true };
      }

      /* ── Tarjetas digitales (producto) ─────────────────────────────── */
      if (has(['tarjeta', 'tarjetas'])) {
        return { text: 'La tarjeta digital es tu presentación en un solo enlace 💳: contacto, WhatsApp, redes, ubicación, servicios y galería. Se actualiza al instante y reemplaza el papel.\n\nHay tres planes: Star $49.900, Pro $99.900 y Elite $149.900.\n\n¿Quieres ver un ejemplo o cotizarla?', cta: true };
      }
      if (has(['landing', 'pagina', 'landing page', 'landing pages'])) {
        return { text: 'Creamos landing pages profesionales en 3 planes 🚀:\n\n• *ECO $699.000* — diseño estándar, banner estático, hasta 5 bloques y 1 correo corporativo.\n• *SMART $1.099.000* ⭐ la más pedida — diseño profesional, hasta 10 bloques, formulario personalizado, 5 correos y SEO.\n• *POWER $1.399.000* — diseño exclusivo, animaciones, reCAPTCHA, panel de administración y Google Analytics 4.\n\nLos tres incluyen hosting y dominio por 1 año ✅\n\n¿Cuál encaja mejor con tu negocio?', cta: true };
      }
      if (has(['catalogo', 'catalogos'])) {
        return { text: 'Tu catálogo digital te permite mostrar productos con fotos y precios actualizables, y compartirlo por WhatsApp o redes 📖. Desde $120.000.\n\n¿Qué tipo de productos o servicios ofreces?', cta: true };
      }
      if (has(['menu', 'menus'])) {
        return { text: 'Los menús digitales con QR son perfectos para restaurantes 🍽️: tus clientes ven platos, precios y promociones, y piden directo por WhatsApp. Desde $150.000.\n\n¿Quieres un menú digital para tu negocio?', cta: true };
      }
      if (has(['asistente', 'asistentes', 'agente ia', 'agentes ia', 'agente con ia', 'chatbot']) || /\bia\b/.test(q)) {
        return { text: 'Creamos agentes IA que atienden a tus clientes 24/7 🤖: responden precios, horarios, disponibilidad y agendan citas, entrenados con la información de tu negocio. Desde $250.000.\n\n¿Quieres uno para tu negocio?', cta: true };
      }
      if (has(['qr', 'codigo qr', 'codigos qr'])) {
        return { text: 'Creamos códigos QR personalizados con tu logo y tus colores 📱 desde $50.000, para imprimir en mesas, vitrinas, empaques o facturas.\n\nLlevan a tus clientes directo a tu menú, catálogo, WhatsApp o reseñas de Google.\n\n¿Para qué lo necesitas?', cta: true };
      }


      /* ── Consultas generales ──────────────────────────────────────── */
      if (has(['seo', 'posicionamiento', 'google ads', 'pauta', 'publicidad', 'redes sociales',
               'community manager', 'branding', 'email marketing', 'diseno de marca'])) {
        return { text: 'Esos servicios no los ofrecemos directamente 🙌. Lo que sí hacemos son seis soluciones digitales:\n\n• Tarjetas Digitales (Star, Pro y Elite)\n• Catálogos Digitales\n• Menús Digitales con QR\n• Landing Pages\n• Códigos QR personalizados\n• Agentes IA de atención 24/7\n\nOjo: la landing page y la tarjeta sí salen optimizadas para que te encuentren en Google. ¿Cuál te interesa?', cta: true };
      }
      if (has(['servicio', 'servicios', 'producto', 'productos', 'que ofrecen', 'que hacen', 'que venden'])) {
        return { text: 'Estas son nuestras seis soluciones 📱:\n\n• Tarjetas Digitales (Star, Pro y Elite)\n• Catálogos Digitales\n• Menús Digitales con QR\n• Landing Pages\n• Códigos QR personalizados\n• Agentes IA de atención 24/7\n\n¿Cuál te interesa?', cta: true };
      }
      if (has(['precio', 'cuesta', 'costo', 'valor', 'tarifa', 'presupuesto', 'cotiza', 'cotizacion', 'cotizar'])) {
        return { text: 'Nuestros precios arrancan así 📊:\n\n• Códigos QR: desde $50.000\n• Tarjetas Digitales: desde $49.900 (Star $49.900 · Pro $99.900 · Elite $149.900)\n• Catálogos Digitales: desde $120.000\n• Menús Digitales: desde $150.000\n• Agentes IA: desde $250.000\n• Landing Pages: desde $350.000\n\nTambién hay paquetes todo en uno desde $59.900. Escríbeme por WhatsApp y te preparo la cotización exacta, sin compromiso.', cta: true };
      }
      var sectores = [
        [['restaurante', 'restaurantes', 'comida', 'comidas', 'cafeteria', 'pizzeria', 'hamburgues'], ['https://konfiozinc.github.io/eltiti/', 'https://konfiozinc.github.io/colsabor/']],
        [['pasteleria', 'reposteria', 'tortas', 'postres'], ['https://konfiozinc.github.io/pasteleria_artesanal/']],
        [['carniceria', 'carnes'], ['https://konfiozinc.github.io/carniceria_la_milagrosa/']],
        [['abogado', 'abogados', 'juridico', 'legal', 'derecho', 'firma'], ['https://konfiozinc.github.io/abogados-dta/', 'https://konfiozinc.github.io/fcr_alianza_legal/']],
        [['belleza', 'salon', 'peluqueria', 'estilista'], ['https://konfiozinc.github.io/np-style/']],
        [['barberia', 'barbero'], ['https://konfiozinc.github.io/ca-ada_style/']],
        [['manicure', 'pedicure', 'nail'], ['https://konfiozinc.github.io/nandy_nails/']],
        [['maquillaje', 'makeup'], ['https://konfiozinc.github.io/makeup_artist/']],
        [['contador', 'contadora', 'contabilidad'], ['https://konfiozinc.github.io/lizeth_lozano/']],
        [['nutricion funcional'], ['https://konfiozinc.github.io/nutricion_funcional/']],
        [['productos nutricionales', 'suplementos'], ['https://konfiozinc.github.io/nutridrink/']],
        [['nutricionista', 'nutricion', 'dietista'], ['https://konfiozinc.github.io/nutricionista/']],
        [['odontologo', 'odontologia', 'dentista', 'dental'], ['https://konfiozinc.github.io/servicios_odontologicos/', 'https://konfiozinc.github.io/cirujana_dentista/']],
        [['diseno', 'disenador', 'diseno grafico'], ['https://konfiozinc.github.io/diseno_grafico/']],
        [['eventos', 'decoracion', 'fiestas'], ['https://konfiozinc.github.io/decoradora_de_fiestas/']],
        [['fumigacion', 'plagas'], ['https://konfiozinc.github.io/fumigaciones-monterrey/', 'https://konfiozinc.github.io/fumig_master/']],
        [['transporte', 'mensajeria', 'envios', 'logistica'], ['https://konfiozinc.github.io/mega-express/']],
        [['grua', 'gruas', 'remolque'], ['https://konfiozinc.github.io/gruas_gyr_arias/']],
        [['inmobiliaria', 'bienes raices', 'finca raiz', 'avaluos'], ['https://konfiozinc.github.io/century_21_radial/', 'https://konfiozinc.github.io/dg_ventas_avaluos/']],
        [['tienda', 'comercio', 'almacen'], ['https://konfiozinc.github.io/dondecompro/', 'https://konfiozinc.github.io/nbccompany/']],
        [['internet', 'fibra', 'telecomunicaciones'], ['https://konfiozinc.github.io/unefibra/']],
        [['musica', 'cantante', 'cantar', 'voz', 'artista', 'banda'], ['https://konfiozinc.github.io/calixto_acordeon_magico/', 'https://konfiozinc.github.io/the-big-bang-carranga/']],
        [['masaje', 'masajes', 'quiromasaje', 'terapia'], ['https://konfiozinc.github.io/quiromasajes-gap/']]
      ];
      for (var si = 0; si < sectores.length; si++) {
        if (has(sectores[si][0])) {
          var enlaces = sectores[si][1];
          return { text: '¡Perfecto! 👋 Para tu sector tenemos ' + (enlaces.length > 1 ? 'estos ejemplos reales:' : 'este ejemplo real:') + '\n' + enlaces.join('\n') + '\n\n📌 ¿Quieres que te arme algo parecido para tu negocio?', cta: false };
        }
      }
      if (has(['portafolio', 'ejemplo', 'ejemplos', 'trabajo', 'trabajos', 'casos', 'resultados', 'proyectos'])) {
        return { text: 'Tenemos proyectos en restaurantes, salud, belleza, inmobiliaria, transporte, música y más 💼.\n\nPuedes ver el portafolio completo aquí:\nhttps://konfiozinc.github.io/card/portafolio.html\n\n¿De qué sector es tu negocio? Así te muestro un ejemplo parecido.', cta: false };
      }
      if (has(['entrega', 'tiempo', 'cuanto tarda', 'cuanto tardan', 'tardan', 'tarda', 'cuando', 'demora', 'rapido'])) {
        return { text: '⏱️ Entregamos en 24 a 48 horas hábiles las tarjetas, catálogos y menús digitales. Las landing pages tardan de 5 a 15 días y los agentes IA de 5 a 10 días, según el alcance.', cta: true };
      }
      if (has(['contacto', 'whatsapp', 'telefono', 'numero', 'correo', 'email', 'hablar'])) {
        return { text: '📞 Contáctanos por:\n• WhatsApp: +57 320 641 1340\n• Email: konfiozinc@gmail.com\n\nO usa el botón verde de WhatsApp. ¡Te respondemos al instante!', cta: true };
      }
      if (has(['hola', 'buenas', 'buenos dias', 'saludo', 'hey'])) {
        return { text: '¡Hola! 👋 Soy el asesor de KONFÍO ZINC.\n\nTe ayudo con nuestras seis soluciones:\n• Tarjetas Digitales (Star, Pro y Elite)\n• Catálogos Digitales\n• Menús Digitales con QR\n• Landing Pages\n• Códigos QR personalizados\n• Agentes IA de atención 24/7\n\nY si quieres ganar dinero recomendándonos, tengo el programa de aliados.\n\nCuéntame, ¿qué necesitas?', cta: false };
      }
      return { text: 'Buena pregunta 😊. Para darte una respuesta exacta, escríbeme por WhatsApp y te atiendo al instante.\n\nAquí puedo ayudarte con: servicios, precios, programa de aliados, portafolio o cotizar tu proyecto. Toca un botón de abajo 👇', cta: true };
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
      track('ia_message', { message: userMsg.slice(0, 120) });
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
      var welcome = '¡Hola! 👋 Bienvenido a KONFÍO ZINC.\n\nTe ayudo con nuestras seis soluciones: tarjetas digitales (Star, Pro y Elite), catálogos, menús digitales con QR, landing pages, códigos QR y agentes IA de atención 24/7.\n\nY si quieres ganar dinero recomendándonos, pregunta por el *programa de aliados*.\n\n¿Qué necesitas?';
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
        track('ia_open');
      }
    }

    toggleBtn.addEventListener('click', function () { toggleChat(); });
    if (closeBtn) closeBtn.addEventListener('click', function () { toggleChat(false); });
    if (resetBtn) resetBtn.addEventListener('click', function () { history = []; chatBody.innerHTML = ''; showWelcome(); });
    if (chatInput) {
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput.value); }
      });
    }
    if (chatSend) chatSend.addEventListener('click', function () { sendMessage(chatInput.value); });
    if (chatChips) {
      chatChips.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var msg = btn.getAttribute('data-msg');
        if (!isOpen) toggleChat(true);
        setTimeout(function () { sendMessage(msg); }, 300);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) toggleChat(false);
    });
  }
})();
