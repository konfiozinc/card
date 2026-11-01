/* KZ-CRM-018 · certificación del equipo comercial: asignaciones, accesos cruzados,
   escalamiento de privilegios, revocación y persistencia.

   Usuarios FICTICIOS, sólo en el emulador. La única cuenta real
   (la cuenta real del administrador) no se toca.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-equipo.cjs"

   Las reglas cargadas son las de PRODUCCIÓN (crm-dev/firestore.rules). Los roles se
   siembran con `Authorization: Bearer owner` (papel de la consola / Admin SDK), porque
   en producción el alta de roles no existe desde el navegador. */

const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner" };
const ANIO = 365 * 24 * 60 * 60 * 1000;
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }),
  });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }),
  }).then((r) => r.json());
};

const sembrarRol = (uid, rol, nombre, activo) => fetch(`${FS}/crm_usuarios/${uid}`, {
  method: "PATCH", headers: { ...OWNER, "content-type": "application/json" },
  body: JSON.stringify({ fields: {
    rol: { stringValue: rol }, activo: { booleanValue: activo !== false },
    nombre: { stringValue: nombre || rol },
  } }),
}).then((r) => r.status);

const H = (tok) => tok ? { authorization: "Bearer " + tok, "content-type": "application/json" }
                       : { "content-type": "application/json" };

/* A03: alta atómica prospecto + marcador de deduplicación (las reglas lo exigen con
   getAfter). Devuelve el código HTTP. */
const altaConMarcador = (tel, uid, tok, camposLead) => fetch(FS + ":commit", {
  method: "POST", headers: H(tok),
  body: JSON.stringify({ writes: [
    { update: { name: "projects/demo-crm-016/databases/default/documents/crm_leads/" + tel, fields: camposLead } },
    { update: { name: "projects/demo-crm-016/databases/default/documents/crm_dedup/" + tel,
      fields: { lead_id: { stringValue: tel }, creado_en: { timestampValue: TS(0) },
                creado_por: { stringValue: uid } } } },
  ] }),
}).then((r) => r.status);


const camposLead = (tel, uid, asignado) => {
  const f = {
    nombre: { stringValue: "Prospecto " + tel },
    telefono: { stringValue: tel },
    industria: { stringValue: "tiendas" },
    consentimiento: { booleanValue: true },
    consentimiento_version: { stringValue: "v1-2026-11" },
    retencion_hasta: { timestampValue: TS(ANIO) },
    estado: { stringValue: "nuevo" },
    creado_en: { timestampValue: TS(0) },
    creado_por: { stringValue: uid },
    historial: { arrayValue: { values: [] } },
    origen: { stringValue: "manual" },
  };
  if (asignado) {
    f.asignado_a = { stringValue: asignado };
    f.asignado_en = { timestampValue: TS(0) };
    f.asignado_por = { stringValue: uid };
  }
  return f;
};

const crearLead = (tel, uid, tok, asignado) =>
  altaConMarcador(tel, uid, tok, camposLead(tel, uid, asignado));

const leerLead = (tel, tok) => fetch(`${FS}/crm_leads/${tel}`, { headers: H(tok) }).then((r) => r.status);

const parche = (tel, fields, tok, mask) => fetch(`${FS}/crm_leads/${tel}${mask ? "?updateMask.fieldPaths=" + mask : ""}`, {
  method: "PATCH", headers: H(tok), body: JSON.stringify({ fields }),
}).then((r) => r.status);

const crearCotizacion = (leadId, uid, tok, plan, monto) => fetch(`${FS}/crm_quotes`, {
  method: "POST", headers: H(tok),
  body: JSON.stringify({ fields: {
    lead_id: { stringValue: leadId }, plan: { stringValue: plan || "pro" },
    monto: { integerValue: monto || 99900 }, moneda: { stringValue: "COP" },
    estado: { stringValue: "enviada" }, creado_por: { stringValue: uid },
    creado_en: { timestampValue: TS(0) },
  } }),
}).then(async (r) => ({ status: r.status, id: r.ok ? (await r.json()).name.split("/").pop() : null }));

