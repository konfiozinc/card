/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/kz-carrusel.js
   KZ-WEB-003 · Carrusel de proyectos accesible.

   QUÉ APORTA
     · Flechas anterior/siguiente siempre visibles, con estado deshabilitado.
     · Teclado: ← → Inicio Fin cuando la pista tiene el foco.
     · Swipe: lo resuelve el navegador con scroll-snap; aquí solo se lee.
     · Contador «n de total» y puntos que se pueden pulsar.
     · aria-live para anunciar el cambio sin robar el foco.
     · Sin movimiento automático: no hay nada que pausar.

   No usa temporizadores ni animación propia, así que no compite con
   prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var raiz = document.querySelector('[data-carrusel]');
  if (!raiz) return;

  var pista = raiz.querySelector('[data-pista]');
  var slides = pista ? Array.prototype.slice.call(pista.children) : [];
  if (!pista || slides.length === 0) return;

  var btnPrev = raiz.querySelector('[data-prev]');
  var btnNext = raiz.querySelector('[data-next]');
  var elActual = raiz.querySelector('[data-actual]');
  var elTotal = raiz.querySelector('[data-total]');
  var contenedorPuntos = raiz.querySelector('[data-puntos]');
  var anuncio = raiz.querySelector('[data-anuncio]');

  if (elTotal) elTotal.textContent = String(slides.length);

  /* ── Puntos ─────────────────────────────────────────────────────── */
  var puntos = [];
  if (contenedorPuntos) {
    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'kz-carrusel__punto';
      b.setAttribute('aria-label', 'Ir al proyecto ' + (i + 1) + ' de ' + slides.length);
      b.addEventListener('click', function () { irA(i); });
      contenedorPuntos.appendChild(b);
      puntos.push(b);
    });
  }

  /* ── Posición actual ────────────────────────────────────────────────
     Se calcula por scrollLeft, que es lo que cambia tanto al pulsar una
     flecha como al deslizar con el dedo. Así el contador nunca miente,
     venga el movimiento del teclado, del ratón o del swipe. */
  function indiceActual() {
    var izq = pista.scrollLeft;
    var mejor = 0;
    var menor = Infinity;
    slides.forEach(function (s, i) {
      var d = Math.abs(s.offsetLeft - pista.offsetLeft - izq);
      if (d < menor) { menor = d; mejor = i; }
    });
    return mejor;
  }

  function puedeAvanzar() {
    return pista.scrollLeft + pista.clientWidth < pista.scrollWidth - 2;
  }

  function pintarEstado() {
    var i = indiceActual();
    if (elActual) elActual.textContent = String(i + 1);
    puntos.forEach(function (p, k) {
      if (k === i) p.setAttribute('aria-current', 'true');
      else p.removeAttribute('aria-current');
    });
    if (btnPrev) btnPrev.disabled = pista.scrollLeft <= 2;
    if (btnNext) btnNext.disabled = !puedeAvanzar();
    if (anuncio) anuncio.textContent = 'Proyecto ' + (i + 1) + ' de ' + slides.length;
  }

  function irA(i) {
    var destino = slides[Math.max(0, Math.min(slides.length - 1, i))];
    if (!destino) return;
    pista.scrollTo({ left: destino.offsetLeft - pista.offsetLeft, behavior: 'smooth' });
  }

  /* ── Controles ──────────────────────────────────────────────────── */
  if (btnPrev) btnPrev.addEventListener('click', function () { irA(indiceActual() - 1); });
  if (btnNext) btnNext.addEventListener('click', function () { irA(indiceActual() + 1); });

  pista.setAttribute('tabindex', '0');

  pista.addEventListener('keydown', function (e) {
    var i = indiceActual();
    /* Los límites son los mismos que los de los botones: con tres tarjetas
       visibles no queda recorrido después de la primera, y pulsar → no debe
       fingir que avanza. */
    if (e.key === 'ArrowRight') { e.preventDefault(); if (puedeAvanzar()) irA(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (pista.scrollLeft > 2) irA(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); irA(0); }
    else if (e.key === 'End') { e.preventDefault(); irA(slides.length - 1); }
  });

  /* El swipe y el teclado no pasan por los botones: se escucha el scroll. */
  var pendiente = null;
  pista.addEventListener('scroll', function () {
    if (pendiente) cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(pintarEstado);
  }, { passive: true });

  window.addEventListener('resize', pintarEstado);

  pintarEstado();
})();
