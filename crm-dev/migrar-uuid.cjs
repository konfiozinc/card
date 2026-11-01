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
const borrarSiNoCambio = async (H, ruta, updateTime) => {
  const writes = [{ delete: `${PREFIJO}/${ruta}` }];
  if (updateTime) writes[0].currentDocument = { updateTime };
  let r;
  try {
    r = await fetch(`${DOCS}:commit`, { method: "POST", headers: H, body: JSON.stringify({ writes }) });
  } catch (e) { throw new Error("commit de borrado sin respuesta: " + e.message); }
  if (r.ok || r.status === 404) return true;
  throw new Error(`el borrado de ${ruta} fue rechazado (HTTP ${r.status}): el documento cambió mientras se revertía`);
};
const updateTimeDe = async (H, ruta) => {
  const r = await fetch(`${DOCS}/${ruta}`, { headers: H });
  if (!r.ok) return null;
  return (await r.json()).updateTime || null;
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
  const cotHuerfanas = cotFin.filter((c) => !idsFin.has(val(c.fields, "lead_id"))).length;
  const venHuerfanas = venFin.filter((v) => !idsFin.has(val(v.fields, "lead_id"))).length;
  console.log("\n--- VERIFICACIÓN REFERENCIAL ---");
  console.log("  prospectos: " + leadsFin.length + " · notas: " + notasTotales +
    " · cotizaciones huérfanas: " + cotHuerfanas + " · ventas huérfanas: " + venHuerfanas);
  if (cotHuerfanas || venHuerfanas) { console.error("\nREFERENCIAS HUÉRFANAS: revisar"); process.exit(3); }
  console.log("\nMIGRACIÓN COMPLETA Y VERIFICADA");
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });

