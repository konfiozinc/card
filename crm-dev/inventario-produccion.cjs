/* KZ-CRM-018 · INVENTARIO DE PRODUCCIÓN — ESTRICTAMENTE DE SOLO LECTURA.
   INTERNO: crm-dev/. No se publica.

   GARANTÍAS DE ESTE SCRIPT
     · Proyecto y base FIJADOS en el código: `kzfio-crm` / `default`. No se aceptan por
       parámetro ni por variable de entorno.
     · TODAS las llamadas pasan por `leer()`, que lanza si el método no es GET. No existe
       ninguna ruta de escritura: ni POST, ni PATCH, ni DELETE, ni :commit, ni deploy.
     · No imprime datos personales: los identificadores heredados son números de teléfono,
       así que sólo se cuentan y, si se muestran, se enmascaran.
     · El informe se escribe en %TEMP%, no en el repositorio.

   Uso:  node crm-dev/inventario-produccion.cjs
*/

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { tokenAcceso } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
);

const PROYECTO = "kzfio-crm";
const BASE = "default";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/${BASE}/documents`;
const REGLAS = `https://firebaserules.googleapis.com/v1/projects/${PROYECTO}`;

const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);
const esUuid4 = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));
/** Enmascara un identificador personal (los heredados son teléfonos). */
const enmascarar = (id) => String(id).length > 4
  ? String(id).slice(0, 3) + "*".repeat(Math.max(0, String(id).length - 7)) + String(id).slice(-4)
  : "***";

let H = null;
let peticiones = 0;

/** ÚNICO punto de salida a la red. Si algún día alguien intenta escribir, revienta aquí. */
async function leer(url) {
  if (H === null) throw new Error("cabecera no inicializada");
  peticiones++;
  const r = await fetch(url, { method: "GET", headers: H });
  return { status: r.status, ok: r.ok, cuerpo: r.ok ? await r.json() : null, texto: r.ok ? null : (await r.text()).slice(0, 200) };
}

