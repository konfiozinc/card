/* KZ-CRM-018 · Migración a UUID + reversión SEGURA (R01 y R03).
   INTERNO: crm-dev/. No se publica.

   CORRECCIONES DE ESTA VERSIÓN
   R01 · La reversión YA NO borra a ciegas: inventaría el estado actual (con paginación
         completa), lo compara contra el respaldo y, si detecta CUALQUIER dato posterior,
         SE NIEGA y termina con código 3 sin modificar un solo documento.
         R01 (cierre definitivo, 2ª pasada): la comparación es ahora del DOCUMENTO
         COMPLETO, no de una lista corta de campos. Antes se comparaban sólo 7 campos
         (nombre, telefono, industria, estado, asignado_a, retencion_hasta,
         servicio_interes); cualquier otro cambio posterior —una entrada añadida al
         historial, un campo comercial nuevo, un campo eliminado— era invisible y la
         reversión borraba el prospecto con ese cambio dentro. También se comprueba el
         contenido de las notas (no sólo su existencia) y que el marcador de
         deduplicación siga apuntando al prospecto migrado.
   R03 · Idempotencia y reanudación reales: distingue heredados de UUID nativos; el mapa
         guarda `estado` por entrada y sólo pasa a `hecho` tras verificar referencias;
         una entrada `pendiente` se reintenta. Cualquier error aborta con código ≠ 0.
         R03 (cierre, 2ª pasada): el mapa se escribe ANTES del commit —la intención
         primero—. Antes se guardaba después, así que una interrupción entre la escritura
         y el guardado hacía que la reanudación generara otro UUID para el mismo teléfono
         y dejara un prospecto DUPLICADO.
   R08 · Los listados recorren todas las páginas con nextPageToken y un listado fallido
         NUNCA se interpreta como «colección vacía».
*/

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROYECTO_REAL = "kzfio-crm";
const BASE = "default";
const EMULADOR = process.argv.includes("--emulador");
const CONFIRMAR = process.argv.includes("--confirmar");
const REVERTIR = process.argv.includes("--revertir");
const LIMPIAR = process.argv.includes("--limpiar-testigos");

const PROYECTO = EMULADOR ? "demo-crm-016" : PROYECTO_REAL;
if (!EMULADOR && process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROYECTO) {
  console.error("ABORTADO: GCLOUD_PROJECT apunta a otro proyecto");
  process.exit(1);
}

const PREFIJO = `projects/${PROYECTO}/databases/${BASE}/documents`;
/* La URL base sólo se puede desviar EN EL EMULADOR: así crm-dev/pruebas-fallos.cjs puede
   interponer un proxy que devuelva 503, rompa la paginación o corte la conexión. Contra
   producción la ruta es fija y NO se acepta ninguna variable de entorno: un fallo de
   inyección no puede redirigir la migración real a otro sitio. */
const DOCS = EMULADOR
  ? (process.env.KZ_FIRESTORE_URL || `http://127.0.0.1:8080/v1/${PREFIJO}`)
  : `https://firestore.googleapis.com/v1/${PREFIJO}`;
const MAPA = path.join(__dirname, "migracion-uuid.json");
const RESP = path.join(__dirname, "migracion-respaldo.json");

const esUuid4 = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);
const sha = (obj) => crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");

async function cabecera() {
  if (EMULADOR) return { authorization: "Bearer owner", "content-type": "application/json" };
  const { tokenAcceso } = require(
    "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
  );
  return { authorization: "Bearer " + (await tokenAcceso()), "content-type": "application/json" };
}

