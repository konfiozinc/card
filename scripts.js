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
    var WA_URL = 'https://wa.me/573206411340?text=Hola%2C%20quiero%20una%20consultor%C3%ADa%20gratis%20de%20marketing%20digital';
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

      if (has(['servicio', 'servicios', 'que ofrecen', 'que hacen', 'que venden'])) {
        return { text: 'Ofrecemos marketing digital integral 🚀:\n\n• SEO y posicionamiento web\n• Gestión de redes sociales\n• Publicidad digital (Google, Facebook, TikTok)\n• Diseño y desarrollo web\n• Branding e identidad visual\n• Email marketing y automatización\n• Analítica y reportes\n\n¿Cuál te interesa?', cta: true };
      }
      if (has(['precio', 'cuanto', 'cuesta', 'costo', 'valor', 'tarifa', 'presupuesto', 'cotiza'])) {
        return { text: 'Cada plan se cotiza según tus objetivos y alcance 📊. Agenda un diagnóstico gratis y te entregamos una propuesta a tu medida, sin compromiso.\n\n¿Quieres que te contactemos para armar tu plan?', cta: true };
      }
      if (has(['portafolio', 'ejemplo', 'ejemplos', 'trabajo', 'trabajos', 'casos', 'resultados'])) {
        return { text: 'Tenemos casos de éxito en restaurantes, salud, belleza, inmobiliaria y más 💼.\n\nPuedes verlos en la sección "Portafolio" de esta página o aquí: https://konfiozinc.github.io/card/\n\n¿De qué sector es tu negocio?', cta: false };
      }
      if (has(['consultoria', 'diagnostico', 'gratis', 'empezar', 'contratar', 'quiero', 'agendar', 'reunion'])) {
        return { text: '¡Perfecto! 🎉 Agenda tu diagnóstico gratis y armamos una estrategia a tu medida.\n\nEscoge el canal que prefieras: aquí mismo cuéntame de tu negocio, o toca el botón de WhatsApp 👇', cta: true };
      }
      if (has(['contacto', 'whatsapp', 'telefono', 'numero', 'correo', 'email', 'hablar'])) {
        return { text: '📞 Contáctanos por:\n• WhatsApp: +57 320 641 1340\n• Email: konfiozinc@gmail.com\n\nO usa el botón verde de WhatsApp. ¡Te respondemos al instante!', cta: true };
      }
      if (has(['hola', 'buenas', 'buenos dias', 'saludo', 'hey'])) {
        return { text: '¡Hola! 👋 Soy el asesor de KONFÍO ZINC, agencia de marketing digital.\n\nCuéntame, ¿qué te gustaría lograr con tu marca? (más clientes, más ventas, mejor presencia online…)', cta: false };
      }
      return { text: 'Buena pregunta 😊. Para darte una respuesta exacta y personalizada, escríbeme por WhatsApp y te atiendo al instante.\n\nAquí puedo ayudarte con: servicios, precios, portafolio o agendar una consultoría gratis. Toca uno de los botones de abajo 👇', cta: true };
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
      var welcome = '¡Hola! 👋 Bienvenido a KONFÍO ZINC, tu agencia de marketing digital.\n\nAyudamos a negocios a crecer con SEO, publicidad, redes sociales, diseño web y branding.\n\nCuéntame, ¿qué te gustaría lograr con tu marca?';
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
