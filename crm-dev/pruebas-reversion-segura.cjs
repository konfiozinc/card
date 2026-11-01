/* KZ-CRM-018 · R01 — PRUEBA DECISIVA DE REVERSIÓN SEGURA.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   QUÉ DEMUESTRA
   Que una reversión NUNCA elimina silenciosamente información comercial creada
   después de la migración. Y que cuando no hay nada nuevo, la reversión sí se
   completa, para que la garantía no sea simplemente «la reversión no funciona».

   ESCENARIOS
     A. Migrar, añadir una NOTA nueva y MODIFICAR un campo comercial (estado).
        → la reversión debe negarse con código 3 y no tocar un solo documento.
     B. Migrar y AMPLIAR el historial heredado (campo fuera de la lista corta).
        → debe negarse igual: el historial es dato comercial.
     C. Migrar y AÑADIR UN CAMPO comercial nuevo (valor_estimado).
        → debe negarse igual: un campo nuevo tampoco puede desaparecer.
     D. Migrar SIN cambios posteriores → la reversión se permite y termina bien.

   Cada escenario parte de un emulador limpio: se borran las colecciones del CRM y
   los ficheros de mapa/respaldo antes de empezar.

   Ejecutar:
     firebase emulators:exec --only firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-reversion-segura.cjs"
*/

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const SCRIPT = path.join(__dirname, "migrar-uuid.cjs");
const MAPA = path.join(__dirname, "migracion-uuid.json");
const RESP = path.join(__dirname, "migracion-respaldo.json");

const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

/* ── utilidades REST ─────────────────────────────────────────────────────── */
const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
};
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

