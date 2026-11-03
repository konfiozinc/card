/**
 * KZ-MINI-001 · Demostrador de Mini Webs · motor.
 *
 * Estado en memoria (sin almacenamiento, sin red, sin servidores):
 *   { paso, plantilla, nombre, descripcion, servicios, primario, secundario,
 *     logo, fotos, coloresPropios }
 *
 * Reglas de seguridad:
 *   · Todo texto del visitante se pinta con `textContent` o `esc()`.
 *   · Las imágenes son data: URI locales (FileReader + canvas), nunca URLs.
 *   · No hay fetch, ni Firebase, ni CMS: nada sale del navegador salvo el
 *     enlace de WhatsApp que el visitante pulsa a mano.
 */
import { PLANTILLAS, PALETAS, imagenDeMuestra } from "./plantillas.js";

const WHATSAPP = "573206411340";

const estado = {
  paso: "bienvenida",
  plantilla: null,
  nombre: "",
  descripcion: "",
  servicios: [{ nombre: "", precio: "" }, { nombre: "", precio: "" }, { nombre: "", precio: "" }],
  primario: "",
  secundario: "",
  logo: null,
  fotos: [null, null, null],
  coloresPropios: false
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/** Escape de texto del visitante. Se usa al construir HTML por cadena. */
function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── Navegación por pasos ─────────────────────────────────────────── */
const PASOS = ["bienvenida", "plantillas", "personalizar", "preview", "solicitud"];
const NOMBRES = { bienvenida: "Bienvenida", plantillas: "Estilo", personalizar: "Personaliza", preview: "Vista previa", solicitud: "Solicitud" };

function ir(paso) {
  if (!PASOS.includes(paso)) return;
  estado.paso = paso;
  for (const p of PASOS) {
    const el = document.getElementById("pantalla-" + p);
    if (!el) continue;
    const activa = p === paso;
    el.hidden = !activa;
    el.classList.toggle("activa", activa);
  }
  const n = PASOS.indexOf(paso) + 1;
  const ind = $("#indicador-paso");
  if (ind) ind.textContent = "Paso " + n + " de 5 · " + NOMBRES[paso];
  if (paso === "personalizar") pintarFormulario();
  if (paso === "preview") { pintarPreview(); renderDemo(); }
  if (paso === "solicitud") pintarResumen();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Aviso flotante (toast) ───────────────────────────────────────── */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ── Pantalla 2 · plantillas ──────────────────────────────────────── */
function pintarPlantillas() {
  const cont = $("#rejilla-plantillas");
  if (!cont) return;
  cont.innerHTML = Object.values(PLANTILLAS).map((pl) => {
    const sel = estado.plantilla === pl.id;
    return `<button type="button" class="tarjeta-plantilla" data-plantilla="${esc(pl.id)}" aria-pressed="${sel}">
      <span class="tarjeta-plantilla__muestra" style="background:linear-gradient(135deg,${esc(pl.colores.primario)} 0%,${esc(pl.colores.primario)} 55%,${esc(pl.colores.secundario)} 55%,${esc(pl.colores.secundario)} 100%);${pl.estilo.radio === "22px" ? "border-radius:16px;margin:10px;height:100px" : ""}"></span>
      <span class="tarjeta-plantilla__cuerpo">
        <span class="tarjeta-plantilla__nombre">${esc(pl.nombre)}</span>
        <span class="tarjeta-plantilla__para">${esc(pl.paraQuien)}</span>
      </span>
    </button>`;
  }).join("");
  cont.querySelectorAll(".tarjeta-plantilla").forEach((b) => {
    b.addEventListener("click", () => elegirPlantilla(b.getAttribute("data-plantilla")));
  });
  const seguir = $("#btn-ir-personalizar");
  if (seguir) seguir.disabled = !estado.plantilla;
}

function elegirPlantilla(id) {
  const pl = PLANTILLAS[id];
  if (!pl) return;
  const antes = estado.plantilla;
  estado.plantilla = id;
  /* Al cambiar de plantilla se conservan los textos, servicios, logo y fotos.
     Los colores se actualizan solo si el visitante no los había elegido. */
  if (!estado.coloresPropios) {
    estado.primario = pl.colores.primario;
    estado.secundario = pl.colores.secundario;
  }
  pintarPlantillas();
  if (antes && antes !== id) toast("Estilo cambiado a " + pl.nombre + ". Tus datos se conservan.");
}

/* ── Pantalla 3 · personalización ─────────────────────────────────── */
function pintarFormulario() {
  const pl = PLANTILLAS[estado.plantilla] || PLANTILLAS.elegancia;
  if (!estado.primario) estado.primario = pl.colores.primario;
  if (!estado.secundario) estado.secundario = pl.colores.secundario;

  const nombre = $("#f-nombre"); if (nombre) nombre.value = estado.nombre;
  const desc = $("#f-descripcion"); if (desc) desc.value = estado.descripcion;
  actualizarContador();

  const prim = $("#f-primario"); if (prim) prim.value = estado.primario;
  const sec = $("#f-secundario"); if (sec) sec.value = estado.secundario;

  pintarServicios();
  pintarPaletas();
  pintarLogo();
  pintarFotos();
}

function actualizarContador() {
  const c = $("#contador-desc");
  if (c) c.textContent = String((estado.descripcion || "").length);
}

function pintarServicios() {
  const cont = $("#lista-servicios");
  if (!cont) return;
  cont.innerHTML = estado.servicios.map((s, i) => `
    <div class="servicio">
      <input type="text" data-servicio="${i}" data-campo="nombre" maxlength="40" placeholder="Servicio o producto ${i + 1}" value="${esc(s.nombre)}" aria-label="Nombre del servicio ${i + 1}" />
      <input type="text" data-servicio="${i}" data-campo="precio" maxlength="16" placeholder="Precio" value="${esc(s.precio)}" aria-label="Precio del servicio ${i + 1}" />
    </div>`).join("");
  cont.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.getAttribute("data-servicio"));
      const campo = inp.getAttribute("data-campo");
      estado.servicios[i][campo] = inp.value;
    });
  });
}

