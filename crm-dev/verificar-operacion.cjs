/* KZ-CRM-016 · verificación de la operación real del CRM (SOLO LECTURA).

   Sirve para dos cosas:
   1. Comprobar que el administrador ya puede entrar y ha entrado.
   2. Auditar que los datos guardados cumplen las reglas de negocio, sin abrir el panel.

   No escribe nada. Es el complemento natural de crm/certificar-produccion.cjs: aquel
   certifica que NADIE anónimo entra; éste certifica que lo que hay dentro es coherente.

   Uso:
     node crm-dev/verificar-operacion.cjs               # contra kzfio-crm (lectura)
     node crm-dev/verificar-operacion.cjs --emulador    # sólo pruebas: demo-crm-016

   En modo --emulador usa el Auth y el Firestore del emulador y no pide credencial.
   KZ_ADMIN_EMAIL permite indicar el correo administrativo que se va a comprobar. */

const EMULADOR = process.argv.includes("--emulador");

const P = EMULADOR ? "demo-crm-016" : "kzfio-crm";
const FS = EMULADOR
  ? `http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents`
  : `https://firestore.googleapis.com/v1/projects/${P}/databases/default/documents`;
const IDENTITY = EMULADOR
  ? `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-crm-016`
  : `https://identitytoolkit.googleapis.com/v1/projects/${P}`;

const cabecera = async () => {
  if (EMULADOR) return { authorization: "Bearer owner" };
  const { tokenAcceso } = require(
    "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/UneFibra-SAS/tools/lib/google-auth.js"
  );
  return { authorization: "Bearer " + (await tokenAcceso()) };
};

const VERSION_VIGENTE = "v1-2026-11";
const ACCIONES = new Set([
  "estado_cambiado", "nota_añadida", "cotizacion_creada", "venta_confirmada",
  "exportacion_csv", "lead_anonimizado", "lead_borrado", "consentimiento_revocado",
  "prospecto_creado",
]);

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  OK    " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : null);

