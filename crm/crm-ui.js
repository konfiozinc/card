/* ── KZ-CRM-019 · capa de presentación del panel ──────────────────────────────
   Este archivo NO toca datos, sesión, permisos ni validaciones: eso sigue en
   crm.js exactamente igual. Aquí sólo se resuelve cómo se RECORRE lo que ya
   existe:

     · áreas del panel (Resumen · Prospectos · Equipo · Auditoría) con aria-current;
     · fila activa de la cartera (la que está abierta en la ficha);
     · estado vacío de la ficha mientras no hay prospecto abierto;
     · embudo del resumen, calculado con los MISMOS prospectos que ya cargó crm.js;
     · en móvil, llevar a la ficha al abrir un prospecto y volver a la cartera.

   Ninguna función de aquí escribe en Firestore ni decide permisos. Si este
   archivo no cargara, el panel se comporta como antes: una sola columna con
   todas las tarjetas apiladas, y todas las operaciones siguen disponibles.
   ────────────────────────────────────────────────────────────────────────── */

/* Alias local del módulo: crm.js define el suyo y no se comparte entre módulos. */
const $ = (sel) => document.querySelector(sel);

/* Áreas de contenido. Ojo: los botones de la navegación llevan `data-seccion`
   para saber a qué área apuntan, pero NO son áreas: si se colaran aquí, la
   propia navegación se ocultaría a sí misma al cambiar de sección. */
const secciones = () => [...document.querySelectorAll("[data-seccion]")]
  .filter((el) => !el.classList.contains("nav__btn"));
const botonesNav = () => [...document.querySelectorAll("#nav-secciones .nav__btn")];

let seccionActiva = "cartera";