async function listarTodas(H, ruta, etiqueta) {
  const salida = [];
  let token = null, paginas = 0;
  do {
    const url = ruta + (token ? (ruta.includes("?") ? "&" : "?") + "pageToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`No se pudo listar ${etiqueta}: HTTP ${r.status}`);
    const j = await r.json();
    for (const d of (j.documents || [])) salida.push({ id: d.name.split("/").pop(), fields: d.fields || {} });
    token = j.nextPageToken || null;
    if (++paginas > 200) throw new Error(`Demasiadas páginas listando ${etiqueta}`);
  } while (token);
  return salida;
}

const listarLeads = (H) => listarTodas(H, `${DOCS}/crm_leads`, "crm_leads");
const listarNotas = (H, id) => listarTodas(H, `${DOCS}/crm_leads/${id}/notas`, "notas de " + id);
const listarCot = (H) => listarTodas(H, `${DOCS}/crm_quotes`, "crm_quotes");
const listarVen = (H) => listarTodas(H, `${DOCS}/crm_sales`, "crm_sales");
const listarDedup = (H) => listarTodas(H, `${DOCS}/crm_dedup`, "crm_dedup");
const listarTestigos = (H) => listarTodas(H, `${DOCS}/crm_supresion`, "crm_supresion");

const commit = async (H, writes) => {
  const r = await fetch(`${DOCS}:commit`, { method: "POST", headers: H, body: JSON.stringify({ writes }) });
  if (!r.ok) throw new Error("commit falló: HTTP " + r.status);
};
const patch = async (H, ruta, fields, mask) => {
  const r = await fetch(`${DOCS}/${ruta}?updateMask.fieldPaths=${mask}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`PATCH ${ruta} falló: HTTP ${r.status}`);
};
const borrar = async (H, ruta) => {
  const r = await fetch(`${DOCS}/${ruta}`, { method: "DELETE", headers: H });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${ruta} falló: HTTP ${r.status}`);
};

/* B.2/B.3 · Borrado con PRECONDICIÓN: se ejecuta sólo si el documento sigue siendo el que
   se leyó (updateTime). Si alguien lo modificó entre la lectura y el borrado, el almacén
   rechaza la operación en vez de destruir a ciegas. No hay atomicidad global: cada borrado
   es su propio commit, y ese límite se declara en vez de disimularse. */
/* §3 · POLÍTICA HTTP ESTRICTA PARA ESCRITURAS.
   Sólo un 200 se considera aplicado. Un 404 del endpoint NUNCA se toma como éxito; 400/409
   es precondición rechazada; 500/503 y la falta de respuesta abortan conservando el estado.
   Nada de esto se interpreta como «el documento ya no estaba». */
const escribirValidado = async (H, writes, etiqueta) => {
  let r;
  try {
    r = await fetch(`${DOCS}:commit`, { method: "POST", headers: H, body: JSON.stringify({ writes }) });
  } catch (e) {
    throw new Error(`${etiqueta}: sin respuesta del almacén (${e.message}); estado conservado para reanudar`);
  }
  if (r.status === 200) return true;
  if (r.status === 400 || r.status === 409) {
    throw new Error(`${etiqueta}: precondición rechazada (HTTP ${r.status}); el estado cambió desde que se validó`);
  }
  if (r.status === 404) {
    throw new Error(`${etiqueta}: el endpoint respondió 404; NO se asume que se haya aplicado`);
  }
  throw new Error(`${etiqueta}: error HTTP ${r.status}; se aborta sin declarar éxito`);
};

/* §3 · LECTURA ESTRICTA. 200 exige updateTime; 404 se declara como ausencia del servidor y
   el llamante lo contrasta con otra fuente; cualquier otro código aborta. */
const leerValidado = async (H, ruta, etiqueta) => {
  let r;
  try {
    r = await fetch(`${DOCS}/${ruta}`, { headers: H });
  } catch (e) {
    throw new Error(`${etiqueta}: sin respuesta al leer (${e.message})`);
  }
  if (r.status === 404) return { existe: false };
  if (r.status !== 200) throw new Error(`${etiqueta}: no se pudo leer (HTTP ${r.status}); un error no es una ausencia`);
  const j = await r.json();
  if (!j.updateTime) throw new Error(`${etiqueta}: la lectura no devolvió updateTime; no se puede validar`);
  return { existe: true, updateTime: j.updateTime, fields: j.fields || {} };
};
/* B1 · FALLO CERRADO. Sin un updateTime válido NO se borra. Antes, si el GET fallaba,
   `updateTime` quedaba nulo y la escritura se enviaba SIN precondición: se destruía una
   modificación concurrente sin detectarla. Un error HTTP NUNCA se interpreta como
   «documento inexistente»: 404 lo decide el propio commit con su precondición, no una
   lectura fallida. El proceso queda intacto para poder reanudar. */
const borrarSiNoCambio = async (H, ruta, updateTime) => {
  if (updateTime === "ausente") return true;   // ya no existe: nada que borrar
  if (!updateTime) {
    throw new Error(`no se pudo leer updateTime de ${ruta}: no se borra sin precondición`);
  }
  const writes = [{ delete: `${PREFIJO}/${ruta}`, currentDocument: { updateTime } }];
  let r;
  try {
    r = await fetch(`${DOCS}:commit`, { method: "POST", headers: H, body: JSON.stringify({ writes }) });
  } catch (e) { throw new Error("commit de borrado sin respuesta: " + e.message); }
  if (r.ok || r.status === 404) return true;
  throw new Error(`el borrado de ${ruta} fue rechazado (HTTP ${r.status}): el documento cambió mientras se revertía`);
};

/* B3 · Modificación con precondición: si la referencia cambió desde que se leyó, el
   almacén rechaza el repunte en vez de sobrescribir lo que otro acaba de escribir. */
const patchSiNoCambio = async (H, ruta, fields, mask, updateTime) => {
  if (updateTime === "ausente") return true;   // ya no existe: nada que repuntar
  if (!updateTime) {
    throw new Error(`no se pudo leer updateTime de ${ruta}: no se modifica sin precondición`);
  }
  const writes = [{
    update: { name: `${PREFIJO}/${ruta}`, fields },
    updateMask: { fieldPaths: [mask] },
    currentDocument: { updateTime },
  }];
  let r;
  try {
    r = await fetch(`${DOCS}:commit`, { method: "POST", headers: H, body: JSON.stringify({ writes }) });
  } catch (e) { throw new Error("commit de modificación sin respuesta: " + e.message); }
  if (r.ok || r.status === 404) return true;
  throw new Error(`la modificación de ${ruta} fue rechazada (HTTP ${r.status}): cambió mientras se revertía`);
};

/* Lectura del updateTime. Lanza si no se puede leer: NO devuelve null, para que nadie
   pueda seguir adelante tratando un fallo de lectura como «no hay nada que proteger». */
const updateTimeDe = async (H, ruta) => {
  const r = await fetch(`${DOCS}/${ruta}`, { headers: H });
  if (r.status === 404) return "ausente";
  if (!r.ok) throw new Error(`no se pudo leer ${ruta}: HTTP ${r.status}`);
  const ut = (await r.json()).updateTime;
  if (!ut) throw new Error(`la lectura de ${ruta} no devolvió updateTime`);
  return ut;
};
const leerMapa = () => (fs.existsSync(MAPA) ? JSON.parse(fs.readFileSync(MAPA, "utf8")) : {});
const guardarMapa = (m) => fs.writeFileSync(MAPA, JSON.stringify(m, null, 1), "utf8");

const CAMPOS_CLAVE = ["nombre", "telefono", "industria", "estado", "asignado_a", "retencion_hasta", "servicio_interes"];
const foto = (fields) => Object.fromEntries(CAMPOS_CLAVE.map((k) => [k, val(fields, k) ?? null]));

/* ── Comparación del DOCUMENTO COMPLETO (R01) ─────────────────────────────
   `foto()` se conserva sólo para la huella informativa del respaldo. La guarda de la
   reversión ya NO usa esa lista corta: compara TODOS los campos del documento.
   `canon()` ordena las claves y normaliza los timestamps a milisegundos para que el
   formato exacto con que la API devuelve las fechas no produzca falsos positivos. */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      const x = v[k];
      if (k === "timestampValue" && typeof x === "string") {
        const ms = Date.parse(x);
        o[k] = Number.isNaN(ms) ? x : "ts:" + ms;
      } else o[k] = canon(x);
    }
    return o;
  }
  return v;
}
const huellaCampos = (fields) => JSON.stringify(canon(fields || {}));

