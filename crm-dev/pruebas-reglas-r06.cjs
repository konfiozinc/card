/* KZ-CRM-018 · P1 y R06 — Borrado directo inseguro y validación de identificadores.
   INTERNO: crm-dev/. No se publica. Sólo emulador.

   P1 · El borrado directo de un prospecto ya NO existe para ningún rol. Antes era
        `allow delete: if esAdmin()`: el panel ya no ofrecía el botón, pero la capacidad
        seguía viva para cualquiera con sesión de administración, y borrar sólo el
        documento dejaba huérfanos la notas, el marcador del número y las referencias
        comerciales. Ahora el borrado es exclusivamente crm-dev/suprimir-datos.cjs.

   R06 · Un prospecto nuevo nace con UUID v4 y sólo con UUID v4. Se rechazan los
        identificadores basados en el teléfono y los que «parecen» UUID pero no lo son
        (versión o variante incorrectas). La compatibilidad con los documentos heredados
        (id = teléfono) es EXPLÍCITA y se cierra con crm_config/transicion.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-reglas-r06.cjs"
*/

const crypto = require("node:crypto");

const PROYECTO = "demo-crm-016";
const PREFIJO = `projects/${PROYECTO}/databases/default/documents`;
const FS = `http://127.0.0.1:8080/v1/${PREFIJO}`;
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const H = (t) => ({ authorization: "Bearer " + t, "content-type": "application/json" });
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }) }).then((r) => r.json());
};
const sembrarRol = (uid, rol) => fetch(`${FS}/crm_usuarios/${uid}`, { method: "PATCH", headers: OWNER,
  body: JSON.stringify({ fields: { rol: { stringValue: rol }, activo: { booleanValue: true } } }) }).then((r) => r.status);

const camposLead = (tel, uid, asignado) => {
  const f = {
    nombre: { stringValue: "Prospecto " + tel }, telefono: { stringValue: tel },
    industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
    consentimiento_version: { stringValue: "v1-2026-11" },
    retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
    creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid },
    historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
  };
  if (asignado) {
    f.asignado_a = { stringValue: asignado }; f.asignado_en = { timestampValue: TS(0) };
    f.asignado_por = { stringValue: uid };
  }
  return f;
};
const camposMarcador = (id, uid) => ({
  lead_id: { stringValue: id }, creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: uid } });

/** Alta en lote (prospecto + marcador), como hace el panel. Devuelve el código HTTP. */
const alta = (tel, uid, tok, idElegido) => {
  const id = idElegido || crypto.randomUUID();
  return fetch(`${FS}:commit`, { method: "POST", headers: H(tok), body: JSON.stringify({ writes: [
    { update: { name: `${PREFIJO}/crm_leads/${id}`, fields: camposLead(tel, uid) } },
    { update: { name: `${PREFIJO}/crm_dedup/${tel}`, fields: camposMarcador(id, uid) } },
  ] }) }).then((r) => r.status);
};

const estado = async (ruta, tok) => (await fetch(`${FS}/${ruta}`, { headers: tok ? H(tok) : {} })).status;
const borrarCon = (ruta, tok) => fetch(`${FS}/${ruta}`,
  { method: "DELETE", headers: tok ? H(tok) : {} }).then((r) => r.status);
const parche = (ruta, campos, tok, campo) => fetch(`${FS}/${ruta}?updateMask.fieldPaths=${campo}`,
  { method: "PATCH", headers: H(tok), body: JSON.stringify({ fields: campos }) }).then((r) => r.status);

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

