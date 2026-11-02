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
/* Sólo los botones que abren un área. El botón «Más» también es `.nav__btn`
   pero NO lleva `data-seccion`: si entrara aquí, pulsarlo cambiaría de área y
   cerraría su propio menú. */
const botonesNav = () => [...document.querySelectorAll("#nav-secciones .nav__btn[data-seccion]")];

let seccionActiva = "cartera";

/* ── Áreas ──────────────────────────────────────────────────────────────── */
const VALIDAS = ["resumen", "cartera", "cotizaciones", "ventas", "equipo", "auditoria"];

function mostrarSeccion(nombre) {
  if (!VALIDAS.includes(nombre)) nombre = "cartera";

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
  /* En celular, Equipo y Auditoría viven dentro del menú «Más»: si el área
     elegida está ahí, el botón que debe verse marcado es «Más». */
  const mas = $("#nav-mas");
  const activo = botonesNav().find((b) => b.dataset.seccion === nombre);
  if (mas) {
    if (activo && activo.closest("#nav-mas-menu")) mas.setAttribute("aria-current", "page");
    else mas.removeAttribute("aria-current");
  }
  cerrarMenuMas();
  seccionActiva = nombre;
  if (nombre === "resumen") pintarEmbudo();
  if (nombre === "cartera") {
    /* Al volver a la cartera, el foco regresa al listado: en móvil evita que el
       teclado quede al final del documento. */
    const destino = $("#t-cartera");
    if (destino) { destino.setAttribute("tabindex", "-1"); destino.focus({ preventScroll: true }); }
  }
  /* Cotizaciones, Ventas y Auditoría los pinta su propio módulo: aquí sólo se
     le avisa de qué área acaba de abrirse (y él decide qué consultar). */
  const M = window.KZ_MODULOS;
  if (M && typeof M.alEntrar === "function") {
    try { M.alEntrar(nombre); } catch (e) { console.warn("ui:", e.message); }
  }
}

/* ── Menú «Más» de la navegación (celular) ─────────────────────────────── */
const menuMas = $("#nav-mas-menu");
const btnMas = $("#nav-mas");

function cerrarMenuMas() {
  if (menuMas) menuMas.dataset.abierto = "false";
  if (btnMas) btnMas.setAttribute("aria-expanded", "false");
}

btnMas?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!menuMas) return;
  const abrir = menuMas.dataset.abierto !== "true";
  menuMas.dataset.abierto = abrir ? "true" : "false";
  btnMas.setAttribute("aria-expanded", abrir ? "true" : "false");
});

document.addEventListener("click", (e) => {
  if (!menuMas || menuMas.dataset.abierto !== "true") return;
  if (e.target.closest("#nav-mas") || e.target.closest("#nav-mas-menu")) return;
  cerrarMenuMas();
});

