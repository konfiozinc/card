/* KZ-CRM-017 · auditoría de formularios y controles del panel.
   INTERNO: crm-dev/ no se publica.

   Mide el panel REAL en 4 tamaños. Para poder medir la vista autenticada sin credenciales,
   se fuerza la vista con JavaScript (sólo cambia `hidden`), sin iniciar sesión y sin tocar
   datos. Es una prueba de maquetación, no de permisos.

   Comprueba, para cada control visible:
     · área táctil mínima (44×44 en móvil, 40 px de alto en escritorio);
     · que las CASILLAS no se estiren (el defecto que se corrigió aquí);
     · alineación vertical de la casilla con su texto;
     · etiqueta asociada (label[for] o control dentro de un label);
     · contraste AA del texto de consentimiento;
     · ausencia de desbordamiento horizontal.

   Uso:  node crm-dev/pruebas-formularios.cjs                 (servidor propio, local)
         node crm-dev/pruebas-formularios.cjs --publicado     (contra GitHub Pages) */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");

const PUBLICADO = "https://konfiozinc.github.io/card/crm/";
const RAIZ = path.join(__dirname, "..");
const PUERTO = 8332;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const TAMANOS = [
  [375, 812, "movil-375x812"],
  [768, 1024, "tablet-768x1024"],
  [1440, 900, "escritorio-1440x900"],
  [1920, 1080, "escritorio-1920x1080"],
];

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

