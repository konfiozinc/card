/* ═══════════════════════════════════════════════════════════
   KONFÍO ZINC · scripts.js
   JS consolidado (main + agente offline) + correcciones.
   - Sin llamadas a Anthropic (agente 100% offline, sin claves).
   - Renderizado de chat sin XSS (escape de HTML).
   - Normalización de acentos en la detección de intención.
   - FAQ accesible por teclado, modal de video con foco/ESC.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────── */
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var normalize = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  var escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia && window.matchMedia('(hover: none)').matches;

  /* ══════════════════════════════════════════════════
     CURSOR (solo desktop, sin reduced-motion)
  ══════════════════════════════════════════════════ */
  if (!isTouch && !reducedMotion) {
    var cur = $('#cur'), ring = $('#curRing');
    if (cur && ring) {
      var mx = 0, my = 0, tx = 0, ty = 0;
      document.addEventListener('mousemove', function (e) {
        mx = e.clientX; my = e.clientY;
        cur.style.left = (mx - 5) + 'px'; cur.style.top = (my - 5) + 'px';
      }, { passive: true });
      (function raf() {
        tx += (mx - tx) * 0.12; ty += (my - ty) * 0.12;
        ring.style.left = (tx - 16) + 'px'; ring.style.top = (ty - 16) + 'px';
        requestAnimationFrame(raf);
      })();
      $$('a,button').forEach(function (el) {
        el.addEventListener('mouseenter', function () { cur.style.transform = 'scale(2.5)'; ring.style.transform = 'scale(.5)'; });
        el.addEventListener('mouseleave', function () { cur.style.transform = 'scale(1)'; ring.style.transform = 'scale(1)'; });
      });
    }
  }

  /* ── Parallax glow ── */
  var hg = $('#hGlow');
  if (hg && !reducedMotion) {
    document.addEventListener('mousemove', function (e) {
      hg.style.transform = 'translate(' + ((e.clientX / innerWidth - .5) * 35) + 'px,' + ((e.clientY / innerHeight - .5) * 35) + 'px)';
    }, { passive: true });
  }

  /* ══════════════════════════════════════════════════
     SCROLL REVEAL
  ══════════════════════════════════════════════════ */
  var revEls = $$('.rev');
  if ('IntersectionObserver' in window) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var sibs = Array.prototype.slice.call(e.target.parentElement.children).filter(function (c) { return c.classList.contains('rev'); });
          var idx = sibs.indexOf(e.target);
          setTimeout(function () { e.target.classList.add('vis'); }, idx * 70);
          revObs.unobserve(e.target);
        }
      });
    }, { threshold: .06 });
    revEls.forEach(function (r) { revObs.observe(r); });
  } else {
    revEls.forEach(function (r) { r.classList.add('vis'); });
  }

  /* ══════════════════════════════════════════════════
     COUNTER ANIMATION
  ══════════════════════════════════════════════════ */
  function animCount(el, target, sfx) {
    var dur = 1800, start = performance.now();
    (function step(now) {
      var p = Math.min((now - start) / dur, 1);
      el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target) + sfx;
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }
  if ('IntersectionObserver' in window) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var el = e.target.querySelector('[data-count]');
          if (el) animCount(el, parseInt(el.dataset.count, 10), el.dataset.sfx || '');
          cObs.unobserve(e.target);
        }
      });
    }, { threshold: .5 });
    $$('.stat').forEach(function (s) { cObs.observe(s); });
  }

  /* ══════════════════════════════════════════════════
     FAQ (accesible: botones + aria-expanded)
  ══════════════════════════════════════════════════ */
  $$('.fq').forEach(function (q) {
    q.addEventListener('click', function () {
      var it = q.closest('.fi');
      var was = it.classList.contains('open');
      $$('.fi.open').forEach(function (i) {
        i.classList.remove('open');
        var b = i.querySelector('.fq');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
      if (!was) {
        it.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ══════════════════════════════════════════════════
     MENÚ MÓVIL
  ══════════════════════════════════════════════════ */
  var navToggle = $('#navToggle'), navLinks = $('#navLinks');
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

  /* ══════════════════════════════════════════════════
     VIDEO MODAL (accesible: dialog, foco, ESC, trap)
  ══════════════════════════════════════════════════ */
  var vModal = $('#vModal'), vFrame = $('#vFrame'), vClose = $('#vClose'), vBtn = $('#vBtn');
  if (vModal && vFrame && vClose && vBtn) {
    var lastFocused = null;
    function openV() {
      lastFocused = document.activeElement;
      vFrame.src = 'https://www.youtube.com/embed/ndRhGLFUlLA?autoplay=1';
      vModal.classList.add('act');
      vModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      vClose.focus();
    }
    function closeV() {
      vModal.classList.remove('act');
      vModal.setAttribute('aria-hidden', 'true');
      vFrame.src = '';
      document.body.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }
    vBtn.addEventListener('click', openV);
    vClose.addEventListener('click', closeV);
    vModal.addEventListener('click', function (e) { if (e.target === vModal) closeV(); });
    vModal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeV(); return; }
      if (e.key === 'Tab') {
        var focusable = vModal.querySelectorAll('button, [href], iframe');
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ══════════════════════════════════════════════════
     MARQUEE: pausar fuera de pantalla (perf)
  ══════════════════════════════════════════════════ */
  if ('IntersectionObserver' in window && !reducedMotion) {
    var mObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        e.target.classList.toggle('is-offscreen', !e.isIntersecting);
      });
    }, { threshold: 0 });
    $$('.port-strip, .ttrack').forEach(function (el) { mObs.observe(el); });
  }

  /* ══════════════════════════════════════════════════
     AGENTE IA FLOTANTE (OFFLINE) · sin claves API
  ══════════════════════════════════════════════════ */
  var chat = $('#kzFabChat');
  var toggleBtn = $('#kzFabToggle');
  var closeBtn = $('#kzFabClose');
  var resetBtn = $('#kzFabReset');
  var body = $('#kzFabBody');
  var input = $('#kzFabInput');
  var sendBtn = $('#kzFabSend');
  var chips = $('#kzFabChips');

  if (chat && toggleBtn) {
    var isOpen = false;
    var history = [];
    var WA_URL = 'https://wa.me/573206411340?text=Hola%20Darwin%2C%20estoy%20interesado%20en%20los%20servicios%20de%20KONF%C3%8DO%20ZINC';

    function formatBotText(text) {
      var s = escapeHtml(text);
      s = s.replace(/\n/g, '<br>');
      s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      return s;
    }

    function addMessage(text, sender) {
      var div = document.createElement('div');
      div.className = 'kz-msg ' + (sender === 'user' ? 'kz-msg-user' : 'kz-msg-bot');
      if (sender === 'bot') {
        div.innerHTML = formatBotText(text); /* contenido escapado */
      } else {
        div.textContent = text; /* texto del usuario: seguro */
      }
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    function showTyping() {
      var div = document.createElement('div');
      div.className = 'kz-msg-typing';
      div.id = 'kzTyping';
      div.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    function hideTyping() {
      var el = document.getElementById('kzTyping');
      if (el) el.remove();
    }

    function showWhatsAppButton() {
      if (document.querySelector('.kz-wa-btn')) return;
      var div = document.createElement('div');
      div.style.cssText = 'align-self: flex-start; margin-top: 4px;';
      var a = document.createElement('a');
      a.href = WA_URL;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'kz-wa-btn';
      a.textContent = '💬 CONTINUAR POR WHATSAPP';
      div.appendChild(a);
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    /* ── LÓGICA DEL AGENTE (reglas de negocio, con acentos normalizados) ── */
    function getResponse(userMsg) {
      var q = normalize(userMsg.trim());

      /* Partner / aliado */
      if (['aliado', 'partner', 'distribuidor', 'revender', 'agencia', 'colaborar', 'comisiones'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '¡Excelente! 💼\n\nKONFÍO ZINC tiene un programa de aliados para agencias, diseñadores y comerciales.\n\nPara definir el esquema de comisiones y tu precio de distribuidor, necesito conocer tu perfil:\n¿Actualmente a qué te dedicas?\n¿Qué tipo de clientes atiendes con más frecuencia?\n\nCon tu perfil, el equipo comercial te confirma la tabla de comisiones y precios por WhatsApp.',
          cta: true
        };
      }

      /* Precio */
      if (['precio', 'precios', 'cuanto', 'cuesta', 'costo', 'valor', 'tarifa', 'plan', 'planes', 'vale', 'precio de'].some(function (k) { return q.indexOf(k) !== -1; }) && !['entrega', 'tiempo', 'demora', 'tarda', 'dias habiles'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: 'Claro 😊.\n\nActualmente manejamos tres categorías:\n\n⭐ START: $49.900 COP\n⭐ PRO: $99.900 COP\n⭐ ELITE: $149.900 COP\n\n📌 START: Ideal para presencia digital sencilla\n📌 PRO: La más recomendada para la mayoría de negocios\n📌 ELITE: La solución más completa\n\n¿A qué se dedica tu negocio? Así podré recomendarte la mejor opción.',
          cta: true
        };
      }

      /* Portafolio / ejemplos */
      if (['ejemplo', 'ejemplos', 'portafolio', 'ver trabajos', 'muestra', 'referencias', 'trabajos'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: 'Claro 😊.\n\nAquí puedes conocer nuestro portafolio y ver ejemplos reales:\n\nhttps://konfiozinc.github.io/card/\n\nCuando lo revises, cuéntame qué estilo te gustó más y con gusto te preparo una propuesta personalizada.',
          cta: false
        };
      }

      /* Contratar (ANTES que la detección de sector) */
      if (['contratar', 'contrata', 'comprar', 'compras', 'empezar', 'listo', 'adquirir', 'quiero una tarjeta', 'quiero mi tarjeta', 'deseo una tarjeta', 'pagar', 'contratacion'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '🎉 ¡Excelente! Vamos a iniciar tu proyecto.\n\nTe recomiendo KONFÍO ZINC PRO ($99.900 COP) porque se ajusta perfectamente a la mayoría de negocios.\n\n📌 Para comenzar, necesito que me compartas:\n• Nombre completo o razón social\n• Teléfono de contacto\n• Logo (si tienes)\n• Fotografías de tu negocio o servicios\n• Redes sociales\n• Servicios o productos que ofreces\n\n📌 Condiciones de pago: 50% de anticipo para iniciar y 50% antes de la entrega final.\n\n📌 Aceptamos pagos por Nequi, Daviplata, transferencia Bancolombia o enlace de Mercado Pago.\n\n¿Me compartes tu información para iniciar el diseño? ✨',
          cta: true
        };
      }

      /* Soporte / actualizaciones / garantía */
      if (['actualizar', 'cambios', 'modificar', 'soporte', 'garantia', 'devolucion', 'devoluciones'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '✅ Tu compra incluye 3 actualizaciones gratuitas al año para cambios menores: número de contacto, enlaces a redes, dirección y ubicación.\n\n📌 Los cambios más complejos (nuevas secciones, rediseños, catálogos o videos) se cotizan según la complejidad del cambio.\n\n📌 Al ser un producto digital personalizado, no se realizan devoluciones una vez iniciado el diseño. Puedes solicitar ajustes durante la fase de revisión antes de la entrega final.\n\n📌 Además, ofrecemos garantía de satisfacción: si no quedas conforme, rediseñamos tu tarjeta sin costo adicional.',
          cta: false
        };
      }

      /* Tiempo de entrega */
      if (['entrega', 'tiempo', 'demora', 'cuando', 'tarda', 'dias habiles'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '⏱️ El tiempo estimado de entrega es de 24 a 48 horas hábiles, una vez recibamos toda la información necesaria.\n\n📌 Si el proyecto requiere personalización especial, el tiempo podrá variar y te informaremos previamente.',
          cta: false
        };
      }

      /* Saludos */
      if (['hola', 'buenas', 'buenos dias', 'buenas tardes', 'saludo', 'hey', 'que tal'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '¡Hola! 👋 ¿Cómo estás?\n\nCuéntame, ¿tu consulta es para tu propio negocio o para un cliente?',
          cta: false
        };
      }

      /* Respuesta a la pregunta de bienvenida */
      if (['propio negocio', 'mi negocio', 'para mi negocio', 'es para mi', 'propia empresa', 'mi propio'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '¡Perfecto! 🎯\n\nCuéntame, ¿a qué se dedica tu negocio? Así puedo recomendarte la tarjeta ideal y mostrarte un ejemplo parecido.',
          cta: false
        };
      }
      if (['cliente', 'tercero', 'para un cliente', 'para otra persona', 'revender', 'ofrecer'].some(function (k) { return q.indexOf(k) !== -1; })) {
        return {
          text: '¡Genial! 🤝\n\nSi quieres ofrecer estas soluciones a tus clientes, nuestro programa de aliados te puede interesar.\n\nCuéntame, ¿a qué te dedicas y qué tipo de clientes atiendes?',
          cta: true
        };
      }

      /* Detección de sector (keywords ya normalizadas, sin acentos) */
      var sectors = {
        restaurante: ['restaurante', 'comida', 'cafeteria', 'gastronomia', 'menu', 'carta', 'chef', 'restaurantes', 'pizzeria', 'hamburguesas'],
        pasteleria: ['pasteleria', 'reposteria', 'tortas', 'postres', 'pastel', 'dulces', 'panaderia'],
        belleza: ['belleza', 'peluqueria', 'salon', 'estilista', 'color', 'alisado', 'spa', 'cosmetica'],
        unas: ['unas', 'manicure', 'pedicure', 'nail'],
        maquillaje: ['maquillaje', 'makeup', 'maquilladora'],
        barberia: ['barberia', 'barbero', 'corte', 'barba'],
        contador: ['contador', 'contadora', 'contabilidad', 'impuestos', 'asesoria contable', 'contable'],
        nutricion_funcional: ['nutricion funcional'],
        nutricion_productos: ['productos nutricionales', 'suplementos', 'batidos', 'vitaminas', 'proteinas'],
        nutricionista: ['nutricionista', 'nutricion', 'dietista', 'nutriologo'],
        odontologo: ['odontologo', 'dentista', 'odontologia', 'dental'],
        abogado: ['abogado', 'juridico', 'legal', 'derecho', 'abogados', 'firma'],
        inmobiliaria: ['inmobiliaria', 'bienes raices', 'finca raiz', 'propiedades', 'inmobiliario', 'avaluos'],
        transporte: ['transporte', 'mensajeria', 'envios', 'delivery', 'logistica'],
        fumigacion: ['fumigacion', 'plagas', 'control de plagas', 'fumigaciones', 'fumigadora'],
        diseno: ['disenador', 'diseno grafico', 'branding', 'creativo', 'diseno'],
        eventos: ['eventos', 'decoracion', 'fiestas', 'bodas', 'decoradora', 'organizacion de eventos'],
        internet: ['internet', 'fibra optica', 'telecomunicaciones', 'tv hogar', 'wifi'],
        tienda: ['tienda', 'comercio', 'almacen', 'minimarket', 'supermercado']
      };

      var detectedSector = null;
      for (var sector in sectors) {
        if (sectors[sector].some(function (kw) { return q.indexOf(kw) !== -1; })) { detectedSector = sector; break; }
      }

      if (detectedSector) {
        var examples = {
          restaurante: 'https://konfiozinc.github.io/eltiti/',
          pasteleria: 'https://konfiozinc.github.io/pasteleria_artesanal/',
          belleza: 'https://konfiozinc.github.io/np-style/',
          unas: 'https://konfiozinc.github.io/nandy_nails/',
          maquillaje: 'https://konfiozinc.github.io/makeup_artist/',
          barberia: 'https://konfiozinc.github.io/ca-ada_style/',
          contador: 'https://konfiozinc.github.io/lizeth_lozano/',
          nutricion_funcional: 'https://konfiozinc.github.io/nutricion_funcional/',
          nutricion_productos: 'https://konfiozinc.github.io/nutridrink/',
          nutricionista: 'https://konfiozinc.github.io/nutricionista/',
          odontologo: 'https://konfiozinc.github.io/servicios_odontologicos/',
          abogado: 'https://konfiozinc.github.io/abogados-dta/',
          inmobiliaria: 'https://konfiozinc.github.io/century_21_radial/',
          transporte: 'https://konfiozinc.github.io/mega-express/',
          fumigacion: 'https://konfiozinc.github.io/fumigaciones-monterrey/',
          diseno: 'https://konfiozinc.github.io/diseno_grafico/',
          eventos: 'https://konfiozinc.github.io/decoradora_de_fiestas/',
          internet: 'https://konfiozinc.github.io/unefibra/',
          tienda: 'https://konfiozinc.github.io/dondecompro/'
        };
        var sectorNames = {
          restaurante: 'restaurante o negocio gastronómico',
          pasteleria: 'negocio de pastelería artesanal',
          belleza: 'estudio de belleza',
          unas: 'nail studio',
          maquillaje: 'estudio de maquillaje',
          barberia: 'barbería',
          contador: 'servicio de contabilidad',
          nutricion_funcional: 'consultorio de nutrición funcional',
          nutricion_productos: 'negocio de productos nutricionales',
          nutricionista: 'consultorio de nutrición',
          odontologo: 'consultorio odontológico',
          abogado: 'oficina jurídica',
          inmobiliaria: 'inmobiliaria',
          transporte: 'negocio de transporte',
          fumigacion: 'empresa de fumigación',
          diseno: 'estudio de diseño',
          eventos: 'negocio de eventos',
          internet: 'proveedor de internet',
          tienda: 'negocio de tienda o comercio'
        };
        var example = examples[detectedSector] || 'https://konfiozinc.github.io/card/';
        var sectorName = sectorNames[detectedSector] || detectedSector;
        return {
          text: '¡Perfecto! 👋\n\nVeo que tienes un ' + sectorName + '. KONFÍO ZINC es ideal para ti.\n\nPuedes ver un ejemplo muy similar aquí:\n' + example + '\n\n📌 ¿Ya manejas redes sociales para tu negocio?',
          cta: false
        };
      }

      /* Respuesta genérica */
      return {
        text: 'Entendido. 😊\n\nPara poder recomendarte la mejor solución, necesito conocer un poco más sobre tu negocio.\n\n¿A qué se dedica tu negocio o profesión? Así podré orientarte mejor.',
        cta: false
      };
    }

    /* ── Enviar mensaje ── */
    function sendMessage(text) {
      if (!text || !text.trim()) return;
      var userMsg = text.trim();
      addMessage(userMsg, 'user');
      input.value = '';

      history.push({ role: 'user', content: userMsg });

      showTyping();

      setTimeout(function () {
        hideTyping();
        var res = getResponse(userMsg);
        addMessage(res.text, 'bot');
        history.push({ role: 'assistant', content: res.text });
        if (res.cta) showWhatsAppButton();
      }, 600);
    }

    /* ── Bienvenida ── */
    function showWelcome() {
      var welcome = '¡Hola! 👋 Bienvenido a KONFÍO ZINC.\n\nAyudamos a negocios y profesionales a fortalecer su presencia digital con Tarjetas Digitales, Catálogos Digitales, Menús Digitales y Mini Landing Pages.\n\nCuéntame, ¿tu consulta es para tu propio negocio o para un cliente?';
      addMessage(welcome, 'bot');
      history.push({ role: 'assistant', content: welcome });
    }

    /* ── Toggle / reset / eventos ── */
    function toggleChat(force) {
      isOpen = (typeof force === 'boolean') ? force : !isOpen;
      chat.classList.toggle('open', isOpen);
      chat.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        input.focus();
        if (body.children.length === 0) showWelcome();
      }
    }

    toggleBtn.addEventListener('click', function () { toggleChat(); });
    closeBtn.addEventListener('click', function () { toggleChat(false); });
    resetBtn.addEventListener('click', function () {
      history = [];
      body.innerHTML = '';
      showWelcome();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });
    sendBtn.addEventListener('click', function () { sendMessage(input.value); });

    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'whatsapp') {
        window.open(WA_URL, '_blank', 'noopener,noreferrer');
        return;
      }
      var msg = btn.dataset.msg;
      if (!isOpen) toggleChat(true);
      setTimeout(function () { sendMessage(msg); }, 300);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) toggleChat(false);
    });

    /* ── CTA: nav / hero / aliados / panel asesor abren el chat ── */
    function openFloatingChat(e) {
      if (e) e.preventDefault();
      toggleChat(true);
    }
    $$('#navAsesorToggle,#heroAsesorToggle,#aliadosToggle,#asesorPanelToggle').forEach(function (el) {
      if (el) el.addEventListener('click', openFloatingChat);
    });
  }
})();
