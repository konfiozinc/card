/* ══════════════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-soluciones-simple.js

   Comprueba en Chromium de verdad que la página pública
   konfiozinc.github.io/card/soluciones.html es la herramienta simple:
   cuatro campos, un permiso, un botón, la Mini Web en vivo — y NADA del
   embudo anterior (industria, recorrido de pasos, cotizador, métricas).

   Uso:  node herramientas/verificar-soluciones-simple.js
   Sale con 0 solo si pasa todo. Saca las capturas a docs/evidencias/.
   ══════════════════════════════════════════════════════════════════════════ */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PLAYWRIGHT = path.join(__dirname, "node_modules/playwright");
const CHROMIUM =
  process.env.KZ_CHROMIUM_PATH ||
  "C:/Users/usuario29/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const PUERTO = Number(process.env.KZ_PUERTO_PRUEBA || 5199);
const SALIDA = path.join(RAIZ, "docs/evidencias/kz-soluciones-simple");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

let pasos = 0;
let fallos = 0;
function comprobar(ok, titulo, detalle) {
  pasos += 1;
  if (ok) {
    console.log(`  OK    ${titulo}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${titulo}${detalle ? " → " + detalle : ""}`);
  }
  return Boolean(ok);
}

const DATOS = {
  negocio: "Brosty Papas",
  whatsapp: "+57 300 555 1212",
  color: "#d97706",
  eslogan: "Papas a la francesa recién hechas"
};

function servir() {
  const servidor = http.createServer((req, res) => {
    const limpio = decodeURIComponent(req.url.split("?")[0]);
    const relativo = limpio === "/" ? "/index.html" : limpio;
    const destino = path.join(RAIZ, relativo);
    if (!destino.startsWith(RAIZ)) {
      res.writeHead(403).end("fuera del sitio");
      return;
    }
    fs.readFile(destino, (err, datos) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("no encontrado");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(destino).toLowerCase()] || "application/octet-stream" });
      res.end(datos);
    });
  });
  return new Promise((listo) => servidor.listen(PUERTO, "127.0.0.1", () => listo(servidor)));
}

