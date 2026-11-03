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

/**
 * Reparte un texto en líneas que caben en `maxAncho`, sin inventar contenido.
 * Solo recorta (con «…» y avisando en `cortado`) si supera `maxLineas`; las
 * medidas de la lámina se calculan con este resultado, así que el texto nunca
 * se sale de su caja.
 */
function envolverLineas(ctx, texto, maxAncho, maxLineas) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  let cortado = false;
  const ancho = (t) => ctx.measureText(t).width;

  for (const palabra of palabras) {
    /* Palabra sola más ancha que la caja: se parte por caracteres. */
    if (!actual && ancho(palabra) > maxAncho) {
      let trozo = "";
      for (const ch of palabra) {
        if (ancho(trozo + ch) > maxAncho && trozo) { lineas.push(trozo); trozo = ch; }
        else trozo += ch;
        if (lineas.length === maxLineas - 1 && trozo && ancho(trozo + ch) > maxAncho) break;
      }
      actual = trozo;
      if (lineas.length >= maxLineas) { cortado = true; break; }
      continue;
    }
    const prueba = actual ? actual + " " + palabra : palabra;
    if (ancho(prueba) > maxAncho && actual) {
      lineas.push(actual);
      actual = palabra;
      if (lineas.length === maxLineas) { cortado = true; actual = ""; break; }
    } else {
      actual = prueba;
    }
  }
  if (actual && lineas.length < maxLineas) lineas.push(actual);
  else if (actual) cortado = true;
  if (!lineas.length) lineas.push("");
  if (cortado) lineas[lineas.length - 1] = lineas[lineas.length - 1].replace(/[\s,;:.]+$/, "") + "…";
  return { lineas, cortado };
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

/** Avisos generales de la lámina (los ajustes de espacio se añaden aparte). */
function avisosBase(d) {
  const avisos = [];
  if (!d.descripcion) avisos.push("Sin descripción escrita: la lámina no inventa una y deja la nota «Sin descripción escrita».");
  if (!d.logo) avisos.push("Sin logo: la lámina usa las iniciales del negocio.");
  if (!d.servicios.length) avisos.push("Sin servicios escritos: la lámina los muestra vacíos.");
  if (d.fotos.filter((f) => f.propia).length < 3) avisos.push("Algunas fotos son de ejemplo: van marcadas como «EJEMPLO» en la lámina.");
  avisos.push("La lámina no reproduce la Mini Web completa: es una vista resumida (portada, servicios, galería y contacto) pensada para verse bien en cualquier teléfono.");
  return avisos;
}

function avisosImagen() {
  return avisosBase(instantanea());
}

/**
 * Fotografía inmutable de la selección. La lámina se dibuja con esta copia:
 * si el visitante cambia de plantilla o de colores mientras se genera, la
 * imagen que sale es coherente de principio a fin, nunca mezclada.
 */
function instantanea() {
  const pl = PLANTILLAS[estado.plantilla] || PLANTILLAS.elegancia;
  const primario = estado.primario || pl.colores.primario;
  const secundario = estado.secundario || pl.colores.secundario;
  return {
    estiloId: pl.id,
    estilo: pl.nombre,
    paraQuien: pl.paraQuien,
    nombre: estado.nombre.trim() || "Tu negocio",
    descripcion: estado.descripcion.trim(),
    servicios: estado.servicios
      .map((s) => ({ nombre: String(s.nombre || "").trim(), precio: formatearPrecio(s.precio) }))
      .filter((s) => s.nombre),
    primario,
    secundario,
    logo: estado.logo,
    logoAspecto: estado.logoAspecto,
    formaLogo: estado.formaLogo || "circular",
    muestra: pl.muestra,
    /* Las muestras se generan más abajo, con la proporción exacta del hueco:
       así el recorte de `cover` no corta el título ni el subtítulo. */
    fotos: estado.fotos.map((f) => ({ propia: !!f, src: f || null }))
  };
}

/**
 * Dibuja el logo de la cabecera con `contain` (sin deformar) y dentro de la
 * forma elegida (sin recortar). Devuelve la geometría usada, que las pruebas
 * comparan con la proporción real de la imagen.
 */