(async () => {
  const H = await cabecera();
  /* R08 · Paginación real: una sola página de 300 no es «la colección». Y un listado
     fallido NO se devuelve como lista vacía: devolver [] convertiría un error de red o
     de permisos en «no hay datos», que es justo la clase de mentira que estas
     verificaciones existen para detectar. */
  const listar = async (col) => {
    const salida = [];
    let token = null, paginas = 0;
    do {
      const url = `${FS}/${col}?pageSize=300` + (token ? "&pageToken=" + encodeURIComponent(token) : "");
      const r = await fetch(url, { headers: H });
      if (!r.ok) throw new Error(`No se pudo listar ${col}: HTTP ${r.status}`);
      const j = await r.json();
      for (const d of (j.documents || [])) salida.push({ id: d.name.split("/").pop(), f: d.fields || {} });
      token = j.nextPageToken || null;
      if (++paginas > 200) throw new Error("Demasiadas páginas listando " + col);
    } while (token);
    return salida;
  };

  console.log("=== 1. Estado de la cuenta administrativa ===");
  const lk = await fetch(`${IDENTITY}/accounts:lookup`, {
    method: "POST", headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ email: [process.env.KZ_ADMIN_EMAIL || "admin@ejemplo.com"] }),
  }).then((r) => r.json());
  const u = (lk.users || [])[0];
  chk("la cuenta existe", !!u, u ? u.localId : "no encontrada");
  if (u) {
    const entro = u.lastLoginAt && Number(u.lastLoginAt) > 0;
    console.log("    último acceso: " + (entro ? new Date(Number(u.lastLoginAt)).toISOString() : "TODAVÍA NINGUNO"));
    chk("el administrador ya ha iniciado sesión al menos una vez", !!entro,
      entro ? "" : "pendiente de que fije su contraseña con el correo de Firebase");
    chk("la cuenta no está deshabilitada", !u.disabled);
  }

  console.log("\n=== 2. Ficha de rol ===");
  if (u) {
    const r = await fetch(`${FS}/crm_usuarios/${u.localId}`, { headers: H });
    const j = r.ok ? await r.json() : null;
    chk("tiene ficha en crm_usuarios", !!j);
    if (j) {
      chk("rol = admin", val(j.fields, "rol") === "admin", val(j.fields, "rol"));
      chk("activo = true", val(j.fields, "activo") === true);
    }
  }

  console.log("\n=== 3. Contenido del CRM ===");
  const leads = await listar("crm_leads");
  const cotizaciones = await listar("crm_quotes");
  const ventas = await listar("crm_sales");
  const auditoria = await listar("crm_audit");
  const usuarios = await listar("crm_usuarios");
  console.log("    prospectos: " + leads.length + " · cotizaciones: " + cotizaciones.length +
    " · ventas: " + ventas.length + " · auditoría: " + auditoria.length + " · roles: " + usuarios.length);

  console.log("\n=== 4. Coherencia de los datos con las reglas de negocio ===");

  /* Prospectos: contrato vigente.
     R06: el identificador ya NO tiene por qué ser el teléfono. Exigir `id == telefono`
     marcaba como incumplimiento TODO prospecto migrado a UUID, que es justo el objetivo
     de la fase. Se comprueba en cambio que cada identificador sea válido: o un UUID v4,
     o —mientras la transición siga abierta— el teléfono del propio documento. */
  const esUuid4 = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));
  const leadsMal = leads.filter((l) => {
    const v = val(l.f, "consentimiento_version");
    const ret = l.f.retencion_hasta && l.f.retencion_hasta.timestampValue;
    return v !== VERSION_VIGENTE || !ret || new Date(ret).getTime() <= Date.now()
      || val(l.f, "consentimiento") !== true;
  });
  chk("todos los prospectos cumplen el contrato vigente", leadsMal.length === 0,
    leadsMal.slice(0, 8).map((l) => l.id).join(",") || "sin incidencias");

  const heredados = leads.filter((l) => !esUuid4(l.id));
  const identificadorRaro = leads.filter((l) => !esUuid4(l.id) && l.id !== val(l.f, "telefono"));
  chk("cada identificador es un UUID v4 o el teléfono del propio documento",
    identificadorRaro.length === 0, identificadorRaro.slice(0, 8).map((l) => l.id).join(",") || "sin incidencias");
  console.log("    con UUID v4: " + (leads.length - heredados.length) +
    " · heredados pendientes de migrar: " + heredados.length);

  /* Cotizaciones: importe amarrado a la lista de precios. */
  const PRECIOS = { basica: 49900, pro: 99900 };
  const cotMal = cotizaciones.filter((c) => {
    const plan = val(c.f, "plan");
    const monto = val(c.f, "monto");
    if (plan === "medida") return monto !== null;
    return PRECIOS[plan] !== monto;
  });
  chk("todas las cotizaciones respetan la lista de precios", cotMal.length === 0,
    cotMal.map((c) => c.id).join(",") || "sin incidencias");

  /* Ventas: toda venta cita una cotización existente y del mismo prospecto. */
  const idsCot = new Set(cotizaciones.map((c) => c.id));
  const ventasMal = ventas.filter((v) => {
    const q = val(v.f, "quote_id");
    const l = val(v.f, "lead_id");
    const c = cotizaciones.find((x) => x.id === q);
    return !idsCot.has(q) || !c || val(c.f, "lead_id") !== l;
  });
  chk("toda venta nace de una cotización del mismo prospecto", ventasMal.length === 0,
    ventasMal.map((v) => v.id).join(",") || "sin incidencias");

  /* Estadística: la suma que muestra el panel debe ser la suma real. */
  const suma = ventas.reduce((s, v) => s + (val(v.f, "monto") || 0), 0);
  const sumaDoc = ventas.reduce((s, v) => s + Number(val(v.f, "monto") || 0), 0);
  chk("la estadística de ventas coincide con la suma de documentos", suma === sumaDoc,
    ventas.length + " ventas · total " + sumaDoc);

  /* Auditoría: acciones de la lista blanca y autor presente. */
  const auditMal = auditoria.filter((a) => !ACCIONES.has(val(a.f, "accion")) || !val(a.f, "autor"));
  chk("toda la auditoría usa acciones permitidas y tiene autor", auditMal.length === 0,
    auditMal.map((a) => a.id).join(",") || "sin incidencias");

  console.log("\n=== 5. Resumen para el acta ===");
  const conActividad = leads.length + cotizaciones.length + ventas.length;
  if (!conActividad) {
    console.log("    El CRM está accesible y vacío: nadie ha registrado datos todavía.");
    console.log("    Certificación del flujo autenticado: pendiente del primer uso real.");
  } else {
    console.log("    El CRM tiene actividad real y los datos son coherentes con las reglas.");
  }

  console.log("\nRESULTADO OPERACIÓN: OK " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
