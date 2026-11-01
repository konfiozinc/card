/* KZ-CRM-017 · capturas y comprobaciones visuales del panel en 4 tamaños.
   INTERNO: vive en crm-dev/ y no se publica.

   Sirve el repositorio en local (necesario porque el panel referencia
   ../assets/css/kz-tokens.css) y captura el panel real en:
     375×812 · 768×1024 · 1440×900 · 1920×1080

   En cada tamaño comprueba: desbordamiento horizontal, tamaño de los objetivos
   táctiles, contraste de textos clave y visibilidad del formulario.

   Uso: node crm-dev/capturas.cjs
*/

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet/admin/node_modules/@playwright/test");

const RAIZ = path.join(__dirname, "..");
const PUERTO = 8331;
const SALIDA = path.join(__dirname, "capturas");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

const TAMANOS = [
  [375, 812, "movil-375x812"],
  [768, 1024, "tablet-768x1024"],
  [1440, 900, "escritorio-1440x900"],
  [1920, 1080, "escritorio-1920x1080"],
];

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

/* Contraste WCAG AA sobre el fondo efectivo más cercano con fondo opaco. */
function luminancia(r, g, b) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const srv = http.createServer((q, w) => {
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

  const b = await chromium.launch({ executablePath: process.env.RCL_CHROMIUM });
  const URL = `http://127.0.0.1:${PUERTO}/crm/index.html`;

  for (const [w, h, nombre] of TAMANOS) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

    await p.goto(URL, { waitUntil: "networkidle" });
    await p.waitForSelector("#vista-login:not([hidden])", { timeout: 15000 });
    await p.waitForTimeout(500);

    const m = await p.evaluate(() => {
      const colorDe = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { color: cs.color, bg: getComputedStyle(document.body).backgroundColor }; };
      /* Sólo se miden controles VISIBLES: la vista del panel está oculta mientras no
         hay sesión, y medirla daría 0 px y un falso fallo. */
      const visible = (el) => {
        if (el.closest("[hidden]")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const objetivos = [...document.querySelectorAll("button, input, select, textarea, a[href]")]
        .filter(visible)
        .map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, h: Math.round(r.height) }; });
      return {
        desbordamiento: document.documentElement.scrollWidth - window.innerWidth,
        desbordamientoBody: document.body.scrollWidth - window.innerWidth,
        loginVisible: !document.querySelector("#vista-login").hidden,
        botones: objetivos,
        colorH1: colorDe("#vista-login h1"),
        colorNota: colorDe("#vista-login .nota"),
        tokensCargados: getComputedStyle(document.documentElement).getPropertyValue("--kz-cyan").trim(),
      };
    });

    console.log(`\n=== ${w}×${h} (${nombre}) ===`);
    chk("sin desbordamiento horizontal", m.desbordamiento <= 0, m.desbordamiento + "px");
    chk("el body tampoco desborda", m.desbordamientoBody <= 0, m.desbordamientoBody + "px");
    chk("se ve el formulario de acceso", m.loginVisible);
    chk("la paleta oficial está cargada (--kz-cyan)", m.tokensCargados === "#00E5FF", m.tokensCargados || "(vacío)");
    const chicos = m.botones.filter((x) => x.h < 40);
    chk("todos los controles miden al menos 40 px de alto", chicos.length === 0,
      chicos.map((c) => c.tag + ":" + c.h).join(",") || "ninguno");
    chk("sin errores de consola", errs.length === 0, (errs[0] || "limpio").slice(0, 90));

    /* Contraste del texto principal y de la nota frente al fondo del cuerpo. */
    const parse = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
    if (m.colorH1 && m.colorNota) {
      const bg = parse(m.colorH1.bg);
      const Lbg = luminancia(bg[0], bg[1], bg[2]);
      for (const [etiqueta, c] of [["título", m.colorH1], ["nota", m.colorNota]]) {
        const fg = parse(c.color);
        const Lf = luminancia(fg[0], fg[1], fg[2]);
        const ratio = (Math.max(Lf, Lbg) + 0.05) / (Math.min(Lf, Lbg) + 0.05);
        chk("contraste AA del " + etiqueta, ratio >= 4.5, ratio.toFixed(2) + ":1");
      }
    }

    await p.screenshot({ path: path.join(SALIDA, nombre + ".png"), fullPage: true });
    await p.close();
  }

  await b.close(); srv.close();
  console.log("\nRESULTADO VISUAL: PASS " + ok + " · FALLA " + ko);
  console.log("Capturas en crm-dev/capturas/");
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
