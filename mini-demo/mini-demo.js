/**
 * KZ-MINI-001 · Demostrador de Mini Webs · motor.
 *
 * Estado en memoria (sin almacenamiento, sin red, sin servidores):
 *   { paso, plantilla, nombre, descripcion, servicios, primario, secundario,
 *     logo, logoAspecto, formaLogo, fotos, coloresPropios }
 *
 * Reglas de seguridad:
 *   · Todo texto del visitante se pinta con `textContent` o `esc()`.
 *   · Las imágenes son data: URI locales (FileReader + canvas), nunca URLs.
 *   · No hay fetch, ni Firebase, ni CMS: nada sale del navegador salvo el
 *     enlace de WhatsApp que el visitante pulsa a mano.
 *   · La imagen de la Mini Web se compone en un canvas local (sin librerías
 *     externas) y se descarga con el botón del propio navegador.
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
  logoAspecto: null,
  formaLogo: "circular",
  fotos: [null, null, null],
  coloresPropios: false
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/** Escape de texto del visitante. Se usa al construir HTML por cadena. */
function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Formato de precio en pesos colombianos, sin alterar el valor numérico:
 *   "12000" → "$ 12.000"      "1.500.000" → "$ 1.500.000"
 *   "12,5"  → "$ 12,50"       "Cotizar"   → "Cotizar" (no es un importe)
 * El valor que se guarda en el estado sigue siendo el texto que escribió el
 * visitante; esto solo cambia cómo se muestra.
 */