/* El nav sólo aparece con sesión: así la pantalla de acceso queda limpia. */
function sincronizarNavegacion() {
  const vista = $("#vista");
  const nav = $("#nav-secciones");
  if (!vista || !nav) return;

  const conSesion = vista.hidden === false;
  nav.hidden = !conSesion;
  if (!conSesion) {
    const chip = $("#cuenta-chip");
    if (chip) chip.hidden = true;
    mostrarSeccion("cartera");
    return;
  }

  const rol = window.CRM && window.CRM.sesion ? window.CRM.sesion.rol : null;
  const esAdmin = rol === "admin";
  const bEquipo = $("#nav-equipo");
  const bAuditoria = $("#nav-auditoria");
  if (bEquipo) bEquipo.hidden = !esAdmin;
  if (bAuditoria) bAuditoria.hidden = !esAdmin;

  /* KZ-CRM-020 · qué áreas tiene cada rol, según lo que las reglas le dejan
     consultar de verdad (medido en crm-dev/sondear-permisos-020.cjs):
       · cotizaciones: admin, comercial y ventas (cada uno con su alcance);
       · ventas:       admin y rol ventas (comercial no puede leer ventas);
       · equipo y auditoría: sólo admin. */
  const puedeCotizar = ["admin", "comercial", "ventas"].includes(rol);
  const puedeVender = ["admin", "ventas"].includes(rol);
  const bCot = $("#nav-cotizaciones");
  const bVen = $("#nav-ventas");
  if (bCot) bCot.hidden = !puedeCotizar;
  if (bVen) bVen.hidden = !puedeVender;
  /* El menú «Más» sólo tiene sentido si Equipo o Auditoría existen para el rol. */
  const bMas = $("#nav-mas");
  if (bMas) bMas.hidden = !esAdmin;

  /* Un rol que pierde un área no debe quedarse «atrapado» en un área que ya no
     tiene botón. */
  const permitidas = { resumen: true, cartera: true, equipo: esAdmin, auditoria: esAdmin, cotizaciones: puedeCotizar, ventas: puedeVender };
  if (!permitidas[seccionActiva]) mostrarSeccion("cartera");

  if (seccionActiva === "cartera") pintarEmbudo();
  sincronizarCuenta();
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
  /* La misma marca en la vista de tarjetas (celular). */
  for (const t of document.querySelectorAll("#lista-tarjetas .tarjeta-prospecto")) {
    t.classList.toggle("tarjeta-prospecto--activa", !!id && t.dataset.id === id);
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

/* ── Cartera en tarjetas (celular) ─────────────────────────────────────────
   Las tarjetas se construyen LEYENDO la tabla que ya pintó crm.js: no se
   duplican datos ni se hace ninguna consulta nueva. Así, cuando el panel
   repinta la cartera (alta, cambio de estado, asignación, recarga), las
   tarjetas se rehacen solas y nunca muestran información vieja.

   Qué columnas salen de la tabla se decide por el ENCABEZADO, no por
   posición fija: el panel muestra «Asignado a» sólo a administración, y esta
   vista se adapta a ello. */
function pintarTarjetas() {
  const caja = $("#lista-tarjetas");
  const tabla = $("#tabla-leads");
  const cab = $("#tabla-cabecera");
  if (!caja || !tabla) return;

  const filas = [...tabla.querySelectorAll("tr[data-id]")];
  if (!filas.length) { caja.innerHTML = ""; return; }

  const etiquetas = cab ? [...cab.querySelectorAll("th")].map((th) => th.textContent.trim()) : [];
  const col = (nombre) => etiquetas.findIndex((t) => t.toLowerCase().includes(nombre));
  const escu = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  caja.innerHTML = filas.map((tr) => {
    const celdas = [...tr.children];
    const leer = (nombre, respaldo) => {
      const i = col(nombre);
      const celda = i >= 0 ? celdas[i] : celdas[respaldo];
      return celda ? celda.textContent.trim() : "";
    };
    const id = tr.dataset.id;
    const nombre = leer("nombre", 0);
    const telefono = leer("tel", 1);
    const industria = leer("industria", 2);
    const asesor = leer("asignado", -1);
    const consent = leer("consent", -1);

    /* La etiqueta de estado se copia con la clase que le puso crm.js, para que
       los colores de «ganado» y «perdido» se mantengan. */
    const iEstado = col("estado");
    const celdaEstado = iEstado >= 0 ? celdas[iEstado] : celdas[3];
    const pill = celdaEstado ? celdaEstado.querySelector(".pill") : null;
    const estadoHtml = pill
      ? `<span class="${escu(pill.className)}">${escu(pill.textContent.trim())}</span>`
      : `<span class="pill">${escu(celdaEstado ? celdaEstado.textContent.trim() : "")}</span>`;

    return `<article class="tarjeta-prospecto" data-id="${escu(id)}">
      <div class="tp__cab">
        <h3 class="tp__nombre">${escu(nombre)}</h3>
        ${estadoHtml}
      </div>
      <dl class="tp__datos">
        <div class="tp__dato"><dt>WhatsApp</dt><dd>${escu(telefono)}</dd></div>
        <div class="tp__dato"><dt>Industria</dt><dd>${escu(industria)}</dd></div>
        ${asesor ? `<div class="tp__dato"><dt>Asesor</dt><dd>${escu(asesor)}</dd></div>` : ""}
        ${consent ? `<div class="tp__dato"><dt>Consent.</dt><dd>${escu(consent)}</dd></div>` : ""}
      </dl>
      <button type="button" class="tp__abrir" data-abrir-ficha="${escu(id)}">Abrir ficha</button>
    </article>`;
  }).join("");
}

/* Abrir la ficha desde una tarjeta: se pulsa la fila equivalente de la tabla,
   de modo que el recorrido es EXACTAMENTE el mismo que en escritorio (mismo
   manejador de crm.js, mismos permisos, misma auditoría). */
$("#lista-tarjetas")?.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-abrir-ficha]");
  const tarjeta = e.target.closest(".tarjeta-prospecto");
  const id = (boton && boton.dataset.abrirFicha) || (tarjeta && tarjeta.dataset.id);
  if (!id) return;
  const selector = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
  const fila = document.querySelector(`#tabla-leads tr[data-id="${selector}"]`);
  if (fila) fila.click();
});