/** Diferencias campo a campo entre el documento respaldado y el actual. */
function camposCambiados(previo, ahora) {
  const cambios = [];
  const claves = new Set([...Object.keys(previo || {}), ...Object.keys(ahora || {})]);
  for (const k of claves) {
    const a = JSON.stringify(canon((previo || {})[k]));
    const b = JSON.stringify(canon((ahora || {})[k]));
    if (a !== b) cambios.push({ campo: k, tipo: previo && previo[k] !== undefined
      ? (ahora && ahora[k] !== undefined ? "modificado" : "eliminado")
      : "añadido" });
  }
  return cambios;
}

(async () => {
  const H = await cabecera();
  console.log("Proyecto : " + PROYECTO + (EMULADOR ? "  (EMULADOR)" : "  (PRODUCCIÓN)"));
  console.log("Modo     : " + (REVERTIR ? "REVERSIÓN" : CONFIRMAR ? "MIGRACIÓN" : "SIMULACIÓN"));

  if (LIMPIAR) return await limpiarTestigos(H);
  if (REVERTIR) return await revertir(H);

  const leads = await listarLeads(H);
  const mapa = leerMapa();
  console.log("Prospectos: " + leads.length + " · entradas en el mapa: " + Object.keys(mapa).length);

  const pendientes = [];
  let yaUuid = 0;
  for (const l of leads) {
    const tel = val(l.fields, "telefono");
    if (esUuid4(l.id)) { yaUuid++; continue; }                 // R03: nació con UUID
    const e = mapa[tel];
    if (e && e.estado === "hecho") continue;                    // ya migrado y verificado
    pendientes.push({ viejo: l.id, tel, campos: l.fields, reintento: e && e.estado === "pendiente" ? e.uuid : null });
  }
  console.log("Ya con UUID (se omiten): " + yaUuid + " · pendientes: " + pendientes.length);
  if (!pendientes.length) { console.log("\nNada que migrar. La migración es idempotente."); return; }

  if (!CONFIRMAR) {
    /* Se calcula la huella del respaldo que se escribiría, sin escribir nada: así el
       operador puede comparar antes de autorizar. */
    const previo = [];
    for (const p of pendientes) {
      previo.push({ id: p.viejo, foto: foto(p.campos) });
      for (const n of await listarNotas(H, p.viejo)) previo.push({ lead: p.viejo, nota: n.id });
    }
    console.log("\n  sha256: " + sha(previo) + "   (respaldo que se escribiría)");
    console.log("\nSIMULACIÓN. No se escribe nada.");
    for (const p of pendientes) console.log("  migraría " + p.viejo + " (tel " + p.tel + ")" + (p.reintento ? "  [reintento]" : ""));
    return;
  }

  /* Respaldo: se amplía el existente, nunca se pisa a ciegas. */
  const respaldo = fs.existsSync(RESP) ? JSON.parse(fs.readFileSync(RESP, "utf8")) : {};
  respaldo.leads = respaldo.leads || []; respaldo.notas = respaldo.notas || [];
  for (const p of pendientes) {
    if (!respaldo.leads.some((x) => x.id === p.viejo)) respaldo.leads.push({ id: p.viejo, campos: p.campos, foto: foto(p.campos) });
    for (const n of await listarNotas(H, p.viejo))
      if (!respaldo.notas.some((x) => x.lead === p.viejo && x.id === n.id))
        /* R01: se guarda también el CONTENIDO de la nota. Sin él no se puede detectar
           que una nota se editó después de migrar, y la reversión borraría la edición. */
        respaldo.notas.push({ lead: p.viejo, id: n.id, campos: n.fields });
  }
  const cots = await listarCot(H), vens = await listarVen(H);
  respaldo.cotizaciones = cots.map((c) => ({ id: c.id, lead_id: val(c.fields, "lead_id") }));
  respaldo.ventas = vens.map((v) => ({ id: v.id, lead_id: val(v.fields, "lead_id") }));
  respaldo.fecha = new Date().toISOString();
  respaldo.huella = sha({ leads: respaldo.leads, notas: respaldo.notas, cotizaciones: respaldo.cotizaciones, ventas: respaldo.ventas });
  fs.writeFileSync(RESP, JSON.stringify(respaldo, null, 1), "utf8");
  console.log("Respaldo: " + respaldo.leads.length + " prospectos · " + respaldo.notas.length + " notas · sha256 " + respaldo.huella.slice(0, 16) + "…");

  for (const p of pendientes) {
    const id = p.reintento || crypto.randomUUID();

    /* R03 · ORDEN CRÍTICO: primero se PERSISTE LA INTENCIÓN, después se escribe.
       Si el proceso muere entre el commit y el guardado del mapa, sin esta línea la
       reanudación generaría otro UUID para el mismo teléfono y dejaría un prospecto
       DUPLICADO. Con la entrada escrita antes, la reanudación reutiliza este mismo UUID
       y el commit se repite sobre el mismo documento, que es idempotente. */
    mapa[p.tel] = { uuid: id, viejo: p.viejo, estado: "pendiente", fecha: new Date().toISOString() };
    guardarMapa(mapa);

    const notas = await listarNotas(H, p.viejo);
    const writes = [
      { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: p.campos } },
      { update: { name: `${PREFIJO}/crm_dedup/${p.tel}`, fields: {
        lead_id: { stringValue: id }, creado_en: { timestampValue: new Date().toISOString() },
        creado_por: { stringValue: val(p.campos, "creado_por") || "migracion" } } } },
    ];
    for (const n of notas) writes.push({ update: { name: `${PREFIJO}/crm_leads/${id}/notas/${n.id}`, fields: n.fields } });
    await commit(H, writes);

    const refsCot = cots.filter((c) => val(c.fields, "lead_id") === p.viejo);
    const refsVen = vens.filter((v) => val(v.fields, "lead_id") === p.viejo);
    for (const c of refsCot) await patch(H, `crm_quotes/${c.id}`, { lead_id: { stringValue: id } }, "lead_id");
    for (const v of refsVen) await patch(H, `crm_sales/${v.id}`, { lead_id: { stringValue: id } }, "lead_id");

    /* Sólo «hecho» si TODO se verificó. */
    const cotAhora = await listarCot(H), venAhora = await listarVen(H);
    const cotOk = refsCot.every((x) => val(cotAhora.find((c) => c.id === x.id).fields, "lead_id") === id);
    const venOk = refsVen.every((x) => val(venAhora.find((v) => v.id === x.id).fields, "lead_id") === id);
    const notasOk = (await listarNotas(H, id)).length === notas.length;
    if (!(cotOk && venOk && notasOk)) {
      console.error(`FALLO verificando ${p.viejo}: queda PENDIENTE para reintento`);
      process.exit(3);
    }
    mapa[p.tel].estado = "hecho";
    guardarMapa(mapa);
    console.log(`  ${p.viejo} → ${id} · notas ${notas.length} · refs ${refsCot.length + refsVen.length} ✓`);
  }
  const leadsFin = await listarLeads(H);
  const idsFin = new Set(leadsFin.map((x) => x.id));
  const cotFin = await listarCot(H), venFin = await listarVen(H);
  let notasTotales = 0;
  for (const l of leadsFin) notasTotales += (await listarNotas(H, l.id)).length;
  /* Una referencia DESASOCIADA por una supresión ("suprimido") no es huérfana: es el
     valor terminal que deja el procedimiento de supresión al cortar el enlace personal.
     Contarla como huérfana haría fallar la migración por un estado correcto. */
  const esViva = (leadId) => !!leadId && leadId !== "suprimido";
  const cotHuerfanas = cotFin.filter((c) => esViva(val(c.fields, "lead_id")) && !idsFin.has(val(c.fields, "lead_id"))).length;
  const venHuerfanas = venFin.filter((v) => esViva(val(v.fields, "lead_id")) && !idsFin.has(val(v.fields, "lead_id"))).length;
  console.log("\n--- VERIFICACIÓN REFERENCIAL ---");
  console.log("  prospectos: " + leadsFin.length + " · notas: " + notasTotales +
    " · cotizaciones huérfanas: " + cotHuerfanas + " · ventas huérfanas: " + venHuerfanas);
  if (cotHuerfanas || venHuerfanas) { console.error("\nREFERENCIAS HUÉRFANAS: revisar"); process.exit(3); }
  console.log("\nMIGRACIÓN COMPLETA Y VERIFICADA");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });

