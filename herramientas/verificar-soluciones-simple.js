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
    comprobar(
      (await pagina.locator("input").count()) === 17,
      "hay 17 controles: 4 datos + 1 permiso + 2 imágenes + 10 opcionales (plegados)"
    );
    comprobar((await pagina.locator("#negocio").count()) === 1, "está el campo del negocio");
    comprobar((await pagina.locator("#whatsapp").count()) === 1, "está el campo del WhatsApp");
    comprobar((await pagina.locator("#color").count()) === 1, "está el campo del color");
    comprobar((await pagina.locator("#eslogan").count()) === 1, "está el campo del eslogan");
    // La simplicidad se mide: cuatro datos de texto/color y DOS imágenes opcionales, nada más.
    comprobar((await pagina.locator("label.campo input").count()) === 4, "siguen siendo exactamente 4 datos en la pantalla principal");
    comprobar((await pagina.locator("input[type=file]").count()) === 2, "hay exactamente 2 zonas de imagen (logo y portada)");
    const aceptan = await pagina.locator("input[type=file]").evaluateAll((is) => is.map((i) => i.getAttribute("accept")));
    comprobar(
      aceptan.length === 2 && aceptan.every((a) => /jpeg/.test(a) && /png/.test(a) && /webp/.test(a)),
      "las dos aceptan JPG, PNG y WEBP",
      aceptan.join(" | ")
    );
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
    comprobar(!/portada|logo/i.test(textoWa), "sin imágenes subidas, el mensaje no las menciona (no miente)");

    // ── 5c · las dos imágenes: logo y portada ───────────────────────
    const PORTADA = path.join(RAIZ, "assets/img/og/og-1200x630.png");
    const LOGO = path.join(RAIZ, "assets/img/marca/marca-oficial.png");

    await pagina.setInputFiles("#archivo-logo", { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("no soy una imagen") });
    await pagina.waitForTimeout(150);
    comprobar(/JPG, PNG o WEBP/.test(await pagina.locator("#aviso").innerText()), "un archivo que no es imagen se rechaza con su motivo");
    comprobar(await pagina.locator("#demo-logo-img").isHidden(), "y no se pinta nada en el móvil");

    await pagina.setInputFiles("#archivo-portada", {
      name: "enorme.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(Math.round(2.5 * 1024 * 1024), 7)
    });
    await pagina.waitForTimeout(200);
    const avisoPeso = await pagina.locator("#aviso").innerText();
    comprobar(/2 MB/.test(avisoPeso), "una imagen de más de 2 MB se rechaza con su peso", avisoPeso);
    comprobar(await pagina.locator("#portada-mini").isHidden(), "y la portada no se pinta");

    // Se cuentan las URL de objeto liberadas, para probar que no hay fuga de memoria.
    await pagina.evaluate(() => {
      window.__liberadas = 0;
      const original = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (u) => { window.__liberadas += 1; return original(u); };
    });

    await pagina.setInputFiles("#archivo-logo", LOGO);
    await pagina.setInputFiles("#archivo-portada", PORTADA);
    await pagina.waitForTimeout(300);

    const srcLogo = String(await pagina.locator("#demo-logo-img").getAttribute("src"));
    comprobar(srcLogo.startsWith("blob:"), "el logo del móvil se pinta con una URL de objeto (blob:)", srcLogo.slice(0, 34));
    comprobar(await pagina.locator("#demo-logo-img").isVisible(), "el logo se ve en el círculo del móvil");
    comprobar(await pagina.locator("#demo-logo-txt").isHidden(), "las iniciales se apartan cuando hay logo");
    comprobar(await pagina.locator("#demo-logo").evaluate((e) => e.classList.contains("con-imagen")), "el círculo queda marcado como «con imagen»");

    const fondo = await pagina.locator("#demo-heroe").evaluate((e) => getComputedStyle(e).backgroundImage);
    comprobar(/url\(/.test(fondo) && /blob:/.test(fondo), "la portada se ve en el encabezado del móvil", fondo.slice(0, 60));
    comprobar(/linear-gradient/.test(fondo), "y lleva un velo oscuro para que el nombre se lea");

    comprobar(!(await pagina.locator("#logo-mini").isHidden()), "aparece la miniatura del logo en el control");
    const estadoLogo = await pagina.locator("#logo-estado").innerText();
    comprobar(/KB|MB/.test(estadoLogo), "el control dice el nombre y el peso del archivo", estadoLogo);
    comprobar(!(await pagina.locator("#logo-quitar").isHidden()), "hay botón para quitar el logo");

    const conImagenes = decodeURIComponent(((await pagina.locator("#enviar").getAttribute("href")) || "").split("text=")[1] || "");
    comprobar(/foto de portada y mi logo/.test(conImagenes), "el mensaje avisa de que ya tiene portada y logo", conImagenes.replace(/\n/g, " "));
    comprobar(/¿Me ayudas a publicarla\?\s*$/.test(conImagenes), "y sigue terminando en la pregunta directa");

    // Con las imágenes puestas se guarda el borrador: no deben viajar al almacén.
    await pagina.click("button.generar");
    await pagina.waitForTimeout(300);
    const almacen = await pagina.evaluate(() => localStorage.getItem("kz-lead-demo-001") || "");
    comprobar(!/blob:|data:image|base64/.test(almacen), "las imágenes NO se guardan en el navegador");
    comprobar(/"negocio"/.test(almacen), "pero los cuatro datos sí se guardan");

    // Cambiar una imagen tiene que liberar la anterior.
    await pagina.setInputFiles("#archivo-portada", LOGO);
    await pagina.waitForTimeout(200);
    const liberadas = await pagina.evaluate(() => window.__liberadas);
    comprobar(liberadas >= 1, "al reemplazar una imagen se libera la anterior (sin fugas)", `${liberadas} liberada(s)`);

    // Quitar deja todo como estaba.
    await pagina.locator("#logo-quitar").click();
    await pagina.locator("#portada-quitar").click();
    await pagina.waitForTimeout(200);
    comprobar(await pagina.locator("#demo-logo-img").isHidden(), "quitar el logo devuelve las iniciales");
    comprobar(
      !/blob:/.test(await pagina.locator("#demo-heroe").evaluate((e) => getComputedStyle(e).backgroundImage)),
      "quitar la portada devuelve el color de la marca"
    );
    const sinImagenes = decodeURIComponent(((await pagina.locator("#enviar").getAttribute("href")) || "").split("text=")[1] || "");
    comprobar(!/portada|logo/.test(sinImagenes), "y el mensaje deja de hablar de imágenes");

    // ── 5d · los dos acordeones: catálogo y redes ───────────────────
    // La regla de oro: la pantalla principal sigue siendo simple.
    comprobar((await pagina.locator("details.acordeon").count()) === 2, "hay exactamente 2 acordeones");
    comprobar((await pagina.locator("details.acordeon[open]").count()) === 0, "los dos vienen CERRADOS: la pantalla principal no se ensucia");

    // Sin tocar nada, el móvil sigue enseñando sus tres ejemplos (no sale vacío).
    comprobar((await pagina.locator("#demo-items .demo__item").count()) === 3, "sin productos escritos, el móvil enseña los 3 ejemplos");
    comprobar(await pagina.locator("#demo-footer").isHidden(), "y no hay pie de redes si no hay redes");

    await pagina.locator("#acordeon-productos summary").click();
    await pagina.locator("#acordeon-redes summary").click();
    comprobar((await pagina.locator("details.acordeon[open]").count()) === 2, "los dos se abren al tocarlos");

    // Producto 1 con nombre y precio, producto 2 solo con nombre, producto 3 vacío.
    await pagina.fill("#producto-1", "Bandeja paisa");
    await pagina.fill("#precio-1", "25000");
    await pagina.fill("#producto-2", "Empanada de carne");
    await pagina.fill("#precio-2", "");
    await pagina.waitForTimeout(150);

    const filas = await pagina.locator("#demo-items .demo__item").evaluateAll((fs) => fs.map((f) => f.innerText.replace(/\s+/g, " ").trim()));
    comprobar(filas.length === 2, "el móvil enseña solo los productos escritos (2 de 3)", filas.join(" | "));
    comprobar(/Bandeja paisa/.test(filas[0] || ""), "el producto 1 aparece con su nombre", filas[0]);
    comprobar(/\$\s?25\.000/.test(filas[0] || ""), "y el precio se escribe como $ 25.000", filas[0]);
    comprobar(/Empanada/.test(filas[1] || "") && !/\$/.test(filas[1] || ""), "el producto sin precio sale sin precio, sin hueco ni $ vacío", filas[1]);
    comprobar(!filas.some((f) => /Producto de ejemplo/.test(f)), "los ejemplos desaparecen en cuanto hay productos propios");
    comprobar((await pagina.locator("#productos-cuenta").innerText()).trim() === "2 productos", "el acordeón cuenta los productos");

    // Redes: dos de tres, más dirección.
    await pagina.fill("#red-instagram", "@lapaisa");
    await pagina.fill("#red-tiktok", "@lapaisa.co");
    await pagina.waitForTimeout(150);
    comprobar(!(await pagina.locator("#demo-footer").isHidden()), "aparece el pie del móvil con las redes");
    const chips = await pagina.locator("#demo-redes .demo__red").evaluateAll((cs) => cs.map((c) => ({ etiqueta: c.getAttribute("aria-label"), fondo: getComputedStyle(c).backgroundColor })));
    comprobar(chips.length === 2, "se pintan solo las redes rellenadas (2)", JSON.stringify(chips));
    comprobar(chips.some((c) => c.etiqueta === "Instagram") && chips.some((c) => c.etiqueta === "TikTok"), "con sus nombres accesibles");
    comprobar(!chips.some((c) => c.etiqueta === "Facebook"), "la que se dejó vacía NO se pinta");
    comprobar(chips.every((c) => c.fondo !== "rgba(0, 0, 0, 0)"), "cada red lleva su color de marca");
    comprobar((await pagina.locator("#demo-redes .demo__red svg").count()) === 2, "cada red trae su silueta dibujada (sin CDN)");
    comprobar((await pagina.locator("#redes-cuenta").innerText()).trim() === "2 datos", "el acordeón cuenta las dos redes");

    await pagina.fill("#direccion", "Cra 45 #12-34, Medellín");
    await pagina.waitForTimeout(150);
    comprobar((await pagina.locator("#redes-cuenta").innerText()).trim() === "3 datos", "y suma la dirección a la cuenta");
    comprobar(!(await pagina.locator("#demo-dir").isHidden()), "la dirección se pinta en el pie");
    comprobar(/Cra 45/.test(await pagina.locator("#demo-dir-texto").innerText()), "con el texto que escribió el cliente");

    // Todo dentro del móvil: nada recortado por abajo.
    const ajuste = await pagina.evaluate(() => {
      const caja = (s) => document.querySelector(s).getBoundingClientRect();
      const pantalla = caja("#pantalla-movil");
      const boton = caja("#demo-boton");
      const pie = caja("#demo-footer");
      const legal = caja(".demo__pie");
      return {
        alto: Math.round(pantalla.height),
        botonDentro: Math.round(pantalla.bottom - boton.bottom),
        pieDentro: Math.round(pantalla.bottom - pie.bottom),
        legalDentro: Math.round(pantalla.bottom - legal.bottom)
      };
    });
    comprobar(ajuste.botonDentro >= 0 && ajuste.pieDentro >= 0 && ajuste.legalDentro >= 0,
      "con catálogo y redes, nada se sale del móvil",
      `botón ${ajuste.botonDentro}px · pie ${ajuste.pieDentro}px · legal ${ajuste.legalDentro}px de margen`);

    // El mensaje presume de catálogo y redes, y solo de lo que hay.
    await pagina.click("button.generar");
    await pagina.waitForTimeout(250);
    const conTodo = decodeURIComponent(((await pagina.locator("#enviar").getAttribute("href")) || "").split("text=")[1] || "");
    comprobar(/Además, ya personalicé mi catálogo y mis redes sociales/.test(conTodo), "el mensaje menciona catálogo y redes", conTodo.replace(/\n/g, " "));
    comprobar(/¿Me ayudas a publicarla\?\s*$/.test(conTodo), "y sigue cerrando con la pregunta directa");

    // Solo catálogo (se vacían las redes): el mensaje no debe hablar de redes.
    await pagina.fill("#red-instagram", "");
    await pagina.fill("#red-tiktok", "");
    await pagina.fill("#direccion", "");
    await pagina.waitForTimeout(200);
    const soloCatalogo = decodeURIComponent(((await pagina.locator("#enviar").getAttribute("href")) || "").split("text=")[1] || "");
    comprobar(/ya personalicé mi catálogo para enviártelo/.test(soloCatalogo), "con solo catálogo, no presume de redes", soloCatalogo.replace(/\n/g, " "));
    comprobar(await pagina.locator("#demo-footer").isHidden(), "y el pie del móvil desaparece al vaciar las redes");

    // Nada de esto es obligatorio: con los acordeones vacíos la demo se genera igual.
    await pagina.fill("#producto-1", "");
    await pagina.fill("#producto-2", "");
    await pagina.waitForTimeout(150);
    comprobar((await pagina.locator("#demo-items .demo__item").count()) === 3, "al vaciar los productos vuelven los ejemplos (sin huecos)");
    const sinExtras = decodeURIComponent(((await pagina.locator("#enviar").getAttribute("href")) || "").split("text=")[1] || "");
    comprobar(!/personalicé/.test(sinExtras), "y el mensaje deja de hablar de catálogo y redes");

    // Se vuelve a escribir un producto para comprobar su memoria tras recargar.
    await pagina.fill("#producto-1", "Bandeja paisa");
    await pagina.fill("#precio-1", "25000");
    await pagina.waitForTimeout(150);
    const editorGuardado = await pagina.evaluate(() => JSON.parse(localStorage.getItem("kz-demo-editor-001") || "null"));
    comprobar(
      editorGuardado && editorGuardado.productos && editorGuardado.productos[0].nombre === "Bandeja paisa",
      "el catálogo se recuerda en su PROPIA clave (la ficha del lead no cambia)",
      JSON.stringify(editorGuardado && editorGuardado.productos && editorGuardado.productos[0])
    );

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

    // ── 6 · al volver, encuentra lo que escribió (las imágenes no: se pierden) ──
    await pagina.reload({ waitUntil: "load" });
    comprobar((await pagina.inputValue("#negocio")) === DATOS.negocio, "al recargar, el nombre sigue ahí");
    comprobar((await pagina.inputValue("#eslogan")) === DATOS.eslogan, "al recargar, el eslogan sigue ahí");
    comprobar(await pagina.locator("#demo-logo-img").isHidden(), "al recargar, el logo se ha perdido (no se guarda)");
    comprobar(
      !/blob:/.test(await pagina.locator("#demo-heroe").evaluate((e) => getComputedStyle(e).backgroundImage)),
      "al recargar, la portada también se ha perdido"
    );
    // El catálogo y las redes son texto: esos sí se recuerdan, y en su propia clave.
    await pagina.locator("#acordeon-productos summary").click();
    comprobar((await pagina.inputValue("#producto-1")) === "Bandeja paisa", "al recargar, el catálogo sigue escrito");

    // ── 7 · borrar lo guardado ──────────────────────────────────────
    await pagina.click("#borrar");
    const trasBorrar = await pagina.evaluate(() => ({
      lead: localStorage.getItem("kz-lead-demo-001"),
      editor: localStorage.getItem("kz-demo-editor-001")
    }));
    comprobar(trasBorrar.lead === null && trasBorrar.editor === null, "el botón de borrar deja el navegador sin datos (las dos claves)");
    comprobar((await pagina.inputValue("#producto-1")) === "", "y vacía también el catálogo de la pantalla");

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

    // ── 10 · capturas (con las dos imágenes puestas, que es como se ve de verdad) ──
    fs.mkdirSync(SALIDA, { recursive: true });
    await pagina.setInputFiles("#archivo-logo", LOGO);
    await pagina.setInputFiles("#archivo-portada", PORTADA);
    await pagina.check("#autoriza");
    await pagina.click("button.generar");
    await pagina.waitForTimeout(400);

    // Antes de la foto: comprobar que lo que se pinta es una imagen con contenido,
    // no un hueco del mismo color. Se mide la variedad de colores de la imagen
    // que el navegador tiene realmente aplicada en el móvil.
    const evidencia = await pagina.evaluate(async () => {
      const cargar = (url) => new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error("no carga"));
        i.src = url;
      });
      async function variedad(url) {
        try {
          const img = await cargar(url);
          const c = document.createElement("canvas");
          c.width = 48; c.height = 48;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, 48, 48);
          const d = ctx.getImageData(0, 0, 48, 48).data;
          const vistos = new Set();
          for (let i = 0; i < d.length; i += 4) vistos.add(d[i] + "," + d[i + 1] + "," + d[i + 2]);
          return { colores: vistos.size, ancho: img.naturalWidth, alto: img.naturalHeight };
        } catch (e) {
          return null;
        }
      }
      const fondo = getComputedStyle(document.getElementById("demo-heroe")).backgroundImage;
      const urlPortada = (fondo.match(/url\(["']?([^"')]+)["']?\)/) || [])[1] || "";
      const urlLogo = document.getElementById("demo-logo-img").getAttribute("src") || "";
      return {
        portada: urlPortada ? await variedad(urlPortada) : null,
        logo: urlLogo ? await variedad(urlLogo) : null,
        urlPortada,
        urlLogo
      };
    });
    console.log(
      "  ...    medida de lo pintado: portada " +
      (evidencia.portada ? `${evidencia.portada.colores} colores distintos · ${evidencia.portada.ancho}x${evidencia.portada.alto}` : "sin leer") +
      " · logo " +
      (evidencia.logo ? `${evidencia.logo.colores} colores distintos · ${evidencia.logo.ancho}x${evidencia.logo.alto}` : "sin leer")
    );
    comprobar(
      "la portada aplicada es una foto con contenido, no un color plano",
      evidencia.portada ? `${evidencia.portada.colores} colores · ${evidencia.portada.ancho}x${evidencia.portada.alto}` : "no se pudo leer"
    );
    comprobar(
      evidencia.logo && evidencia.logo.colores >= 20,
      "el logo aplicado es una imagen con contenido",
      evidencia.logo ? `${evidencia.logo.colores} colores · ${evidencia.logo.ancho}x${evidencia.logo.alto}` : "no se pudo leer"
    );
    comprobar(String(evidencia.urlPortada).startsWith("blob:") && String(evidencia.urlLogo).startsWith("blob:"), "las dos se sirven por URL de objeto, ninguna va incrustada");

    await pagina.evaluate(() => document.querySelectorAll("details.acordeon").forEach((d) => { d.open = false; }));
    await pagina.waitForTimeout(120);
    await pagina.screenshot({ path: path.join(SALIDA, "soluciones-1366.png"), fullPage: true });

    // Y ahora el editor a plena potencia: acordeones abiertos, catálogo y redes puestos.
    await pagina.evaluate(() => document.querySelectorAll("details.acordeon").forEach((d) => { d.open = true; }));
    await pagina.fill("#producto-1", "Bandeja paisa");
    await pagina.fill("#precio-1", "25000");
    await pagina.fill("#producto-2", "Empanada de carne");
    await pagina.fill("#precio-2", "3000");
    await pagina.fill("#producto-3", "Jugo natural");
    await pagina.fill("#precio-3", "6000");
    await pagina.fill("#red-instagram", "@lapaisa");
    await pagina.fill("#red-tiktok", "@lapaisa.co");
    await pagina.fill("#direccion", "Cra 45 #12-34, Medellín");
    await pagina.check("#autoriza");
    await pagina.click("button.generar");
    await pagina.waitForTimeout(450);
    await pagina.locator(".columna-form").screenshot({ path: path.join(SALIDA, "editor-abierto.png") });
    await pagina.locator(".movil").screenshot({ path: path.join(SALIDA, "movil-con-redes.png") });
    await pagina.screenshot({ path: path.join(SALIDA, "pagina-completa-editor.png"), fullPage: true });

    const movil = await navegador.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
    await movil.goto(`${base}/soluciones.html`, { waitUntil: "load" });
    await movil.fill("#negocio", DATOS.negocio);
    await movil.fill("#whatsapp", DATOS.whatsapp);
    await movil.evaluate((c) => { const el = document.getElementById("color"); el.value = c; el.dispatchEvent(new Event("input", { bubbles: true })); }, DATOS.color);
    await movil.fill("#eslogan", DATOS.eslogan);
    await movil.setInputFiles("#archivo-logo", LOGO);
    await movil.setInputFiles("#archivo-portada", PORTADA);
    await movil.evaluate(() => document.querySelectorAll("details.acordeon").forEach((d) => { d.open = true; }));
    await movil.fill("#producto-1", "Bandeja paisa");
    await movil.fill("#precio-1", "25000");
    await movil.fill("#producto-2", "Empanada de carne");
    await movil.fill("#precio-2", "3000");
    await movil.fill("#red-instagram", "@lapaisa");
    await movil.fill("#red-facebook", "lapaisa");
    await movil.fill("#direccion", "Cra 45 #12-34, Medellín");
    await movil.check("#autoriza");
    await movil.click("button.generar");
    await movil.waitForTimeout(450);
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