/** Recorre una colección completa con nextPageToken. Un fallo NO se interpreta como vacío. */
async function listarTodas(ruta, etiqueta) {
  const salida = [];
  let token = null, paginas = 0;
  do {
    const url = `${DOCS}/${ruta}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const r = await leer(url);
    if (!r.ok) throw new Error(`No se pudo listar ${etiqueta}: HTTP ${r.status} ${r.texto || ""}`);
    for (const d of (r.cuerpo.documents || [])) salida.push({ id: d.name.split("/").pop(), fields: d.fields || {} });
    token = r.cuerpo.nextPageToken || null;
    if (++paginas > 500) throw new Error("Demasiadas páginas listando " + etiqueta);
  } while (token);
  return salida;
}

(async () => {
  const t = await tokenAcceso();
  H = { authorization: "Bearer " + t };
  const informe = { proyecto: PROYECTO, base: BASE, fecha: new Date().toISOString(), modo: "SOLO LECTURA" };

  console.log("INVENTARIO DE PRODUCCIÓN · " + PROYECTO + " · base «" + BASE + "» · SOLO LECTURA");
  console.log("Sesión: token de firebase login (no se guarda)\n");

  /* 1. ¿Existe la base con el nombre EXACTO «default»? --------------------- */
  console.log("1. Base de datos");
  const baseMeta = await leer(`https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/${BASE}`);
  if (baseMeta.ok) {
    informe.base_confirmada = true;
    informe.base_nombre = baseMeta.cuerpo.name;
    informe.base_tipo = baseMeta.cuerpo.type || "(no informado)";
    informe.base_ubicacion = baseMeta.cuerpo.locationId || "(no informada)";
    informe.pitr = baseMeta.cuerpo.pointInTimeRecoveryEnablement || "(no informado)";
    informe.version_retencion = baseMeta.cuerpo.versionRetentionPeriod || "(no informado)";
    console.log("   · nombre exacto: " + baseMeta.cuerpo.name);
    console.log("   · tipo: " + informe.base_tipo + " · ubicación: " + informe.base_ubicacion);
    console.log("   · recuperación a un punto en el tiempo: " + informe.pitr);
    console.log("   · retención de versiones: " + informe.version_retencion);
  } else {
    informe.base_confirmada = false;
    informe.base_error = "HTTP " + baseMeta.status + " " + (baseMeta.texto || "");
    console.log("   · NO se pudo confirmar la base: HTTP " + baseMeta.status + " (se sigue con las lecturas)");
  }

  /* 2. Recuentos ---------------------------------------------------------- */
  console.log("\n2. Contenido");
  const leads = await listarTodas("crm_leads", "crm_leads");
  const cotizaciones = await listarTodas("crm_quotes", "crm_quotes");
  const ventas = await listarTodas("crm_sales", "crm_sales");
  const usuarios = await listarTodas("crm_usuarios", "crm_usuarios");
  const auditoria = await listarTodas("crm_audit", "crm_audit");
  const marcadores = await listarTodas("crm_dedup", "crm_dedup");
  const config = await listarTodas("crm_config", "crm_config");

  /* Notas: una lectura por prospecto, paginada. */
  let notas = 0;
  const leadsConNotas = [];
  for (const l of leads) {
    const suyas = await listarTodas(`crm_leads/${l.id}/notas`, "notas de un prospecto");
    notas += suyas.length;
    if (suyas.length) leadsConNotas.push(l.id);
  }

  informe.prospectos = leads.length;
  informe.notas = notas;
  informe.prospectos_con_notas = leadsConNotas.length;
  informe.cotizaciones = cotizaciones.length;
  informe.ventas = ventas.length;
  informe.usuarios = usuarios.length;
  informe.auditoria = auditoria.length;
  informe.marcadores_dedup = marcadores.length;
  informe.config_documentos = config.length;

  console.log("   · prospectos ............ " + leads.length);
  console.log("   · notas ................. " + notas + "  (en " + leadsConNotas.length + " prospectos)");
  console.log("   · cotizaciones .......... " + cotizaciones.length);
  console.log("   · ventas ................ " + ventas.length);
  console.log("   · usuarios (fichas) ..... " + usuarios.length);
  console.log("   · registros de auditoría  " + auditoria.length);
  console.log("   · marcadores crm_dedup .. " + marcadores.length);
  console.log("   · documentos crm_config . " + config.length);

  /* 3. Registros heredados (id = teléfono) --------------------------------- */
  console.log("\n3. Registros heredados (modelo anterior: id = teléfono)");
  const heredados = leads.filter((l) => !esUuid4(l.id));
  const conUuid = leads.filter((l) => esUuid4(l.id));
  const raros = heredados.filter((l) => !/^[0-9]{10,15}$/.test(l.id));
  informe.heredados = heredados.length;
  informe.con_uuid = conUuid.length;
  informe.identificadores_raros = raros.length;
  informe.heredados_ejemplo_enmascarado = heredados.slice(0, 3).map((l) => enmascarar(l.id));
  console.log("   · con UUID v4 ........... " + conUuid.length);
  console.log("   · heredados (teléfono) .. " + heredados.length);
  console.log("   · identificadores que NO son ni UUID ni teléfono: " + raros.length);
  if (heredados.length) {
    console.log("   · ejemplo enmascarado ... " + informe.heredados_ejemplo_enmascarado.join(", "));
  }

  /* ¿Cada heredado tiene marcador? ¿Y cada UUID? */
  const sinMarcador = leads.filter((l) => {
    const tel = val(l.fields, "telefono");
    return !marcadores.some((m) => m.id === tel && val(m.fields, "lead_id") === l.id);
  });
  informe.prospectos_sin_marcador = sinMarcador.length;
  console.log("   · prospectos SIN marcador de deduplicación: " + sinMarcador.length);

  /* 4. Configuración de transición ---------------------------------------- */
  console.log("\n4. Configuración de transición (crm_config/transicion)");
  const trans = await leer(`${DOCS}/crm_config/transicion`);
  if (trans.ok) {
    informe.transicion_documento = true;
    informe.transicion_acepta_heredados = val(trans.cuerpo.fields, "acepta_heredados");
    informe.transicion_campos = Object.keys(trans.cuerpo.fields || {});
    console.log("   · el documento EXISTE · campos: " + informe.transicion_campos.join(", "));
    console.log("   · acepta_heredados = " + String(informe.transicion_acepta_heredados) +
      "  → ventana " + (informe.transicion_acepta_heredados === false ? "CERRADA" : "ABIERTA"));
  } else if (trans.status === 404) {
    informe.transicion_documento = false;
    console.log("   · NO existe → la ventana está ABIERTA (valor por omisión de las reglas candidatas)");
  } else {
    informe.transicion_documento = null;
    informe.transicion_error = "HTTP " + trans.status;
    console.log("   · no se pudo leer: HTTP " + trans.status);
  }

  /* 5. Releases de reglas -------------------------------------------------- */
  console.log("\n5. Releases de reglas publicados");
  const rel = await leer(`${REGLAS}/releases`);
  if (!rel.ok) {
    console.log("   · no se pudieron leer los releases: HTTP " + rel.status);
    informe.releases_error = "HTTP " + rel.status;
  } else {
    const lista = rel.cuerpo.releases || [];
    informe.releases = [];
    for (const r of lista) {
      const fila = {
        nombre: (r.name || "").split("/").pop(),
        destino: r.rulesetName ? "(ruleset)" : "",
        ruleset: (r.rulesetName || "").split("/").pop(),
        creado: r.createTime,
        actualizado: r.updateTime,
      };
      /* El código publicado de verdad: se lee el ruleset adjunto al release. */
      if (r.rulesetName) {
        const rs = await leer(`https://firebaserules.googleapis.com/v1/${r.rulesetName}`);
        if (rs.ok && rs.cuerpo.source && rs.cuerpo.source.files) {
          fila.lineas = rs.cuerpo.source.files.map((f) => (f.content || "").split("\n").length).reduce((a, b) => a + b, 0);
          fila.contenido = rs.cuerpo.source.files.map((f) => f.content || "").join("\n");
          fila.huella = require("node:crypto").createHash("sha256").update(fila.contenido).digest("hex").slice(0, 16);
        }
      }
      informe.releases.push(fila);
      console.log("   · " + fila.nombre + " → ruleset " + fila.ruleset + " · actualizado " + fila.actualizado +
        " · " + (fila.lineas || "?") + " líneas · sha256 " + (fila.huella || "?"));
    }
    /* Se comparan los dos release publicados con los ficheros del repositorio. */
    const publicados = informe.releases.filter((x) => x.contenido);
    informe.comparacion = publicados.map((x) => {
      const candidato = fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8");
      const previo = fs.readFileSync(path.join(__dirname, "firestore.rules.prev"), "utf8");
      const norm = (s) => s.replace(/\r\n/g, "\n").trim();
      return {
        release: x.nombre,
        igual_a_reglas_anteriores_del_repo: norm(x.contenido) === norm(previo),
        igual_a_candidatas: norm(x.contenido) === norm(candidato),
      };
    });
  }

  /* 6. Fichero del informe ------------------------------------------------- */
  const salida = path.join(os.tmpdir(), "kz-inventario-produccion.json");
  fs.writeFileSync(salida, JSON.stringify({ ...informe, releases: (informe.releases || []).map((r) => ({ ...r, contenido: undefined })) }, null, 1), "utf8");
  console.log("\nPeticiones GET realizadas: " + peticiones + " · ninguna de escritura.");
  console.log("Informe escrito en: " + salida);
  console.log("\nEste inventario NO ha modificado nada.");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