function pintarPaletas() {
  const cont = $("#paletas");
  if (!cont) return;
  cont.innerHTML = PALETAS.map((p) => `
    <button type="button" class="paleta" data-paleta="${esc(p.nombre)}">
      <span class="paleta__a" style="background:${esc(p.primario)}"></span>
      <span class="paleta__b" style="background:${esc(p.secundario)}"></span>
      ${esc(p.nombre)}
    </button>`).join("");
  cont.querySelectorAll(".paleta").forEach((b) => {
    b.addEventListener("click", () => {
      const p = PALETAS.find((x) => x.nombre === b.getAttribute("data-paleta"));
      if (!p) return;
      aplicarColores(p.primario, p.secundario, true);
    });
  });
}

function aplicarColores(primario, secundario, propio) {
  estado.primario = primario;
  estado.secundario = secundario;
  if (propio) estado.coloresPropios = true;
  const a = $("#f-primario"), b = $("#f-secundario");
  if (a) a.value = primario;
  if (b) b.value = secundario;
  const pa = $("#p-primario"), pb = $("#p-secundario");
  if (pa) pa.value = primario;
  if (pb) pb.value = secundario;
  if (estado.paso === "preview") renderDemo();
}

function pintarLogo() {
  const est = $("#logo-estado");
  const quitar = $("#btn-quitar-logo");
  if (est) est.textContent = estado.logo ? "Logo cargado" : "Sin logo";
  if (quitar) quitar.hidden = !estado.logo;
}

function pintarFotos() {
  const cont = $("#fotos");
  if (!cont) return;
  cont.innerHTML = estado.fotos.map((f, i) => `
    <div class="foto" data-foto="${i}" role="group" aria-label="Fotografía ${i + 1}">
      ${f ? `<img src="${esc(f)}" alt="Fotografía ${i + 1} de la Mini Web" />` : `<span class="foto__vacia">Foto ${i + 1}<br /><small>toca para elegir</small></span>`}
      <input type="file" accept="image/*" data-foto-input="${i}" aria-label="Subir fotografía ${i + 1}" />
      ${f ? `<button type="button" class="foto__quitar" data-foto-quitar="${i}" aria-label="Quitar fotografía ${i + 1}">×</button>` : ""}
    </div>`).join("");
  cont.querySelectorAll("[data-foto-input]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const i = Number(inp.getAttribute("data-foto-input"));
      cargarArchivo(inp.files && inp.files[0], (dataUrl) => {
        estado.fotos[i] = dataUrl;
        pintarFotos();
        if (estado.paso === "preview") renderDemo();
      });
    });
  });
  cont.querySelectorAll("[data-foto-quitar]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-foto-quitar"));
      estado.fotos[i] = null;
      pintarFotos();
      if (estado.paso === "preview") renderDemo();
    });
  });
}

