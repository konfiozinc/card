/* KZ-CONVERSION-015 · lógica del sistema comercial interactivo.
   Reglas de honestidad que este archivo respeta:
   - Nada se declara "vendido" ni "confirmado": solo "solicitud preparada".
   - No se envían pedidos a negocios reales: las demostraciones son ficticias.
   - Los precios salen del catálogo oficial de la agencia (49.900 / 99.900) o se
     marcan como "requiere evaluación humana". No se inventan descuentos.
   - Los datos del formulario solo salen del navegador si la persona los envía
     por WhatsApp, y únicamente con consentimiento explícito. */
"use strict";

(function () {
  const PRECIOS = { basica: 49900, pro: 99900 };
  const WA = "573206411340"; // número público de la agencia (mismo que usa el sitio)

  const INDUSTRIAS = {
    restaurantes: { nombre: "Restaurantes y cafeterías", solucion: "Menú o catálogo digital", demo: "menu", porque: "un menú que se actualiza sin reimprimir y pedidos por WhatsApp." },
    belleza: { nombre: "Belleza y bienestar", solucion: "Tarjeta digital + Mini Web", demo: "tarjeta", porque: "un enlace que se comparte por redes y agenda por WhatsApp." },
    profesionales: { nombre: "Profesionales independientes", solucion: "Tarjeta digital", demo: "tarjeta", porque: "tus datos, servicios y contacto en un solo enlace profesional." },
    comercios: { nombre: "Comercios y tiendas", solucion: "Catálogo digital", demo: "menu", porque: "vitrina ordenada por categorías, con consulta directa por WhatsApp." },
    empresas: { nombre: "Servicios empresariales", solucion: "Mini Web empresarial", demo: "miniweb", porque: "presencia propia con servicios, alcance y formulario de contacto." },
  };

  const DEMOS = { tarjeta: "Tarjeta digital interactiva", menu: "Menú o catálogo comercial", miniweb: "Mini Web empresarial" };

  const estado = {
    industria: null,
    demoVista: "tarjeta",
    demoProbada: false,
    alcanceVisto: false,
    plan: null,
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const pesos = (n) => "$" + Number(n).toLocaleString("es-CO");
  const evento = (nombre, extra) => {
    try { if (typeof window.gtag === "function") window.gtag("event", nombre, Object.assign({ transporte: "kz-conversion-015" }, extra || {})); } catch (e) {}
  };

  /* ---------- selector de industria ---------- */
  function pintarIndustrias() {
    const cont = $("#industrias");
    cont.innerHTML = Object.entries(INDUSTRIAS).map(([id, v]) => (
      '<button type="button" class="industria" role="button" aria-pressed="false" data-industria="' + id + '">' +
      "<b>" + v.nombre + "</b><span>" + v.solucion + "</span></button>"
    )).join("");
    cont.addEventListener("click", (e) => {
      const b = e.target.closest("[data-industria]");
      if (!b) return;
      elegirIndustria(b.dataset.industria);
    });
  }

  function elegirIndustria(id) {
    const info = INDUSTRIAS[id];
    if (!info) return;
    estado.industria = id;
    $$(".industria").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.industria === id)));
    $("#reco").innerHTML = "<b>Solución sugerida para " + info.nombre + ": " + info.solucion + ".</b> " +
      "La elegimos porque " + info.porque + " Puedes probarla abajo antes de pedir nada.";
    verDemo(info.demo);
    actualizarPasos();
    evento("kz_industria_elegida", { industria: id });
  }

  /* ---------- demostraciones ---------- */
  function verDemo(clave) {
    if (!DEMOS[clave]) return;
    estado.demoVista = clave;
    $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.demo === clave)));
    $$(".demo").forEach((d) => { d.hidden = d.dataset.demo !== clave; });
    evento("kz_demo_vista", { demo: clave });
  }

  function marcaProbada() {
    estado.demoProbada = true;
    actualizarPasos();
    evento("kz_demo_iniciada", { demo: estado.demoVista });
  }

  function initTarjeta() {
    const vcf = () => [
      "BEGIN:VCARD", "VERSION:3.0",
      "FN:Valentina Ríos (demostración)",
      "ORG:Estudio Aurora · datos ficticios",
      "TEL;TYPE=CELL:+573000000000",
      "EMAIL:valentina@ejemplo.test",
      "END:VCARD",
    ].join("\r\n");

    $("#tdc-guardar").addEventListener("click", () => {
      marcaProbada();
      const blob = new Blob([vcf()], { type: "text/vcard;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "contacto-demostracion.vcf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      avisar("ok", "Descargaste una tarjeta de contacto de ejemplo (.vcf). En un cliente real, tus datos saldrían aquí.");
      evento("kz_demo_completada", { demo: "tarjeta", accion: "descarga_vcf" });
    });

    $("#tdc-compartir").addEventListener("click", async () => {
      marcaProbada();
      const url = location.origin + location.pathname + "#demo-tarjeta";
      try {
        if (navigator.share) { await navigator.share({ title: "Tarjeta digital (demostración)", url: url }); avisar("ok", "Compartida con el menú del sistema."); }
        else { await navigator.clipboard.writeText(url); avisar("ok", "Enlace de la demostración copiado al portapapeles."); }
        evento("kz_demo_completada", { demo: "tarjeta", accion: "compartir" });
      } catch (e) { avisar("info", "No se pudo compartir automáticamente; el enlace es " + url); }
    });
  }

  const MENU_DEMO = [
    { id: "d1", nombre: "Bowl de la casa", desc: "Demostración · datos ficticios", precio: 18900 },
    { id: "d2", nombre: "Limonada de coco", desc: "Demostración · datos ficticios", precio: 7900 },
    { id: "d3", nombre: "Postre de temporada", desc: "Demostración · datos ficticios", precio: 9600 },
  ];
  const carrito = {};

  function initMenu() {
    const cont = $("#menu-items");
    cont.innerHTML = MENU_DEMO.map((p) => (
      '<div class="menu-demo__item"><div><div class="nom">' + p.nombre + '</div><div class="desc">' + p.desc + '</div></div>' +
      '<div><span class="pz">' + pesos(p.precio) + '</span> ' +
      '<button type="button" class="btn" data-agregar="' + p.id + '" aria-label="Agregar ' + p.nombre + ' a la demostración">+</button></div></div>'
    )).join("");
    cont.addEventListener("click", (e) => {
      const b = e.target.closest("[data-agregar]");
      if (!b) return;
      marcaProbada();
      sumar("demo_iniciada");
      carrito[b.dataset.agregar] = (carrito[b.dataset.agregar] || 0) + 1;
      pintarMenu();
    });
    pintarMenu();
  }

  function pintarMenu() {
    const total = MENU_DEMO.reduce((s, p) => s + (carrito[p.id] || 0) * p.precio, 0);
    const n = Object.values(carrito).reduce((s, c) => s + c, 0);
    $("#menu-total").textContent = pesos(total);
    $("#menu-cuenta").textContent = n + (n === 1 ? " producto" : " productos");
    $("#menu-limpiar").disabled = n === 0;
  }

  function initMiniweb() {
    const aplicar = () => {
      const nombre = ($("#mw-nombre").value || "Tu negocio").slice(0, 40);
      const acento = $("#mw-acento").value;
      const fondo = $("#mw-fondo").value;
      const vista = $("#mw-vista");
      vista.style.setProperty("--mw-acento", acento);
      vista.style.setProperty("--mw-fondo", fondo);
      $("#mw-titulo").textContent = nombre;
      const claro = (() => { const c = fondo.replace("#", ""); const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16); return (0.2126*r + 0.7152*g + 0.0722*b) > 140; })();
      vista.classList.toggle("mw--clara", claro);
      $("#mw-texto").textContent = "Plantilla «" + $("#mw-plantilla").value + "» · vista previa de demostración con datos ficticios.";
      evento("kz_demo_completada", { demo: "miniweb", accion: "personalizar" });
      sumar("demo_completada");
      pintarMenu();
    };
    ["#mw-nombre", "#mw-acento", "#mw-fondo", "#mw-plantilla"].forEach((sel) => {
      const el = $(sel);
      el.addEventListener("input", () => { marcaProbada(); sumar("demo_iniciada"); aplicar(); });
      el.addEventListener("change", () => { marcaProbada(); sumar("demo_iniciada"); aplicar(); });
    });
    aplicar();
  }

  /* ---------- recorrido ---------- */
  function actualizarPasos() {
    const pasos = [
      ["paso-industria", !!estado.industria],
      ["paso-demo", estado.demoProbada],
      ["paso-alcance", estado.alcanceVisto],
      ["paso-cotiza", !!estado.plan],
      ["paso-solicitud", estado.solicitudPreparada === true],
    ];
    pasos.forEach(([id, hecho]) => { const el = document.getElementById(id); if (el) el.classList.toggle("hecho", hecho); });
    const n = pasos.filter((p) => p[1]).length;
    $("#progreso").textContent = n + " de 5 pasos completados";
    evento("kz_recorrido_paso", { pasos: n });
  }

  /* ---------- cotizador ---------- */
  function initCotizador() {
    $("#planes").addEventListener("click", (e) => {
      const b = e.target.closest("[data-plan]");
      if (!b) return;
      estado.plan = b.dataset.plan;
      $$(".plan").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.plan === estado.plan)));
      pintarCotiza();
      actualizarPasos();
      evento("kz_cotizacion_solicitada", { plan: estado.plan });
      sumar("cotizacion");
    });
    pintarCotiza();
  }

  function pintarCotiza() {
    const caja = $("#cotiza-resumen");
    if (!estado.plan) { caja.innerHTML = "Elige un servicio para ver su precio oficial."; return; }
    if (estado.plan === "medida") {
      caja.innerHTML = "<b>A medida</b><br>Los proyectos personalizados no tienen precio de lista: se evalúan contigo. " +
        "No mostramos una cifra inventada. Deja tus datos y te contactamos con una propuesta real.<br>" +
        "<strong>Requiere evaluación humana.</strong>";
      return;
    }
    const precio = PRECIOS[estado.plan];
    caja.innerHTML = "<b>" + (estado.plan === "basica" ? "Mini Web Básica" : "Mini Web Pro") + "</b><br>" +
      "Precio oficial: <strong>" + pesos(precio) + " COP</strong> · pago único.<br>" +
      "Descuentos de distribuidor y comisiones no se aplican aquí: se gestionan aparte según la política de aliados. " +
      "Este valor es informativo y no confirma una compra.";
  }

  /* ---------- solicitud ---------- */
  function initFormulario() {
    $("#form-sol").addEventListener("submit", (e) => {
      e.preventDefault();
      const nombre = $("#f-nombre").value.trim();
      const tel = $("#f-tel").value.replace(/[^\d]/g, "");
      const consent = $("#f-consent").checked;
      limpiarErrores();
      let ok = true;
      if (nombre.length < 2) { error("f-nombre", "Escribe tu nombre (mínimo 2 letras)."); ok = false; }
      if (tel.length < 10 || tel.length > 15) { error("f-tel", "El WhatsApp debe tener entre 10 y 15 dígitos."); ok = false; }
      if (!estado.industria) { avisar("err", "Elige primero tu tipo de negocio."); ok = false; }
      if (!estado.plan) { error("f-consent", "Elige un servicio en el cotizador para que sepamos qué cotizar."); ok = false; }
      if (!consent) { error("f-consent", "Necesitamos tu autorización para contactarte."); ok = false; }
      if (!ok) { avisar("err", "Revisa los campos marcados."); return; }

      estado.solicitudPreparada = true;
      actualizarPasos();

      const plan = estado.plan === "basica" ? "Mini Web Básica ($49.900)" : estado.plan === "pro" ? "Mini Web Pro ($99.900)" : "Proyecto a medida (evaluación)";
      const texto = [
        "Hola, soy " + nombre + ".",
        "Tipo de negocio: " + INDUSTRIAS[estado.industria].nombre + ".",
        "Servicio de interés: " + plan + ".",
        "Vi la demostración de " + DEMOS[estado.demoVista] + " en el sitio.",
        "Mi WhatsApp: " + tel,
      ].join("\n");

      // Registro local con consentimiento, solo en este navegador (no hay CRM publicado).
      try {
        const clave = "kz-leads-local-v1";
        const lista = JSON.parse(localStorage.getItem(clave) || "[]");
        lista.push({ nombre: nombre, telefono: tel, industria: estado.industria, plan: estado.plan, consentimiento: true, enviado: false, ambito: "borrador_local", fecha: new Date().toISOString() });
        localStorage.setItem(clave, JSON.stringify(lista.slice(-50)));
      } catch (err) { /* modo privado: seguimos sin guardar */ }

      const url = "https://wa.me/" + WA + "?text=" + encodeURIComponent(texto);
      avisar("info", 'Solicitud preparada: guardamos un <b>borrador en este navegador</b> y abrimos WhatsApp con el mensaje escrito. ' +
        '<b>La agencia todavía no ha recibido nada</b>: no queda confirmado hasta que tú lo envíes y nosotros respondamos. ' +
        'Si no abre, <a href="' + url + '" target="_blank" rel="noopener">toca aquí</a>.');
      window.open(url, "_blank", "noopener");
      evento("kz_lead_registrado", { industria: estado.industria, plan: estado.plan });
      sumar("solicitud");
      pintarMetricas();
    });
    $("#f-consent").addEventListener("change", () => error("f-consent", ""));
    $("#f-borrar").addEventListener("click", () => {
      try { localStorage.removeItem("kz-leads-local-v1"); localStorage.removeItem("kz-metricas-local-v1"); } catch (e) {}
      pintarMetricas();
      avisar("ok", "Listo: se borraron el borrador de tu solicitud y los contadores de este navegador.");
    });

    // pestañas: flechas izquierda/derecha y activación con Enter/Espacio
    const tabs = Array.from(document.querySelectorAll(".tab"));
    tabs.forEach((t, i) => {
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const j = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          tabs[j].focus();
          verDemo(tabs[j].dataset.demo);
        }
      });
    });
    // enlace directo a una demostración (#demo-menu, #demo-miniweb…)
    const hash = (location.hash || "").replace("#", "");
    if (DEMOS[hash]) verDemo(hash);
    else if (hash === "demo-menu") verDemo("menu");
    else if (hash === "demo-miniweb") verDemo("miniweb");
  }

  function error(id, msg) {
    const el = document.getElementById("err-" + id);
    if (el) el.textContent = msg || "";
    const campo = document.getElementById(id);
    if (campo) campo.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function limpiarErrores() { ["f-nombre", "f-tel", "f-consent"].forEach((id) => error(id, "")); }
  function avisar(tipo, html) {
    const caja = $("#estado-sol");
    caja.className = "estado-sol " + tipo;
    caja.innerHTML = html;
  }

  /* ---------- métricas locales (sin backend) ---------- */
  function leerMetricas() {
    try { return JSON.parse(localStorage.getItem("kz-metricas-local-v1") || "{}"); } catch (e) { return {}; }
  }
  function sumar(nombre) {
    const m = leerMetricas();
    m[nombre] = (m[nombre] || 0) + 1;
    try { localStorage.setItem("kz-metricas-local-v1", JSON.stringify(m)); } catch (e) {}
    pintarMetricas();
  }
  function pintarMetricas() {
    const m = leerMetricas();
    const caja = $("#metricas");
    if (!caja) return;
    const filas = [
      ["demo_iniciada", "Demostraciones iniciadas"],
      ["demo_completada", "Demostraciones completadas"],
      ["cotizacion", "Cotizaciones elegidas"],
      ["solicitud", "Solicitudes preparadas"],
    ];
    caja.textContent = "";
    filas.forEach(([k, etiqueta]) => {
      const valor = Number.isInteger(m[k]) && m[k] >= 0 ? m[k] : 0;
      const cajaFila = document.createElement("div");
      cajaFila.className = "metrica";
      const fuerte = document.createElement("b");
      fuerte.textContent = String(valor);
      const label = document.createElement("span");
      label.textContent = etiqueta;
      cajaFila.append(fuerte, label);
      caja.appendChild(cajaFila);
    });
  }

  /* ---------- arranque ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    pintarIndustrias();
    $$(".tab").forEach((t) => t.addEventListener("click", () => verDemo(t.dataset.demo)));
    initTarjeta();
    initMenu();
    initMiniweb();
    initCotizador();
    initFormulario();
    $("#menu-limpiar").addEventListener("click", () => {
      Object.keys(carrito).forEach((k) => delete carrito[k]);
      pintarMenu();
      evento("kz_demo_completada", { demo: "menu", accion: "limpiar" });
    });
    $("#alcance").addEventListener("change", (e) => { estado.alcanceVisto = e.target.checked; actualizarPasos(); });
    actualizarPasos();
    pintarMetricas();
    const params = new URLSearchParams(location.search);
    if (params.get("industria") && INDUSTRIAS[params.get("industria")]) elegirIndustria(params.get("industria"));
    evento("kz_soluciones_vista");
  });

  // Hook de métricas expuesto para pruebas y para sumar desde otras páginas.
  window.KZConversion = { estado: estado, INDUSTRIAS: INDUSTRIAS, PRECIOS: PRECIOS, sumar: sumar };
})();