async function listar(ruta) {
  const salida = [];
  let token = null, paginas = 0;
  do {
    const url = `${FS}/${ruta}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, { headers: OWNER });
    if (!r.ok) throw new Error(`listar ${ruta}: HTTP ${r.status}`);
    const j = await r.json();
    for (const d of (j.documents || [])) salida.push({ id: d.name.split("/").pop(), fields: d.fields || {} });
    token = j.nextPageToken || null;
    if (++paginas > 100) throw new Error("demasiadas páginas");
  } while (token);
  return salida;
}
const leer = async (ruta) => {
  const r = await fetch(`${FS}/${ruta}`, { headers: OWNER });
  return r.ok ? r.json() : null;
};
const existe = async (ruta) => (await fetch(`${FS}/${ruta}`, { headers: OWNER })).status === 200;
/** Campos del documento, o null si no existe. Evita que una comprobación reviente
 *  cuando justo lo que se está demostrando es que el documento desapareció. */
const camposDe = async (ruta) => { const d = await leer(ruta); return d ? (d.fields || {}) : null; };
const campoDe = async (ruta, k) => { const f = await camposDe(ruta); return f ? val(f, k) : undefined; };
const patch = async (ruta, fields, mask) => {
  const r = await fetch(`${FS}/${ruta}?updateMask.fieldPaths=${mask}`, {
    method: "PATCH", headers: OWNER, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`PATCH ${ruta}: HTTP ${r.status}`);
};
const crear = async (ruta, fields, id) => {
  const url = `${FS}/${ruta}` + (id ? `?documentId=${encodeURIComponent(id)}` : "");
  const r = await fetch(url, { method: "POST", headers: OWNER, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`POST ${ruta}: HTTP ${r.status}`);
  return (await r.json()).name.split("/").pop();
};
const borrar = async (ruta) => { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); };

const correr = (args) => {
  try {
    return { codigo: 0, salida: execFileSync(process.execPath, [SCRIPT, "--emulador", ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) { return { codigo: e.status, salida: String((e.stdout || "") + (e.stderr || "")) }; }
};

/* ── instantánea global: sirve para demostrar «no se tocó nada» ──────────── */
async function fotoGlobal() {
  const out = {};
  for (const l of await listar("crm_leads")) {
    out["crm_leads/" + l.id] = canon(l.fields);
    for (const n of await listar(`crm_leads/${l.id}/notas`))
      out[`crm_leads/${l.id}/notas/${n.id}`] = canon(n.fields);
  }
  for (const c of await listar("crm_quotes")) out["crm_quotes/" + c.id] = canon(c.fields);
  for (const v of await listar("crm_sales")) out["crm_sales/" + v.id] = canon(v.fields);
  for (const d of await listar("crm_dedup")) out["crm_dedup/" + d.id] = canon(d.fields);
  return out;
}
function diffFotos(a, b) {
  const cambios = [];
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of claves) {
    const ja = JSON.stringify(a[k]), jb = JSON.stringify(b[k]);
    if (ja !== jb) {
      cambios.push(a[k] === undefined ? `CREADO  ${k}`
        : b[k] === undefined ? `BORRADO ${k}`
        : `CAMBIADO ${k}`);
    }
  }
  return cambios;
}

/* ── limpieza total antes de cada escenario ──────────────────────────────── */
async function limpiar() {
  for (const l of await listar("crm_leads")) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) await borrar(`crm_leads/${l.id}/notas/${n.id}`);
    await borrar(`crm_leads/${l.id}`);
  }
  for (const c of ["crm_quotes", "crm_sales", "crm_dedup"]) {
    for (const d of await listar(c)) await borrar(`${c}/${d.id}`);
  }
  for (const f of [MAPA, RESP]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

/* ── siembra del ESQUEMA ANTIGUO: id = teléfono ──────────────────────────── */
const leadAntiguo = (tel, uid) => ({
  nombre: { stringValue: "Antiguo " + tel }, telefono: { stringValue: tel },
  industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "contactado" },
  creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
  historial: { arrayValue: { values: [{ stringValue: "nota heredada del modelo viejo" }] } },
  origen: { stringValue: "manual" },
});
const notaVieja = (tel, uid) => ({
  texto: { stringValue: "nota vieja de " + tel }, autor: { stringValue: uid },
  fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" },
});

const UID = "uid-ficticio-r01";

/** Siembra el modelo antiguo y devuelve los identificadores usados. */
async function sembrar(tels) {
  for (const tel of tels) {
    await crear("crm_leads", leadAntiguo(tel, UID), tel);
    await crear(`crm_leads/${tel}/notas`, notaVieja(tel, UID));
  }
  const cot = await crear("crm_quotes", {
    lead_id: { stringValue: tels[0] }, plan: { stringValue: "pro" },
    monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
    estado: { stringValue: "enviada" }, creado_por: { stringValue: UID },
    creado_en: { timestampValue: TS(0) } });
  const ven = await crear("crm_sales", {
    lead_id: { stringValue: tels[0] }, quote_id: { stringValue: cot },
    monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
    confirmado_por: { stringValue: UID }, confirmado_en: { timestampValue: TS(0) } });
  return { cot, ven };
}

const leerMapa = () => JSON.parse(fs.readFileSync(MAPA, "utf8"));

/* ══════════════════════════════════════════════════════════════════════════
   A · Nota nueva + campo comercial modificado después de migrar
   ══════════════════════════════════════════════════════════════════════════ */
async function escenarioA() {
  console.log("\n=== A · Nota nueva y cambio comercial tras migrar: la reversión debe negarse ===");
  await limpiar();
  const [T1, T2] = ["3209300001", "3209300002"];
  const { cot, ven } = await sembrar([T1, T2]);

  const mig = correr(["--confirmar"]);
  chk("A · la migración termina bien", mig.codigo === 0, "código " + mig.codigo);
  const mapa = leerMapa();
  const uuid1 = mapa[T1].uuid;
  chk("A · el prospecto migrado tiene UUID", /^[0-9a-f-]{36}$/.test(uuid1), uuid1);

  /* 3. Nota NUEVA sobre el prospecto ya migrado (información comercial nueva). */
  const notaNueva = await crear(`crm_leads/${uuid1}/notas`, {
    texto: { stringValue: "NOTA NUEVA POSTERIOR A LA MIGRACIÓN · no debe perderse" },
    autor: { stringValue: UID }, fecha: { timestampValue: TS(1000) }, tipo: { stringValue: "nota" } });
  /* 4. Campo comercial modificado después de migrar. */
  await patch(`crm_leads/${uuid1}`, { estado: { stringValue: "negociacion" } }, "estado");

  const antes = await fotoGlobal();
  const rev = correr(["--revertir", "--confirmar"]);
  const despues = await fotoGlobal();
  const cambios = diffFotos(antes, despues);

  /* 6. Código de salida 3. */
  chk("A · la reversión se NIEGA con código 3", rev.codigo === 3, "código " + rev.codigo);
  chk("A · la salida anuncia el rechazo", /REVERSIÓN RECHAZADA/.test(rev.salida));
  chk("A · la salida declara que no se modificó nada", /No se ha modificado ningún documento/.test(rev.salida));
  chk("A · menciona la nota creada después", /nota\(s\) creadas después de la migración/.test(rev.salida));
  chk("A · menciona el campo comercial cambiado", /el campo «estado» cambió después de la migración/.test(rev.salida));

  /* 7. No se eliminó ni modificó ningún documento. */
  chk("A · NO se borró ni modificó ningún documento", cambios.length === 0, cambios.join(" · "));

  /* 8. Las notas nuevas siguen presentes. */
  chk("A · la nota nueva sigue presente", await existe(`crm_leads/${uuid1}/notas/${notaNueva}`));
  chk("A · el prospecto migrado sigue existiendo", await existe(`crm_leads/${uuid1}`));
  chk("A · el cambio comercial posterior sigue intacto",
    (await campoDe(`crm_leads/${uuid1}`, "estado")) === "negociacion",
    String(await campoDe(`crm_leads/${uuid1}`, "estado")));

  /* 9. Las referencias comerciales permanecen intactas. */
  chk("A · la cotización sigue apuntando al UUID",
    (await campoDe(`crm_quotes/${cot}`, "lead_id")) === uuid1);
  chk("A · la venta sigue apuntando al UUID",
    (await campoDe(`crm_sales/${ven}`, "lead_id")) === uuid1);
  chk("A · el marcador de deduplicación sigue intacto",
    (await campoDe(`crm_dedup/${T1}`, "lead_id")) === uuid1);
  chk("A · los documentos heredados siguen intactos",
    (await campoDe(`crm_leads/${T1}`, "telefono")) === T1);
  chk("A · el mapa de migración se conserva", fs.existsSync(MAPA));

  /* Segunda tentativa: la negativa es estable, no un fallo transitorio. */
  const rev2 = correr(["--revertir", "--confirmar"]);
  chk("A · una segunda tentativa también se niega", rev2.codigo === 3, "código " + rev2.codigo);
  chk("A · la segunda tentativa tampoco modifica nada",
    diffFotos(despues, await fotoGlobal()).length === 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   B · Historial ampliado (campo fuera de la lista corta de comparación)
   ══════════════════════════════════════════════════════════════════════════ */
async function escenarioB() {
  console.log("\n=== B · Historial ampliado tras migrar: la reversión debe negarse ===");
  await limpiar();
  const T = "3209300003";
  await sembrar([T]);
  const mig = correr(["--confirmar"]);
  chk("B · la migración termina bien", mig.codigo === 0, "código " + mig.codigo);
  const uuid = leerMapa()[T].uuid;

  const historialAhora = (await leer(`crm_leads/${uuid}`)).fields.historial.arrayValue.values || [];
  await patch(`crm_leads/${uuid}`, {
    historial: { arrayValue: { values: [...historialAhora,
      { stringValue: "ENTRADA DE HISTORIAL AÑADIDA DESPUÉS DE MIGRAR" }] } } }, "historial");

  const antes = await fotoGlobal();
  const rev = correr(["--revertir", "--confirmar"]);
  const cambios = diffFotos(antes, await fotoGlobal());

  chk("B · la reversión se NIEGA con código 3", rev.codigo === 3, "código " + rev.codigo);
  chk("B · no se borra ni se modifica ningún documento", cambios.length === 0, cambios.join(" · "));
  const histB = await camposDe(`crm_leads/${uuid}`);
  chk("B · el prospecto migrado sigue existiendo", !!histB);
  chk("B · el historial ampliado sigue presente",
    !!histB && ((histB.historial && histB.historial.arrayValue && histB.historial.arrayValue.values) || []).length === 2,
    histB ? String(((histB.historial || {}).arrayValue || {}).values?.length) + " entradas" : "documento borrado");
}

/* ══════════════════════════════════════════════════════════════════════════
   C · Campo comercial NUEVO añadido después de migrar
   ══════════════════════════════════════════════════════════════════════════ */
async function escenarioC() {
  console.log("\n=== C · Campo comercial nuevo tras migrar: la reversión debe negarse ===");
  await limpiar();
  const T = "3209300004";
  await sembrar([T]);
  const mig = correr(["--confirmar"]);
  chk("C · la migración termina bien", mig.codigo === 0, "código " + mig.codigo);
  const uuid = leerMapa()[T].uuid;

  await patch(`crm_leads/${uuid}`, { valor_estimado: { integerValue: "450000" } }, "valor_estimado");

  const antes = await fotoGlobal();
  const rev = correr(["--revertir", "--confirmar"]);
  const cambios = diffFotos(antes, await fotoGlobal());

  chk("C · la reversión se NIEGA con código 3", rev.codigo === 3, "código " + rev.codigo);
  chk("C · no se borra ni se modifica ningún documento", cambios.length === 0, cambios.join(" · "));
  chk("C · el campo comercial nuevo sigue presente",
    (await campoDe(`crm_leads/${uuid}`, "valor_estimado")) === "450000",
    String(await campoDe(`crm_leads/${uuid}`, "valor_estimado")));
}

/* ══════════════════════════════════════════════════════════════════════════
   D · Migración sin cambios posteriores: la reversión SÍ se permite
   ══════════════════════════════════════════════════════════════════════════ */
async function escenarioD() {
  console.log("\n=== D · Sin cambios posteriores: la reversión se permite y se completa ===");
  await limpiar();
  const [T1, T2] = ["3209300005", "3209300006"];
  const { cot, ven } = await sembrar([T1, T2]);
  const fotoHeredada = {
    [`crm_leads/${T1}`]: canon((await leer(`crm_leads/${T1}`)).fields),
    [`crm_leads/${T2}`]: canon((await leer(`crm_leads/${T2}`)).fields),
    [`crm_leads/${T1}/notas`]: (await listar(`crm_leads/${T1}/notas`)).length,
    [`crm_leads/${T2}/notas`]: (await listar(`crm_leads/${T2}/notas`)).length,
  };

  const mig = correr(["--confirmar"]);
  chk("D · la migración termina bien", mig.codigo === 0, "código " + mig.codigo);
  const mapa = leerMapa();
  const uuid1 = mapa[T1].uuid;
  chk("D · hay 2 UUID nuevos además de los 2 heredados", (await listar("crm_leads")).length === 4);

  const rev = correr(["--revertir", "--confirmar"]);
  chk("D · la reversión se permite y termina bien", rev.codigo === 0, "código " + rev.codigo);
  chk("D · informa de reversión completa", /REVERSIÓN COMPLETA/.test(rev.salida));
  chk("D · los prospectos importados se borraron", (await listar("crm_leads")).length === 2);
  chk("D · el prospecto migrado ya no existe", !(await existe(`crm_leads/${uuid1}`)));
  chk("D · los marcadores de deduplicación se borraron", (await listar("crm_dedup")).length === 0);
  chk("D · la cotización volvió al identificador antiguo",
    val((await leer(`crm_quotes/${cot}`)).fields, "lead_id") === T1);
  chk("D · la venta volvió al identificador antiguo",
    val((await leer(`crm_sales/${ven}`)).fields, "lead_id") === T1);
  chk("D · se eliminó el mapa", !fs.existsSync(MAPA));

  const heredadoIntacto =
    JSON.stringify(canon((await leer(`crm_leads/${T1}`)).fields)) === JSON.stringify(fotoHeredada[`crm_leads/${T1}`]) &&
    JSON.stringify(canon((await leer(`crm_leads/${T2}`)).fields)) === JSON.stringify(fotoHeredada[`crm_leads/${T2}`]);
  chk("D · los documentos heredados no cambiaron ni un byte", heredadoIntacto);
  chk("D · las notas heredadas siguen ahí",
    (await listar(`crm_leads/${T1}/notas`)).length === 1 &&
    (await listar(`crm_leads/${T2}/notas`)).length === 1);
}

/* ── guardia: nunca fuera del emulador ───────────────────────────────────── */
async function comprobarEmulador() {
  const r = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!r || !r.ok) {
    console.error("ERROR: el emulador no responde en " + FS);
    console.error("Ejecuta esta prueba con: firebase emulators:exec --only firestore --project " +
      PROYECTO + " --config crm-dev/emulador-produccion.json \"node crm-dev/pruebas-reversion-segura.cjs\"");
    process.exit(2);
  }
}

(async () => {
  await comprobarEmulador();
  console.log("R01 · Reversión segura · proyecto " + PROYECTO + " (EMULADOR)");
  await escenarioA();
  await escenarioB();
  await escenarioC();
  await escenarioD();
  console.log("\nRESULTADO R01: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
