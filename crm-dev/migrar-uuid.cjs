/* KZ-CRM-018 · Migración al modelo UUID (A03) — PROCEDIMIENTO PRIVILEGIADO.
   INTERNO: crm-dev/. No se publica.

   QUÉ HACE
   Convierte prospectos del modelo antiguo (id = teléfono) al modelo nuevo:
     crm_leads/{uuid}  +  crm_dedup/{telefono}  +  notas copiadas  +  lead_id repuntado
   en cotizaciones y ventas.

   GARANTÍAS
     · SIMULACIÓN POR DEFECTO: sin --confirmar no escribe nada.
     · RESPALDO verificable (SHA-256) de todo lo que va a tocar, antes de tocar nada.
     · MAPA telefono → uuid persistido, para idempotencia y para revertir.
     · IDEMPOTENTE: si el teléfono ya está en el mapa, se salta; repetir no crea UUID
       nuevos ni duplica notas ni referencias.
     · NO BORRA NADA: los documentos antiguos siguen donde estaban. Limpiarlos es un
       paso posterior, separado y con autorización.

   Uso:
     node crm-dev/migrar-uuid.cjs                      # simulación
     node crm-dev/migrar-uuid.cjs --confirmar           # migra
     node crm-dev/migrar-uuid.cjs --revertir --confirmar   # deshace usando el mapa
     (añadir --emulador para probar; en producción exige sesión de firebase login)
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

const uuid = () => crypto.randomUUID();
const sha = (obj) => crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

async function cabecera() {
  if (EMULADOR) return { authorization: "Bearer owner", "content-type": "application/json" };
  const { tokenAcceso } = require(
    "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
  );
  return { authorization: "Bearer " + (await tokenAcceso()), "content-type": "application/json" };
}

const listar = async (H, ruta) => {
  const r = await fetch(ruta, { headers: H });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.documents || []).map((d) => ({ id: d.name.split("/").pop(), name: d.name, fields: d.fields || {} }));
};
const listarNotas = async (H, leadId) => listar(H, `${DOCS}/crm_leads/${leadId}/notas?pageSize=300`);

const commit = (H, writes) => fetch(`${DOCS}:commit`, {
  method: "POST", headers: H, body: JSON.stringify({ writes }),
}).then((r) => r.status);

const patch = (H, ruta, fields, mask) => fetch(`${DOCS}/${ruta}?updateMask.fieldPaths=${mask}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ fields }),
}).then((r) => r.status);

const borrar = (H, ruta) => fetch(`${DOCS}/${ruta}`, { method: "DELETE", headers: H }).then((r) => r.status);

const leerMapa = () => (fs.existsSync(MAPA) ? JSON.parse(fs.readFileSync(MAPA, "utf8")) : {});
const guardarMapa = (m) => fs.writeFileSync(MAPA, JSON.stringify(m, null, 1), "utf8");

(async () => {
  const H = await cabecera();

  const leads = await listar(H, `${DOCS}/crm_leads?pageSize=300`);
  console.log("Proyecto : " + PROYECTO + (EMULADOR ? "  (EMULADOR)" : "  (PRODUCCIÓN)"));
  console.log("Modo     : " + (REVERTIR ? "REVERSIÓN" : CONFIRMAR ? "MIGRACIÓN" : "SIMULACIÓN") +
    (CONFIRMAR ? "" : " (no escribe nada)"));
  console.log("Prospectos encontrados: " + leads.length);

  if (REVERTIR) return revertir(H, leads);

  /* ── 1. Inventario y clasificación ── */
  const mapa = leerMapa();
  const pendientes = [];
  for (const l of leads) {
    const tel = val(l.fields, "telefono");
    const yaHecho = mapa[tel] && mapa[tel].uuid === l.id;
    if (yaHecho) continue;                      // ya es UUID: nada que migrar
    if (mapa[tel]) { console.log("  · " + l.id + " ya tiene UUID en el mapa: se salta"); continue; }
    pendientes.push({ viejo: l.id, tel, campos: l.fields });
  }
  console.log("Pendientes de migrar: " + pendientes.length);
  if (!pendientes.length) { console.log("\nNada que migrar. La migración es idempotente."); return; }

  /* ── 2. Respaldo verificable ANTES de tocar nada ── */
  const respaldo = { fecha: new Date().toISOString(), proyecto: PROYECTO, leads: [], notas: [], cotizaciones: [], ventas: [] };
  for (const p of pendientes) {
    respaldo.leads.push({ id: p.viejo, campos: p.campos });
    for (const n of await listarNotas(H, p.viejo)) respaldo.notas.push({ lead: p.viejo, id: n.id, campos: n.fields });
  }
  const cot = await listar(H, `${DOCS}/crm_quotes?pageSize=300`);
  const ven = await listar(H, `${DOCS}/crm_sales?pageSize=300`);
  respaldo.cotizaciones = cot.map((c) => ({ id: c.id, lead_id: val(c.fields, "lead_id") }));
  respaldo.ventas = ven.map((v) => ({ id: v.id, lead_id: val(v.fields, "lead_id") }));
  const huella = sha(respaldo);

  console.log("\n--- RESPALDO ---");
  console.log("  prospectos: " + respaldo.leads.length + " · notas: " + respaldo.notas.length +
    " · cotizaciones: " + respaldo.cotizaciones.length + " · ventas: " + respaldo.ventas.length);
  console.log("  sha256: " + huella);

  if (!CONFIRMAR) {
    console.log("\nSIMULACIÓN. No se ha escrito nada.");
    for (const p of pendientes) console.log("  migraría " + p.viejo + " → UUID nuevo (tel " + p.tel + ")");
    return;
  }
  fs.writeFileSync(RESP, JSON.stringify({ huella, ...respaldo }, null, 1), "utf8");
  console.log("  respaldo escrito en migracion-respaldo.json");

  /* ── 3. Migración ── */
  let migrados = 0, notasCopiadas = 0, refsRepuntadas = 0, errores = 0;
  for (const p of pendientes) {
    const id = uuid();
    const notas = await listarNotas(H, p.viejo);

    const writes = [
      { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: p.campos } },
      { update: { name: `${PREFIJO}/crm_dedup/${p.tel}`,
        fields: { lead_id: { stringValue: id }, creado_en: { timestampValue: new Date().toISOString() },
                  creado_por: { stringValue: val(p.campos, "creado_por") || "migracion" } } } },
    ];
    for (const n of notas) writes.push({ update: { name: `${PREFIJO}/crm_leads/${id}/notas/${n.id}`, fields: n.campos } });

    const st = await commit(H, writes);
    if (st !== 200) { console.error("  ERROR migrando " + p.viejo + ": HTTP " + st); errores++; continue; }
    migrados++; notasCopiadas += notas.length;

    /* Repuntar referencias comerciales del id antiguo al nuevo */
    for (const c of respaldo.cotizaciones.filter((x) => x.lead_id === p.viejo)) {
      if (await patch(H, `crm_quotes/${c.id}`, { lead_id: { stringValue: id } }, "lead_id") === 200) refsRepuntadas++;
      else errores++;
    }
    for (const v of respaldo.ventas.filter((x) => x.lead_id === p.viejo)) {
      if (await patch(H, `crm_sales/${v.id}`, { lead_id: { stringValue: id } }, "lead_id") === 200) refsRepuntadas++;
      else errores++;
    }

    mapa[p.tel] = { uuid: id, viejo: p.viejo, fecha: new Date().toISOString() };
    guardarMapa(mapa);
  }

  console.log("\n--- MIGRACIÓN ---");
  console.log("  prospectos migrados: " + migrados + " · notas copiadas: " + notasCopiadas +
    " · referencias repuntadas: " + refsRepuntadas + " · errores: " + errores);

  /* ── 4. Verificación referencial ── */
  const cerca = await verificar(H);
  console.log("\n--- VERIFICACIÓN REFERENCIAL ---");
  console.log("  prospectos: " + cerca.leads + " · notas: " + cerca.notas +
    " · cotizaciones huérfanas: " + cerca.cotHuerfanas + " · ventas huérfanas: " + cerca.venHuerfanas +
    " · marcadores: " + cerca.marcadores + " · marcadores huérfanos: " + cerca.marcHuerfanos);
  const ok = cerca.cotHuerfanas === 0 && cerca.venHuerfanas === 0 && cerca.marcHuerfanos === 0 && errores === 0;
  console.log("\n" + (ok ? "MIGRACIÓN CORRECTA" : "MIGRACIÓN CON PROBLEMAS: revisar los conteos"));
  process.exit(ok ? 0 : 3);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });

