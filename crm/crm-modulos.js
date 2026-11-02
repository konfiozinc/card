/* ── KZ-CRM-020 · Cotizaciones, Ventas y Auditoría ────────────────────────────
   Módulo de LECTURA y presentación. No escribe nada nuevo en Firestore: las
   cotizaciones y las ventas se siguen creando desde la ficha del prospecto
   (crm.js), y la auditoría la escribe el servidor con la identidad de quien
   actuó. Aquí sólo se consultan y se muestran.

   Lo que cada rol PUEDE consultar no se supone: se midió con
   crm-dev/sondear-permisos-020.cjs contra las reglas vigentes (sin cambiarlas):

     · admin     → todas las cotizaciones, todas las ventas y la auditoría;
     · comercial → SÓLO las cotizaciones de sus prospectos, y sólo una consulta
                   por prospecto (la colección completa y el operador `in`
                   quedan denegados porque la regla depende de otro documento);
     · ventas    → SÓLO las cotizaciones y ventas de sus prospectos, igual;
     · lectura   → nada de esto;
     · anónimo   → nada.

   Por eso, cuando el rol no puede listar una colección completa se consulta
   prospecto por prospecto, con un tope explícito y un aviso que lo dice.
   ────────────────────────────────────────────────────────────────────────── */

import { collection, doc, getDoc, getDocs, query, where, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $m = (sel) => document.querySelector(sel);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CO"));

/* Etiquetas de negocio. Los NOMBRES de plan son los de la base canónica; los
   importes NO se fijan aquí: se muestran los que trae cada documento. */
const PLANES = { basica: "Mini Web Básica", pro: "Mini Web Pro", medida: "Proyecto a medida" };
const ACCIONES = {
  prospecto_creado: "Prospecto creado",
  prospecto_asignado: "Prospecto asignado",
  prospecto_reasignado: "Prospecto reasignado",
  estado_cambiado: "Estado cambiado",
  nota_añadida: "Nota añadida",
  cotizacion_creada: "Cotización creada",
  venta_confirmada: "Venta confirmada",
  exportacion_csv: "Exportación CSV",
  lead_anonimizado: "Prospecto anonimizado",
  lead_borrado: "Prospecto borrado",
  consentimiento_revocado: "Consentimiento revocado",
};

/* Tope de prospectos que se recorren para armar la vista de un asesor. Con
   muchos prospectos, hacer una consulta por cada uno sería lento: se acota y se
   dice en pantalla. */
const TOPE_POR_PROSPECTO = 40;
const TOPE_FILAS = 1000;
/* La auditoría se consulta sólo con los movimientos MÁS RECIENTES: se dice en
   pantalla cuántos se muestran para que nadie los tome por el historial entero. */
const LIMITE_AUDITORIA = 50;

const estado = {
  cotizaciones: null,
  ventas: null,
  auditoria: null,
  filtroCot: { texto: "", estado: "" },
  filtroVen: { texto: "" },
  cargando: { cotizaciones: false, ventas: false, auditoria: false },
};

const ctx = () => {
  const CRM = window.CRM;
  if (!CRM || !CRM.db || !CRM.sesion || !CRM.sesion.rol) return null;
  return { db: CRM.db, rol: CRM.sesion.rol, uid: CRM.sesion.uid, leads: Array.isArray(CRM.leads) ? CRM.leads : [] };
};

const avisar = (sel, texto, tipo) => {
  const caja = $m(sel);
  if (!caja) return;
  caja.textContent = texto || "";
  /* `alerta` (rosado) se reserva a problemas; `info` (cian) explica un alcance
     normal, como «sólo ves tus registros». */
  caja.className = "bandeja" + (tipo === "alerta" ? " bandeja--aviso" : tipo === "info" ? " bandeja--info" : "");
};

/* El detalle de la auditoría lo escribió el panel con datos crudos
   («<uuid> · 99900», «basica», «cotizado»). Aquí sólo se vuelve legible: los
   identificadores se cambian por el nombre del cliente, los importes se
   formatean y los planes se escriben como se llaman comercialmente. No se
   altera ningún registro. */
function detalleLegible(a, leads) {
  let texto = String(a.detalle == null ? "" : a.detalle).trim();
  if (!texto) return "";
  for (const l of leads) {
    if (l && l.id && texto.includes(l.id)) texto = texto.split(l.id).join(l.nombre || "prospecto");
  }
  /* Importes: entre 4 y 7 cifras (49.900 … 1.399.000). Los teléfonos tienen 10
     y los identificadores llevan letras, así que no se confunden. */
  texto = texto.replace(/(^|[^\d])(\d{4,7})(?![\d])/g, (m, pre, num) => pre + "$" + Number(num).toLocaleString("es-CO"));
  texto = texto.replace(/\b(basica|pro|medida)\b/g, (m) => PLANES[m] || m);
  return texto;
}

/* Fecha y hora en horario de Colombia. */
const fechaLarga = (ts) => {
  if (!ts) return "—";
  const d = typeof ts.toDate === "function" ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

const nombreLead = (leadId, leads) => {
  const l = leads.find((x) => x.id === leadId);
  if (l && l.nombre) return l.nombre;
  return "Prospecto no disponible";
};

const servicioDe = (plan) => PLANES[plan] || (plan ? String(plan) : "—");

/* ── Lectura de datos ──────────────────────────────────────────────────── */

/* Colección completa: sólo cuando la regla lo permite (administración). */
async function leerColeccion(db, nombre) {
  const snap = await getDocs(query(collection(db, nombre), limit(TOPE_FILAS)));
  return { filas: snap.docs.map((d) => Object.assign({ id: d.id }, d.data())), completo: snap.size < TOPE_FILAS };
}

/* Una consulta por prospecto propio: la única forma que admiten las reglas para
   comercial y ventas. Se hace con concurrencia limitada para no abrir 40
   peticiones a la vez. */
async function leerPorProspecto(db, coleccion, leadsPropios) {
  const objetivo = leadsPropios.slice(0, TOPE_POR_PROSPECTO);
  const salida = [];
  const grupo = 5;
  for (let i = 0; i < objetivo.length; i += grupo) {
    const tanda = objetivo.slice(i, i + grupo);
    const resultados = await Promise.all(tanda.map(async (l) => {
      try {
        const snap = await getDocs(query(collection(db, coleccion), where("lead_id", "==", l.id)));
        return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      } catch (e) {
        /* Un prospecto que ya no se puede leer no debe romper la lista entera. */
        return [];
      }
    }));
    for (const r of resultados) salida.push(...r);
  }
  return {
    filas: salida,
    completo: leadsPropios.length <= TOPE_POR_PROSPECTO,
    recortado: Math.max(0, leadsPropios.length - TOPE_POR_PROSPECTO),
  };
}

/* ── Cotizaciones ──────────────────────────────────────────────────────── */
async function cargarCotizaciones(c) {
  const puedeTodo = c.rol === "admin";
  if (!puedeTodo && !["comercial", "ventas"].includes(c.rol)) {
    estado.cotizaciones = { filas: [], completo: true, sinAcceso: true };
    return;
  }
  if (puedeTodo) {
    const r = await leerColeccion(c.db, "crm_quotes");
    estado.cotizaciones = { filas: r.filas, completo: r.completo, sinAcceso: false };
    return;
  }
  const propios = c.leads.filter((l) => l.asignado_a === c.uid);
  const r = await leerPorProspecto(c.db, "crm_quotes", propios);
  estado.cotizaciones = { filas: r.filas, completo: r.completo, recortado: r.recortado, sinAcceso: false, alcancePropio: true };
}

function cotizacionesFiltradas() {
  const lista = (estado.cotizaciones && estado.cotizaciones.filas) || [];
  const leads = (ctx() || {}).leads || [];
  const t = (estado.filtroCot.texto || "").toLowerCase();
  return lista
    .filter((q) => {
      const okEstado = !estado.filtroCot.estado || q.estado === estado.filtroCot.estado;
      const cliente = nombreLead(q.lead_id, leads);
      const texto = [cliente, servicioDe(q.plan), q.plan].join(" ").toLowerCase();
      return okEstado && (!t || texto.includes(t));
    })
    .sort((a, b) => {
      const fa = a.creado_en && a.creado_en.toMillis ? a.creado_en.toMillis() : 0;
      const fb = b.creado_en && b.creado_en.toMillis ? b.creado_en.toMillis() : 0;
      return fb - fa;
    });
}

function pintarCotizaciones() {
  const c = ctx();
  const cuerpo = $m("#tabla-cotizaciones");
  const tarjetas = $m("#lista-cotizaciones");
  const kpis = $m("#cot-kpis");
  const contador = $m("#cot-contador");
  if (!c || !cuerpo || !tarjetas) return;

  const info = estado.cotizaciones || { filas: [], completo: true };

  if (info.sinAcceso) {
    cuerpo.innerHTML = `<tr><td colspan="6">Tu rol no tiene acceso a las cotizaciones.</td></tr>`;
    tarjetas.innerHTML = "";
    if (kpis) kpis.innerHTML = "";
    if (contador) contador.textContent = "";
    avisar("#cot-aviso", "Tu rol no tiene una vista de cotizaciones. Puedes verlas dentro de la ficha del prospecto.", "alerta");
    return;
  }

  const filas = cotizacionesFiltradas();
  const leads = c.leads;

  /* ¿La lista es completa? Si el rol sólo puede consultar prospecto por
     prospecto y la cartera supera el tope, o si se alcanzó el tope de lectura,
     los indicadores NO son totales: se marcan como parciales y se avisa. */
  const parcial = !info.completo || (info.recortado || 0) > 0;
  const cifra = (n) => (parcial ? "≥ " : "") + n;
  const eti = (t) => t + (parcial ? " · parcial" : "");

  /* Indicadores: sólo con datos reales. «Cotizado vigente» suma lo que sigue
     vivo (enviadas y aceptadas); las rechazadas y las vencidas no cuentan, y las
     cotizaciones «a medida» no tienen importe y no se suman. */
  const vigentes = info.filas.filter((q) => ["enviada", "aceptada"].includes(q.estado) && typeof q.monto === "number");
  const cotizado = vigentes.reduce((s, q) => s + q.monto, 0);
  const cuenta = (e) => info.filas.filter((q) => q.estado === e).length;
  if (kpis) {
    kpis.innerHTML = [
      `<div class="stat"><b>${cifra(info.filas.length)}</b><span>${eti("cotizaciones")}</span></div>`,
      `<div class="stat"><b>${cifra(cuenta("enviada"))}</b><span>${eti("en curso")}</span></div>`,
      `<div class="stat"><b>${cifra(cuenta("aceptada"))}</b><span>${eti("aceptadas")}</span></div>`,
      `<div class="stat"><b>${(parcial ? "≥ " : "") + pesos(cotizado)}</b><span>${eti("cotizado vigente")}</span></div>`,
    ].join("");
  }
  if (contador) contador.textContent = filas.length + " de " + info.filas.length + (parcial ? " cargadas" : "");

  cuerpo.innerHTML = filas.length ? filas.map((q) => `
    <tr>
      <td>${esc(fechaLarga(q.creado_en))}</td>
      <td>${esc(nombreLead(q.lead_id, leads))}</td>
      <td>${esc(servicioDe(q.plan))}</td>
      <td>${esc(q.monto == null ? "Sin importe" : pesos(q.monto))}</td>
      <td><span class="pill pill--${esc(q.estado)}">${esc(q.estado)}</span></td>
      <td><button class="mini" data-abrir-prospecto="${esc(q.lead_id)}">Abrir prospecto</button></td>
    </tr>`).join("")
    : `<tr><td colspan="6">${info.filas.length ? "Ninguna cotización coincide con el filtro." : "Todavía no hay cotizaciones registradas."}</td></tr>`;

  tarjetas.innerHTML = filas.map((q) => `
    <article class="tarjeta-registro">
      <div class="tp__cab">
        <h3 class="tp__nombre">${esc(nombreLead(q.lead_id, leads))}</h3>
        <span class="pill pill--${esc(q.estado)}">${esc(q.estado)}</span>
      </div>
      <dl class="tp__datos">
        <div class="tp__dato"><dt>Servicio</dt><dd>${esc(servicioDe(q.plan))}</dd></div>
        <div class="tp__dato"><dt>Importe</dt><dd>${esc(q.monto == null ? "Sin importe" : pesos(q.monto))}</dd></div>
        <div class="tp__dato"><dt>Fecha</dt><dd>${esc(fechaLarga(q.creado_en))}</dd></div>
      </dl>
      <button type="button" class="tp__abrir" data-abrir-prospecto="${esc(q.lead_id)}">Abrir prospecto</button>
    </article>`).join("");

  const notas = [];
  if (info.alcancePropio) notas.push("Se muestran sólo las cotizaciones de tus prospectos.");
  if (parcial) {
    notas.push("Estos resultados son PARCIALES: " +
      (info.recortado ? `se revisaron ${TOPE_POR_PROSPECTO} de ${TOPE_POR_PROSPECTO + info.recortado} prospectos (${info.recortado} sin revisar). ` : "") +
      (info.completo === false ? "se alcanzó el tope de lectura. " : "") +
      "Las cifras de arriba son un mínimo, no el total.");
  } else if (info.alcancePropio) {
    notas.push("Es el total de tu cartera.");
  }
  avisar("#cot-aviso", notas.join(" "), notas.length ? (parcial ? "alerta" : "info") : null);
}

/* ── Ventas ────────────────────────────────────────────────────────────── */
async function cargarVentas(c) {
  const puedeTodo = c.rol === "admin";
  if (!puedeTodo && c.rol !== "ventas") {
    /* Comercial y lectura no tienen acceso a crm_sales (medido). */
    estado.ventas = { filas: [], completo: true, sinAcceso: true };
    return;
  }
  if (puedeTodo) {
    const r = await leerColeccion(c.db, "crm_sales");
    estado.ventas = { filas: r.filas, completo: r.completo, sinAcceso: false };
    return;
  }
  const propios = c.leads.filter((l) => l.asignado_a === c.uid);
  const r = await leerPorProspecto(c.db, "crm_sales", propios);
  estado.ventas = { filas: r.filas, completo: r.completo, recortado: r.recortado, sinAcceso: false, alcancePropio: true };
}

function ventasFiltradas() {
  const lista = (estado.ventas && estado.ventas.filas) || [];
  const leads = (ctx() || {}).leads || [];
  const t = (estado.filtroVen.texto || "").toLowerCase();
  return lista
    .filter((v) => {
      const texto = [nombreLead(v.lead_id, leads), servicioDe(v.plan)].join(" ").toLowerCase();
      return !t || texto.includes(t);
    })
    .sort((a, b) => {
      const fa = a.confirmado_en && a.confirmado_en.toMillis ? a.confirmado_en.toMillis() : 0;
      const fb = b.confirmado_en && b.confirmado_en.toMillis ? b.confirmado_en.toMillis() : 0;
      return fb - fa;
    });
}

/* El plan vendido no vive en la venta: vive en su cotización (el id de la venta
   ES el id de la cotización). Se completa sin volver a contar nada. */
async function completarServicioDeVentas(c) {
  const filas = (estado.ventas && estado.ventas.filas) || [];
  const pendientes = filas.filter((v) => v.plan === undefined);
  const grupo = 5;
  for (let i = 0; i < pendientes.length; i += grupo) {
    const tanda = pendientes.slice(i, i + grupo);
    await Promise.all(tanda.map(async (v) => {
      try {
        const snap = await getDoc(doc(c.db, "crm_quotes", v.quote_id || v.id));
        v.plan = snap.exists() ? snap.data().plan : null;
      } catch (e) {
        v.plan = null;
      }
    }));
  }
}

function pintarVentas() {
  const c = ctx();
  const cuerpo = $m("#tabla-ventas");
  const tarjetas = $m("#lista-ventas");
  const kpis = $m("#ven-kpis");
  const contador = $m("#ven-contador");
  if (!c || !cuerpo || !tarjetas) return;

  const info = estado.ventas || { filas: [], completo: true };

  if (info.sinAcceso) {
    cuerpo.innerHTML = `<tr><td colspan="6">Tu rol no tiene acceso a las ventas.</td></tr>`;
    tarjetas.innerHTML = "";
    if (kpis) kpis.innerHTML = "";
    if (contador) contador.textContent = "";
    avisar("#ven-aviso", "Tu rol no tiene acceso a las ventas confirmadas.", "alerta");
    return;
  }

  const filas = ventasFiltradas();
  const leads = c.leads;
  const total = info.filas.reduce((s, v) => s + (typeof v.monto === "number" ? v.monto : 0), 0);
  const n = info.filas.length;

  /* Igual que en cotizaciones: si la lectura está recortada, ninguna cifra es un
     total y así se indica (nunca se presenta un mínimo como si fuera el total). */
  const parcial = !info.completo || (info.recortado || 0) > 0;
  const cifra = (v) => (parcial ? "≥ " : "") + v;
  const eti = (t) => t + (parcial ? " · parcial" : "");

  if (kpis) {
    kpis.innerHTML = [
      `<div class="stat stat--venta"><b>${cifra(pesos(total))}</b><span>${eti("vendido")}</span></div>`,
      `<div class="stat"><b>${cifra(n)}</b><span>${eti("ventas")}</span></div>`,
      `<div class="stat"><b>${n ? cifra(pesos(Math.round(total / n))) : "—"}</b><span>${eti("ticket medio")}</span></div>`,
    ].join("");
  }
  if (contador) contador.textContent = filas.length + " de " + n + (parcial ? " cargadas" : "");

  cuerpo.innerHTML = filas.length ? filas.map((v) => `
    <tr>
      <td>${esc(fechaLarga(v.confirmado_en))}</td>
      <td>${esc(nombreLead(v.lead_id, leads))}</td>
      <td>${esc(servicioDe(v.plan))}</td>
      <td>${esc(pesos(v.monto))}</td>
      <td><span class="pill pill--confirmada">confirmada</span></td>
      <td><button class="mini" data-abrir-prospecto="${esc(v.lead_id)}">Abrir prospecto</button></td>
    </tr>`).join("")
    : `<tr><td colspan="6">${n ? "Ninguna venta coincide con el buscador." : "Todavía no hay ventas confirmadas."}</td></tr>`;

  tarjetas.innerHTML = filas.map((v) => `
    <article class="tarjeta-registro">
      <div class="tp__cab">
        <h3 class="tp__nombre">${esc(nombreLead(v.lead_id, leads))}</h3>
        <span class="pill pill--confirmada">confirmada</span>
      </div>
      <dl class="tp__datos">
        <div class="tp__dato"><dt>Servicio</dt><dd>${esc(servicioDe(v.plan))}</dd></div>
        <div class="tp__dato"><dt>Importe</dt><dd>${esc(pesos(v.monto))}</dd></div>
        <div class="tp__dato"><dt>Fecha</dt><dd>${esc(fechaLarga(v.confirmado_en))}</dd></div>
      </dl>
      <button type="button" class="tp__abrir" data-abrir-prospecto="${esc(v.lead_id)}">Abrir prospecto</button>
    </article>`).join("");

  const notas = [];
  if (info.alcancePropio) notas.push("Se muestran sólo las ventas de tus prospectos.");
  if (parcial) {
    notas.push("Estos resultados son PARCIALES: " +
      (info.recortado ? `se revisaron ${TOPE_POR_PROSPECTO} de ${TOPE_POR_PROSPECTO + info.recortado} prospectos (${info.recortado} sin revisar). ` : "") +
      (info.completo === false ? "se alcanzó el tope de lectura. " : "") +
      "Las cifras de arriba son un mínimo, no el total.");
  } else if (info.alcancePropio) {
    notas.push("Es el total de tu cartera.");
  }
  avisar("#ven-aviso", notas.join(" "), notas.length ? (parcial ? "alerta" : "info") : null);
}

/* ── Auditoría ─────────────────────────────────────────────────────────── */
async function cargarAuditoria(c) {
  if (c.rol !== "admin") { estado.auditoria = { filas: [], sinAcceso: true }; return; }
  const snap = await getDocs(query(collection(c.db, "crm_audit"), orderBy("fecha", "desc"), limit(LIMITE_AUDITORIA)));
  estado.auditoria = { filas: snap.docs.map((d) => Object.assign({ id: d.id }, d.data())), sinAcceso: false };
}

function pintarAuditoria() {
  const c = ctx();
  const lista = $m("#auditoria-lista");
  const legado = $m("#auditoria-tabla-envoltura");
  const contador = $m("#aud-contador");
  if (!c || !lista) return;

  const info = estado.auditoria || { filas: [], sinAcceso: true };
  if (info.sinAcceso) {
    lista.innerHTML = "";
    if (legado) legado.hidden = false;
    if (contador) contador.textContent = "";
    avisar("#aud-aviso", "Sólo la administración puede consultar la auditoría.", "alerta");
    return;
  }

  lista.innerHTML = info.filas.length ? info.filas.map((a) => {
    const cuando = a.fecha && typeof a.fecha.toDate === "function" ? a.fecha.toDate() : null;
    const iso = cuando ? cuando.toISOString() : "";
    return `
    <article class="auditoria-item">
      <div class="auditoria-item__cab">
        <span class="pill pill--accion">${esc(ACCIONES[a.accion] || a.accion || "acción")}</span>
        <time class="auditoria-item__fecha" datetime="${esc(iso)}">${esc(fechaLarga(a.fecha))}</time>
      </div>
      ${a.detalle ? `<p class="auditoria-item__detalle">${esc(detalleLegible(a, c.leads))}</p>` : ""}
      <p class="auditoria-item__autor">${esc(a.rol || "—")}</p>
    </article>`;
  }).join("")
    : `<p class="nota">Sin registros de auditoría.</p>`;

  /* La tabla que pinta crm.js se conserva como respaldo, pero si la lista nueva
     tiene contenido se oculta para no duplicar la misma información. */
  if (legado) legado.hidden = info.filas.length > 0;
  if (contador) contador.textContent = info.filas.length + (info.filas.length >= LIMITE_AUDITORIA ? " más recientes" : " registros");
  avisar("#aud-aviso", "", null);
}

/* ── Entrada desde la navegación ───────────────────────────────────────── */
async function cargar(area) {
  const c = ctx();
  if (!c) return;
  if (area === "cotizaciones" && !estado.cargando.cotizaciones) {
    estado.cargando.cotizaciones = true;
    avisar("#cot-aviso", "Cargando cotizaciones…", false);
    try { await cargarCotizaciones(c); }
    catch (e) { estado.cotizaciones = { filas: [], completo: true, sinAcceso: false }; avisar("#cot-aviso", "No se pudieron cargar las cotizaciones (" + (e.code || e.message) + ").", "alerta"); }
    finally { estado.cargando.cotizaciones = false; }
    pintarCotizaciones();
  }
  if (area === "ventas" && !estado.cargando.ventas) {
    estado.cargando.ventas = true;
    avisar("#ven-aviso", "Cargando ventas…", false);
    try {
      await cargarVentas(c);
      if (!(estado.ventas && estado.ventas.sinAcceso)) { await completarServicioDeVentas(c); }
    } catch (e) { estado.ventas = { filas: [], completo: true, sinAcceso: false }; avisar("#ven-aviso", "No se pudieron cargar las ventas (" + (e.code || e.message) + ").", "alerta"); }
    finally { estado.cargando.ventas = false; }
    pintarVentas();
  }
  if (area === "auditoria" && !estado.cargando.auditoria) {
    estado.cargando.auditoria = true;
    try { await cargarAuditoria(c); }
    catch (e) { estado.auditoria = { filas: [], sinAcceso: false }; avisar("#aud-aviso", "No se pudo cargar la auditoría (" + (e.code || e.message) + ").", "alerta"); }
    finally { estado.cargando.auditoria = false; }
    pintarAuditoria();
  }
}

/* ── Interacción ───────────────────────────────────────────────────────── */
$m("#cot-buscar")?.addEventListener("input", (e) => { estado.filtroCot.texto = e.target.value; pintarCotizaciones(); });
$m("#cot-estado")?.addEventListener("change", (e) => { estado.filtroCot.estado = e.target.value; pintarCotizaciones(); });
$m("#ven-buscar")?.addEventListener("input", (e) => { estado.filtroVen.texto = e.target.value; pintarVentas(); });

/* Abrir el prospecto desde una cotización o una venta: se cambia al área de
   Prospectos y se pulsa la fila equivalente, de modo que el recorrido es el
   mismo que desde la cartera (mismos permisos y misma ficha). */
function abrirProspecto(id) {
  if (!id) return;
  const UI = window.KZ_UI;
  if (UI && typeof UI.mostrarSeccion === "function") UI.mostrarSeccion("cartera");
  setTimeout(() => {
    const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    const fila = document.querySelector(`#tabla-leads tr[data-id="${sel}"]`);
    if (fila) { fila.click(); return; }
    const aviso = document.querySelector("#estado-panel");
    if (aviso) {
      aviso.className = "aviso err";
      aviso.textContent = "Ese prospecto no está en tu cartera, así que no se puede abrir desde aquí.";
    }
  }, 80);
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-abrir-prospecto]");
  if (b) abrirProspecto(b.dataset.abrirProspecto);
});