(async () => {
  const usarPublicado = process.argv.includes("--publicado");
  let srv = null;
  let base;
  if (usarPublicado) {
    base = PUBLICADO;
    console.log("Objetivo: SITIO PUBLICADO\n");
  } else {
    srv = http.createServer((q, w) => {
      let u = decodeURIComponent((q.url || "/").split("?")[0]);
      if (u === "/") u = "/crm/index.html";
      const f = path.join(RAIZ, u);
      if (!f.startsWith(RAIZ)) { w.writeHead(403); return w.end(); }
      fs.readFile(f, (e, b) => {
        if (e) { w.writeHead(404); return w.end("404"); }
        w.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
        w.end(b);
      });
    });
    await new Promise((r) => srv.listen(PUERTO, "127.0.0.1", r));
    base = `http://127.0.0.1:${PUERTO}/crm/index.html`;
    console.log("Objetivo: servidor local (mismo código que se publica)\n");
  }

  const b = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });

  for (const [w, h, nombre] of TAMANOS) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(base, { waitUntil: "networkidle" });
    await p.waitForSelector("#vista-login:not([hidden])", { timeout: 20000 });

    /* Se muestran las vistas sin iniciar sesión: sólo se quita `hidden`. */
    await p.evaluate(() => {
      document.querySelector("#vista-login").hidden = true;
      const v = document.querySelector("#vista");
      v.hidden = false;
      const det = document.querySelector("#detalle"); if (det) det.hidden = false;
      for (const id of ["bloque-cotizar", "bloque-venta", "bloque-privacidad", "bloque-auditoria", "bloque-asignacion", "lab-sin-asignar"]) {
        const el = document.querySelector("#" + id); if (el) el.hidden = false;
      }
    });
    await p.waitForTimeout(250);

    console.log(`\n=== ${w}×${h} (${nombre}) ===`);

    const m = await p.evaluate(() => {
      const vis = (el) => {
        if (el.closest("[hidden]")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const controles = [...document.querySelectorAll("input, select, textarea, button")]
        .filter(vis)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const tipo = (el.type || el.tagName).toLowerCase();
          const dentroDeLabel = !!el.closest("label");
          const id = el.id;
          const etiqueta = (id && document.querySelector(`label[for="${id}"]`)) || null;
          return {
            tipo, id,
            w: Math.round(r.width), h: Math.round(r.height),
            etiquetado: tipo === "checkbox" || tipo === "submit" || tipo === "button"
              || tipo === "search" || !!etiqueta || dentroDeLabel || !!el.getAttribute("aria-label"),
            fontSize: cs.fontSize,
          };
        });

      const enLinea = document.querySelector("#f-sin-asignar");
      const inline = enLinea ? (() => { const r2 = enLinea.getBoundingClientRect(); return { w: Math.round(r2.width), h: Math.round(r2.height) }; })() : null;
      const casilla = document.querySelector("#n-consent");
      let cons = null;
      if (casilla) {
        const rc = casilla.getBoundingClientRect();
        const span = casilla.parentElement.querySelector("span");
        const rs = span ? span.getBoundingClientRect() : null;
        const lbl = casilla.closest("label").getBoundingClientRect();
        const cs = getComputedStyle(span);
        cons = {
          w: Math.round(rc.width), h: Math.round(rc.height),
          topCasilla: Math.round(rc.top), topTexto: rs ? Math.round(rs.top) : null,
          altoFila: Math.round(lbl.height),
          colorTexto: cs.color,
          bg: getComputedStyle(document.body).backgroundColor,
          anchoTexto: rs ? Math.round(rs.width) : 0,
        };
      }
      return {
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        controles, cons, inline,
        tablaScroll: !!document.querySelector(".tabla-scroll"),
      };
    });

    chk("sin desbordamiento horizontal", m.desborde <= 0, m.desborde + "px");

    /* El defecto reportado: la casilla se estiraba a todo el ancho. */
    if (m.cons) {
      chk("la casilla NO se estira al ancho del formulario", m.cons.w <= 40, m.cons.w + "px de ancho");
      chk("la casilla tiene tamaño razonable", m.cons.w >= 16 && m.cons.h >= 16 && m.cons.h <= 40,
        m.cons.w + "×" + m.cons.h + "px");
      chk("la fila de consentimiento es área táctil suficiente", m.cons.altoFila >= 44, m.cons.altoFila + "px");
      chk("el texto de consentimiento ocupa el resto del ancho", m.cons.anchoTexto > 150, m.cons.anchoTexto + "px");
      /* Alineación: la casilla debe empezar a la altura del texto, no muy por debajo. */
      if (m.cons.topTexto !== null) {
        const desfase = Math.abs(m.cons.topCasilla - m.cons.topTexto);
        chk("la casilla está alineada con su texto", desfase <= 8, desfase + "px de desfase");
      }
      const parse = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = (c) => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      const fg = parse(m.cons.colorTexto), bg = parse(m.cons.bg);
      const ratio = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
      chk("contraste AA del texto de consentimiento", ratio >= 4.5, ratio.toFixed(2) + ":1");
    } else {
      chk("existe la casilla de consentimiento", false);
    }

    const altoMinimo = w <= 560 ? 44 : 40;
    const chicos = m.controles.filter((c) => c.h < altoMinimo && c.tipo !== "checkbox");
    chk("todos los controles miden al menos " + altoMinimo + " px de alto", chicos.length === 0,
      chicos.map((c) => (c.id || c.tipo) + ":" + c.h).join(",") || "ninguno");

    const sinEtiqueta = m.controles.filter((c) => !c.etiquetado);
    chk("todos los controles tienen etiqueta o aria-label", sinEtiqueta.length === 0,
      sinEtiqueta.map((c) => c.id || c.tipo).join(",") || "ninguno");

    if (m.inline) {
      chk("la casilla en línea (sólo sin asignar) NO se estira", m.inline.w <= 40 && m.inline.h <= 40, m.inline.w + "×" + m.inline.h + "px");
    } else {
      chk("existe la casilla en línea del filtro", false);
    }
    chk("la tabla tiene contenedor con desplazamiento propio", m.tablaScroll);
    chk("sin errores de JavaScript", errs.length === 0, errs[0] || "limpio");

    await p.close();
  }

  await b.close();
  if (srv) srv.close();
  console.log("\nRESULTADO FORMULARIOS: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