/** Lee un archivo local, lo reduce en un canvas y devuelve un data: URI. */
function cargarArchivo(archivo, cb) {
  if (!archivo || !/^image\//.test(archivo.type)) { toast("Elige una imagen válida."); return; }
  const lector = new FileReader();
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 900;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
      try { cb(lienzo.toDataURL("image/jpeg", 0.82)); }
      catch (e) { cb(String(lector.result || "")); }
    };
    img.onerror = () => { toast("No se pudo leer la imagen."); };
    img.src = String(lector.result || "");
  };
  lector.readAsDataURL(archivo);
}

/* ── Pantalla 4 · vista previa ────────────────────────────────────── */
function pintarPreview() {
  const cont = $("#preview-plantillas");
  if (cont) {
    cont.innerHTML = Object.values(PLANTILLAS).map((pl) =>
      `<button type="button" class="preview__plantilla" data-pl="${esc(pl.id)}" aria-pressed="${estado.plantilla === pl.id}">${esc(pl.nombre)}</button>`
    ).join("");
    cont.querySelectorAll("[data-pl]").forEach((b) => {
      b.addEventListener("click", () => { elegirPlantilla(b.getAttribute("data-pl")); pintarPreview(); renderDemo(); });
    });
  }
  const pa = $("#p-primario"), pb = $("#p-secundario");
  if (pa) pa.value = estado.primario;
  if (pb) pb.value = estado.secundario;
}

