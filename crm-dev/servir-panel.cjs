/* KZ-CRM-016 · sirve el panel del CRM en local (uso interno).

   Por qué no basta abrir el archivo: el panel usa módulos ES y Firebase Auth,
   que necesitan un origen http(s) real. `file://` no funciona.

   Uso:  node crm/servir-panel.cjs            # http://127.0.0.1:8321/crm/index.html
         node crm/servir-panel.cjs 9000       # otro puerto

   Sirve SÓLO la carpeta crm/ y el mínimo necesario. No expone la raíz del
   repositorio, así que no publica documentos, ni el blog, ni nada del sitio. */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PUERTO = Number(process.argv[2] || 8321);
/* El panel vive en `crm/` y este servidor en `crm-dev/`: la raíz es la carpeta del panel, no
   la del script. Estaba puesta como `__dirname`, así que servía desde `crm-dev/`, donde no hay
   `index.html`, y todas las peticiones respondían 404. Por eso `pruebas-panel-real.cjs` no
   podía ejecutarse. */
const RAIZ = path.join(__dirname, "..", "crm");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/* Lista blanca: sólo lo que el panel necesita. Cualquier otro archivo de la carpeta
   (pruebas, scripts de despliegue, reglas) NO se sirve. */
const PERMITIDOS = new Set([
  "index.html", "crm.js", "crm.css", "alta-prospecto.js", "formulario.html",
]);

const srv = http.createServer((req, res) => {
  let ruta = decodeURIComponent((req.url || "/").split("?")[0]);
  if (ruta === "/favicon.ico") { res.writeHead(204); return res.end(); }
  if (ruta === "/") ruta = "/crm/index.html";

  const rel = ruta.replace(/^\/+/, "");
  const partes = rel.split("/");
  const archivo = partes[partes.length - 1];

  if (partes[0] !== "crm" || partes.length !== 2 || !PERMITIDOS.has(archivo)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("No encontrado");
  }

  const completo = path.join(RAIZ, archivo);
  fs.readFile(completo, (err, datos) => {
    if (err) { res.writeHead(404); return res.end("No encontrado"); }
    res.writeHead(200, {
      "content-type": MIME[path.extname(completo)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(datos);
  });
});

srv.listen(PUERTO, "127.0.0.1", () => {
  console.log("Panel del CRM servido en local:");
  console.log("   http://127.0.0.1:" + PUERTO + "/crm/index.html");
  console.log("");
  console.log("Contra el proyecto real kzfio-crm. Con ?emulador=1 iría al emulador.");
  console.log("Ctrl+C para detener.");
});