/* ── API para la navegación (crm-ui.js) ────────────────────────────────── */
window.KZ_MODULOS = {
  areas: ["cotizaciones", "ventas", "auditoria"],
  alEntrar(area) {
    try {
      if (["cotizaciones", "ventas", "auditoria"].includes(area)) {
        /* Se recarga al entrar: cotizaciones y ventas cambian desde la ficha. */
        cargar(area);
      }
    } catch (e) { console.warn("modulos:", e.message); }
  },
  recargar(area) {
    if (area === "cotizaciones") estado.cotizaciones = null;
    if (area === "ventas") estado.ventas = null;
    if (area === "auditoria") estado.auditoria = null;
    cargar(area);
  },
  /* Al cerrar sesión: no dejar registros en memoria ni en pantalla. */
  limpiar() {
    estado.cotizaciones = null;
    estado.ventas = null;
    estado.auditoria = null;
    estado.filtroCot = { texto: "", estado: "" };
    estado.filtroVen = { texto: "" };
    for (const sel of ["#tabla-cotizaciones", "#lista-cotizaciones", "#tabla-ventas", "#lista-ventas",
      "#auditoria-lista", "#cot-kpis", "#ven-kpis"]) {
      const el = $m(sel); if (el) el.innerHTML = "";
    }
    for (const sel of ["#cot-aviso", "#ven-aviso", "#aud-aviso"]) avisar(sel, "", null);
    for (const sel of ["#cot-contador", "#ven-contador", "#aud-contador"]) {
      const el = $m(sel); if (el) el.textContent = "";
    }
    const legado = $m("#auditoria-tabla-envoltura"); if (legado) legado.hidden = false;
    for (const sel of ["#cot-buscar", "#ven-buscar", "#cot-estado"]) {
      const el = $m(sel); if (el) el.value = "";
    }
  },
  /* Para las pruebas internas: conteos reales sin tocar la interfaz. */
  resumen() {
    return {
      cotizaciones: (estado.cotizaciones && estado.cotizaciones.filas || []).length,
      ventas: (estado.ventas && estado.ventas.filas || []).length,
      auditoria: (estado.auditoria && estado.auditoria.filas || []).length,
      filtradasCot: cotizacionesFiltradas().length,
      filtradasVen: ventasFiltradas().length,
    };
  },
};
