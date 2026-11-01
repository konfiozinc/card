/* KZ-CRM-016 · certificación REAL contra el proyecto kzfio-crm (no emulador).

   Comprueba, SIN autenticación, que las reglas publicadas impiden cualquier acceso
   anónimo a los datos comerciales. Es la prueba que discrimina de verdad: con el
   contrato antiguo, una escritura anónima devolvía 200; con el privado debe dar 403.

   Si la escritura anónima llegara a prosperar, el script BORRA lo creado con la
   credencial privilegiada y falla ruidosamente: no se deja un registro ficticio.

   Uso:  node crm/certificar-produccion.cjs
*/

const { tokenAcceso } = require(
  "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
);

const P = "kzfio-crm";
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/default/documents`;
const ANIO = 365 * 24 * 60 * 60 * 1000;

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();

/* Documento de alta VÁLIDA según el contrato. Si las reglas fuesen las antiguas,
   este documento pasaría; con las privadas debe ser rechazado por falta de rol. */
const leadValido = (tel) => ({
  nombre: { stringValue: "PRUEBA ACTIVACION" },
  telefono: { stringValue: tel },
  industria: { stringValue: "restaurantes" },
  consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) },
  estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: TS(0) },
  creado_por: { stringValue: "anonimo" },
  historial: { arrayValue: { values: [] } },
  origen: { stringValue: "manual" },
});

const anon = (metodo, ruta, cuerpo) => fetch(`${FS}${ruta}`, {
  method: metodo,
  headers: { "content-type": "application/json" },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
});

(async () => {
  const t = await tokenAcceso();
  const H = { authorization: "Bearer " + t };
  const TEL = "3209990001";

  console.log("=== Certificación REAL · proyecto " + P + " · base default");
  console.log("    (todas las peticiones de esta sección van SIN credencial)\n");

  console.log("A. Lectura anónima");
  for (const col of ["crm_leads", "crm_quotes", "crm_sales", "crm_audit", "crm_usuarios"]) {
    const r = await anon("GET", "/" + col);
    chk("anónimo NO lee " + col, r.status === 403, "HTTP " + r.status);
  }

  console.log("\nB. Escritura anónima — la prueba discriminante");
  const creado = await anon("POST", `/crm_leads?documentId=${TEL}`, { fields: leadValido(TEL) });
  const statusCrear = creado.status;
  chk("anónimo NO puede crear prospecto (403)", statusCrear === 403, "HTTP " + statusCrear);
  if (statusCrear !== 403) {
    console.error("\n  !! LA ESCRITURA ANÓNIMA PROSPERÓ: se limpia de inmediato con la credencial privilegiada");
    const del = await fetch(`${FS}/crm_leads/${TEL}`, { method: "DELETE", headers: H });
    console.error("  limpieza -> HTTP " + del.status);
  }

  chk("anónimo NO puede modificar un prospecto",
    (await anon("PATCH", `/crm_leads/${TEL}`, { fields: { estado: { stringValue: "ganado" } } })).status === 403);
  chk("anónimo NO puede borrar un prospecto",
    (await anon("DELETE", `/crm_leads/${TEL}`)).status === 403);

  console.log("\nC. Cotizaciones, ventas y auditoría");
  chk("anónimo NO crea cotización", (await anon("POST", "/crm_quotes", { fields: {
    lead_id: { stringValue: TEL }, plan: { stringValue: "pro" }, monto: { integerValue: 99900 },
    moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
    creado_por: { stringValue: "anonimo" }, creado_en: { timestampValue: TS(0) },
  } })).status === 403);
  chk("anónimo NO crea venta", (await anon("POST", "/crm_sales", { fields: {
    lead_id: { stringValue: TEL }, quote_id: { stringValue: "x" }, monto: { integerValue: 99900 },
    confirmado_por: { stringValue: "anonimo" }, confirmado_en: { timestampValue: TS(0) },
  } })).status === 403);
  chk("anónimo NO escribe auditoría", (await anon("POST", "/crm_audit", { fields: {
    accion: { stringValue: "estado_cambiado" }, detalle: { stringValue: "x" },
    autor: { stringValue: "anonimo" }, rol: { stringValue: "admin" }, fecha: { timestampValue: TS(0) },
  } })).status === 403);
  chk("anónimo NO se crea un rol", (await anon("PATCH", "/crm_usuarios/anonimo", { fields: {
    rol: { stringValue: "admin" }, activo: { booleanValue: true },
  } })).status === 403);

  console.log("\nD. Control: la credencial privilegiada sí alcanza la base");
  /* R08 · Recuento REAL de la colección, recorriendo todas las páginas. Antes se pedía
     una muestra de 5 y se imprimía ese número como si describiera la base. */
  let totalLeads = 0, tokenPagina = null, paginasLeidas = 0, estadoLectura = 0;
  do {
    const url = `${FS}/crm_leads?pageSize=300` + (tokenPagina ? "&pageToken=" + encodeURIComponent(tokenPagina) : "");
    const r = await fetch(url, { headers: H });
    if (paginasLeidas === 0) estadoLectura = r.status;
    if (r.status !== 200) break;
    const j = await r.json();
    totalLeads += (j.documents || []).length;
    tokenPagina = j.nextPageToken || null;
  } while (tokenPagina && ++paginasLeidas < 200);
  chk("lectura privilegiada funciona", estadoLectura === 200, "HTTP " + estadoLectura);
  chk("el inventario se recorre completo (sin corte silencioso)", !tokenPagina,
    tokenPagina ? "quedaron páginas sin leer" : "");
  console.log("    prospectos en crm_leads: " + totalLeads + " en " + (paginasLeidas + 1) + " página(s)");

  console.log("\nE. Las reglas publicadas son las privadas");
  const rel = await fetch(`https://firebaserules.googleapis.com/v1/projects/${P}/releases`, { headers: H }).then((r) => r.json());
  const fs = require("node:fs");
  const path = require("node:path");
  const local = fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8").replace(/\r\n/g, "\n").trim();
  for (const r of rel.releases || []) {
    const rs = await fetch(`https://firebaserules.googleapis.com/v1/projects/${P}/` + r.rulesetName.split(`projects/${P}/`)[1], { headers: H }).then((x) => x.json());
    const cont = (rs.source.files[0].content || "").replace(/\r\n/g, "\n").trim();
    const nombre = r.name.split("/releases/")[1];
    chk("release " + nombre + " contiene exactamente crm/firestore.rules", cont === local,
      "attachmentPoint=" + (rs.attachmentPoint || "ninguno"));
    chk("release " + nombre + " no admite alta anónima", !/allow create: if tieneRol\(equipo\(\)\)/.test(cont) ||
      /allow create: if tieneRol\(equipo\(\)\)\s*\n\s*&& leadId/.test(cont));
  }

  console.log("\nRESULTADO CERTIFICACIÓN PRODUCCIÓN: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