const crearVenta = (leadId, quoteId, uid, tok, monto) => fetch(`${FS}/crm_sales?documentId=${quoteId}`, {
  method: "POST", headers: H(tok),
  body: JSON.stringify({ fields: {
    lead_id: { stringValue: leadId }, quote_id: { stringValue: quoteId },
    monto: { integerValue: monto || 99900 }, moneda: { stringValue: "COP" },
    confirmado_por: { stringValue: uid }, confirmado_en: { timestampValue: TS(0) },
  } }),
}).then((r) => r.status);

/* Consulta estructurada: la que usa el panel para la bandeja personal. */
const listarMios = (uid, tok) => fetch(`${FS}:runQuery`, {
  method: "POST", headers: H(tok),
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "crm_leads" }],
    where: { fieldFilter: { field: { fieldPath: "asignado_a" }, op: "EQUAL", value: { stringValue: uid } } } } }),
}).then((r) => r.status);

const listarTodos = (tok) => fetch(`${FS}:runQuery`, {
  method: "POST", headers: H(tok),
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "crm_leads" }] } }),
}).then((r) => r.status);

(async () => {
  /* ── Escenario ── */
  const admin = await altaUsuario("admin@equipo.test");
  const comercialA = await altaUsuario("comercialA@equipo.test");
  const comercialB = await altaUsuario("comercialB@equipo.test");
  const ventas = await altaUsuario("ventas@equipo.test");
  const lectura = await altaUsuario("lectura@equipo.test");

  await sembrarRol(admin.localId, "admin", "Administración");
  await sembrarRol(comercialA.localId, "comercial", "Asesor A");
  await sembrarRol(comercialB.localId, "comercial", "Asesor B");
  await sembrarRol(ventas.localId, "ventas", "Ventas");
  await sembrarRol(lectura.localId, "lectura", "Solo lectura");

  const TEL_A = "3201000001", TEL_B = "3201000002", TEL_LIBRE = "3201000003";
  chk("el admin crea un prospecto asignado a A", (await crearLead(TEL_A, admin.localId, admin.idToken, comercialA.localId)) === 200);
  chk("el admin crea un prospecto asignado a B", (await crearLead(TEL_B, admin.localId, admin.idToken, comercialB.localId)) === 200);
  chk("el admin crea un prospecto sin asignar", (await crearLead(TEL_LIBRE, admin.localId, admin.idToken)) === 200);

  console.log("\n=== A. Acceso cruzado entre asesores ===");
  chk("A lee su prospecto", (await leerLead(TEL_A, comercialA.idToken)) === 200);
  chk("A NO lee el prospecto de B", (await leerLead(TEL_B, comercialA.idToken)) === 403);
  chk("A NO lee el prospecto sin asignar", (await leerLead(TEL_LIBRE, comercialA.idToken)) === 403);
  chk("B NO lee el prospecto de A", (await leerLead(TEL_A, comercialB.idToken)) === 403);
  chk("A NO actualiza el prospecto de B",
    (await parche(TEL_B, { estado: { stringValue: "contactado" } }, comercialA.idToken, "estado")) === 403);
  chk("A SÍ actualiza el estado de su propio prospecto",
    (await parche(TEL_A, { estado: { stringValue: "contactado" } }, comercialA.idToken, "estado")) === 200);

  console.log("\n=== B. Consultas: la bandeja no puede ser global ===");
  chk("la consulta filtrada por asignado_a funciona para A", (await listarMios(comercialA.localId, comercialA.idToken)) === 200);
  chk("una consulta SIN filtro es rechazada para A (no puede listar todo)",
    (await listarTodos(comercialA.idToken)) === 403);
  chk("el admin sí puede listar todo", (await listarTodos(admin.idToken)) === 200);

  console.log("\n=== C. Asignación: sólo administración ===");
  chk("A no puede asignarse el prospecto sin asignar",
    (await parche(TEL_LIBRE, { asignado_a: { stringValue: comercialA.localId } }, comercialA.idToken, "asignado_a")) === 403);
  chk("A no puede quitarse la asignación a sí mismo",
    (await parche(TEL_A, { asignado_a: { nullValue: "NULL_VALUE" } }, comercialA.idToken, "asignado_a")) === 403);
  chk("A no puede reasignar su prospecto a B",
    (await parche(TEL_A, { asignado_a: { stringValue: comercialB.localId } }, comercialA.idToken, "asignado_a")) === 403);
  chk("el admin sí puede reasignar de A a B",
    (await parche(TEL_A, { asignado_a: { stringValue: comercialB.localId } }, admin.idToken, "asignado_a")) === 200);

  console.log("\n=== D. Persistencia de la reasignación ===");
  chk("tras reasignar, A ya NO ve el prospecto", (await leerLead(TEL_A, comercialA.idToken)) === 403);
  chk("tras reasignar, B SÍ lo ve", (await leerLead(TEL_A, comercialB.idToken)) === 200);
  chk("el admin lo sigue viendo", (await leerLead(TEL_A, admin.idToken)) === 200);

  console.log("\n=== E. Rol «ventas» ===");
  await parche(TEL_B, { asignado_a: { stringValue: ventas.localId } }, admin.idToken, "asignado_a");
  chk("ventas lee su prospecto asignado", (await leerLead(TEL_B, ventas.idToken)) === 200);
  chk("ventas NO lee el de otro", (await leerLead(TEL_LIBRE, ventas.idToken)) === 403);
  chk("ventas NO crea cotizaciones",
    (await crearCotizacion(TEL_B, ventas.localId, ventas.idToken)).status === 403);
  const cotV = await crearCotizacion(TEL_B, admin.localId, admin.idToken);
  chk("el admin prepara la cotización para poder vender", cotV.status === 200, "HTTP " + cotV.status);
  chk("ventas NO confirma venta de un prospecto ajeno",
    (await crearVenta(TEL_LIBRE, cotV.id, ventas.localId, ventas.idToken)) === 403);
  chk("ventas SÍ confirma la venta de su prospecto",
    (await crearVenta(TEL_B, cotV.id, ventas.localId, ventas.idToken)) === 200);
  chk("la misma cotización no se puede vender dos veces",
    (await crearVenta(TEL_B, cotV.id, ventas.localId, ventas.idToken)) !== 200);
  chk("no se vende sin cotización",
    (await crearVenta(TEL_B, "no-existe", ventas.localId, ventas.idToken)) === 403);

  console.log("\n=== F. Rol «lectura» ===");
  await parche(TEL_LIBRE, { asignado_a: { stringValue: lectura.localId } }, admin.idToken, "asignado_a");
  chk("lectura lee su registro asignado", (await leerLead(TEL_LIBRE, lectura.idToken)) === 200);
  chk("lectura NO modifica el estado",
    (await parche(TEL_LIBRE, { estado: { stringValue: "contactado" } }, lectura.idToken, "estado")) === 403);
  chk("lectura NO añade notas",
    (await parche(TEL_LIBRE, { historial: { arrayValue: { values: [{ stringValue: "x" }] } } }, lectura.idToken, "historial")) === 403);
  chk("lectura NO crea prospectos",
    (await crearLead("3201000009", lectura.localId, lectura.idToken)) === 403);
  chk("lectura NO lee prospectos ajenos", (await leerLead(TEL_A, lectura.idToken)) === 403);

  console.log("\n=== G. Escalamiento de privilegios ===");
  chk("comercial no puede cambiarse el rol",
    (await fetch(`${FS}/crm_usuarios/${comercialA.localId}`, { method: "PATCH",
      headers: H(comercialA.idToken), body: JSON.stringify({ fields: { rol: { stringValue: "admin" } } }) }).then((r) => r.status)) === 403);
  chk("lectura no puede cambiarse el rol a comercial",
    (await fetch(`${FS}/crm_usuarios/${lectura.localId}`, { method: "PATCH",
      headers: H(lectura.idToken), body: JSON.stringify({ fields: { rol: { stringValue: "comercial" } } }) }).then((r) => r.status)) === 403);
  chk("ni el admin puede escribir roles desde el cliente",
    (await fetch(`${FS}/crm_usuarios/${comercialA.localId}`, { method: "PATCH",
      headers: H(admin.idToken), body: JSON.stringify({ fields: { rol: { stringValue: "ventas" } } }) }).then((r) => r.status)) === 403);
  chk("el admin SÍ lee la ficha de otros (para asignar)",
    (await fetch(`${FS}/crm_usuarios/${comercialA.localId}`, { headers: H(admin.idToken) }).then((r) => r.status)) === 200);
  chk("comercial NO lee la ficha de otro asesor",
    (await fetch(`${FS}/crm_usuarios/${comercialB.localId}`, { headers: H(comercialA.idToken) }).then((r) => r.status)) === 403);
  chk("comercial SÍ lee su propia ficha",
    (await fetch(`${FS}/crm_usuarios/${comercialA.localId}`, { headers: H(comercialA.idToken) }).then((r) => r.status)) === 200);

  console.log("\n=== H. Revocación sin borrar historial ===");
  chk("desactivar a B (activo=false)", (await sembrarRol(comercialB.localId, "comercial", "Asesor B", false)) === 200);
  chk("B desactivado ya NO lee su prospecto", (await leerLead(TEL_A, comercialB.idToken)) === 403);
  chk("el prospecto de B sigue existiendo para el admin", (await leerLead(TEL_A, admin.idToken)) === 200);
  chk("reactivar a B", (await sembrarRol(comercialB.localId, "comercial", "Asesor B", true)) === 200);
  chk("B recupera el acceso a su prospecto", (await leerLead(TEL_A, comercialB.idToken)) === 200);

  console.log("\n=== I. Separación cotización / venta ===");
  /* Antes esta comprobación contaba TODA la colección crm_sales y exigía exactamente 1.
     Eso sólo era cierto en una base recién creada: si antes se ejecutaba cualquier otra
     suite que hubiera vendido algo (por ejemplo pruebas-a03), fallaba sin que hubiera
     ningún defecto en el producto. Ahora se comprueba el hecho concreto: la venta de
     ESTA cotización vive en crm_sales y no quedó como campo dentro de crm_quotes. */
  const ventaDeCot = await fetch(`${FS}/crm_sales/${cotV.id}`, { headers: H(admin.idToken) })
    .then((r) => r.ok ? r.json() : null);
  chk("una venta confirmada vive en crm_sales",
    !!ventaDeCot && Object.values(ventaDeCot.fields.quote_id)[0] === cotV.id);
  const cotFinal = await fetch(`${FS}/crm_quotes/${cotV.id}`, { headers: H(admin.idToken) })
    .then((r) => r.ok ? r.json() : null);
  chk("la venta NO se guarda dentro de la cotización",
    !!cotFinal && !("venta" in cotFinal.fields) && !("confirmada" in cotFinal.fields));

  console.log("\n=== J. Anónimo (sigue cerrado) ===");
  chk("anónimo NO lee prospectos", (await leerLead(TEL_A, null)) === 403);
  chk("anónimo NO lista prospectos", (await listarTodos(null)) === 403);
  chk("anónimo NO crea prospectos", (await crearLead("3201000010", "x", null)) === 403);

  console.log("\n=== K. Correcciones de la auditoría independiente (H01/H02) ===");

  const sAuto = await crearLead("3201000020", comercialA.localId, comercialA.idToken, comercialA.localId);
  chk("H01 · comercial NO puede crear un prospecto asignándose a sí mismo", sAuto === 403, "HTTP " + sAuto);

  const sSin = await crearLead("3201000021", comercialA.localId, comercialA.idToken);
  chk("H01 · comercial SÍ crea un prospecto SIN asignación", sSin === 200, "HTTP " + sSin);

  const leeSin = await leerLead("3201000021", comercialA.idToken);
  chk("H01 · pero NO lo ve mientras no se lo asigne el admin", leeSin === 403, "HTTP " + leeSin);

  const sAsig = await parche("3201000021", { asignado_a: { stringValue: comercialA.localId } }, admin.idToken, "asignado_a");
  chk("H01 · el admin lo asigna", sAsig === 200, "HTTP " + sAsig);
  const leeDespues = await leerLead("3201000021", comercialA.idToken);
  chk("H01 · y entonces el comercial sí lo ve", leeDespues === 200, "HTTP " + leeDespues);

  const respAudit = await fetch(FS + "/crm_audit", {
    method: "POST", headers: H(lectura.idToken),
    body: JSON.stringify({ fields: {
      accion: { stringValue: "nota_añadida" }, detalle: { stringValue: "x" },
      autor: { stringValue: lectura.localId }, rol: { stringValue: "lectura" },
      fecha: { timestampValue: TS(0) } } }),
  });
  chk("H02 · lectura NO puede escribir en la auditoría", respAudit.status === 403, "HTTP " + respAudit.status);

  /* Las solicitudes de equipo NO están implementadas: se retiraron porque su
     bloque de reglas rompió la compilación. No se mide lo que no existe. */

  console.log("\nRESULTADO EQUIPO: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
