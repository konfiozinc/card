/* KZ-CRM-018 · Arnés de INYECCIÓN DE FALLOS para las pruebas del CRM.
   INTERNO: crm-dev/lib/. No se publica.

   POR QUÉ UN PROXY Y NO EL EMULADOR
   El emulador de Firestore no sabe devolver un 503 a voluntad, ni romper la segunda
   página, ni «aplicar una escritura y perder la respuesta». Para probar la reacción del
   procedimiento ante esos fallos hace falta interponer algo que los provoque. Este módulo
   es ese algo: un proxy HTTP transparente que reenvía TODO al emulador y sólo altera lo
   que una regla indique.

   IMPORTANTE — LÍMITE DE ESTA HERRAMIENTA
   El proxy no imita a Firestore: mide cómo responde el procedimiento cuando Firestore
   falla. Las pruebas que exigen comportamiento REAL del almacén (reglas, atomicidad,
   concurrencia) se hacen contra el emulador sin proxy.

   USO
     const { crearProxy } = require("./lib/proxy-fallos.cjs");
     const proxy = await crearProxy({ puerto: 8099 });
     proxy.regla({ id:"sin-inventario", prueba:(i) => i.method === "GET" &&
       !i.url.includes("pageToken"), accion:"503", veces:1 });
     // el hijo se lanza con KZ_FIRESTORE_URL = http://127.0.0.1:8099/v1/...
     await proxy.cerrar();
*/

const http = require("node:http");

const leerCuerpo = (req) => new Promise((resolve) => {
  const trozos = [];
  req.on("data", (c) => trozos.push(c));
  req.on("end", () => resolve(Buffer.concat(trozos).toString("utf8")));
});