/** Construye la Mini Web de la demo. Todo el texto pasa por esc(). */
function renderDemo() {
  const cont = $("#demo-movil");
  if (!cont) return;
  const pl = PLANTILLAS[estado.plantilla] || null;
  if (!pl) { cont.innerHTML = `<div class="demo__seccion">Elige un estilo para ver la vista previa.</div>`; return; }

  const nombre = estado.nombre.trim() || "Tu negocio";
  const desc = estado.descripcion.trim() || pl.lema;
  const servicios = estado.servicios.filter((s) => s.nombre.trim()).slice(0, 6);
  const logo = estado.logo
    ? `<img class="demo__logo" src="${esc(estado.logo)}" alt="Logo de ${esc(nombre)}" />`
    : `<div class="demo__logo" aria-hidden="true">${esc(nombre.slice(0, 2).toUpperCase())}</div>`;

  const serviciosHtml = servicios.length
    ? servicios.map((s) => `<div class="demo__servicio"><span>${esc(s.nombre)}</span><b>${esc(s.precio || "Consultar")}</b></div>`).join("")
    : `<div class="demo__servicio"><span>${esc("Añade tus servicios en el paso anterior")}</span><b>—</b></div>`;

  const fotos = estado.fotos.map((f, i) => f || imagenDeMuestra(pl.muestra[i].titulo, pl.muestra[i].subtitulo, estado.primario, estado.secundario, i));

  cont.innerHTML = `
    <div class="demo demo--${esc(pl.id)}" style="--p:${esc(estado.primario)};--s:${esc(estado.secundario)}">
      <header class="demo__hero">
        ${logo}
        <h1 class="demo__nombre">${esc(nombre)}</h1>
        <p class="demo__desc">${esc(desc)}</p>
        <button type="button" class="demo__cta" data-demo-cta="whatsapp">Escribir por WhatsApp</button>
      </header>
      <nav class="demo__nav" aria-label="Secciones de la Mini Web">
        <a href="#demo-servicios" data-demo-nav>Servicios</a>
        <a href="#demo-galeria" data-demo-nav>Galería</a>
        <a href="#demo-contacto" data-demo-nav>Contacto</a>
      </nav>
      <section class="demo__seccion" id="demo-servicios">
        <h2 class="demo__h3">Servicios</h2>
        <div class="demo__servicios">${serviciosHtml}</div>
      </section>
      <section class="demo__seccion" id="demo-galeria">
        <h2 class="demo__h3">Galería</h2>
        <div class="demo__galeria">${fotos.map((f, i) => `<img src="${esc(f)}" alt="Fotografía ${i + 1}" />`).join("")}</div>
      </section>
      <section class="demo__seccion" id="demo-contacto">
        <h2 class="demo__h3">Contacto</h2>
        <div class="demo__contacto">
          <button type="button" class="demo__cta" data-demo-cta="pedido">Hacer un pedido</button>
          <a href="#" data-demo-cta="mapa">Ver ubicación</a>
        </div>
      </section>
      <footer class="demo__pie">Demostración creada con el demostrador de KONFÍO ZINC · no publicada</footer>
    </div>`;

  cont.querySelectorAll("[data-demo-cta]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      toast("Botón simulado: en tu Mini Web real llevará a WhatsApp o a tu mapa.");
    });
  });
  cont.querySelectorAll("[data-demo-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const destino = cont.querySelector(a.getAttribute("href"));
      if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* ── Pantalla 5 · resumen y WhatsApp ─────────────────────────────── */
function textoWhatsApp() {
  const pl = PLANTILLAS[estado.plantilla];
  const servicios = estado.servicios.filter((s) => s.nombre.trim());
  const lineas = [
    "Hola KONFÍO ZINC, vengo del demostrador de Mini Webs.",
    "",
    "Negocio: " + (estado.nombre.trim() || "(sin nombre)"),
    "Estilo elegido: " + (pl ? pl.nombre : "(sin estilo)"),
    "Colores: " + estado.primario + " y " + estado.secundario,
    "Descripción: " + (estado.descripcion.trim() || "(sin descripción)"),
    "",
    "Servicios:",
    ...(servicios.length ? servicios.map((s) => "• " + s.nombre + (s.precio ? " — " + s.precio : "")) : ["• (aún sin servicios)"]),
    "",
    "Logo: " + (estado.logo ? "sí" : "no"),
    "Fotografías: " + estado.fotos.filter(Boolean).length + " de 3"
  ];
  return lineas.join("\n");
}

function pintarResumen() {
  const cont = $("#resumen");
  const pl = PLANTILLAS[estado.plantilla];
  const servicios = estado.servicios.filter((s) => s.nombre.trim());
  if (cont) {
    cont.innerHTML = `
      <dl>
        <dt>Negocio</dt><dd>${esc(estado.nombre.trim() || "Sin nombre todavía")}</dd>
        <dt>Estilo</dt><dd>${esc(pl ? pl.nombre : "Sin elegir")}</dd>
        <dt>Colores</dt><dd><span class="estampa"><i style="background:${esc(estado.primario)}"></i>${esc(estado.primario)} · <i style="background:${esc(estado.secundario)}"></i>${esc(estado.secundario)}</span></dd>
        <dt>Descripción</dt><dd>${esc(estado.descripcion.trim() || "—")}</dd>
        <dt>Servicios</dt><dd>${esc(servicios.length ? servicios.map((s) => s.nombre + (s.precio ? " (" + s.precio + ")" : "")).join(" · ") : "—")}</dd>
        <dt>Logo</dt><dd>${estado.logo ? "Sí" : "No"}</dd>
        <dt>Fotografías</dt><dd>${estado.fotos.filter(Boolean).length} de 3</dd>
      </dl>`;
  }
  const btn = $("#btn-whatsapp");
  if (btn) btn.href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(textoWhatsApp());
}

/* ── Arranque ────────────────────────────────────────────────────── */
function iniciar() {
  pintarPlantillas();

  $("#btn-empezar")?.addEventListener("click", () => ir("plantillas"));
  $("#btn-ir-personalizar")?.addEventListener("click", () => { if (estado.plantilla) ir("personalizar"); });
  $("#btn-ir-preview")?.addEventListener("click", () => ir("preview"));
  $("#btn-ir-solicitud")?.addEventListener("click", () => ir("solicitud"));
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => ir(b.getAttribute("data-ir"))));

  $("#f-nombre")?.addEventListener("input", (e) => { estado.nombre = e.target.value; });
  $("#f-descripcion")?.addEventListener("input", (e) => {
    estado.descripcion = e.target.value;
    actualizarContador();
  });
  $("#f-primario")?.addEventListener("input", (e) => aplicarColores(e.target.value, estado.secundario, true));
  $("#f-secundario")?.addEventListener("input", (e) => aplicarColores(estado.primario, e.target.value, true));
  $("#p-primario")?.addEventListener("input", (e) => aplicarColores(e.target.value, estado.secundario, true));
  $("#p-secundario")?.addEventListener("input", (e) => aplicarColores(estado.primario, e.target.value, true));

  $("#btn-add-servicio")?.addEventListener("click", () => {
    if (estado.servicios.length >= 6) { toast("Puedes añadir hasta 6 servicios."); return; }
    estado.servicios.push({ nombre: "", precio: "" });
    pintarServicios();
  });

  $("#f-logo")?.addEventListener("change", (e) => {
    cargarArchivo(e.target.files && e.target.files[0], (dataUrl) => {
      estado.logo = dataUrl;
      pintarLogo();
      if (estado.paso === "preview") renderDemo();
    });
  });
  $("#btn-quitar-logo")?.addEventListener("click", () => {
    estado.logo = null;
    const inp = $("#f-logo");
    if (inp) inp.value = "";
    pintarLogo();
    if (estado.paso === "preview") renderDemo();
  });

  ir("bienvenida");
}

iniciar();

/* Expuesto solo para las pruebas locales (no se usa en producción). */
window.__miniDemo = { estado, ir, renderDemo, textoWhatsApp };