/* ── Indicador compacto de cuenta ──────────────────────────────────────────
   El correo del administrador no cabe en la barra del celular y cortarlo con
   puntos suspensivos quedaba mal. El chip muestra las iniciales y el rol; el
   correo completo se consulta al pulsarlo. La sesión NO cambia: esto sólo
   reformatea el texto que ya escribió crm.js en #quien. */
function sincronizarCuenta() {
  const chip = $("#cuenta-chip");
  const quien = $("#quien");
  const datos = $("#cuenta-datos");
  if (!chip || !quien) return;

  if (datos) datos.hidden = true;
  chip.setAttribute("aria-expanded", "false");

  const texto = (quien.textContent || "").trim();
  if (!texto) { chip.hidden = true; return; }

  const [correoCrudo, rolCrudo] = texto.split("·").map((x) => x.trim());
  const correo = correoCrudo || texto;
  const rol = rolCrudo || ((window.CRM && window.CRM.sesion && window.CRM.sesion.rol) || "");
  const sigla = (correo.split("@")[0] || "?").slice(0, 2).toUpperCase();

  const s = $("#cuenta-sigla"); if (s) s.textContent = sigla;
  const r = $("#cuenta-rol"); if (r) r.textContent = rol;
  const c = $("#cuenta-correo"); if (c) c.textContent = correo;
  const rd = $("#cuenta-rol-detalle"); if (rd) rd.textContent = rol ? "Rol: " + rol : "";
  chip.title = correo + (rol ? " · " + rol : "");
  chip.setAttribute("aria-label", "Cuenta: " + correo + (rol ? " · " + rol : ""));
  chip.hidden = false;
}

$("#cuenta-chip")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const chip = $("#cuenta-chip");
  const datos = $("#cuenta-datos");
  if (!chip || !datos) return;
  const abrir = datos.hidden;
  datos.hidden = !abrir;
  chip.setAttribute("aria-expanded", abrir ? "true" : "false");
});

/* Cerrar al tocar fuera o con Escape. */
document.addEventListener("click", (e) => {
  const datos = $("#cuenta-datos");
  const chip = $("#cuenta-chip");
  if (!datos || !chip || datos.hidden) return;
  if (e.target.closest("#cuenta-chip") || e.target.closest("#cuenta-datos")) return;
  datos.hidden = true;
  chip.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const datos = $("#cuenta-datos");
  const chip = $("#cuenta-chip");
  if (!datos || !chip || datos.hidden) return;
  datos.hidden = true;
  chip.setAttribute("aria-expanded", "false");
  chip.focus();
});

/* Lleva un bloque justo debajo de la barra fija.
   `scrollIntoView` se quedaba corto (medido: la ficha aterrizaba 125 px por
   debajo de la barra) porque crm.js seguía pintando notas y cotizaciones
   después de abrirse. Aquí el destino se calcula con la altura REAL de la
   barra y se reajusta una vez que el panel ha terminado de crecer. */
