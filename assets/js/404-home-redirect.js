/* Rescate del enlace oficial de KONFÍO ZINC si GitHub Pages sirve el 404 de la carpeta. */
(function () {
  var ruta = window.location.pathname;
  if (ruta === "/card" || ruta === "/card/") {
    window.location.replace("/card/index.html" + window.location.search + window.location.hash);
  }
})();