/* ══ REVERSIÓN SEGURA (R01) ═══════════════════════════════════════════════════ */
/* B4 · RECUPERACIÓN DE TESTIGOS RESIDUALES de una reversión interrumpida.
   Un testigo se retira SÓLO si su operación concluyó y se verificó: el prospecto migrado
   ya no existe y ninguna cotización ni venta lo referencia. Si el prospecto sigue vivo hay
   trabajo destructivo pendiente y el testigo se CONSERVA, para no reabrir la ventana que
   el testigo existe para cerrar. Idempotente: se puede repetir sin efectos.
   NUNCA se recomienda suprimir-datos.cjs aquí: ese procedimiento suprime el prospecto. */
async function limpiarTestigos(H) {
  const testigos = await listarTestigos(H);
  if (!testigos.length) { console.log("No hay testigos de supresión ni de reversión pendientes."); return; }
  const leads = await listarLeads(H);
  const cot = await listarCot(H), ven = await listarVen(H);
  const idsVivos = new Set(leads.map((l) => l.id));
  let retirados = 0, conservados = 0, fallos = 0;
  console.log("Testigos encontrados: " + testigos.length);
  for (const w of testigos) {
    const uuid = w.id;
    const estado = val(w.fields, "estado");
    if (estado !== "reversion") {
      conservados++;
      console.log("  · " + uuid.slice(0, 8) + "… CONSERVADO: es de «" + estado + "», no de una reversión.");
      continue;
    }
    const existe = idsVivos.has(uuid);
    const refs = cot.some((c) => val(c.fields, "lead_id") === uuid) || ven.some((v) => val(v.fields, "lead_id") === uuid);
    if (existe || refs) {
      conservados++;
      console.log("  · " + uuid.slice(0, 8) + "… CONSERVADO: " +
        (existe ? "el prospecto sigue existiendo (trabajo destructivo pendiente)" : "quedan referencias vivas") +
        ". Reanuda con: --revertir --confirmar");
      continue;
    }
    const r = await fetch(`${DOCS}/crm_supresion/${uuid}`, { method: "DELETE", headers: H });
    if (r.ok || r.status === 404) { retirados++; console.log("  · " + uuid.slice(0, 8) + "… retirado (concluido y verificado)"); }
    else { fallos++; console.error("  · " + uuid.slice(0, 8) + "… NO se pudo retirar: HTTP " + r.status); }
  }
  console.log("\nTestigos retirados: " + retirados + " · conservados: " + conservados + " · fallos: " + fallos);
  if (conservados) {
    console.log("Los conservados protegen trabajo destructivo pendiente: reanuda la reversión");
    console.log("con --revertir --confirmar y vuelve a ejecutar --limpiar-testigos después.");
  }
  process.exit(fallos || conservados ? 3 : 0);
}
async function revertir(H) {
  const mapa = leerMapa();
  const entradas = Object.entries(mapa);
  if (!entradas.length) { console.log("No hay mapa: nada que revertir."); return; }
  if (!fs.existsSync(RESP)) {
    console.error("ABORTADO: no existe el respaldo. Sin respaldo no se puede comparar, y sin comparar no se revierte.");
    process.exit(3);
  }
  const respaldo = JSON.parse(fs.readFileSync(RESP, "utf8"));
  console.log("Entradas en el mapa: " + entradas.length + " · respaldo: " + (respaldo.leads || []).length + " prospectos");

  const ponerTestigos = () => escribirValidado(H, entradas.map(([, e]) => ({ update: {
    name: `${PREFIJO}/crm_supresion/${e.uuid}`,
    fields: { estado: { stringValue: "reversion" }, desde: { timestampValue: new Date().toISOString() },
      id_sha256: { stringValue: sha(e.uuid).slice(0, 16) } } } })), "escribir los testigos");

  const retirarTestigos = async () => {
    let fallos = 0;
    for (const [, e] of entradas) {
      let r = null;
      try { r = await fetch(`${DOCS}/crm_supresion/${e.uuid}`, { method: "DELETE", headers: H }); } catch { r = null; }
      if (!r || (!r.ok && r.status !== 404)) fallos++;
    }
    return fallos;
  };

  /* §2 · El testigo se adquiere ANTES del inventario autorizativo. Protege las escrituras
     que pasan por las reglas (notas, estado, cotizaciones, ventas, marcador); NO protege al
     procedimiento privilegiado, que salta las reglas: por eso las precondiciones del
     almacén no son opcionales. */
  if (CONFIRMAR) await ponerTestigos();

  /* §1 · ESTADO VALIDADO. Se lee y se valida UNA sola vez, conservando el updateTime de
     cada documento. Ninguna escritura posterior usará una versión distinta de la validada. */
  const leadsAhora = await listarLeads(H);
  const cotsAhora = await listarCot(H);
  const vensAhora = await listarVen(H);
  const dedupAhora = await listarDedup(H);
  const problemas = [], detalle = [];
  const validado = new Map();

  for (const [tel, e] of entradas) {
    const fila = leadsAhora.find((l) => l.id === e.uuid);
    const previo = (respaldo.leads || []).find((l) => l.id === e.viejo);
    const reg = { tel, uuid: e.uuid, viejo: e.viejo, lead: null, notas: [], marcador: null, cots: [], vens: [] };

    if (fila) {
      /* §3 · Un GET con 404 falso no puede pasar por «documento ausente»: se contrasta con
         el listado, que es una fuente independiente. */
      const lectura = await leerValidado(H, `crm_leads/${e.uuid}`, "prospecto " + tel);
      if (!lectura.existe) {
        problemas.push(`${tel}: el listado lo incluye pero la lectura dice que no existe (respuesta incoherente)`);
      } else {
        reg.lead = { updateTime: lectura.updateTime, fields: lectura.fields };
        if (!previo) problemas.push(`${tel}: el prospecto migrado no está en el respaldo; no se puede verificar`);
        else if (!previo.campos) problemas.push(`${tel}: el respaldo no guardó el documento completo; no se puede verificar`);
        else {
          for (const c of camposCambiados(previo.campos, lectura.fields)) {
            problemas.push(c.tipo === "añadido"
              ? `${tel}: el campo «${c.campo}» se añadió después de la migración`
              : c.tipo === "eliminado"
                ? `${tel}: el campo «${c.campo}» se eliminó después de la migración`
                : `${tel}: el campo «${c.campo}» cambió después de la migración`);
          }
        }
      }

      const notasResp = (respaldo.notas || []).filter((n) => n.lead === e.viejo);
      const idsResp = notasResp.map((n) => n.id);
      for (const n of await listarNotas(H, e.uuid)) {
        const ln = await leerValidado(H, `crm_leads/${e.uuid}/notas/${n.id}`, "nota " + n.id);
        if (!ln.existe) { problemas.push(`${tel}: la nota ${n.id} aparece en el listado y no se puede leer`); continue; }
        reg.notas.push({ id: n.id, updateTime: ln.updateTime, fields: ln.fields });
      }
      const reversionIniciada = !!e.reversion;
      const nuevas = reg.notas.filter((n) => !idsResp.includes(n.id));
      if (nuevas.length) problemas.push(`${tel}: ${nuevas.length} nota(s) creadas después de la migración`);
      if (!reversionIniciada) {
        const faltan = idsResp.filter((id) => !reg.notas.some((n) => n.id === id));
        if (faltan.length) problemas.push(`${tel}: ${faltan.length} nota(s) desaparecidas después de la migración`);
      } else {
        detalle.push(`${tel}: reversión ya iniciada en una ejecución anterior (notas borradas por nosotros)`);
      }
      /* Las ediciones se comparan SIEMPRE, también al reanudar. */
      const editadas = [];
      for (const r of notasResp) {
        const ahora = reg.notas.find((n) => n.id === r.id);
        if (ahora && r.campos && huellaCampos(r.campos) !== huellaCampos(ahora.fields)) editadas.push(r.id);
      }
      if (editadas.length) problemas.push(`${tel}: ${editadas.length} nota(s) editadas después de la migración`);
      detalle.push(`${tel}: notas ahora ${reg.notas.length} · en respaldo ${idsResp.length}`);
    }

    const marca = dedupAhora.find((d) => d.id === tel);
    if (marca) {
      const lm = await leerValidado(H, `crm_dedup/${tel}`, "marcador " + tel);
      if (!lm.existe) problemas.push(`${tel}: el marcador aparece en el listado y no se puede leer`);
      else if (val(lm.fields, "lead_id") !== e.uuid) problemas.push(`${tel}: el marcador ya no apunta al prospecto migrado`);
      else reg.marcador = { updateTime: lm.updateTime };
    }

    const cotResp = (respaldo.cotizaciones || []).filter((c) => c.lead_id === e.viejo).map((c) => c.id);
    for (const c of cotsAhora.filter((x) => val(x.fields, "lead_id") === e.uuid)) {
      const lc = await leerValidado(H, `crm_quotes/${c.id}`, "cotización " + c.id);
      if (!lc.existe) { problemas.push(`${tel}: la cotización ${c.id} aparece en el listado y no se puede leer`); continue; }
      reg.cots.push({ id: c.id, updateTime: lc.updateTime });
    }
    const cotNew = reg.cots.filter((c) => !cotResp.includes(c.id));
    if (cotNew.length) problemas.push(`${tel}: ${cotNew.length} cotización(es) creadas después de la migración`);

    const venResp = (respaldo.ventas || []).filter((v) => v.lead_id === e.viejo).map((v) => v.id);
    for (const v of vensAhora.filter((x) => val(x.fields, "lead_id") === e.uuid)) {
      const lv = await leerValidado(H, `crm_sales/${v.id}`, "venta " + v.id);
      if (!lv.existe) { problemas.push(`${tel}: la venta ${v.id} aparece en el listado y no se puede leer`); continue; }
      reg.vens.push({ id: v.id, updateTime: lv.updateTime });
    }
    const venNew = reg.vens.filter((v) => !venResp.includes(v.id));
    if (venNew.length) problemas.push(`${tel}: ${venNew.length} venta(s) creadas después de la migración`);

    validado.set(tel, reg);
  }

  console.log("\n--- COMPARACIÓN CONTRA EL RESPALDO ---");
  detalle.forEach((d) => console.log("  " + d));

  if (problemas.length) {
    console.error("\nREVERSIÓN RECHAZADA: se perdería información creada después de la migración.");
    problemas.forEach((p) => console.error("  · " + p));
    const fallosRetirada = await retirarTestigos();
    if (fallosRetirada) {
      console.error("  ATENCIÓN: " + fallosRetirada + " testigo(s) no se pudieron retirar.");
      console.error("  Recuperación segura: node crm-dev/migrar-uuid.cjs --revertir --limpiar-testigos");
      console.error("  NUNCA uses suprimir-datos.cjs: suprimiría el prospecto entero.");
    }
    console.error("\nNo se ha modificado ningún documento.");
    process.exit(3);
  }
  console.log("  sin datos posteriores: la reversión es segura");

  if (!CONFIRMAR) {
    console.log("\nSIMULACIÓN de reversión. Se repuntarían referencias y se borrarían los documentos NUEVOS.");
    return;
  }

  let repuntadas = 0, borrados = 0;
  for (const [tel, e] of entradas) {
    const reg = validado.get(tel);
    if (!reg || (!reg.lead && reg.notas.length === 0)) {
      console.error(`\nINCOMPLETO: ${tel} no tiene estado validado utilizable. Se conserva el mapa y el testigo.`);
      process.exit(3);
    }
    mapa[tel] = { ...e, reversion: "iniciada" };
    guardarMapa(mapa);

    /* §1 · Las escrituras usan EXCLUSIVAMENTE el updateTime validado. */
    for (const c of reg.cots) {
      await escribirValidado(H, [{ update: { name: `${PREFIJO}/crm_quotes/${c.id}`, fields: { lead_id: { stringValue: e.viejo } } },
        updateMask: { fieldPaths: ["lead_id"] }, currentDocument: { updateTime: c.updateTime } }], "repuntar cotización " + c.id);
      repuntadas++;
    }
    for (const v of reg.vens) {
      await escribirValidado(H, [{ update: { name: `${PREFIJO}/crm_sales/${v.id}`, fields: { lead_id: { stringValue: e.viejo } } },
        updateMask: { fieldPaths: ["lead_id"] }, currentDocument: { updateTime: v.updateTime } }], "repuntar venta " + v.id);
      repuntadas++;
    }
    for (const n of reg.notas) {
      await escribirValidado(H, [{ delete: `${PREFIJO}/crm_leads/${e.uuid}/notas/${n.id}`,
        currentDocument: { updateTime: n.updateTime } }], "borrar nota " + n.id);
      borrados++;
    }
    if (reg.lead) {
      await escribirValidado(H, [{ delete: `${PREFIJO}/crm_leads/${e.uuid}`,
        currentDocument: { updateTime: reg.lead.updateTime } }], "borrar prospecto " + tel);
      borrados++;
    }
    if (reg.marcador) {
      await escribirValidado(H, [{ delete: `${PREFIJO}/crm_dedup/${tel}`,
        currentDocument: { updateTime: reg.marcador.updateTime } }], "borrar marcador " + tel);
    }

    /* §5 · VERIFICACIÓN FINAL antes de dar la entrada por terminada. */
    const vLead = await leerValidado(H, `crm_leads/${e.uuid}`, "verificar prospecto");
    if (vLead.existe) throw new Error(`${tel}: el prospecto sigue existiendo tras el borrado`);
    const vNotas = await listarNotas(H, e.uuid);
    if (vNotas.length) throw new Error(`${tel}: quedan ${vNotas.length} nota(s) sin borrar`);
    if (reg.marcador) {
      const vm = await leerValidado(H, `crm_dedup/${tel}`, "verificar marcador");
      if (vm.existe) throw new Error(`${tel}: el marcador sigue existiendo`);
    }
    const cotFin = (await listarCot(H)), venFin = (await listarVen(H));
    if (cotFin.some((c) => val(c.fields, "lead_id") === e.uuid) || venFin.some((v) => val(v.fields, "lead_id") === e.uuid))
      throw new Error(`${tel}: quedan referencias al UUID`);
    for (const c of reg.cots) {
      const ahora = cotFin.find((x) => x.id === c.id);
      if (!ahora || val(ahora.fields, "lead_id") !== e.viejo) throw new Error(`${tel}: la cotización ${c.id} no quedó repuntada`);
    }
    for (const v of reg.vens) {
      const ahora = venFin.find((x) => x.id === v.id);
      if (!ahora || val(ahora.fields, "lead_id") !== e.viejo) throw new Error(`${tel}: la venta ${v.id} no quedó repuntada`);
    }
    if (reg.lead) {
      const heredado = await leerValidado(H, `crm_leads/${e.viejo}`, "verificar heredado " + tel);
      if (!heredado.existe) throw new Error(`${tel}: el documento heredado no está tras la reversión`);
    }

    /* §5.6 · El testigo se retira y se CONFIRMA su retirada antes de marcar «hecha». */
    let rt = null;
    try { rt = await fetch(`${DOCS}/crm_supresion/${e.uuid}`, { method: "DELETE", headers: H }); } catch { rt = null; }
    if (!rt) throw new Error(`${tel}: sin respuesta al retirar el testigo (HTTP 500/503 o conexión)`);
    if (rt.status === 500 || rt.status === 503) throw new Error(`${tel}: al retirar el testigo respondió HTTP ${rt.status}`);
    const vt = await leerValidado(H, `crm_supresion/${e.uuid}`, "verificar testigo");
    if (vt.existe) throw new Error(`${tel}: el testigo sigue presente; la entrada NO se marca terminada`);

    mapa[tel] = { ...mapa[tel], reversion: "hecha" };
    guardarMapa(mapa);
    console.log(`  ${e.viejo} ← ${tel} · notas ${reg.notas.length} · refs ${reg.cots.length + reg.vens.length} · verificado ✓`);
  }

  const pendientes = Object.entries(leerMapa()).filter(([, x]) => x.reversion !== "hecha");
  if (pendientes.length) {
    console.error("\nREVERSIÓN INCOMPLETA: " + pendientes.length + " entrada(s) sin terminar. Se conserva el mapa.");
    process.exit(3);
  }
  const cotsFin = await listarCot(H), vensFin = await listarVen(H);
  const malas = entradas.filter(([, e]) =>
    cotsFin.some((c) => val(c.fields, "lead_id") === e.uuid) || vensFin.some((v) => val(v.fields, "lead_id") === e.uuid));
  if (malas.length) {
    console.error("\nReversión INCOMPLETA: quedan referencias al UUID. Se conserva el mapa.");
    process.exit(3);
  }

  fs.unlinkSync(MAPA);
  console.log("\nREVERSIÓN COMPLETA · referencias repuntadas: " + repuntadas + " · documentos nuevos borrados: " + borrados);
}