function llevarBajoLaBarra(el, intentos) {
  if (!el) return;
  const barra = document.querySelector(".barra");
  const aire = (barra ? barra.getBoundingClientRect().height : 0) + 10;
  const destino = Math.max(0, el.getBoundingClientRect().top + window.scrollY - aire);
  const comportamiento = (intentos && intentos > 1) ? "auto" : "smooth";
  window.scrollTo({ top: destino, behavior: comportamiento });
}

/* Delegación en captura: crm.js escucha el mismo click y abre la ficha. */
$("#tabla-leads")?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  marcarFilaActiva(tr.dataset.id);
  const movil = window.matchMedia("(max-width: 1100px)").matches;
  if (movil) {
    /* Se lleva la vista a la ficha una vez que crm.js la ha mostrado, y se
       reajusta cuando terminan de pintarse notas y cotizaciones. */
    setTimeout(() => {
      const detalle = $("#detalle");
      if (detalle && detalle.hidden === false) {
        llevarBajoLaBarra(detalle, 1);
        setTimeout(() => {
          const d = $("#detalle");
          if (d && d.hidden === false) llevarBajoLaBarra(d, 2);
        }, 520);
      }
    }, 200);
  }
});

$("#btn-volver-lista")?.addEventListener("click", () => {
  const destino = $("#t-cartera") || $("#tabla-leads");
  if (!destino) return;
  destino.setAttribute("tabindex", "-1");
  llevarBajoLaBarra(destino, 2);
  destino.focus({ preventScroll: true });
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
if (tabla) observar(tabla, { childList: true }, () => { pintarTarjetas(); pintarEmbudo(); restaurarFilaActiva(); });

/* El correo de la sesión lo escribe crm.js en #quien: al cambiar, se rehace el chip. */
const quien = $("#quien");
if (quien) observar(quien, { childList: true, characterData: true, subtree: true }, sincronizarCuenta);

const stats = $("#stats");
if (stats) observar(stats, { childList: true }, pintarEmbudo);

$("#btn-salir")?.addEventListener("click", () => {
  marcarFilaActiva(null);
  /* Al cerrar sesión no deben quedar cotizaciones, ventas ni auditoría en
     memoria ni en pantalla (KZ-CRM-020). */
  if (window.KZ_MODULOS && typeof window.KZ_MODULOS.limpiar === "function") {
    try { window.KZ_MODULOS.limpiar(); } catch (e) { console.warn("ui:", e.message); }
  }
  mostrarSeccion("cartera");
});

/* ── Aviso de bienvenida ───────────────────────────────────────────────────
   «Sesión iniciada como …» es útil una vez, no toda la jornada: en el celular
   ocupaba una franja entera encima de la cartera. Se oculta SÓLO ese aviso a
   los pocos segundos; las confirmaciones y los errores se quedan hasta que
   crm.js los reemplace. El texto y las clases siguen siendo de crm.js. */
const avisoPanel = $("#estado-panel");
if (avisoPanel) {
  let temporizadorAviso = null;
  observar(avisoPanel, { childList: true, characterData: true, subtree: true }, () => {
    if (temporizadorAviso) { clearTimeout(temporizadorAviso); temporizadorAviso = null; }
    avisoPanel.hidden = false;
    const texto = (avisoPanel.textContent || "").trim();
    if (avisoPanel.classList.contains("ok") && /^Sesión iniciada/i.test(texto)) {
      temporizadorAviso = setTimeout(() => { avisoPanel.hidden = true; }, 2500);
    }
  });
}

/* Estado inicial coherente también sin sesión (login limpio). */
sincronizarNavegacion();
sincronizarFicha();
pintarTarjetas();
pintarEmbudo();

/* API mínima para que el módulo de Cotizaciones/Ventas pueda cambiar de área
   (por ejemplo, al pulsar «Abrir prospecto»). */
window.KZ_UI = { mostrarSeccion };
