'use strict';
(() => {
  const button = document.getElementById('activar');
  const slot = document.getElementById('laboratorio');
  const status = document.getElementById('estado');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = null;
  function close() {
    if (frame) frame.remove();
    frame = null;
    button.textContent = 'Abrir laboratorio de scroll';
    button.setAttribute('aria-expanded', 'false');
  }
  function preference() {
    if (reduced.matches) close();
    button.hidden = reduced.matches;
    status.textContent = reduced.matches
      ? 'Movimiento reducido: se conserva la lista estática de los seis servicios.'
      : 'Abre el laboratorio y desplázate dentro del marco. Puedes cerrarlo con el mismo botón.';
  }
  button.setAttribute('aria-controls', 'laboratorio');
  button.addEventListener('click', () => {
    if (frame) { close(); return; }
    if (reduced.matches) return;
    frame = document.createElement('iframe');
    frame.title = 'Laboratorio scroll-world: tres diagramas locales con navegación por escenas';
    frame.src = 'recorrido.html';
    frame.setAttribute('sandbox', 'allow-scripts');
    slot.append(frame);
    button.textContent = 'Cerrar laboratorio';
    button.setAttribute('aria-expanded', 'true');
  });
  reduced.addEventListener('change', preference);
  preference();
})();