function formatearPrecio(valor) {
  const texto = String(valor == null ? "" : valor).trim();
  if (!texto) return "";
  const m = texto.match(/^[^\d]*(\d[\d.,]*)[^\d]*$/);
  if (!m) return texto;
  const crudo = m[1];
  const separadores = crudo.replace(/\d/g, "");
  let numero;
  if (separadores) {
    const ultimo = separadores.slice(-1);
    const partes = crudo.split(ultimo);
    const cola = partes[partes.length - 1];
    if (cola.length === 1 || cola.length === 2) {
      numero = Number(partes.slice(0, -1).join("").replace(/[.,]/g, "") + "." + cola);
    } else {
      numero = Number(crudo.replace(/[.,]/g, ""));
    }
  } else {
    numero = Number(crudo);
  }
  if (!Number.isFinite(numero)) return texto;
  const decimales = Number.isInteger(numero) ? 0 : 2;
  return "$ " + numero.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
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

/* Enlace pulsado en la navegación interna (se suelta al desplazar a mano). */
let navFijado = null;

/* ── Pantalla 2 · plantillas ──────────────────────────────────────── */
function pintarPlantillas() {
  const cont = $("#rejilla-plantillas");
  if (!cont) return;
  cont.innerHTML = Object.values(PLANTILLAS).map((pl) => {
    const sel = estado.plantilla === pl.id;
    return `<button type="button" class="tarjeta-plantilla" data-plantilla="${esc(pl.id)}" aria-pressed="${sel}" aria-label="${esc(pl.nombre)}: ${esc(pl.paraQuien)}${sel ? " (elegida)" : ""}">
      <span class="tarjeta-plantilla__muestra" style="background:linear-gradient(135deg,${esc(pl.colores.primario)} 0%,${esc(pl.colores.primario)} 55%,${esc(pl.colores.secundario)} 55%,${esc(pl.colores.secundario)} 100%)">
        ${sel ? `<span class="tarjeta-plantilla__elegida">Elegida</span>` : ""}
      </span>
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

  const formas = $("#formas-logo");
  if (formas) {
    formas.hidden = !estado.logo;
    formas.querySelectorAll("[data-forma]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-forma") === estado.formaLogo));
    });
  }
}

function pintarFotos() {
  const cont = $("#fotos");
  if (!cont) return;
  cont.innerHTML = estado.fotos.map((f, i) => `
    <div class="foto" data-foto="${i}" role="group" aria-label="Fotografía ${i + 1}">
      ${f ? `<img src="${esc(f)}" alt="Fotografía ${i + 1} de la Mini Web" />` : `<span class="foto__vacia">Foto ${i + 1}<br /><small>toca para elegir</small></span>`}
      ${f ? `<span class="foto__marca foto__marca--propia">tu foto</span>` : `<span class="foto__marca">ejemplo</span>`}
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
      const meta = { ancho: img.width, alto: img.height, relacion: img.width / Math.max(1, img.height) };
      try { cb(lienzo.toDataURL("image/jpeg", 0.82), meta); }
      catch (e) { cb(String(lector.result || ""), meta); }
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

/** Clase del marco del logo según la proporción real de la imagen. */
function claseAspecto() {
  if (estado.logoAspecto === "panoramica") return " demo__logo--panoramica";
  if (estado.logoAspecto === "vertical") return " demo__logo--vertical";
  return "";
}

function claseForma() {
  if (estado.formaLogo === "redondeado") return " demo__logo--redondeado";
  if (estado.formaLogo === "original") return " demo__logo--original";
  return "";
}

/** Construye la Mini Web de la demo. Todo el texto pasa por esc(). */
function renderDemo() {
  const cont = $("#demo-movil");
  if (!cont) return;
  const pl = PLANTILLAS[estado.plantilla] || null;
  if (!pl) { cont.innerHTML = `<div class="demo__seccion">Elige un estilo para ver la vista previa.</div>`; return; }

  const nombre = estado.nombre.trim() || "Tu negocio";
  const descPropia = estado.descripcion.trim();
  const desc = descPropia || pl.lema;
  const servicios = estado.servicios.filter((s) => s.nombre.trim()).slice(0, 6);
  const logo = estado.logo
    ? `<img class="demo__logo${claseAspecto()}${claseForma()}" src="${esc(estado.logo)}" alt="Logo de ${esc(nombre)}" />`
    : `<div class="demo__logo${claseForma()}" aria-hidden="true">${esc(nombre.slice(0, 2).toUpperCase())}</div>`;

  const serviciosHtml = servicios.length
    ? servicios.map((s) => `<div class="demo__servicio"><span>${esc(s.nombre)}</span><b>${esc(formatearPrecio(s.precio) || "Consultar")}</b></div>`).join("")
    : `<div class="demo__servicio"><span>${esc("Añade tus servicios en el paso anterior")}</span><b>—</b></div>`;

  const fotos = estado.fotos.map((f, i) => ({
    src: f || imagenDeMuestra(pl.muestra[i].titulo, pl.muestra[i].subtitulo, estado.primario, estado.secundario, i),
    propia: !!f
  }));

  cont.innerHTML = `
    <div class="demo demo--${esc(pl.id)}" style="--p:${esc(estado.primario)};--s:${esc(estado.secundario)}">
      <header class="demo__hero">
        ${logo}
        <h1 class="demo__nombre">${esc(nombre)}</h1>
        <p class="demo__desc">${esc(desc)}${descPropia ? "" : `<span class="demo__marca-ejemplo">texto de ejemplo</span>`}</p>
        <button type="button" class="demo__cta" data-demo-cta="whatsapp">Escribir por WhatsApp</button>
      </header>
      <nav class="demo__nav" aria-label="Secciones de la Mini Web">
        <a href="#demo-servicios" data-demo-nav>Servicios</a>
        <a href="#demo-galeria" data-demo-nav>Galería</a>
        <a href="#demo-contacto" data-demo-nav>Contacto</a>
      </nav>
      <section class="demo__seccion" id="demo-servicios" data-demo-seccion>
        <h2 class="demo__h3">Servicios</h2>
        <div class="demo__servicios">${serviciosHtml}</div>
      </section>
      <section class="demo__seccion" id="demo-galeria" data-demo-seccion>
        <h2 class="demo__h3">Galería</h2>
        <div class="demo__galeria">${fotos.map((f, i) => `<figure class="demo__foto${f.propia ? " demo__foto--propia" : ""}">
          <img src="${esc(f.src)}" alt="Fotografía ${i + 1}${f.propia ? " subida por ti" : " de ejemplo"}" />
          <figcaption class="demo__foto-marca">${f.propia ? "tu foto" : "ejemplo"}</figcaption>
        </figure>`).join("")}</div>
      </section>
      <section class="demo__seccion" id="demo-contacto" data-demo-seccion>
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
  navFijado = null;
  cont.querySelectorAll("[data-demo-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      /* La marca sigue al enlace pulsado hasta que el visitante vuelve a
         desplazar a mano: la Mini Web es corta y no siempre cabe alinear la
         sección arriba, pero la sección elegida sí queda marcada. */
      navFijado = a;
      const destino = cont.querySelector(a.getAttribute("href"));
      if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
      marcarNav();
    });
  });
  marcarNav();
}

/** Marca como activa la sección que más se ve (empate: la última). */
function marcarNav() {
  const cont = $("#demo-movil");
  if (!cont) return;
  const enlaces = Array.from(cont.querySelectorAll("[data-demo-nav]"));
  if (!enlaces.length) return;
  if (navFijado && enlaces.includes(navFijado)) {
    enlaces.forEach((a) => a.classList.toggle("activo", a === navFijado));
    return;
  }
  const caja = cont.getBoundingClientRect();
  let mejor = enlaces[0];
  let mejorArea = -1;
  for (const a of enlaces) {
    const sec = cont.querySelector(a.getAttribute("href"));
    if (!sec) continue;
    const r = sec.getBoundingClientRect();
    const visible = Math.min(r.bottom, caja.bottom) - Math.max(r.top, caja.top);
    if (visible >= mejorArea) { mejorArea = visible; mejor = a; }
  }
  enlaces.forEach((a) => a.classList.toggle("activo", a === mejor));
}

/* ── Pantalla 5 · resumen y WhatsApp ─────────────────────────────── */
function textoWhatsApp() {
  const pl = PLANTILLAS[estado.plantilla];
  const servicios = estado.servicios.filter((s) => s.nombre.trim());
  const propias = estado.fotos.filter(Boolean).length;
  const desc = estado.descripcion.trim();
  const nombre = estado.nombre.trim();
  const origen = estado.coloresPropios ? "elegido por mí" : "del estilo";
  const lineas = [
    "Hola KONFÍO ZINC, vengo del demostrador de Mini Webs.",
    "",
    "1) MI NEGOCIO",
    "• Nombre: " + (nombre || "(sin escribir todavía)"),
    "• Descripción: " + (desc || "(no escribí descripción)"),
    "",
    "2) DISEÑO QUE ELEGÍ",
    "• Estilo: " + (pl ? pl.nombre + " — " + pl.paraQuien : "(sin elegir)"),
    "• Color principal: " + estado.primario + " (" + origen + ")",
    "• Color secundario: " + estado.secundario + " (" + origen + ")",
    "",
    "3) SERVICIOS QUE ESCRIBÍ",
    ...(servicios.length
      ? servicios.map((s) => "• " + s.nombre + (s.precio ? " — " + formatearPrecio(s.precio) : ""))
      : ["• (aún no escribí servicios)"]),
    "",
    "4) IMÁGENES",
    "• Logo: " + (estado.logo ? "sí, cargado" : "no"),
    "• Fotografías propias: " + propias + " de 3" + (propias < 3 ? " (el resto son de ejemplo)" : ""),
    "",
    "PARA TENER EN CUENTA",
    "• Los textos de ejemplo de la plantilla no son mi información: lo que vale es lo que escribí arriba.",
    "• La imagen de mi Mini Web la descargo y la adjunto yo en el chat; el demostrador no envía nada."
  ];
  return lineas.join("\n");
}

function pintarResumen() {
  const cont = $("#resumen");
  const pl = PLANTILLAS[estado.plantilla];
  const servicios = estado.servicios.filter((s) => s.nombre.trim());
  const desc = estado.descripcion.trim();
  const propias = estado.fotos.filter(Boolean).length;
  if (cont) {
    cont.innerHTML = `
      <dl>
        <dt>Negocio</dt><dd>${esc(estado.nombre.trim() || "Sin escribir todavía")}</dd>
        <dt>Estilo</dt><dd>${esc(pl ? pl.nombre : "Sin elegir")}</dd>
        <dt>Colores</dt><dd><span class="estampa">
          <span class="estampa__color"><i style="background:${esc(estado.primario)}"></i>${esc(estado.primario)} <small>principal</small></span>
          <span class="estampa__color"><i style="background:${esc(estado.secundario)}"></i>${esc(estado.secundario)} <small>secundario</small></span>
        </span></dd>
        <dt>Descripción</dt><dd>${desc ? esc(desc) : `Sin escribir todavía <em>(en la demo se ve el texto de ejemplo del estilo)</em>`}</dd>
        <dt>Servicios</dt><dd>${esc(servicios.length ? servicios.map((s) => s.nombre + (s.precio ? " (" + formatearPrecio(s.precio) + ")" : "")).join(" · ") : "Sin escribir todavía")}</dd>
        <dt>Logo</dt><dd>${estado.logo ? "Sí" : "No"}</dd>
        <dt>Fotografías</dt><dd>${propias} tuyas · ${3 - propias} de ejemplo</dd>
      </dl>`;
  }
  const btn = $("#btn-whatsapp");
  if (btn) btn.href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(textoWhatsApp());
}

/* ── Descarga de la imagen de la Mini Web (canvas local) ──────────── */
const LADO = 1080;

function cargarImagen(src) {
  return new Promise((resolver) => {
    if (!src) { resolver(null); return; }
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

/** Parte un texto en líneas que caben en `maxAncho`, como máximo `maxLineas`. */
function partirTexto(ctx, texto, maxAncho, maxLineas) {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? actual + " " + p : p;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = p;
      if (lineas.length === maxLineas) {
        actual = "";
        lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/\s+\S*$/, "") + "…";
        break;
      }
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, maxLineas);
}

function redondear(ctx, x, y, w, h, r) {
  const radio = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + radio[0], y);
  ctx.lineTo(x + w - radio[1], y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radio[1]);
  ctx.lineTo(x + w, y + h - radio[2]);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radio[2], y + h);
  ctx.lineTo(x + radio[3], y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radio[3]);
  ctx.lineTo(x, y + radio[0]);
  ctx.quadraticCurveTo(x, y, x + radio[0], y);
  ctx.closePath();
}

/** Dibuja una imagen dentro de un rectángulo tipo `object-fit`. */
function dibujarAjustada(ctx, img, x, y, w, h, modo) {
  const rel = img.width / Math.max(1, img.height);
  const relCaja = w / h;
  let dw, dh;
  if (modo === "contain") {
    if (rel > relCaja) { dw = w; dh = w / rel; } else { dh = h; dw = h * rel; }
  } else if (rel > relCaja) { dh = h; dw = h * rel; } else { dw = w; dh = w / rel; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Lista de avisos: lo que la imagen no puede representar tal cual. */
function avisosImagen() {
  const avisos = [];
  const servicios = estado.servicios.filter((s) => s.nombre.trim());
  if (!estado.descripcion.trim()) avisos.push("Sin descripción escrita: la lámina no inventa una, deja el espacio con la nota «Sin descripción».");
  if (!estado.logo) avisos.push("Sin logo: la lámina usa las iniciales del negocio.");
  if (!servicios.length) avisos.push("Sin servicios escritos: la lámina los muestra vacíos.");
  else if (servicios.length > 4) avisos.push("La lámina muestra " + 4 + " de tus " + servicios.length + " servicios; el resto queda en tu Mini Web.");
  if (estado.fotos.filter(Boolean).length < 3) avisos.push("Algunas fotos son de ejemplo: van marcadas como «ejemplo» en la lámina.");
  avisos.push("La lámina no reproduce la Mini Web completa: es una vista resumida (portada, servicios, galería y contacto) pensada para verse bien en cualquier teléfono.");
  return avisos;
}

/** Compone la lámina en un canvas y devuelve el canvas y sus avisos. */
async function componerLamina() {
  const pl = PLANTILLAS[estado.plantilla] || PLANTILLAS.elegancia;
  const avisos = avisosImagen();
  const nombre = estado.nombre.trim() || "Tu negocio";
  const descPropia = estado.descripcion.trim();
  const servicios = estado.servicios.filter((s) => s.nombre.trim()).slice(0, 4);
  const fotos = estado.fotos.map((f, i) => ({
    src: f || imagenDeMuestra(pl.muestra[i].titulo, pl.muestra[i].subtitulo, estado.primario, estado.secundario, i),
    propia: !!f
  }));

  const ALTO = 1480;
  const lienzo = document.createElement("canvas");
  lienzo.width = LADO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return { lienzo: null, avisos: ["Tu navegador no permitió dibujar la imagen."] };

  /* Fondo con el color principal del cliente */
  const fondo = ctx.createLinearGradient(0, 0, LADO, ALTO);
  fondo.addColorStop(0, estado.primario);
  fondo.addColorStop(1, estado.primario);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, LADO, ALTO);

  /* Tarjeta blanca */
  const M = 48;
  const tarjetaW = LADO - M * 2;
  ctx.save();
  ctx.shadowColor = "rgba(2, 8, 20, .35)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 18;
  redondear(ctx, M, M, tarjetaW, ALTO - M * 2, 44);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  /* Franja superior con el color principal */
  ctx.save();
  redondear(ctx, M, M, tarjetaW, 486, [44, 44, 0, 0]);
  ctx.clip();
  ctx.fillStyle = estado.primario;
  ctx.fillRect(M, M, tarjetaW, 486);
  ctx.restore();

  const centro = LADO / 2;

  /* Logo: círculo si la forma es circular; si no, la forma se respeta */
  const imgLogo = await cargarImagen(estado.logo);
  const cajaLogo = estado.logoAspecto === "panoramica" ? { w: 300, h: 150 } : { w: 170, h: 170 };
  const logoX = centro - cajaLogo.w / 2;
  const logoY = M + 54;
  if (imgLogo) {
    ctx.save();
    if (estado.formaLogo === "circular") {
      ctx.beginPath();
      ctx.arc(centro, logoY + cajaLogo.h / 2, Math.min(cajaLogo.w, cajaLogo.h) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(logoX, logoY, cajaLogo.w, cajaLogo.h);
      const lado = Math.min(cajaLogo.w, cajaLogo.h) - 28;
      dibujarAjustada(ctx, imgLogo, centro - lado / 2, logoY + cajaLogo.h / 2 - lado / 2, lado, lado, "contain");
    } else {
      const r = estado.formaLogo === "redondeado" ? 26 : 8;
      ctx.fillStyle = estado.formaLogo === "original" ? "transparent" : "#ffffff";
      if (estado.formaLogo !== "original") { redondear(ctx, logoX, logoY, cajaLogo.w, cajaLogo.h, r); ctx.fill(); }
      if (estado.formaLogo !== "original") { redondear(ctx, logoX, logoY, cajaLogo.w, cajaLogo.h, r); ctx.clip(); }
      dibujarAjustada(ctx, imgLogo, logoX + 12, logoY + 12, cajaLogo.w - 24, cajaLogo.h - 24, "contain");
    }
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centro, logoY + cajaLogo.h / 2, Math.min(cajaLogo.w, cajaLogo.h) / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, .22)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(nombre.slice(0, 2).toUpperCase(), centro, logoY + cajaLogo.h / 2 + 2);
    ctx.restore();
  }

  /* Nombre y descripción */
  let y = logoY + cajaLogo.h + 54;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 52px system-ui, sans-serif";
  for (const linea of partirTexto(ctx, nombre, tarjetaW - 140, 2)) {
    ctx.fillText(linea, centro, y);
    y += 60;
  }
  ctx.font = "400 28px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, .88)";
  if (descPropia) {
    for (const linea of partirTexto(ctx, descPropia, tarjetaW - 180, 3)) {
      ctx.fillText(linea, centro, y + 6);
      y += 36;
    }
  } else {
    ctx.fillText("Sin descripción escrita", centro, y + 6);
    y += 36;
  }

  /* Servicios */
  y = M + 486 + 62;
  ctx.textAlign = "left";
  ctx.fillStyle = estado.primario;
  ctx.font = "800 34px system-ui, sans-serif";
  ctx.fillText("Servicios", M + 56, y);
  y += 28;
  if (!servicios.length) {
    ctx.font = "400 27px system-ui, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Todavía sin servicios escritos", M + 56, y + 12);
    y += 30;
  } else {
    for (const s of servicios) {
      y += 34;
      redondear(ctx, M + 56, y, tarjetaW - 112, 62, 16);
      ctx.fillStyle = "#f1f5f9";
      ctx.fill();
      ctx.font = "600 27px system-ui, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "left";
      ctx.fillText(partirTexto(ctx, s.nombre, tarjetaW - 420, 1)[0] || s.nombre, M + 78, y + 40);
      ctx.textAlign = "right";
      ctx.fillStyle = estado.primario;
      ctx.fillText(formatearPrecio(s.precio) || "Consultar", M + tarjetaW - 78, y + 40);
      ctx.textAlign = "left";
      y += 24;
    }
  }

  /* Galería */
  y += 40;
  ctx.fillStyle = estado.primario;
  ctx.font = "800 34px system-ui, sans-serif";
  ctx.fillText("Galería", M + 56, y);
  y += 28;

  const anchoFoto = Math.floor((tarjetaW - 112 - 2 * 28) / 3);
  const altoFoto = Math.round(anchoFoto * 0.75);
  for (let i = 0; i < 3; i += 1) {
    const x = M + 56 + i * (anchoFoto + 28);
    const img = await cargarImagen(fotos[i].src);
    ctx.save();
    redondear(ctx, x, y, anchoFoto, altoFoto, 16);
    ctx.clip();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(x, y, anchoFoto, altoFoto);
    if (img) dibujarAjustada(ctx, img, x, y, anchoFoto, altoFoto, "cover");
    ctx.restore();
    redondear(ctx, x + 8, y + altoFoto - 40, fotos[i].propia ? 96 : 92, 30, 15);
    ctx.fillStyle = fotos[i].propia ? "rgba(255,255,255,.95)" : "rgba(2,8,20,.72)";
    ctx.fill();
    ctx.font = "800 17px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = fotos[i].propia ? "#0f172a" : "#ffffff";
    ctx.fillText(fotos[i].propia ? "TU FOTO" : "EJEMPLO", x + 8 + (fotos[i].propia ? 48 : 46), y + altoFoto - 20);
    ctx.textAlign = "left";
  }

  /* Pie */
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = "400 22px system-ui, sans-serif";
  ctx.fillText("Demostración creada con el demostrador de KONFÍO ZINC · no publicada", centro, ALTO - M - 54);
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillStyle = estado.primario;
  ctx.fillText(pl.nombre + " · " + (estado.primario) + " / " + (estado.secundario), centro, ALTO - M - 26);

  return { lienzo, avisos };
}

function nombreArchivo() {
  const base = (estado.nombre || "mi-negocio")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "mi-negocio";
  return "mini-web-" + base + ".png";
}

/** Genera y descarga la imagen. Devuelve los avisos para poder mostrarlos. */
async function descargarImagen() {
  if (!estado.plantilla) { toast("Elige un estilo antes de descargar."); return { ok: false, avisos: ["Sin estilo elegido."] }; }
  const { lienzo, avisos } = await componerLamina();
  if (!lienzo) { toast("No se pudo generar la imagen."); return { ok: false, avisos }; }
  const nota = $("#nota-descarga");
  if (nota) {
    nota.innerHTML = "<strong>Aviso:</strong> " + avisos.map((a) => esc(a)).join(" ");
  }
  return new Promise((resolver) => {
    try {
      lienzo.toBlob((blob) => {
        if (!blob) { toast("No se pudo generar la imagen."); resolver({ ok: false, avisos }); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo();
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        /* Se libera tarde a propósito: si el móvil tarda en abrir el gestor de
           descargas, revocar el blob de inmediato puede cortar la descarga. */
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        toast("Imagen descargada: " + a.download);
        resolver({ ok: true, avisos, nombre: a.download, blob });
      }, "image/png");
    } catch (e) {
      toast("El navegador bloqueó la descarga. Usa «Ver imagen para guardar».");
      resolver({ ok: false, avisos });
    }
  });
}

/* ── Visor: guardar la imagen sin el gestor de descargas ──────────────
   Muchos navegadores móviles bloquean la descarga directa cuando el origen
   no es HTTPS. Mostrar la imagen permite guardarla con una pulsación larga
   sin desactivar ninguna protección del teléfono. */
let visorUrl = null;

function cerrarVisor() {
  const visor = $("#visor");
  if (visor) visor.hidden = true;
  if (visorUrl) { URL.revokeObjectURL(visorUrl); visorUrl = null; }
  const img = $("#visor-img");
  if (img) img.removeAttribute("src");
  const abridor = document.activeElement;
  if (abridor && abridor.blur) abridor.blur();
}

/** Genera la lámina y la muestra a tamaño completo para guardarla a mano. */
async function verImagen() {
  if (!estado.plantilla) { toast("Elige un estilo antes de ver la imagen."); return { ok: false }; }
  const { lienzo, avisos } = await componerLamina();
  if (!lienzo) { toast("No se pudo generar la imagen."); return { ok: false, avisos }; }
  let url;
  try {
    const dataUrl = lienzo.toDataURL("image/png");
    url = dataUrl;
  } catch (e) {
    toast("El navegador no permitió generar la imagen.");
    return { ok: false, avisos };
  }
  const img = $("#visor-img");
  const visor = $("#visor");
  if (!img || !visor) return { ok: false, avisos };
  img.src = url;
  visorUrl = null;
  visor.hidden = false;
  const cerrar = $("#visor-cerrar");
  if (cerrar) cerrar.focus();
  return { ok: true, avisos };
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
    cargarArchivo(e.target.files && e.target.files[0], (dataUrl, meta) => {
      estado.logo = dataUrl;
      const rel = meta && meta.relacion ? meta.relacion : 1;
      estado.logoAspecto = rel > 1.35 ? "panoramica" : rel < 0.75 ? "vertical" : "cuadrada";
      pintarLogo();
      if (estado.paso === "preview") renderDemo();
    });
  });
  $("#btn-quitar-logo")?.addEventListener("click", () => {
    estado.logo = null;
    estado.logoAspecto = null;
    const inp = $("#f-logo");
    if (inp) inp.value = "";
    pintarLogo();
    if (estado.paso === "preview") renderDemo();
  });

  $("#formas-logo")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-forma]");
    if (!b) return;
    estado.formaLogo = b.getAttribute("data-forma");
    pintarLogo();
    if (estado.paso === "preview") renderDemo();
  });

  $("#btn-descargar")?.addEventListener("click", () => { descargarImagen(); });
  $("#btn-descargar-2")?.addEventListener("click", () => { descargarImagen(); });
  $("#btn-ver-imagen")?.addEventListener("click", () => { verImagen(); });
  $("#btn-ver-imagen-2")?.addEventListener("click", () => { verImagen(); });
  $("#visor-cerrar")?.addEventListener("click", cerrarVisor);
  $("#visor")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) cerrarVisor(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarVisor(); });

  const pantalla = $("#demo-movil");
  if (pantalla) {
    /* Al desplazar a mano se suelta el enlace fijado: la marca vuelve a
       seguir a la sección que realmente se está viendo. */
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach((ev) => {
      pantalla.addEventListener(ev, () => { navFijado = null; marcarNav(); }, { passive: true });
    });
    pantalla.addEventListener("scroll", marcarNav, { passive: true });
  }

  ir("bienvenida");
}

iniciar();

/* Expuesto solo para las pruebas locales (no se usa en producción). */
window.__miniDemo = { estado, ir, renderDemo, textoWhatsApp, descargarImagen, componerLamina, avisosImagen, formatearPrecio, verImagen, cerrarVisor };