function crearProxy({ puerto = 8099, hostDestino = "127.0.0.1", puertoDestino = 8080 } = {}) {
  const reglas = [];
  const usadas = new Map();
  const disparadas = new Set();
  const oyentes = new Map();
  const contadores = { total: 0, listado: 0, commit: 0, patch: 0, borrado: 0, lectura: 0, alta: 0 };
  const paginas = new Map();      // estado del modo «paginación sintética»

  const emitir = (id) => {
    disparadas.add(id);
    const fns = oyentes.get(id) || [];
    oyentes.delete(id);
    fns.forEach((f) => f());
  };

  /** Resuelve cuando la regla `id` se dispare (o de inmediato si ya se disparó). */
  const esperar = (id, msMax = 30000) => new Promise((resolve, reject) => {
    if (disparadas.has(id)) return resolve();
    const temporizador = setTimeout(() => reject(new Error("tiempo de espera agotado esperando «" + id + "»")), msMax);
    const lista = oyentes.get(id) || [];
    lista.push(() => { clearTimeout(temporizador); resolve(); });
    oyentes.set(id, lista);
  });

  const contar = (info) => {
    contadores.total++;
    if (info.method === "POST" && /:commit$/.test(info.url.split("?")[0])) contadores.commit++;
    else if (info.method === "PATCH") contadores.patch++;
    else if (info.method === "DELETE") contadores.borrado++;
    else if (info.method === "GET") contadores.lectura++;
    else if (info.method === "POST") contadores.alta++;
    if (info.method === "GET" && /\/(crm_leads|crm_quotes|crm_sales|crm_dedup)(\/[^/]+\/notas)?(\?|$)/.test(info.url)) contadores.listado++;
  };

  const pedirDestino = (info) => new Promise((resolve, reject) => {
    const peticion = http.request({
      host: hostDestino, port: puertoDestino, path: info.url, method: info.method,
      headers: { ...info.cabeceras, host: hostDestino + ":" + puertoDestino },
    }, (respuesta) => {
      const trozos = [];
      respuesta.on("data", (c) => trozos.push(c));
      respuesta.on("end", () => resolve({
        estado: respuesta.statusCode,
        cabeceras: respuesta.headers,
        texto: Buffer.concat(trozos).toString("utf8"),
      }));
    });
    peticion.on("error", reject);
    if (info.cuerpo) peticion.write(info.cuerpo);
    peticion.end();
  });

  const responder = (res, estado, texto, extra = {}) => {
    if (res.writableEnded) return;
    res.writeHead(estado, { "content-type": "application/json", ...extra });
    res.end(texto);
  };

  /* ESCRITURA FUERA DE BANDA · acción «inmutar».
     Escribe DIRECTAMENTE en el almacén antes de reenviar la petición observada. Es la única
     forma de reproducir de manera estable la ventana que hay entre la lectura validada y la
     escritura con precondición: la escritura de fuera de banda sube el updateTime del
     documento y la precondición de la petición original queda obsoleta. Sin este modo, la
     «modificación concurrente durante el repunte» sólo podría provocarse con una carrera de
     tiempos que unas veces ocurre y otras no —y una prueba que a veces no mide nada no
     demuestra nada.
     Se usa el token de la propia petición observada (en el emulador, `Bearer owner`). */
  const mutarFueraDeBanda = (info, mutar) => pedirDestino({
    url: mutar.url,
    method: mutar.method || "PATCH",
    cuerpo: JSON.stringify({ fields: mutar.fields }),
    cabeceras: {
      authorization: (info.cabeceras && info.cabeceras.authorization) || "Bearer owner",
      "content-type": "application/json",
    },
  });

  const servidor = http.createServer(async (req, res) => {
    const cuerpo = await leerCuerpo(req);
    const info = { method: req.method, url: req.url, cuerpo, cabeceras: req.headers };
    contar(info);

    const regla = reglas.find((r) => {
      const limite = r.veces == null ? Infinity : r.veces;
      if ((usadas.get(r.id) || 0) >= limite) return false;
      if (disparadas.has(r.id) && r.unaVez) return false;
      try { return r.prueba(info, contadores); } catch { return false; }
    });
    if (regla) usadas.set(regla.id, (usadas.get(regla.id) || 0) + 1);

    try {
      /* Fallos sin tocar el almacén. */
      if (regla && regla.accion === "503") return responder(res, 503, '{"error":{"status":"UNAVAILABLE"}}');
      if (regla && regla.accion === "500") return responder(res, 500, '{"error":{"status":"INTERNAL"}}');
      /* 404 fabricado: sirve para demostrar que un 404 del endpoint NUNCA se toma como éxito. */
      if (regla && regla.accion === "404") return responder(res, 404, '{"error":{"status":"NOT_FOUND"}}');
      if (regla && regla.accion === "colgar-antes") { emitir(regla.id); return; }  // nunca responde

      /* Modificación concurrente REAL en el almacén, y después se reenvía la petición tal
         cual: así el almacén decide con su propia precondición, no el proxy. */
      if (regla && regla.accion === "inmutar") {
        const fuera = await mutarFueraDeBanda(info, regla.mutar || {});
        if (fuera.estado < 200 || fuera.estado > 299) {
          return responder(res, 502, JSON.stringify({ error: "mutación fuera de banda falló: HTTP " + fuera.estado }));
        }
        emitir(regla.id);
      }

      /* Paginación sintética: se sirve la lista real en dos páginas fabricadas. */
      if (regla && regla.accion === "paginar") {
        const clave = regla.id;
        const token = "sintetico-1";
        const yaToken = /pageToken=([^&]+)/.exec(info.url);
        if (!paginas.has(clave)) {
          const completa = await pedirDestino({ ...info, url: info.url.replace(/([?&])pageToken=[^&]*/g, "").replace(/[?&]$/, "") });
          const js = JSON.parse(completa.texto || "{}");
          const docs = js.documents || [];
          const mitad = Math.max(1, Math.floor(docs.length / 2));
          paginas.set(clave, { primera: docs.slice(0, mitad), segunda: docs.slice(mitad) });
          if (regla.fallarSegunda) {
            return responder(res, 200, JSON.stringify({ documents: paginas.get(clave).primera, nextPageToken: token }));
          }
          return responder(res, 200, JSON.stringify({ documents: paginas.get(clave).primera, nextPageToken: token }));
        }
        if (yaToken && decodeURIComponent(yaToken[1]) === token) {
          if (regla.fallarSegunda) return responder(res, 503, '{"error":{"status":"UNAVAILABLE"}}');
          return responder(res, 200, JSON.stringify({ documents: paginas.get(clave).segunda }));
        }
      }

      const destino = await pedirDestino(info);

      /* Aplicado en el almacén, pero la respuesta NO llega: simula la caída del proceso
         justo después de una escritura, que es la ventana más peligrosa. */
      if (regla && regla.accion === "colgar-despues") { emitir(regla.id); return; }

      /* Aplicado en el almacén y la CONEXIÓN SE CORTA: la escritura está hecha y la
         respuesta se pierde. A diferencia de «colgar-despues» —que deja al cliente colgado
         y sólo se puede sacar de ahí matándolo—, aquí el cliente recibe un error de red y
         tiene que decidir qué hacer, que es justo lo que hay que probar. */
      if (regla && regla.accion === "cortar-despues") {
        emitir(regla.id);
        try { req.destroy(); } catch { /* ya cerrado */ }
        try { res.destroy(); } catch { /* ya cerrado */ }
        return;
      }

      return responder(res, destino.estado, destino.texto);
    } catch (e) {
      return responder(res, 502, JSON.stringify({ error: String(e && e.message) }));
    }
  });

  return new Promise((resolve, reject) => {
    servidor.on("error", reject);
    servidor.listen(puerto, "127.0.0.1", () => resolve({
      puerto,
      urlBase: `http://127.0.0.1:${puerto}/v1/projects/demo-crm-016/databases/default/documents`,
      contadores,
      regla: (r) => { reglas.push(r); return r; },
      limpiarReglas: () => {
        reglas.length = 0; usadas.clear(); disparadas.clear(); paginas.clear();
        /* Los contadores también se reinician: si no, una regla basada en «el commit
           número 2» deja de dispararse porque cuenta los commits de escenarios previos.
           Fue un fallo real de esta herramienta. */
        for (const k of Object.keys(contadores)) contadores[k] = 0;
      },
      esperar,
      cerrar: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }),
    }));
  });
}

module.exports = { crearProxy };