(async () => {
  const sonda = await fetch(`${FS}/crm_leads?pageSize=1`, { headers: OWNER }).catch(() => null);
  if (!sonda || !sonda.ok) { console.error("ERROR: el emulador no responde"); process.exit(2); }

  const admin = await altaUsuario("admin-r06@test.local");
  await sembrarRol(admin.localId, "admin");
  const comerc = await altaUsuario("comercial-r06@test.local");
  await sembrarRol(comerc.localId, "comercial");
  const ventas = await altaUsuario("ventas-r06@test.local");
  await sembrarRol(ventas.localId, "ventas");
  const lectura = await altaUsuario("lectura-r06@test.local");
  await sembrarRol(lectura.localId, "lectura");

  /* ── Escenario base: un prospecto UUID completo y uno heredado ────────── */
  const TEL_UUID = "3209800001";
  const idUuid = crypto.randomUUID();
  chk("base: alta con UUID v4 prospera", (await alta(TEL_UUID, admin.localId, admin.idToken, idUuid)) === 200);

  const TEL_HEREDADO = "3209800002";
  await fetch(`${FS}/crm_leads/${TEL_HEREDADO}`, { method: "PATCH", headers: OWNER,
    body: JSON.stringify({ fields: camposLead(TEL_HEREDADO, admin.localId, comerc.localId) }) });
  await fetch(`${FS}/crm_dedup/${TEL_HEREDADO}`, { method: "PATCH", headers: OWNER,
    body: JSON.stringify({ fields: camposMarcador(TEL_HEREDADO, admin.localId) }) });

  const notaId = await fetch(`${FS}/crm_leads/${idUuid}/notas`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { texto: { stringValue: "nota de la que no debe desaparecer nada" },
      autor: { stringValue: admin.localId }, fecha: { timestampValue: TS(0) },
      tipo: { stringValue: "nota" } } }) }).then((r) => r.ok ? (r.json()).then((j) => j.name.split("/").pop()) : null);
  chk("base: se crea una nota inmutable", !!notaId);

  const cotId = await fetch(`${FS}/crm_quotes`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { lead_id: { stringValue: idUuid }, plan: { stringValue: "pro" },
      monto: { integerValue: 99900 }, moneda: { stringValue: "COP" }, estado: { stringValue: "enviada" },
      creado_por: { stringValue: admin.localId }, creado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.ok ? (r.json()).then((j) => j.name.split("/").pop()) : null);
  chk("base: se crea una cotización", !!cotId);
  const ventaCodigo = await fetch(`${FS}/crm_sales?documentId=${cotId}`, { method: "POST", headers: H(admin.idToken),
    body: JSON.stringify({ fields: { lead_id: { stringValue: idUuid }, quote_id: { stringValue: cotId },
      monto: { integerValue: 99900 }, moneda: { stringValue: "COP" },
      confirmado_por: { stringValue: admin.localId }, confirmado_en: { timestampValue: TS(0) } } }) })
    .then((r) => r.status);
  chk("base: se confirma una venta", ventaCodigo === 200, "HTTP " + ventaCodigo);

  /* ── A. Ningún rol puede borrar el prospecto directamente (P1) ────────── */
  console.log("\n=== A · Borrado directo del prospecto: cerrado para todos ===");
  chk("A · admin NO puede borrar el prospecto con UUID", (await borrarCon(`crm_leads/${idUuid}`, admin.idToken)) === 403);
  chk("A · admin NO puede borrar el prospecto heredado", (await borrarCon(`crm_leads/${TEL_HEREDADO}`, admin.idToken)) === 403);
  chk("A · comercial NO puede borrar", (await borrarCon(`crm_leads/${idUuid}`, comerc.idToken)) === 403);
  chk("A · ventas NO puede borrar", (await borrarCon(`crm_leads/${idUuid}`, ventas.idToken)) === 403);
  chk("A · lectura NO puede borrar", (await borrarCon(`crm_leads/${idUuid}`, lectura.idToken)) === 403);
  const anonDelete = await borrarCon(`crm_leads/${idUuid}`, null);
  chk("A · anónimo NO puede borrar", anonDelete === 401 || anonDelete === 403, "HTTP " + anonDelete);

  chk("A · nadie borra una nota", (await borrarCon(`crm_leads/${idUuid}/notas/${notaId}`, admin.idToken)) === 403);
  chk("A · nadie borra el marcador del número", (await borrarCon(`crm_dedup/${TEL_UUID}`, admin.idToken)) === 403);
  chk("A · nadie borra una cotización", (await borrarCon(`crm_quotes/${cotId}`, admin.idToken)) === 403);
  chk("A · nadie borra una venta", (await borrarCon(`crm_sales/${cotId}`, admin.idToken)) === 403);

  console.log("\n--- A · Tras los intentos, nada desapareció ni quedó huérfano ---");
  chk("A · el prospecto sigue existiendo", (await estado(`crm_leads/${idUuid}`, admin.idToken)) === 200);
  chk("A · el heredado sigue existiendo", (await estado(`crm_leads/${TEL_HEREDADO}`, admin.idToken)) === 200);
  chk("A · la nota sigue existiendo", (await estado(`crm_leads/${idUuid}/notas/${notaId}`, admin.idToken)) === 200);
  chk("A · el marcador sigue existiendo", (await estado(`crm_dedup/${TEL_UUID}`, admin.idToken)) === 200);
  chk("A · la cotización sigue existiendo", (await estado(`crm_quotes/${cotId}`, admin.idToken)) === 200);
  chk("A · la venta sigue existiendo", (await estado(`crm_sales/${cotId}`, admin.idToken)) === 200);

  const leads = await listar("crm_leads");
  const idsLeads = new Set(leads.map((l) => l.id));
  const marcadores = await listar("crm_dedup");
  const cotizaciones = await listar("crm_quotes");
  const listaVentas = await listar("crm_sales");
  const notasHuerfanas = [];
  for (const l of leads) {
    for (const n of await listar(`crm_leads/${l.id}/notas`)) if (!idsLeads.has(l.id)) notasHuerfanas.push(n.id);
  }
  chk("A · ningún marcador apunta a un prospecto inexistente",
    marcadores.every((m) => idsLeads.has(val(m.fields, "lead_id"))));
  chk("A · ninguna cotización apunta a un prospecto inexistente",
    cotizaciones.every((c) => idsLeads.has(val(c.fields, "lead_id"))));
  chk("A · ninguna venta apunta a un prospecto inexistente",
    listaVentas.every((v) => idsLeads.has(val(v.fields, "lead_id"))));
  chk("A · ninguna nota queda huérfana", notasHuerfanas.length === 0);

  /* ── B. Identificadores válidos (R06) ─────────────────────────────────── */
  console.log("\n=== B · Identificador válido: UUID v4 ===");
  chk("B · un UUID v4 generado por el sistema se acepta",
    (await alta("3209800010", admin.localId, admin.idToken)) === 200);
  chk("B · otro UUID v4 con variante 9 en el cuarto grupo se acepta",
    (await alta("3209800011", admin.localId, admin.idToken, "12345678-1234-4321-9234-123456789abc")) === 200);
  chk("B · otro con variante b en el cuarto grupo se acepta",
    (await alta("3209800012", admin.localId, admin.idToken, "abcdef01-2345-4678-babc-def012345678")) === 200);

  /* ── C. Identificadores basados en el teléfono ────────────────────────── */
  console.log("\n=== C · Identificador basado en el teléfono: rechazado ===");
  chk("C · id = teléfono de 10 dígitos rechazado",
    (await alta("3209800020", admin.localId, admin.idToken, "3209800020")) === 403);
  chk("C · id = teléfono con prefijo de país rechazado",
    (await alta("3209800021", admin.localId, admin.idToken, "573209800021")) === 403);
  chk("C · id numérico de 9 dígitos rechazado",
    (await alta("3209800022", admin.localId, admin.idToken, "320980002")) === 403);
  chk("C · ninguno de esos intentos dejó prospecto",
    (await estado(`crm_leads/3209800020`, admin.idToken)) === 404);

  /* ── D. Identificadores inválidos ─────────────────────────────────────── */
  console.log("\n=== D · Identificadores inválidos: rechazados ===");
  const invalidos = [
    ["UUID v1 (versión incorrecta)", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"],
    ["UUID v4 con variante incorrecta (c)", "12345678-1234-4234-c234-123456789abc"],
    ["UUID en mayúsculas", "ABCDEF01-2345-4678-9ABC-DEF012345678"],
    ["con guiones pero incompleto", "12345678-1234-4234-9234-1234567"],
    ["cadena arbitraria", "demo-crm-016"],
    ["UUID válido con espacios", " 12345678-1234-4234-9234-123456789abc"],
    ["UUID v4 con carácter no hexadecimal", "12345678-1234-4234-9234-123456789zzz"],
  ];
  let n = 0;
  for (const [etiqueta, identificador] of invalidos) {
    n++;
    chk(`D · ${etiqueta} → rechazado`,
      (await alta("32098000" + (30 + n), admin.localId, admin.idToken, identificador)) === 403, identificador);
  }
  chk("D · un UUID válido SIN marcador tampoco se cuela",
    (await fetch(`${FS}:commit`, { method: "POST", headers: H(admin.idToken), body: JSON.stringify({ writes: [
      { update: { name: `${PREFIJO}/crm_leads/${crypto.randomUUID()}`, fields: camposLead("3209800049", admin.localId) } },
    ] }) }).then((r) => r.status)) === 403);

  /* ── E. Compatibilidad con heredados: ventana abierta ─────────────────── */
  console.log("\n=== E · Compatibilidad: la ventana está abierta por defecto ===");
  chk("E · el admin actualiza un prospecto heredado",
    (await parche(`crm_leads/${TEL_HEREDADO}`, { estado: { stringValue: "contactado" } },
      admin.idToken, "estado")) === 200);
  chk("E · el comercial asignado actualiza su heredado",
    (await parche(`crm_leads/${TEL_HEREDADO}`, { estado: { stringValue: "cotizado" } },
      comerc.idToken, "estado")) === 200);
  chk("E · y el cambio se guardó",
    val((await fetch(`${FS}/crm_leads/${TEL_HEREDADO}`, { headers: H(admin.idToken) }).then((r) => r.json())).fields, "estado") === "cotizado");

  /* ── F. Cierre explícito de la ventana ────────────────────────────────── */
  console.log("\n=== F · Al cerrar la transición, el heredado deja de admitir escrituras ===");
  chk("F · el procedimiento privilegiado cierra la ventana",
    (await fetch(`${FS}/crm_config/transicion`, { method: "PATCH", headers: OWNER,
      body: JSON.stringify({ fields: { acepta_heredados: { booleanValue: false },
        cerrada_en: { timestampValue: TS(0) } } }) }).then((r) => r.status)) === 200);
  chk("F · el admin ya NO puede escribir un heredado",
    (await parche(`crm_leads/${TEL_HEREDADO}`, { estado: { stringValue: "ganado" } },
      admin.idToken, "estado")) === 403);
  chk("F · el admin sigue pudiendo escribir un UUID",
    (await parche(`crm_leads/${idUuid}`, { estado: { stringValue: "contactado" } },
      admin.idToken, "estado")) === 200);
  chk("F · el heredado se sigue LEYENDO (no se oculta información)",
    (await estado(`crm_leads/${TEL_HEREDADO}`, admin.idToken)) === 200);
  chk("F · el heredado se sigue LISTANDO",
    (await listar("crm_leads")).some((l) => l.id === TEL_HEREDADO));
  chk("F · la nota de un prospecto UUID sigue escribiéndose",
    (await fetch(`${FS}/crm_leads/${idUuid}/notas`, { method: "POST", headers: H(admin.idToken),
      body: JSON.stringify({ fields: { texto: { stringValue: "nota posterior al cierre de la ventana" },
        autor: { stringValue: admin.localId }, fecha: { timestampValue: TS(0) },
        tipo: { stringValue: "nota" } } }) }).then((r) => r.status)) === 200);

  /* ── G. La configuración de control sólo la escribe el procedimiento ──── */
  console.log("\n=== G · La ventana no se reabre desde el navegador ===");
  chk("G · el admin LEE el estado de la transición", (await estado("crm_config/transicion", admin.idToken)) === 200);
  chk("G · el comercial NO lee la configuración de control",
    (await estado("crm_config/transicion", comerc.idToken)) === 403);
  chk("G · el admin NO puede reabrir la ventana",
    (await fetch(`${FS}/crm_config/transicion?updateMask.fieldPaths=acepta_heredados`, { method: "PATCH",
      headers: H(admin.idToken), body: JSON.stringify({ fields: { acepta_heredados: { booleanValue: true } } }) })
      .then((r) => r.status)) === 403);
  chk("G · nadie puede crear la configuración desde el navegador",
    (await fetch(`${FS}/crm_config/otra`, { method: "PATCH", headers: H(admin.idToken),
      body: JSON.stringify({ fields: { acepta_heredados: { booleanValue: true } } }) }).then((r) => r.status)) === 403);
  chk("G · la ventana sigue cerrada",
    (await parche(`crm_leads/${TEL_HEREDADO}`, { estado: { stringValue: "contactado" } },
      admin.idToken, "estado")) === 403);

  console.log("\nRESULTADO P1/R06: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