function dibujarLogo(ctx, img, d, caja, centro) {
  const forma = d.formaLogo;
  const meta = { forma, caja: { x: caja.x, y: caja.y, w: caja.w, h: caja.h }, dibujado: null, relacionFuente: null, relacionDibujada: null, dentroCaja: false };

  if (!img) {
    const radio = Math.min(caja.w, caja.h) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centro, caja.y + caja.h / 2, radio, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, .22)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = '800 52px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(d.nombre || "?").slice(0, 2).toUpperCase(), centro, caja.y + caja.h / 2 + 2);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
    return meta;
  }

  const PAD = 14;
  let dentro;
  if (forma === "circular") {
    /* Cuadrado inscrito en el círculo: así nada queda fuera del borde. */
    const lado = Math.round(Math.min(caja.w, caja.h) / Math.SQRT2) - 8;
    dentro = { x: centro - lado / 2, y: caja.y + caja.h / 2 - lado / 2, w: lado, h: lado };
  } else {
    dentro = { x: caja.x + PAD, y: caja.y + PAD, w: caja.w - PAD * 2, h: caja.h - PAD * 2 };
  }

  const rel = img.width / Math.max(1, img.height);
  const relCaja = dentro.w / dentro.h;
  let dw, dh;
  if (rel > relCaja) { dw = dentro.w; dh = dw / rel; } else { dh = dentro.h; dw = dh * rel; }
  const dx = dentro.x + (dentro.w - dw) / 2;
  const dy = dentro.y + (dentro.h - dh) / 2;

  ctx.save();
  if (forma === "circular") {
    ctx.beginPath();
    ctx.arc(centro, caja.y + caja.h / 2, Math.min(caja.w, caja.h) / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.clip();
  } else if (forma === "redondeado") {
    redondear(ctx, caja.x, caja.y, caja.w, caja.h, 26);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.clip();
  }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();

  meta.dibujado = { x: dx, y: dy, w: dw, h: dh };
  meta.relacionFuente = rel;
  meta.relacionDibujada = dw / dh;
  meta.dentroCaja = dx >= caja.x - 0.5 && dy >= caja.y - 0.5 && dx + dw <= caja.x + caja.w + 0.5 && dy + dh <= caja.y + caja.h + 0.5;
  return meta;
}

/**
 * Compone la lámina promocional (1080×1480) con un motor de medida: primero se
 * miden todos los bloques y después se colocan, así que no hay superposiciones
 * ni texto fuera de su caja. Si el contenido no cabe, se ajusta el tamaño de la
 * galería y, solo como último recurso, se muestran menos servicios; todo queda
 * anotado en `avisos` y en `meta`.
 *
 * Devuelve { lienzo, avisos, meta }. `meta` expone la geometría para que las
 * pruebas comprueben de forma objetiva que nada se solapa.
 */