(async () => {
  console.log("KONFÍO ZINC · la página pública de soluciones, verificada\n");

  const servidor = await servir();
  const base = `http://127.0.0.1:${PUERTO}`;
  const { chromium } = require(PLAYWRIGHT);
  const navegador = await chromium.launch({ executablePath: CHROMIUM, headless: true });

  try {
    const pagina = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
    const errores = [];
    const fallosRed = [];
    pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    pagina.on("pageerror", (e) => errores.push("pageerror: " + e.message));
    pagina.on("requestfailed", (r) => fallosRed.push(r.url() + " · " + (r.failure() && r.failure().errorText)));
    pagina.on("response", (r) => { if (r.status() >= 400) fallosRed.push(r.url() + " · HTTP " + r.status()); });

    const resp = await pagina.goto(`${base}/soluciones.html`, { waitUntil: "load" });
    comprobar(resp.status() === 200, "la página responde 200");

    // ── 1 · lo que SÍ debe estar ─────────────────────────────────────
    comprobar((await pagina.locator("input:not([type=checkbox])").count()) === 4, "hay exactamente 4 campos");
    comprobar((await pagina.locator("#negocio").count()) === 1, "está el campo del negocio");
    comprobar((await pagina.locator("#whatsapp").count()) === 1, "está el campo del WhatsApp");
    comprobar((await pagina.locator("#color").count()) === 1, "está el campo del color");
    comprobar((await pagina.locator("#eslogan").count()) === 1, "está el campo del eslogan");
    comprobar((await pagina.locator("input[type=checkbox]").count()) === 1, "hay exactamente 1 permiso (el check)");
    comprobar((await pagina.locator("button[type=submit]").count()) === 1, "hay exactamente 1 botón de envío");
    comprobar((await pagina.locator("#pantalla-movil").count()) === 1, "está la vista previa en vivo");
    const etiqueta = (await pagina.locator("button.generar").innerText()).trim();
    comprobar(etiqueta === "Generar mi Mini Web y guardar mis datos", "el botón dice lo acordado", `dice «${etiqueta}»`);

    // ── 2 · lo que NO debe quedar del embudo ─────────────────────────
    const cuerpo = await pagina.content();
    comprobar(!/class="nav-links"/.test(cuerpo), "no quedó el menú de navegación del sitio");
    comprobar((await pagina.locator(".pasos, .paso").count()) === 0, "no quedó el recorrido de pasos");
    comprobar((await pagina.locator(".cotizador, .plan, [data-plan]").count()) === 0, "no quedó el cotizador");
    comprobar((await pagina.locator("#metricas, .metricas").count()) === 0, "no quedaron las métricas de la visita");
    comprobar(!/conversion-015/.test(cuerpo), "no se carga el motor del flujo anterior");
    comprobar(!/Elige tu tipo de negocio|Elegir industria|Tu recorrido/i.test(cuerpo), "no queda el texto del embudo");
    const enlaces = await pagina.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    comprobar(enlaces.filter((h) => h === "index.html").length <= 2, "solo hay salida al inicio (sin menús)", enlaces.join(", "));

    // ── 3 · el espejo en vivo ────────────────────────────────────────
    await pagina.fill("#negocio", DATOS.negocio);
    await pagina.fill("#whatsapp", DATOS.whatsapp);
    await pagina.evaluate((c) => {
      const el = document.getElementById("color");
      el.value = c;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, DATOS.color);
    await pagina.fill("#eslogan", DATOS.eslogan);
    comprobar((await pagina.locator("#demo-nombre").innerText()).trim() === DATOS.negocio, "el nombre se ve en el móvil");
    comprobar((await pagina.locator("#demo-lema").innerText()).trim() === DATOS.eslogan, "el eslogan se ve en el móvil");
    comprobar((await pagina.locator("#demo-logo").innerText()).trim() === "BR", "las iniciales salen del nombre");

    // ── 4 · control negativo: sin el permiso no pasa ─────────────────
    await pagina.click("button.generar");
    await pagina.waitForTimeout(300);
    comprobar(!(await pagina.locator("#listo").evaluate((e) => e.classList.contains("visible"))), "sin marcar el check no aparece el paso de WhatsApp");
    const avisoMalo = (await pagina.locator("#aviso").innerText()).trim();
    comprobar(avisoMalo.length > 0 && /Falta/.test(avisoMalo), "y dice en español qué falta", avisoMalo);
    comprobar(await pagina.evaluate(() => localStorage.getItem("kz-lead-demo-001")) === null, "sin el check no se guarda nada");

    // ── 5 · el camino bueno ─────────────────────────────────────────
    await pagina.check("#autoriza");
    await pagina.click("button.generar");
    await pagina.waitForTimeout(400);
    comprobar(await pagina.locator("#listo").evaluate((e) => e.classList.contains("visible")), "con el check aparece el paso de WhatsApp");
    const avisoBueno = (await pagina.locator("#aviso").innerText()).trim();
    comprobar(/^¡Listo!/.test(avisoBueno), "confirma en pantalla", avisoBueno);
    comprobar(await pagina.locator("body").evaluate((b) => b.classList.contains("publicado")), "la vista previa queda marcada como generada");

    const enlaceWa = await pagina.locator("#enviar").getAttribute("href");
    comprobar(/^https:\/\/wa\.me\/573206411340\?text=/.test(enlaceWa), "el botón de WhatsApp apunta al número de la agencia", enlaceWa && enlaceWa.slice(0, 45));
    const textoWa = decodeURIComponent((enlaceWa || "").split("text=")[1] || "");
    comprobar(textoWa.includes(DATOS.negocio), "el mensaje lleva el nombre del negocio");
    comprobar(textoWa.includes(DATOS.eslogan), "el mensaje lleva el eslogan");
    comprobar(textoWa.includes(DATOS.whatsapp), "el mensaje lleva el WhatsApp del cliente");

    // ── 5b · el mensaje suena a persona, no a ficha ─────────────────
    comprobar(textoWa.includes("*" + DATOS.negocio + "*"), "el nombre del negocio va destacado (negrita de WhatsApp)");
    comprobar(/¿Me ayudas a publicarla\?\s*$/.test(textoWa), "termina con una pregunta directa", textoWa.slice(-40));
    comprobar(!/¿Me la dejamos publicada/.test(textoWa), "ya no habla como un trámite de banco");
    comprobar(!/[•·]/.test(textoWa), "no hay viñetas de lista de campos");
    comprobar(!/#[0-9a-f]{6}\b/i.test(textoWa), "el color no se enseña como código hexadecimal", textoWa.replace(/\n/g, " "));
    comprobar(/mi color de marca es naranja\./.test(textoWa), "el color se dice en palabras (naranja)", textoWa.replace(/\n/g, " "));
    comprobar(/^¡Hola!/.test(textoWa), "empieza con un saludo de persona");

    // El nombre del color, con una batería de colores reales, por el camino de verdad.
    const COLORES = [
      ["#ff0000", "rojo"],
      ["#00ff00", "verde"],
      ["#0000ff", "azul"],
      ["#1f3a5f", "azul marino"],
      ["#ffff00", "amarillo"],
      ["#00ffff", "celeste"],
      ["#800080", "morado"],
      ["#ff69b4", "rosa"],
      ["#000000", "negro"],
      ["#ffffff", "blanco"],
      ["#808080", "gris"]
    ];
    let aciertos = 0;
    const fallados = [];
    for (const [hex, esperado] of COLORES) {
      await pagina.evaluate((c) => {
        const el = document.getElementById("color");
        el.value = c;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, hex);
      const href = await pagina.locator("#enviar").getAttribute("href");
      const texto = decodeURIComponent((href || "").split("text=")[1] || "");
      const dicho = (texto.match(/mi color de marca es ([^.\n]+)\./) || [])[1];
      if (dicho === esperado) aciertos += 1;
      else fallados.push(`${hex} → dijo «${dicho}», se esperaba «${esperado}»`);
    }
    comprobar(aciertos === COLORES.length, `los ${COLORES.length} colores se dicen en palabras`, fallados.join(" · "));

    // El mensaje no se queda viejo si el cliente corrige algo después de generarlo.
    await pagina.fill("#eslogan", DATOS.eslogan + " y punto");
    const trasCorregir = decodeURIComponent(((await pagina.locator("#enviar").getAttribute("href")) || "").split("text=")[1] || "");
    comprobar(trasCorregir.includes("y punto"), "si corrige el eslogan, el mensaje se actualiza solo");
    await pagina.fill("#eslogan", DATOS.eslogan);

    // Se deja el color de la prueba como estaba, para las capturas.
    await pagina.evaluate((c) => {
      const el = document.getElementById("color");
      el.value = c;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, DATOS.color);

    // Guardado local, con el mismo esquema que usa el STUDIO.
    const guardado = await pagina.evaluate(() => {
      const bruto = localStorage.getItem("kz-lead-demo-001");
      return bruto ? JSON.parse(bruto) : null;
    });
    comprobar(guardado && guardado.negocio === DATOS.negocio, "quedó el borrador en este navegador");
    comprobar(guardado && guardado.esquema === "KZ-LEAD-DEMO-001", "con el esquema de la casa");
    comprobar(guardado && guardado.autorizaContacto === true, "y con la autorización registrada");

    // ── 6 · al volver, encuentra lo que escribió ────────────────────
    await pagina.reload({ waitUntil: "load" });
    comprobar((await pagina.inputValue("#negocio")) === DATOS.negocio, "al recargar, el nombre sigue ahí");
    comprobar((await pagina.inputValue("#eslogan")) === DATOS.eslogan, "al recargar, el eslogan sigue ahí");

    // ── 7 · borrar lo guardado ──────────────────────────────────────
    await pagina.click("#borrar");
    const trasBorrar = await pagina.evaluate(() => localStorage.getItem("kz-lead-demo-001"));
    comprobar(trasBorrar === null, "el botón de borrar deja el navegador sin datos");

    // ── 8 · cero ruido ──────────────────────────────────────────────
    comprobar(errores.length === 0, "cero errores en la consola", errores.join(" | "));
    comprobar(fallosRed.length === 0, "cero peticiones fallidas (nada roto)", fallosRed.join(" | "));

    // ── 9 · medidas: que se vea, no solo que exista ─────────────────
    const medidas = await pagina.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { ancho: Math.round(b.width), alto: Math.round(b.height), y: Math.round(b.y) }; };
      return { desborde: document.documentElement.scrollWidth - window.innerWidth, marco: r(".movil__marco"), pantalla: r("#pantalla-movil"), boton: r(".generar"), check: r("#autoriza") };
    });
    comprobar(medidas.desborde <= 1, "sin desborde horizontal en 1366", `${medidas.desborde}px`);
    comprobar(medidas.marco && medidas.marco.ancho >= 300 && medidas.marco.ancho <= 420, "el móvil mide lo de un móvil", medidas.marco && `${medidas.marco.ancho}px`);
    comprobar(medidas.pantalla && medidas.marco && medidas.pantalla.ancho < medidas.marco.ancho, "la pantalla queda dentro del marco");
    comprobar(medidas.boton && medidas.boton.alto >= 44, "el botón es cómodo de pulsar", medidas.boton && `${medidas.boton.alto}px`);
    comprobar(medidas.check && medidas.check.ancho >= 16, "el check se ve", medidas.check && `${medidas.check.ancho}px`);

    // ── 10 · capturas ───────────────────────────────────────────────
    fs.mkdirSync(SALIDA, { recursive: true });
    await pagina.screenshot({ path: path.join(SALIDA, "soluciones-1366.png"), fullPage: true });
    const movil = await navegador.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
    await movil.goto(`${base}/soluciones.html`, { waitUntil: "load" });
    await movil.fill("#negocio", DATOS.negocio);
    await movil.fill("#whatsapp", DATOS.whatsapp);
    await movil.evaluate((c) => { const el = document.getElementById("color"); el.value = c; el.dispatchEvent(new Event("input", { bubbles: true })); }, DATOS.color);
    await movil.fill("#eslogan", DATOS.eslogan);
    await movil.check("#autoriza");
    await movil.click("button.generar");
    await movil.waitForTimeout(400);
    const mMedidas = await movil.evaluate(() => ({ desborde: document.documentElement.scrollWidth - window.innerWidth, boton: Math.round(document.querySelector(".generar").getBoundingClientRect().height) }));
    comprobar(mMedidas.desborde <= 1, "sin desborde horizontal en 375", `${mMedidas.desborde}px`);
    comprobar(mMedidas.boton >= 44, "el botón es grande en el móvil", `${mMedidas.boton}px`);
    await movil.screenshot({ path: path.join(SALIDA, "soluciones-375.png"), fullPage: true });
    console.log(`  capturas: ${SALIDA}`);
  } finally {
    await navegador.close();
    servidor.close();
  }

  console.log(`\n  ${pasos - fallos}/${pasos} comprobaciones OK · ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  console.error("\n  ERROR: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
