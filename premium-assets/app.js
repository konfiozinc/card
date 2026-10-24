(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const header = $('[data-header]');
  const menuButton = $('.menu-toggle');
  const nav = $('#nav-principal');
  const closeMenu = () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  };
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  });
  $$('#nav-principal a').forEach(link => link.addEventListener('click', closeMenu));
  addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMenu();
      menuButton?.focus();
    }
  });
  const setHeader = () => header?.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', setHeader, { passive: true });
  setHeader();

  const reveals = $$('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(element => element.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    reveals.forEach(element => observer.observe(element));
  }

  const canvas = $('#zinc-orbit');
  if (canvas) {
    const context = canvas.getContext('2d', { alpha: true });
    let width = 0, height = 0, frame = 0;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 1.6);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = time => {
      context.clearRect(0, 0, width, height);
      const cx = width * .55, cy = height * .47;
      const radius = Math.min(width, height) * .29;
      const scrollPhase = Math.min(scrollY / Math.max(innerHeight, 1), 2) * 1.2;
      const phase = reduceMotion ? .45 : time * .00012 + scrollPhase;
      for (let ring = 0; ring < 34; ring++) {
        const tilt = (ring / 33 - .5) * 1.28;
        const yRadius = radius * (.22 + Math.abs(Math.cos(tilt)) * .63);
        const xRadius = radius * (1 + Math.sin(tilt) * .12);
        context.beginPath();
        context.ellipse(cx + Math.sin(phase + tilt) * 9, cy + tilt * radius * .55, xRadius, yRadius, phase * .24 + tilt, 0, Math.PI * 2);
        const alpha = .035 + (ring % 5 === 0 ? .09 : 0);
        context.strokeStyle = ring % 3 === 0 ? `rgba(0,229,255,${alpha})` : `rgba(240,180,41,${alpha + .025})`;
        context.lineWidth = ring % 5 === 0 ? 1.3 : .65;
        context.stroke();
      }
      for (let i = 0; i < 46; i++) {
        const angle = i * 2.399 + phase;
        const distance = radius * (.5 + (i % 9) / 11);
        const x = cx + Math.cos(angle) * distance;
        const y = cy + Math.sin(angle) * distance * .52;
        context.beginPath();
        context.arc(x, y, i % 8 === 0 ? 2.2 : 1, 0, Math.PI * 2);
        context.fillStyle = i % 4 ? 'rgba(240,180,41,.5)' : 'rgba(0,229,255,.62)';
        context.fill();
      }
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else addEventListener('resize', resize, { passive: true });
    resize();
    draw(0);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduceMotion) frame = requestAnimationFrame(draw);
    });
  }

  const marquee = $('[data-marquee]');
  if (marquee) {
    let pressed = false, startX = 0, startScroll = 0;
    marquee.addEventListener('pointerdown', event => {
      pressed = true;
      startX = event.clientX;
      startScroll = marquee.scrollLeft;
      marquee.setPointerCapture(event.pointerId);
    });
    marquee.addEventListener('pointermove', event => {
      if (pressed) marquee.scrollLeft = startScroll - (event.clientX - startX);
    });
    const release = () => { pressed = false; };
    marquee.addEventListener('pointerup', release);
    marquee.addEventListener('pointercancel', release);
  }

  $$('[data-service-choice]').forEach(link => link.addEventListener('click', () => {
    const select = $('#servicio');
    if (select) select.value = link.dataset.serviceChoice;
  }));

  /* KZ-SEC-002: el formulario premium escribía a `/api/leads`, una ruta que
     GitHub Pages no sirve. Ahora escribe en la colección `contactos` de
     Firestore (misma que lee el panel y que usa el formulario estándar), vía
     la API REST con la clave web pública. La creación pública está protegida
     por firestore.rules (campos cerrados, tamaños y formato). */
  const FIREBASE_API_KEY = 'AIzaSyDbwAk9APwP2SeaEfWxeQG_bdL9eatciEA';
  const LEADS_URL = 'https://firestore.googleapis.com/v1/projects/konfio-zinc/databases/(default)/documents/contactos?key=' + FIREBASE_API_KEY;

  const form = $('#lead-form');
  const fallback = $('#whatsapp-fallback');
  const status = $('#form-status');
  const fields = ['nombre', 'telefono', 'negocio', 'servicio', 'objetivo'];
  const setError = (id, message = '') => {
    const input = $('#' + id);
    const error = $('#error-' + id);
    input?.setAttribute('aria-invalid', String(Boolean(message)));
    if (error) error.textContent = message;
  };
  const values = () => Object.fromEntries(fields.map(id => [id, $('#' + id)?.value.trim() || '']));
  const validate = data => {
    const errors = {};
    if (data.nombre.length < 2 || data.nombre.length > 100) errors.nombre = 'Escribe un nombre válido.';
    if (!/^\+?[\d ()-]{7,30}$/.test(data.telefono) || data.telefono.replace(/\D/g, '').length < 7) errors.telefono = 'Escribe un número de WhatsApp válido.';
    if (data.negocio.length < 2 || data.negocio.length > 120) errors.negocio = 'Cuéntanos el nombre o tipo de negocio.';
    if (!data.servicio) errors.servicio = 'Selecciona una solución.';
    if (data.objetivo.length < 12 || data.objetivo.length > 800) errors.objetivo = 'Describe brevemente qué necesitas resolver.';
    return errors;
  };
  const whatsappUrl = data => {
    const message = [
      'Hola Konfío Zinc, quiero solicitar un diagnóstico.',
      'Nombre: ' + data.nombre,
      'Negocio: ' + data.negocio,
      'WhatsApp: ' + data.telefono,
      'Servicio: ' + data.servicio,
      'Objetivo: ' + data.objetivo
    ].join('\n');
    const url = new URL('https://wa.me/573206411340');
    url.searchParams.set('text', message);
    return url.href;
  };
  fields.forEach(id => $('#' + id)?.addEventListener('input', () => setError(id)));
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    fallback.hidden = true;
    fallback.removeAttribute('href');
    status.textContent = '';
    delete status.dataset.kind;
    fields.forEach(id => setError(id));
    const data = values();
    const errors = validate(data);
    if ($('#website')?.value) return;
    /* KZ-SEC-002: cooldown del navegador (proporcional). El honeypot, la
       validación y las reglas de Firestore son las barreras reales; esto solo
       frena reenvíos en ráfaga desde el mismo equipo. */
    const COOLDOWN_MS = 60 * 1000;
    try {
      const last = Number(localStorage.getItem('kz_lead_last') || 0);
      if (Date.now() - last < COOLDOWN_MS) {
        status.textContent = 'Acabamos de recibir tu solicitud. Espera un momento antes de enviar otra.';
        status.dataset.kind = 'error';
        return;
      }
    } catch { /* sin almacenamiento: se permite */ }
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([id, message]) => setError(id, message));
      status.textContent = 'Revisa los campos indicados.';
      status.dataset.kind = 'error';
      $('#' + Object.keys(errors)[0])?.focus();
      return;
    }
    const button = $('.lead-form__submit', form);
    button.disabled = true;
    button.textContent = 'Enviando de forma segura…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const fieldsDoc = {
        nombre: { stringValue: data.nombre },
        telefono: { stringValue: data.telefono },
        servicio: { stringValue: data.servicio },
        mensaje: { stringValue: 'Negocio: ' + data.negocio + '. Objetivo: ' + data.objetivo },
        origen: { stringValue: 'premium' },
        estado: { stringValue: 'NUEVO' },
        createdAt: { timestampValue: new Date().toISOString() }
      };
      const response = await fetch(LEADS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ fields: fieldsDoc }),
        signal: controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.name) throw new Error('not-confirmed');
      status.textContent = 'Solicitud recibida. Te contactaremos por WhatsApp en horario hábil.';
      status.dataset.kind = 'success';
      try { localStorage.setItem('kz_lead_last', String(Date.now())); } catch { /* sin almacenamiento */ }
      form.reset();
    } catch {
      fallback.href = whatsappUrl(data);
      fallback.hidden = false;
      status.textContent = 'No pudimos registrar tu solicitud en este momento. Tus datos no se dan por recibidos; puedes continuar por WhatsApp.';
      status.dataset.kind = 'error';
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
      button.innerHTML = 'Preparar diagnóstico <span aria-hidden="true">↗</span>';
    }
  });
  $('#year').textContent = String(new Date().getFullYear());
})();