/* ── Áreas ──────────────────────────────────────────────────────────────── */
function mostrarSeccion(nombre) {
  const validas = ["resumen", "cartera", "equipo", "auditoria"];
  if (!validas.includes(nombre)) nombre = "cartera";

  /* Doble candado: la navegación oculta con clase, el rol oculta con [hidden].
     Nunca se escribe el atributo `hidden` de un bloque porque es del panel
     (crm.js decide ahí qué ve cada rol). */
  for (const el of secciones()) {
    const suya = el.dataset.seccion === nombre;
    /* El resumen no tiene rol asociado: su visibilidad es puramente de
       presentación, así que aquí sí se usa `hidden` (evita el parpadeo inicial
       y no pisa ninguna decisión de permisos). Los demás bloques usan la clase
       para no tocar el `hidden` que escribe crm.js según el rol. */
    if (el.dataset.seccion === "resumen") el.hidden = !suya;
    else el.classList.toggle("seccion-oculta", !suya);
  }
  for (const b of botonesNav()) {
    if (b.dataset.seccion === nombre) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  seccionActiva = nombre;
  if (nombre === "resumen") pintarEmbudo();
  if (nombre === "cartera") {
    /* Al volver a la cartera, el foco regresa al listado: en móvil evita que el
       teclado quede al final del documento. */
    const destino = $("#t-cartera");
    if (destino) { destino.setAttribute("tabindex", "-1"); destino.focus({ preventScroll: true }); }
  }
}

/* El nav sólo aparece con sesión: así la pantalla de acceso queda limpia. */
function sincronizarNavegacion() {
  const vista = $("#vista");
  const nav = $("#nav-secciones");
  if (!vista || !nav) return;

  const conSesion = vista.hidden === false;
  nav.hidden = !conSesion;
  if (!conSesion) { mostrarSeccion("cartera"); return; }

  const rol = window.CRM && window.CRM.sesion ? window.CRM.sesion.rol : null;
  const esAdmin = rol === "admin";
  const bEquipo = $("#nav-equipo");
  const bAuditoria = $("#nav-auditoria");
  if (bEquipo) bEquipo.hidden = !esAdmin;
  if (bAuditoria) bAuditoria.hidden = !esAdmin;
  /* Un rol que no puede ver Equipo/Auditoría no debe quedarse «atrapado» en un
     área que ya no tiene botón. */
  if (!esAdmin && (seccionActiva === "equipo" || seccionActiva === "auditoria")) {
    mostrarSeccion("cartera");
  }
  if (seccionActiva === "cartera") pintarEmbudo();
}

botonesNav().forEach((b) => {
  b.addEventListener("click", () => mostrarSeccion(b.dataset.seccion));
});

/* ── Ficha: estado vacío y fila activa ──────────────────────────────────── */
function sincronizarFicha() {
  const detalle = $("#detalle");
  const vacia = $("#ficha-vacia");
  if (!detalle || !vacia) return;
  const abierta = detalle.hidden === false;
  vacia.hidden = abierta;
  if (!abierta) marcarFilaActiva(null);
}

function marcarFilaActiva(id) {
  for (const tr of document.querySelectorAll("#tabla-leads tr[data-id]")) {
    tr.classList.toggle("fila--activa", !!id && tr.dataset.id === id);
    if (id && tr.dataset.id === id) tr.setAttribute("aria-current", "true");
    else tr.removeAttribute("aria-current");
  }
}

/* La cartera la repinta crm.js; aquí sólo se recupera la fila que sigue abierta. */
function restaurarFilaActiva() {
  const detalle = $("#detalle");
  const nombre = $("#d-nombre");
  if (!detalle || detalle.hidden !== false || !nombre || !nombre.textContent) return;
  const candidato = [...document.querySelectorAll("#tabla-leads tr[data-id]")]
    .find((tr) => tr.children[0] && tr.children[0].textContent === nombre.textContent);
  if (candidato) marcarFilaActiva(candidato.dataset.id);
}

/* Delegación en captura: crm.js escucha el mismo click y abre la ficha. */
$("#tabla-leads")?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  marcarFilaActiva(tr.dataset.id);
  const movil = window.matchMedia("(max-width: 1100px)").matches;
  if (movil) {
    /* Se lleva la vista a la ficha una vez que crm.js la ha mostrado. */
    setTimeout(() => {
      const detalle = $("#detalle");
      if (detalle && detalle.hidden === false) {
        detalle.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 160);
  }
});

$("#btn-volver-lista")?.addEventListener("click", () => {
  const destino = $("#t-cartera") || $("#tabla-leads");
  if (destino) {
    destino.setAttribute("tabindex", "-1");
    destino.scrollIntoView({ behavior: "smooth", block: "start" });
    destino.focus({ preventScroll: true });
  }
});

/* ── Embudo del resumen ─────────────────────────────────────────────────── */
const ORDEN_ESTADOS = ["nuevo", "contactado", "cotizado", "ganado", "perdido"];

function pintarEmbudo() {
  const caja = $("#embudo");
  if (!caja) return;
  const leads = (window.CRM && window.CRM.leads) || [];
  if (!leads.length) { caja.innerHTML = ""; return; }

  const cuenta = ORDEN_ESTADOS.map((e) => ({
    estado: e,
    total: leads.filter((l) => l.estado === e).length,
  }));
  const sinAsignar = leads.filter((l) => !l.asignado_a).length;
  /* El máximo incluye «sin asignar»: si se dejara fuera, una cartera de 6
     prospectos sin asignar y 2 contactados dibujaría las dos barras llenas (la
     de sin asignar al 300 %, recortada) y el gráfico mentiría. */
  const maximo = Math.max(1, ...cuenta.map((c) => c.total), sinAsignar);

  /* Las etiquetas se escapan igual que en el panel: nunca se inyecta texto
     crudo en el DOM, ni siquiera el que sale de un select. */
  const escu = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  caja.innerHTML = cuenta.map((c) => `
    <div class="embudo__fila embudo__fila--${escu(c.estado)}">
      <span class="embudo__nombre">${escu(c.estado)}</span>
      <span class="embudo__carril"><span class="embudo__barra" style="width:${
        (c.total / maximo * 100).toFixed(2)}%"></span></span>
      <span class="embudo__valor">${c.total}</span>
    </div>`).join("") + (sinAsignar
    ? `<div class="embudo__fila embudo__fila--perdido">
         <span class="embudo__nombre">sin asignar</span>
         <span class="embudo__carril"><span class="embudo__barra" style="width:${
           (sinAsignar / maximo * 100).toFixed(2)}%; opacity:.55"></span></span>
         <span class="embudo__valor">${sinAsignar}</span>
       </div>` : "");
}

/* ── Observadores: seguir los repintados de crm.js sin tocar su código ───── */
function observar(nodo, opciones, alCambiar) {
  if (!nodo || typeof MutationObserver === "undefined") return;
  new MutationObserver(() => { try { alCambiar(); } catch (e) { console.warn("ui:", e.message); } })
    .observe(nodo, opciones);
}

const vista = $("#vista");
if (vista) observar(vista, { attributes: true, attributeFilter: ["hidden"] }, sincronizarNavegacion);

const detalle = $("#detalle");
if (detalle) observar(detalle, { attributes: true, attributeFilter: ["hidden"] }, sincronizarFicha);

const tabla = $("#tabla-leads");
if (tabla) observar(tabla, { childList: true }, () => { pintarEmbudo(); restaurarFilaActiva(); });

const stats = $("#stats");
if (stats) observar(stats, { childList: true }, pintarEmbudo);

$("#btn-salir")?.addEventListener("click", () => {
  marcarFilaActiva(null);
  mostrarSeccion("cartera");
});

/* Estado inicial coherente también sin sesión (login limpio). */
sincronizarNavegacion();
sincronizarFicha();
pintarEmbudo();
