/* KZ-CRM-018 · Certificación de la migración a UUID (A03).
   INTERNO: crm-dev/.

   Escenario: se siembran prospectos con el ESQUEMA ANTIGUO (id = teléfono, notas,
   cotización y venta colgando de él), se ejecuta la migración, se comprueba el
   resultado, se REPITE la migración para probar idempotencia, y finalmente se revierte.

   Ejecutar:
     firebase emulators:exec --only firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-migracion.cjs" */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const SCRIPT = path.join(__dirname, "migrar-uuid.cjs");
const MAPA = path.join(__dirname, "migracion-uuid.json");
const RESP = path.join(__dirname, "migracion-respaldo.json");

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const correr = (args) => {
  try {
    return { codigo: 0, salida: execFileSync(process.execPath, [SCRIPT, "--emulador", ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) { return { codigo: e.status, salida: String((e.stdout || "") + (e.stderr || "")) }; }
};

const listar = async (ruta) => {
  const j = await fetch(`${FS}/${ruta}`, { headers: OWNER }).then((r) => r.json()).catch(() => ({}));
  return j.documents || [];
};
const contar = async (ruta) => (await listar(ruta)).length;
const leer = (ruta) => fetch(`${FS}/${ruta}`, { headers: OWNER }).then((r) => r.ok ? r.json() : null);

const leadAntiguo = (tel, uid) => ({
  nombre: { stringValue: "Antiguo " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "contactado" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [{ stringValue: "nota heredada del modelo viejo" }] } },
  origen: { stringValue: "manual" },
});

(async () => {
  for (const f of [MAPA, RESP]) if (fs.existsSync(f)) fs.unlinkSync(f);

  const A = "3209000001", B = "3209000002", UID = "uid-migracion-ficticio";

  console.log("=== A. Sembrar el esquema ANTIGUO ===");
  for (const tel of [A, B]) {
    await fetch(`${FS}/crm_leads?documentId=${tel}`, { method: "POST", headers: OWNER,
      body: JSON.stringify({ fields: leadAntiguo(tel, UID) }) });
    await fetch(`${FS}/crm_leads/${tel}/notas`, { method: "POST", headers: OWNER,
      body: JSON.stringify({ fields: { texto: { stringValue: "nota vieja de " + tel },
        autor: { stringValue: UID }, fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } } }) });
  }
  await fetch(`${FS}/crm_quotes`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: { lead_id: { stringValue: A }, plan: { stringValue: "pro" },
      monto: { integerValue: 99900 }, moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
      creado_por: { stringValue: UID }, creado_en: { timestampValue: TS(0) } } }) });

  chk("2 prospectos con id = teléfono", (await contar("crm_leads")) === 2);
  chk("2 notas colgando del id antiguo",
    (await contar(`crm_leads/${A}/notas`)) === 1 && (await contar(`crm_leads/${B}/notas`)) === 1);
  chk("sin marcadores de deduplicación", (await contar("crm_dedup")) === 0);

  console.log("\n=== B. Simulación: no debe escribir nada ===");
  const sim = correr([]);
  chk("la simulación termina sin error", sim.codigo === 0, "código " + sim.codigo);
  chk("anuncia simulación", /SIMULACIÓN/.test(sim.salida));
  chk("no creó marcadores", (await contar("crm_dedup")) === 0);
  chk("no escribió el respaldo", !fs.existsSync(RESP));
  chk("muestra el sha256 del respaldo", /sha256: [0-9a-f]{64}/.test(sim.salida));

  console.log("\n=== C. Migración real ===");
  const mig = correr(["--confirmar"]);
  chk("la migración termina correctamente", mig.codigo === 0, "código " + mig.codigo);
  chk("se creó el respaldo con huella", fs.existsSync(RESP) && /huella/.test(fs.readFileSync(RESP, "utf8")));
  chk("ahora hay 4 prospectos (2 antiguos + 2 nuevos)", (await contar("crm_leads")) === 4);
  chk("se crearon 2 marcadores de deduplicación", (await contar("crm_dedup")) === 2);

  const mapa = JSON.parse(fs.readFileSync(MAPA, "utf8"));
  chk("el mapa tiene los 2 teléfonos", Object.keys(mapa).length === 2);
  chk("el UUID del mapa no es el teléfono", mapa[A].uuid !== A && /^[0-9a-f-]{36}$/.test(mapa[A].uuid));

  chk("las notas se copiaron al UUID", (await contar(`crm_leads/${mapa[A].uuid}/notas`)) === 1);
  const cotNueva = await listar("crm_quotes");
  chk("la cotización se repuntó al UUID",
    cotNueva.length === 1 && Object.values(cotNueva[0].fields.lead_id)[0] === mapa[A].uuid);
  chk("los documentos ANTIGUOS siguen existiendo (no se borra nada)",
    (await leer(`crm_leads/${A}`)) !== null);
  chk("las notas antiguas también siguen",
    (await contar(`crm_leads/${A}/notas`)) === 1);
  chk("verificación referencial sin huérfanas", /cotizaciones huérfanas: 0/.test(mig.salida));

  console.log("\n=== D. Idempotencia: repetir no debe cambiar nada ===");
  const uuidAntes = mapa[A].uuid;
  const antesLeads = await contar("crm_leads");
  const antesNotas = await contar(`crm_leads/${mapa[A].uuid}/notas`);
  const rep = correr(["--confirmar"]);
  chk("la repetición termina sin error", rep.codigo === 0, "código " + rep.codigo);
  chk("no crea UUID nuevos", JSON.parse(fs.readFileSync(MAPA, "utf8"))[A].uuid === uuidAntes);
  chk("no duplica prospectos", (await contar("crm_leads")) === antesLeads, (await contar("crm_leads")) + " vs " + antesLeads);
  chk("no duplica notas", (await contar(`crm_leads/${uuidAntes}/notas`)) === antesNotas);
  chk("informa de que no hay nada que migrar", /Nada que migrar|Pendientes de migrar: 0/.test(rep.salida));

  console.log("\n=== E. Reversión ===");
  const rev = correr(["--revertir", "--confirmar"]);
  chk("la reversión termina sin error", rev.codigo === 0, "código " + rev.codigo);
  chk("se eliminó el mapa", !fs.existsSync(MAPA));
  chk("se borraron los prospectos nuevos", (await contar("crm_leads")) === 2);
  chk("se borraron los marcadores", (await contar("crm_dedup")) === 0);
  const cotRev = await listar("crm_quotes");
  chk("la cotización volvió al id antiguo",
    cotRev.length === 1 && Object.values(cotRev[0].fields.lead_id)[0] === A);
  chk("los prospectos antiguos conservan su información",
    (await leer(`crm_leads/${A}`)) !== null && (await contar(`crm_leads/${A}/notas`)) === 1);

  console.log("\nRESULTADO MIGRACIÓN: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
