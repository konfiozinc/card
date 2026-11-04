/* ═══════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/kz-pila-servicios.js
   MISIÓN KZ-WEB-RESCATE-001-D · efecto de tarjetas apiladas

   QUÉ HACE
   Las siete tarjetas están fijas con CSS (position: sticky). Al bajar,
   la siguiente se monta encima de la anterior. Este archivo añade el
   toque de profundidad: la tarjeta que queda debajo se reduce y se
   oscurece poco a poco, y la que entra llega limpia.

   SIN JAVASCRIPT: las tarjetas se siguen apilando con CSS y son
   perfectamente legibles; solo falta el escalado. Nada se oculta.

   POR QUÉ SE MIDE CON offsetTop/offsetHeight
   getBoundingClientRect incluye el propio transform: usarlo aquí haría
   que el escalado se realimentara y la tarjeta temblara. offsetTop y
   offsetHeight son medidas de maquetación y no cambian con el
   transform, así que el cálculo es estable.

   ACCESIBILIDAD: con «reducir movimiento» activado no se anima nada.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var raiz = document.querySelector("[data-kz-pila]");
  if (!raiz) return;

  var tarjetas = Array.prototype.slice.call(raiz.querySelectorAll(".kz-serv__panel"));
  if (tarjetas.length < 2) return;

  var ESCALA_MIN = 0.94; // reducción máxima de la tarjeta que queda debajo
  var SUBIDA_MAX = 10;   // píxeles que sube al reducirse
  var VELO_MAX = 0.22;   // opacidad máxima del oscurecido

  var reducido = window.matchMedia("(prefers-reduced-motion: reduce)");
  var pendiente = false;
  var lineaFija = 76;
  var alto = [];
  var tope = [];

  function limitar(n, a, b) {
    return n < a ? a : n > b ? b : n;
  }

  /* Posición del borde superior de un elemento en el documento,
     ignorando transformaciones. */
  function topeEnDocumento(el) {
    var y = 0;
    var nodo = el;
    while (nodo) {
      y += nodo.offsetTop || 0;
      nodo = nodo.offsetParent;
    }
    return y;
  }

  function medir() {
    lineaFija = parseFloat(getComputedStyle(tarjetas[0]).top) || 76;
    for (var i = 0; i < tarjetas.length; i++) {
      alto[i] = tarjetas[i].offsetHeight;
      tope[i] = topeEnDocumento(tarjetas[i]);
    }
    pintar();
  }

  function pintar() {
    pendiente = false;

    if (reducido.matches) {
      for (var k = 0; k < tarjetas.length; k++) {
        tarjetas[k].style.setProperty("--kz-pila-escala", "1");
        tarjetas[k].style.setProperty("--kz-pila-y", "0");
        tarjetas[k].style.setProperty("--kz-pila-oscurecer", "0");
      }
      return;
    }

    var y = window.pageYOffset || document.documentElement.scrollTop || 0;

    for (var i = 0; i < tarjetas.length; i++) {
      var t = tarjetas[i];
      var progreso = 0;

      if (i + 1 < tarjetas.length && alto[i] > 0) {
        // Borde inferior de esta tarjeta cuando ya está fijada.
        var fondoFijado = lineaFija + alto[i];
        // Borde superior de la siguiente, tal como se ve ahora.
        var arribaSiguiente = tope[i + 1] - y;
        progreso = limitar((fondoFijado - arribaSiguiente) / alto[i], 0, 1);
      }

      var escala = 1 - (1 - ESCALA_MIN) * progreso;
      t.style.setProperty("--kz-pila-escala", escala.toFixed(4));
      t.style.setProperty("--kz-pila-y", (SUBIDA_MAX * progreso).toFixed(2));
      t.style.setProperty("--kz-pila-oscurecer", (VELO_MAX * progreso).toFixed(4));
    }
  }

  function alDesplazar() {
    if (pendiente) return;
    pendiente = true;
    window.requestAnimationFrame(pintar);
  }

  function alRedimensionar() {
    window.requestAnimationFrame(medir);
  }

  window.addEventListener("scroll", alDesplazar, { passive: true });
  window.addEventListener("resize", alRedimensionar);
  window.addEventListener("orientationchange", alRedimensionar);
  window.addEventListener("load", alRedimensionar);
  if (reducido.addEventListener) reducido.addEventListener("change", alDesplazar);

  medir();
})();
