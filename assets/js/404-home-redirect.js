/* Recuperación para enlaces compartidos que terminan en el 404 de GitHub Pages.
   No cambia rutas válidas: este archivo solo se carga desde 404.html. */
(function () {
  var ruta = window.location.pathname;
  if (ruta === "/card/index.html") return;
  if (ruta === "/card" || ruta.indexOf("/card/") === 0) {
    window.location.replace("/card/index.html");
  }
})();