async function componerLamina() {
  const d = instantanea();
  const W = LADO;
  const H = 1480;
  const M = 48;
  const PAD = 56;
  const tarjeta = { x: M, y: M, w: W - M * 2, h: H - M * 2 };
  const innerX = tarjeta.x + PAD;
  const innerW = tarjeta.w - PAD * 2;
  const centro = W / 2;

  const lienzo = document.createElement("canvas");
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return { lienzo: null, avisos: ["Tu navegador no permitió dibujar la imagen."], meta: null };

  const FUENTE = {
    nombre: '800 52px system-ui, "Segoe UI", sans-serif',
    desc: '400 28px system-ui, "Segoe UI", sans-serif',
    titulo: '800 34px system-ui, "Segoe UI", sans-serif',
    item: '600 27px system-ui, "Segoe UI", sans-serif',
    precio: '700 27px system-ui, "Segoe UI", sans-serif',
    marca: '800 17px system-ui, "Segoe UI", sans-serif',
    pie: '400 22px system-ui, "Segoe UI", sans-serif',
    pieFuerte: '700 22px system-ui, "Segoe UI", sans-serif',
    vacio: 'italic 26px system-ui, "Segoe UI", sans-serif'
  };
  const LH = { nombre: 60, desc: 36, item: 34 };

  /* ── 1 · Medición ────────────────────────────────────────────────── */
  ctx.font = FUENTE.nombre;
  const nombreM = envolverLineas(ctx, d.nombre, innerW - 40, 2);
  ctx.font = FUENTE.desc;
  const descM = d.descripcion ? envolverLineas(ctx, d.descripcion, innerW - 80, 3) : null;

  /* Con forma circular el marco es cuadrado; si no, se adapta a la imagen. */
  const cajaLogo = d.formaLogo === "circular"
    ? { w: 148, h: 148 }
    : d.logoAspecto === "panoramica" ? { w: 300, h: 132 }
      : d.logoAspecto === "vertical" ? { w: 116, h: 158 }
        : { w: 152, h: 152 };

  const HERO = { padTop: 46, gap: 40, padBottom: 44 };
  const altoNombre = nombreM.lineas.length * LH.nombre;
  const altoDesc = descM ? 8 + descM.lineas.length * LH.desc : 38;
  const heroH = HERO.padTop + cajaLogo.h + HERO.gap + altoNombre + altoDesc + HERO.padBottom;

  const ALTO_FILA_MIN = 74;
  const filaServicio = (s) => {
    ctx.font = FUENTE.item;
    const m = envolverLineas(ctx, s.nombre, innerW - 320, 2);
    return { nombre: s.nombre, precio: s.precio, lineas: m.lineas, cortado: m.cortado, alto: Math.max(ALTO_FILA_MIN, 40 + m.lineas.length * LH.item) };
  };
  const medirServicios = (n) => {
    const filas = d.servicios.slice(0, n).map(filaServicio);
    const alto = filas.length ? 60 + filas.reduce((a, f) => a + f.alto, 0) + 12 * (filas.length - 1) : 60 + 46;
    return { filas, alto };
  };

  const SEP_TILE = 22;
  const anchoTile = Math.floor((innerW - SEP_TILE * 2) / 3);
  const ALTO_CAPTION = 48;
  const altoGaleria = (altoImg) => 60 + altoImg + ALTO_CAPTION;
  const SEP_SECCION = 46;

  /* ── 2 · Reparto vertical con ajuste automático ──────────────────── */
  const pieTop = tarjeta.y + tarjeta.h - 96;
  const contenidoTop = tarjeta.y + heroH + 46;
  const disponible = pieTop - 28 - contenidoTop;

  let nServicios = Math.min(4, d.servicios.length);
  let altoImg = Math.round(anchoTile * 0.7);
  let serv = medirServicios(nServicios);
  const total = () => serv.alto + SEP_SECCION + altoGaleria(altoImg);

  while (total() > disponible && altoImg > Math.round(anchoTile * 0.52)) {
    altoImg -= 6;
  }
  while (total() > disponible && nServicios > 0) {
    nServicios -= 1;
    serv = medirServicios(nServicios);
  }
  if (total() > disponible) {
    /* Último recurso: se recorta la descripción con «…» para no salirse. */
    ctx.font = FUENTE.desc;
    const ajustada = envolverLineas(ctx, d.descripcion, innerW - 80, 2);
    d.descripcion = ajustada.lineas.join(" ").replace(/…$/, "");
    d._descCortada = ajustada.cortado;
  }

  /* ── 3 · Avisos ──────────────────────────────────────────────────── */
  const avisos = avisosBase(d);
  if (serv.filas.length < d.servicios.length) {
    avisos.push("La lámina muestra " + serv.filas.length + " de " + d.servicios.length + " servicios; el resto queda en tu Mini Web.");
  }
  if (altoImg < Math.round(anchoTile * 0.7)) {
    avisos.push("La galería va algo más baja para que todo el contenido quepa sin solaparse.");
  }
  const cortes = [nombreM, descM, ...serv.filas].filter((x) => x && x.cortado);
  if (cortes.length || d._descCortada) avisos.push("Algún texto se acortó con «…» para no salirse de la lámina.");

  /* ── 4 · Dibujo ──────────────────────────────────────────────────── */
  ctx.fillStyle = d.primario;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "rgba(2, 8, 20, .35)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 18;
  redondear(ctx, tarjeta.x, tarjeta.y, tarjeta.w, tarjeta.h, 44);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  redondear(ctx, tarjeta.x, tarjeta.y, tarjeta.w, heroH, [44, 44, 0, 0]);
  ctx.clip();
  ctx.fillStyle = d.primario;
  ctx.fillRect(tarjeta.x, tarjeta.y, tarjeta.w, heroH);
  ctx.restore();

  const hero = { top: tarjeta.y, bottom: tarjeta.y + heroH, h: heroH };

  /* Logo */
  const imgLogo = await cargarImagen(d.logo);
  const caja = { x: centro - cajaLogo.w / 2, y: hero.top + HERO.padTop, w: cajaLogo.w, h: cajaLogo.h };
  const logo = dibujarLogo(ctx, imgLogo, d, caja, centro);

  /* Nombre y descripción dentro de la franja */
  let y = hero.top + HERO.padTop + cajaLogo.h + HERO.gap;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = FUENTE.nombre;
  for (const linea of nombreM.lineas) { ctx.fillText(linea, centro, y + 44); y += LH.nombre; }
  if (descM) {
    ctx.font = FUENTE.desc;
    ctx.fillStyle = "rgba(255, 255, 255, .9)";
    descM.lineas.forEach((linea, i) => ctx.fillText(linea, centro, y + 36 + i * LH.desc));
  } else {
    ctx.font = FUENTE.vacio;
    ctx.fillStyle = "rgba(255, 255, 255, .75)";
    ctx.fillText("Sin descripción escrita", centro, y + 34);
  }

  /* Servicios */
  let top = contenidoTop;
  ctx.textAlign = "left";
  ctx.fillStyle = d.primario;
  ctx.font = FUENTE.titulo;
  ctx.fillText("Servicios", innerX, top + 34);

  const filasMeta = [];
  let yf = top + 60;
  if (!serv.filas.length) {
    ctx.font = FUENTE.vacio;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Todavía sin servicios escritos", innerX, top + 60 + 30);
  } else {
    for (const f of serv.filas) {
      redondear(ctx, innerX, yf, innerW, f.alto, 16);
      ctx.fillStyle = "#f1f5f9";
      ctx.fill();
      ctx.font = FUENTE.item;
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "left";
      f.lineas.forEach((linea, i) => ctx.fillText(linea, innerX + 26, yf + 48 + i * LH.item));
      ctx.font = FUENTE.precio;
      ctx.fillStyle = d.primario;
      ctx.textAlign = "right";
      ctx.fillText(f.precio || "Consultar", innerX + innerW - 26, yf + 48);
      ctx.textAlign = "left";
      filasMeta.push({ nombre: f.nombre, precio: f.precio || "Consultar", top: yf, bottom: yf + f.alto, lineas: f.lineas.length });
      yf += f.alto + 12;
    }
    yf -= 12;
  }
  const servicios = { top, bottom: top + serv.alto, ultimaFila: yf };

  /* Galería */
  const gy = servicios.bottom + SEP_SECCION;
  ctx.fillStyle = d.primario;
  ctx.font = FUENTE.titulo;
  ctx.textAlign = "left";
  ctx.fillText("Galería", innerX, gy + 34);

  const tilesTop = gy + 60;
  const tiles = [];
  for (let i = 0; i < 3; i += 1) {
    const x = innerX + i * (anchoTile + SEP_TILE);
    /* La muestra se genera con la proporción exacta del recuadro (2× para
       nitidez): `cover` la encaja sin recortar y el texto queda completo. */
    const fuenteFoto = d.fotos[i].src
      || imagenDeMuestra(d.muestra[i].titulo, d.muestra[i].subtitulo, d.primario, d.secundario, i, { ancho: anchoTile * 2, alto: altoImg * 2 });
    const img = await cargarImagen(fuenteFoto);
    ctx.save();
    redondear(ctx, x, tilesTop, anchoTile, altoImg, 16);
    ctx.clip();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(x, tilesTop, anchoTile, altoImg);
    if (img) dibujarAjustada(ctx, img, x, tilesTop, anchoTile, altoImg, "cover");
    ctx.restore();

    /* La marca va en su propia franja BAJO la imagen: nunca encima de un texto. */
    const marca = { y: tilesTop + altoImg + 10, h: 32 };
    const texto = d.fotos[i].propia ? "TU FOTO" : "EJEMPLO";
    ctx.font = FUENTE.marca;
    marca.w = Math.ceil(ctx.measureText(texto).width) + 30;
    marca.x = x + 4;
    redondear(ctx, marca.x, marca.y, marca.w, marca.h, 16);
    ctx.fillStyle = d.fotos[i].propia ? "#0f172a" : "#e2e8f0";
    ctx.fill();
    ctx.fillStyle = d.fotos[i].propia ? "#ffffff" : "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, marca.x + marca.w / 2, marca.y + marca.h / 2 + 1);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    tiles.push({ imagen: { x, y: tilesTop, w: anchoTile, h: altoImg }, marca, texto, propia: d.fotos[i].propia });
  }
  const galeria = { top: gy, bottom: gy + altoGaleria(altoImg) };

  /* Pie */
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = FUENTE.pie;
  ctx.fillText("Demostración creada con el demostrador de KONFÍO ZINC · no publicada", centro, pieTop + 44);
  ctx.font = FUENTE.pieFuerte;
  ctx.fillStyle = d.primario;
  ctx.fillText(d.estilo + " · " + d.primario + " / " + d.secundario, centro, pieTop + 76);

  const meta = {
    ancho: W,
    alto: H,
    estiloId: d.estiloId,
    estilo: d.estilo,
    colores: { primario: d.primario, secundario: d.secundario },
    nombre: d.nombre,
    descripcion: d.descripcion,
    descripcionVacia: !d.descripcion,
    formaLogo: d.formaLogo,
    logo,
    hero,
    secciones: { servicios, galeria },
    servicios: filasMeta,
    serviciosTotales: d.servicios.length,
    tiles,
    pie: { top: pieTop, bottom: tarjeta.y + tarjeta.h },
    tarjeta,
    ajustes: {
      serviciosMostrados: serv.filas.length,
      altoTile: altoImg,
      recortes: cortes.length + (d._descCortada ? 1 : 0)
    },
    avisos
  };
  return { lienzo, avisos, meta };
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