async function verificar(H) {
  const leads = await listar(H, `${DOCS}/crm_leads?pageSize=300`);
  const ids = new Set(leads.map((l) => l.id));
  let notas = 0;
  for (const l of leads) notas += (await listarNotas(H, l.id)).length;
  const cots = await listar(H, `${DOCS}/crm_quotes?pageSize=300`);
  const vens = await listar(H, `${DOCS}/crm_sales?pageSize=300`);
  const marc = await listar(H, `${DOCS}/crm_dedup?pageSize=300`);
  return {
    leads: leads.length, notas,
    cotHuerfanas: cots.filter((c) => !ids.has(val(c.fields, "lead_id"))).length,
    venHuerfanas: vens.filter((v) => !ids.has(val(v.fields, "lead_id"))).length,
    marcadores: marc.length,
    marcHuerfanos: marc.filter((m) => !ids.has(val(m.fields, "lead_id"))).length,
  };
}

async function revertir(H, leads) {
  const mapa = leerMapa();
  const entradas = Object.entries(mapa);
  console.log("Entradas en el mapa: " + entradas.length);
  if (!entradas.length) { console.log("No hay mapa: nada que revertir."); return; }
  if (!CONFIRMAR) {
    console.log("\nSIMULACIÓN de reversión. Se repuntarían las referencias a los ids antiguos");
    console.log("y se borrarían los documentos NUEVOS. Los antiguos nunca se borraron.");
    return;
  }
  let repuntadas = 0, borrados = 0, errores = 0;
  for (const [tel, e] of entradas) {
    const cots = await listar(H, `${DOCS}/crm_quotes?pageSize=300`);
    for (const c of cots.filter((x) => val(x.fields, "lead_id") === e.uuid)) {
      if (await patch(H, `crm_quotes/${c.id}`, { lead_id: { stringValue: e.viejo } }, "lead_id") === 200) repuntadas++; else errores++;
    }
    const vens = await listar(H, `${DOCS}/crm_sales?pageSize=300`);
    for (const v of vens.filter((x) => val(x.fields, "lead_id") === e.uuid)) {
      if (await patch(H, `crm_sales/${v.id}`, { lead_id: { stringValue: e.viejo } }, "lead_id") === 200) repuntadas++; else errores++;
    }
    for (const n of await listarNotas(H, e.uuid)) {
      if (await borrar(H, `crm_leads/${e.uuid}/notas/${n.id}`) === 200) borrados++; else errores++;
    }
    if (await borrar(H, `crm_leads/${e.uuid}`) === 200) borrados++; else errores++;
    if (await borrar(H, `crm_dedup/${tel}`) !== 200) errores++;
  }
  fs.unlinkSync(MAPA);
  console.log("\n--- REVERSIÓN ---");
  console.log("  referencias repuntadas: " + repuntadas + " · documentos nuevos borrados: " + borrados + " · errores: " + errores);
  console.log("  mapa eliminado. Los documentos antiguos siguen intactos.");
  process.exit(errores ? 3 : 0);
}