/* ══ REVERSIÓN SEGURA (R01) ═══════════════════════════════════════════════════ */
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

  const leadsAhora = await listarLeads(H);
  const cotsAhora = await listarCot(H);
  const vensAhora = await listarVen(H);
  const dedupAhora = await listarDedup(H);

  const problemas = [], detalle = [];

  for (const [tel, e] of entradas) {
    const actual = leadsAhora.find((l) => l.id === e.uuid);
    const previo = (respaldo.leads || []).find((l) => l.id === e.viejo);

    /* ── 1. El documento completo, campo a campo (no una lista corta) ───── */
    if (actual) {
      if (!previo) {
        /* No poder comparar NO autoriza a borrar: sin respaldo de este prospecto no
           hay forma de saber qué se perdería. */
        problemas.push(`${tel}: el prospecto migrado no está en el respaldo; no se puede verificar`);
      } else if (!previo.campos) {
        problemas.push(`${tel}: el respaldo no guardó el documento completo; no se puede verificar`);
      } else {
        for (const c of camposCambiados(previo.campos, actual.fields))
          problemas.push(c.tipo === "añadido"
            ? `${tel}: el campo «${c.campo}» se añadió después de la migración`
            : c.tipo === "eliminado"
              ? `${tel}: el campo «${c.campo}» se eliminó después de la migración`
              : `${tel}: el campo «${c.campo}» cambió después de la migración`);
      }
    }

    /* ── 2. Notas: creadas, editadas o desaparecidas después de migrar ─── */
    if (actual) {
      const notasAhora = await listarNotas(H, e.uuid);
      const notasResp = (respaldo.notas || []).filter((n) => n.lead === e.viejo);
      const idsResp = notasResp.map((n) => n.id);

      /* Una nota que ya no está porque la borró ESTA MISMA reversión en una ejecución
         anterior interrumpida no es una pérdida: es trabajo ya hecho. Por eso, si la
         entrada lleva `reversion` registrada, no se exigen las notas del respaldo. Lo que
         sí se sigue exigiendo es que no haya notas NUEVAS: una nota creada entre la
         interrupción y la reanudación se perdería igual. */
      const reversionIniciada = !!e.reversion;

      const nuevas = notasAhora.filter((n) => !idsResp.includes(n.id));
      if (nuevas.length) problemas.push(`${tel}: ${nuevas.length} nota(s) creadas después de la migración`);

      if (!reversionIniciada) {
        const faltan = idsResp.filter((id) => !notasAhora.some((n) => n.id === id));
        if (faltan.length) problemas.push(`${tel}: ${faltan.length} nota(s) desaparecidas después de la migración`);

        /* Sólo se puede comparar el contenido si el respaldo lo guardó. */
        const editadas = [];
        for (const r of notasResp) {
          const ahora = notasAhora.find((n) => n.id === r.id);
          if (ahora && r.campos && huellaCampos(r.campos) !== huellaCampos(ahora.fields)) editadas.push(r.id);
        }
        if (editadas.length) problemas.push(`${tel}: ${editadas.length} nota(s) editadas después de la migración`);
      } else {
        detalle.push(`${tel}: reversión ya iniciada en una ejecución anterior (notas borradas por nosotros)`);
      }

      detalle.push(`${tel}: notas ahora ${notasAhora.length} · en respaldo ${idsResp.length}`);
    }

    /* ── 3. El marcador debe seguir apuntando a ESTE prospecto ────────────
       Si alguien lo reutilizó para otro prospecto, borrarlo destruiría el marcador
       de un tercero. */
    const marca = dedupAhora.find((d) => d.id === tel);
    if (marca && val(marca.fields, "lead_id") !== e.uuid)
      problemas.push(`${tel}: el marcador de deduplicación ya no apunta al prospecto migrado`);

    const cotResp = (respaldo.cotizaciones || []).filter((c) => c.lead_id === e.viejo).map((c) => c.id);
    const cotNew = cotsAhora.filter((c) => val(c.fields, "lead_id") === e.uuid && !cotResp.includes(c.id));
    if (cotNew.length) problemas.push(`${tel}: ${cotNew.length} cotización(es) creadas después de la migración`);

    const venResp = (respaldo.ventas || []).filter((v) => v.lead_id === e.viejo).map((v) => v.id);
    const venNew = vensAhora.filter((v) => val(v.fields, "lead_id") === e.uuid && !venResp.includes(v.id));
    if (venNew.length) problemas.push(`${tel}: ${venNew.length} venta(s) creadas después de la migración`);
  }

  console.log("\n--- COMPARACIÓN CONTRA EL RESPALDO ---");
  detalle.forEach((d) => console.log("  " + d));

  if (problemas.length) {
    console.error("\nREVERSIÓN RECHAZADA: se perdería información creada después de la migración.");
    problemas.forEach((p) => console.error("  · " + p));
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
    /* R01/R03 · Se anota en el mapa que ESTA entrada ya se está revirtiendo, antes de
       tocar nada. Si la reversión se interrumpe, la reanudación sabrá que las notas que
       faltan las borró ella y no las tomará por una pérdida de información. */
    if (e.reversion !== "hecha") {
      mapa[tel] = { ...e, reversion: "iniciada" };
      guardarMapa(mapa);
    }

    for (const c of cotsAhora.filter((x) => val(x.fields, "lead_id") === e.uuid))
      { await patch(H, `crm_quotes/${c.id}`, { lead_id: { stringValue: e.viejo } }, "lead_id"); repuntadas++; }
    for (const v of vensAhora.filter((x) => val(x.fields, "lead_id") === e.uuid))
      { await patch(H, `crm_sales/${v.id}`, { lead_id: { stringValue: e.viejo } }, "lead_id"); repuntadas++; }
    for (const n of await listarNotas(H, e.uuid)) {
      await borrarSiNoCambio(H, `crm_leads/${e.uuid}/notas/${n.id}`, await updateTimeDe(H, `crm_leads/${e.uuid}/notas/${n.id}`));
      borrados++;
    }
    await borrarSiNoCambio(H, `crm_leads/${e.uuid}`, await updateTimeDe(H, `crm_leads/${e.uuid}`)); borrados++;
    await borrar(H, `crm_dedup/${tel}`);

    mapa[tel] = { ...mapa[tel], reversion: "hecha" };
    guardarMapa(mapa);
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
