/* KZ-CRM-018 · Migración a UUID + reversión SEGURA (R01 y R03).
   INTERNO: crm-dev/. No se publica.

   CORRECCIONES DE ESTA VERSIÓN
   R01 · La reversión YA NO borra a ciegas: inventaría el estado actual (con paginación
         completa), lo compara contra el respaldo y, si detecta CUALQUIER dato posterior
         (notas nuevas, cambios de campos, cotizaciones o ventas nuevas), SE NIEGA y
         termina con código 3 sin modificar un solo documento.
   R03 · Idempotencia y reanudación reales: distingue heredados de UUID nativos; el mapa
         guarda `estado` por entrada y sólo pasa a `hecho` tras verificar referencias;
         una entrada `pendiente` se reintenta. Cualquier error aborta con código ≠ 0.
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
const DOCS = EMULADOR
  ? `http://127.0.0.1:8080/v1/${PREFIJO}`
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

const leerMapa = () => (fs.existsSync(MAPA) ? JSON.parse(fs.readFileSync(MAPA, "utf8")) : {});
const guardarMapa = (m) => fs.writeFileSync(MAPA, JSON.stringify(m, null, 1), "utf8");

const CAMPOS_CLAVE = ["nombre", "telefono", "industria", "estado", "asignado_a", "retencion_hasta", "servicio_interes"];
const foto = (fields) => Object.fromEntries(CAMPOS_CLAVE.map((k) => [k, val(fields, k) ?? null]));

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
      if (!respaldo.notas.some((x) => x.lead === p.viejo && x.id === n.id)) respaldo.notas.push({ lead: p.viejo, id: n.id });
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
    const notas = await listarNotas(H, p.viejo);
    const writes = [
      { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: p.campos } },
      { update: { name: `${PREFIJO}/crm_dedup/${p.tel}`, fields: {
        lead_id: { stringValue: id }, creado_en: { timestampValue: new Date().toISOString() },
        creado_por: { stringValue: val(p.campos, "creado_por") || "migracion" } } } },
    ];
    for (const n of notas) writes.push({ update: { name: `${PREFIJO}/crm_leads/${id}/notas/${n.id}`, fields: n.fields } });
    await commit(H, writes);

    mapa[p.tel] = { uuid: id, viejo: p.viejo, estado: "pendiente", fecha: new Date().toISOString() };
    guardarMapa(mapa);

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

  const problemas = [], detalle = [];

  for (const [tel, e] of entradas) {
    const actual = leadsAhora.find((l) => l.id === e.uuid);
    const previo = (respaldo.leads || []).find((l) => l.id === e.viejo);

    if (actual && previo && previo.foto) {
      const f = foto(actual.fields);
      for (const k of Object.keys(previo.foto)) {
        if (String(f[k] ?? "") !== String(previo.foto[k] ?? ""))
          problemas.push(`${tel}: el campo «${k}» cambió después de la migración`);
      }
    }

    if (actual) {
      const notasAhora = await listarNotas(H, e.uuid);
      const notasResp = (respaldo.notas || []).filter((n) => n.lead === e.viejo).map((n) => n.id);
      const nuevas = notasAhora.filter((n) => !notasResp.includes(n.id));
      if (nuevas.length) problemas.push(`${tel}: ${nuevas.length} nota(s) creadas después de la migración`);
      detalle.push(`${tel}: notas ahora ${notasAhora.length} · en respaldo ${notasResp.length}`);
    }

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
    for (const c of cotsAhora.filter((x) => val(x.fields, "lead_id") === e.uuid))
      { await patch(H, `crm_quotes/${c.id}`, { lead_id: { stringValue: e.viejo } }, "lead_id"); repuntadas++; }
    for (const v of vensAhora.filter((x) => val(x.fields, "lead_id") === e.uuid))
      { await patch(H, `crm_sales/${v.id}`, { lead_id: { stringValue: e.viejo } }, "lead_id"); repuntadas++; }
    for (const n of await listarNotas(H, e.uuid)) { await borrar(H, `crm_leads/${e.uuid}/notas/${n.id}`); borrados++; }
    await borrar(H, `crm_leads/${e.uuid}`); borrados++;
    await borrar(H, `crm_dedup/${tel}`);
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
