import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, getDocs, query, orderBy, limit, updateDoc,
  addDoc, serverTimestamp, where, arrayUnion, deleteDoc, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { registrarProspectoInterno } from "./alta-prospecto.js";

/* ── KZ-CRM-017 · panel comercial privado de KONFÍO ZINC ──────────────────────
   Se publica en GitHub Pages y habla SÓLO con el proyecto real `kzfio-crm`.
   Aquí NO hay ninguna ruta de emulador: las configuraciones del emulador y los
   scripts de administración viven fuera de este directorio, en `crm-dev/`, que
   no se publica.

   Regla de negocio: una venta confirmada es un documento de crm_sales con
   cotización previa del mismo prospecto; cotizar o abrir WhatsApp NUNCA crea
   una venta. */

/* Configuración PÚBLICA del SDK de la app web «CRM Web» del proyecto kzfio-crm.
   No hay credenciales administrativas aquí ni en ningún archivo del frontend:
   estos valores los publica Google en cualquier app web de Firebase y por sí
   solos no dan acceso a nada; todo lo decide crm/firestore.rules. */
const CONFIG = {
  apiKey: "AIzaSyAeTUIAcqHz0pFuNLpxpg6MiboA-PgdLe4",
  authDomain: "kzfio-crm.firebaseapp.com",
  projectId: "kzfio-crm",
  storageBucket: "kzfio-crm.firebasestorage.app",
  messagingSenderId: "172060412799",
  appId: "1:172060412799:web:a5f6f2221b948b02f8e84a",
};

/* IDENTIFICADOR DE BASE — cuidado, aquí se rompió el primer acceso real.
   Este proyecto NO usa la base por omisión «(default)»: su base se llama
   literalmente «default». `getFirestore(app)` sin el segundo argumento apunta a
   «(default)», que en kzfio-crm NO EXISTE: la autenticación funcionaba y el panel
   se caía en la primera lectura, con «The database (default) does not exist».
   El id se pasa explícito y es el mismo en producción y en el emulador, para que
   las pruebas ejerciten exactamente la misma ruta. */
const ID_BASE = "default";

const app = initializeApp(CONFIG);
const auth = getAuth(app);
const db = getFirestore(app, ID_BASE);

/* Sesión persistente: al recargar o volver en otro momento no hay que volver a
   entrar. El cierre sigue siendo voluntario, con el botón «Salir». */
setPersistence(auth, browserLocalPersistence).catch(() => { /* el SDK cae a sesión en memoria */ });

const PRECIOS = { basica: 49900, pro: 99900 };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = (n) => n == null ? "—" : "$" + Number(n).toLocaleString("es-CO");

const sesion = { uid: null, rol: null, email: null };
let leads = [];
let filtro = { estado: "", texto: "" };

function aviso(texto, tipo) {
  const caja = $("#estado-panel");
  caja.className = "aviso " + (tipo || "");
  caja.textContent = texto;
}

async function rolDe(uid) {
  const snap = await getDoc(doc(db, "crm_usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

/* NOTA: aquí había una función de alta de rol para el emulador. Se eliminó: en el
   panel publicado los roles se asignan sólo por procedimiento privilegiado, y el
   navegador no tiene ninguna vía para crear ni modificar el propio rol. */

async function auditar(accion, detalle) {
  try {
    await addDoc(collection(db, "crm_audit"), {
      accion, detalle: detalle || "", autor: sesion.uid, rol: sesion.rol, fecha: serverTimestamp(),
    });
  } catch (e) { console.warn("auditoría no disponible:", e.message); }
}

/* ── sesión ──
   Los errores de Authentication se traducen a algo que se pueda accionar. Nunca se
   muestra el correo introducido ni se confirma si una cuenta existe: eso convertiría
   el formulario en un oráculo de cuentas. */
const ERRORES_AUTH = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "El correo no tiene un formato válido.",
  "auth/missing-password": "Escribe tu contraseña.",
  "auth/user-disabled": "Esta cuenta está deshabilitada. Habla con la administración.",
  "auth/too-many-requests": "Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.",
  "auth/network-request-failed": "No hay conexión con el servidor. Revisa tu internet.",
  "auth/operation-not-allowed": "El acceso con correo y contraseña no está habilitado.",
  "auth/unauthorized-domain": "Este dominio no está autorizado para iniciar sesión.",
  "auth/configuration-not-found": "La autenticación del proyecto no está disponible ahora mismo.",
};
const mensajeAuth = (code) => ERRORES_AUTH[code] || "No se pudo iniciar sesión. Inténtalo de nuevo.";

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#l-email").value.trim();
  const pass = $("#l-pass").value;
  const boton = e.submitter || $("#form-login button[type=submit]");
  $("#login-error").textContent = "";
  if (!email || !pass) { $("#login-error").textContent = "Escribe tu correo y tu contraseña."; return; }
  if (boton) { boton.disabled = true; boton.textContent = "Entrando…"; }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const rol = await rolDe(cred.user.uid);
    if (!rol || rol.activo !== true) {
      $("#login-error").textContent = "Esta cuenta no tiene un rol activo en el CRM. Habla con la administración.";
      await signOut(auth);
    }
  } catch (err) {
    $("#login-error").textContent = mensajeAuth(err && err.code);
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = "Entrar"; }
  }
});

/* SEG-03 (auditoría KZ-CRM-017): al salir no basta con ocultar el panel. Los datos
   seguían en memoria y en el DOM de la pestaña, y window.CRM.leads los exponía. Aquí
   se vacía todo lo sensible: es la diferencia entre «cerrar sesión» y «desconectar». */
function limpiarPanel() {
  leads = [];
  leadActual = null;
  sesion.uid = null; sesion.rol = null; sesion.email = null;
  $("#tabla-leads").innerHTML = "";
  $("#tabla-audit").innerHTML = "";
  $("#stats").innerHTML = "";
  $("#contador").textContent = "";
  $("#quien").textContent = "";
  $("#detalle").hidden = true;
  $("#d-nombre").textContent = "";
  $("#d-meta").textContent = "";
  $("#d-historial").innerHTML = "";
  $("#d-cotizaciones").textContent = "";
  $("#d-nota").value = "";
  $("#s-quote").value = "";
  $("#s-monto").value = "";
  $("#f-texto").value = "";
  filtro = { estado: "", texto: "" };
  for (const campo of ["#n-nombre", "#n-telefono"]) { const el = $(campo); if (el) el.value = ""; }
  const cons = $("#n-consent"); if (cons) cons.checked = false;
  $("#l-pass").value = "";
  $("#login-error").textContent = "";
  $("#estado-panel").textContent = "";
}

$("#btn-salir").addEventListener("click", async () => {
  limpiarPanel();
  await signOut(auth);
});

onAuthStateChanged(auth, async (u) => {
  if (!u) {
    limpiarPanel();
    $("#vista").hidden = true; $("#vista-login").hidden = false;
    $("#btn-salir").hidden = true;
    return;
  }
  /* El rol se lee de crm_usuarios. Hay que distinguir tres situaciones, porque
     confundirlas fue justo lo que hizo incomprensible el primer acceso real:
       · la lectura falla        → problema de conexión o de reglas
       · no hay ficha            → la cuenta existe pero no tiene rol
       · ficha desactivada       → rol revocado */
  let rol = null, fallo = null;
  try { rol = await rolDe(u.uid); } catch (err) { fallo = err; }

  if (fallo) {
    $("#login-error").textContent = /permission-denied/.test(fallo.code || "")
      ? "Tu cuenta no tiene permiso para leer el CRM. Habla con la administración."
      : "No se pudo cargar tu perfil del CRM (" + (fallo.code || "sin conexión") + "). Vuelve a intentarlo.";
    await signOut(auth);
    return;
  }
  if (!rol) {
    $("#login-error").textContent = "Esta cuenta no tiene ficha en el CRM. La administración debe asignarle un rol.";
    await signOut(auth);
    return;
  }
  if (rol.activo !== true || !rol.rol) {
    $("#login-error").textContent = "Tu rol en el CRM está desactivado. Habla con la administración.";
    await signOut(auth);
    return;
  }

  sesion.uid = u.uid; sesion.rol = rol.rol; sesion.email = u.email;
  $("#vista-login").hidden = true; $("#vista").hidden = false;
  $("#btn-salir").hidden = false;
  $("#quien").textContent = u.email + " · " + rol.rol;
  aplicarPermisos();
  await cargarLeads();
  await pintarStats();
  if (rol.rol === "admin") await pintarAuditoria();
  aviso("Sesión iniciada como " + rol.rol + ".", "ok");
  /* El foco va al contenido: en móvil ahorra un desplazamiento y con lector de
     pantalla anuncia el cambio de vista. */
  const principal = document.querySelector("#vista h2, #vista .tarjeta h2");
  if (principal) { principal.setAttribute("tabindex", "-1"); principal.focus(); }
});

function aplicarPermisos() {
  const puedeCotizar = ["admin", "comercial"].includes(sesion.rol);
  const puedeVender = ["admin", "ventas"].includes(sesion.rol);
  const esAdmin = sesion.rol === "admin";
  $("#bloque-cotizar").hidden = !puedeCotizar;
  $("#bloque-venta").hidden = !puedeVender;
  $("#btn-exportar").hidden = !["admin", "comercial"].includes(sesion.rol);
  $("#bloque-auditoria").hidden = !esAdmin;
  $("#bloque-privacidad").hidden = !esAdmin;
}

/* ── alta de prospecto por el operador (modo privado) ── */
$("#btn-alta").addEventListener("click", async () => {
  const boton = $("#btn-alta");
  boton.disabled = true;
  const r = await registrarProspectoInterno(db, {
    nombre: $("#n-nombre").value,
    telefono: $("#n-telefono").value,
    industria: $("#n-industria").value,
    origen: $("#n-origen").value,
    consentimiento: $("#n-consent").checked,
  }, { uid: sesion.uid });

  const MENSAJES_ALTA = {
    nombre: "Escribe el nombre (entre 2 y 60 caracteres).",
    telefono: "El WhatsApp debe tener entre 10 y 15 dígitos.",
    industria: "Elige una industria válida.",
    consentimiento: "Debes confirmar que el prospecto autorizó el contacto.",
    duplicado: "Ya existe un prospecto con ese WhatsApp.",
    permiso: "Tu rol no puede registrar prospectos.",
    sesion: "Vuelve a iniciar sesión.",
  };

  if (r.ok) {
    await auditar("prospecto_creado", r.telefono);
    $("#n-nombre").value = ""; $("#n-telefono").value = ""; $("#n-consent").checked = false;
    await cargarLeads(); await pintarStats();
    if (sesion.rol === "admin") await pintarAuditoria();
    aviso("Prospecto registrado: " + r.telefono, "ok");
  } else {
    aviso(MENSAJES_ALTA[r.motivo] || ("No se pudo registrar: " + (r.detalle || r.motivo)), "err");
  }
  boton.disabled = false;
});

/* ── leads ── */
async function cargarLeads() {
  const snap = await getDocs(query(collection(db, "crm_leads"), orderBy("creado_en", "desc"), limit(200)));
  leads = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  pintarTabla();
}

function leadsFiltrados() {
  return leads.filter((l) => {
    const okEstado = !filtro.estado || l.estado === filtro.estado;
    const t = (filtro.texto || "").toLowerCase();
    const okTexto = !t || [l.nombre, l.telefono, l.industria, l.servicio_interes].join(" ").toLowerCase().includes(t);
    return okEstado && okTexto;
  });
}

function pintarTabla() {
  const filas = leadsFiltrados();
  $("#tabla-leads").innerHTML = filas.length ? filas.map((l) => `
    <tr data-id="${esc(l.id)}">
      <td>${esc(l.nombre)}</td>
      <td>${esc(l.telefono)}</td>
      <td>${esc(l.industria)}</td>
      <td><span class="pill pill--${esc(l.estado)}">${esc(l.estado)}</span></td>
      <td>${esc(l.consentimiento ? "sí" : "no")}</td>
      <td><button class="mini" data-abrir="${esc(l.id)}">Abrir</button></td>
    </tr>`).join("") : '<tr><td colspan="6">Sin prospectos que coincidan.</td></tr>';
  $("#contador").textContent = filas.length + " de " + leads.length + " prospectos";
}

$("#f-estado").addEventListener("change", (e) => { filtro.estado = e.target.value; pintarTabla(); });
$("#f-texto").addEventListener("input", (e) => { filtro.texto = e.target.value; pintarTabla(); });
$("#tabla-leads").addEventListener("click", (e) => {
  const b = e.target.closest("[data-abrir]") || e.target.closest("tr[data-id]");
  if (b) abrirLead(b.dataset.abrir || b.dataset.id);
});

let leadActual = null;
async function abrirLead(id) {
  leadActual = leads.find((l) => l.id === id) || null;
  if (!leadActual) return;
  $("#detalle").hidden = false;
  $("#d-nombre").textContent = leadActual.nombre;
  $("#d-meta").textContent = [leadActual.telefono, leadActual.industria, leadActual.servicio_interes].filter(Boolean).join(" · ");
  $("#d-estado").value = leadActual.estado || "nuevo";
  $("#d-historial").innerHTML = (leadActual.historial || []).map((h) => `<li>${esc(h)}</li>`).join("") || "<li>Sin notas todavía.</li>";
  $("#d-cotizaciones").textContent = "—";
  const snapQ = await getDocs(query(collection(db, "crm_quotes"), where("lead_id", "==", id)));
  const qs = snapQ.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  $("#d-cotizaciones").innerHTML = qs.length
    ? qs.map((q) => `<div>${esc(q.plan)} · ${pesos(q.monto)} · ${esc(q.estado)} <span class="muted">(${esc(q.id)})</span></div>`).join("")
    : "Sin cotizaciones.";
}

$("#btn-estado").addEventListener("click", async () => {
  if (!leadActual) return;
  const nuevo = $("#d-estado").value;
  await updateDoc(doc(db, "crm_leads", leadActual.id), {
    estado: nuevo,
    historial: arrayUnion(new Date().toISOString() + " · estado → " + nuevo + " (por " + sesion.email + ")"),
  });
  await auditar("estado_cambiado", leadActual.id + " → " + nuevo);
  await cargarLeads(); await pintarStats();
  abrirLead(leadActual.id);
  aviso("Estado actualizado a «" + nuevo + "».", "ok");
});

$("#btn-nota").addEventListener("click", async () => {
  if (!leadActual) return;
  const nota = $("#d-nota").value.trim();
  if (nota.length < 3) { aviso("Escribe una nota de al menos 3 caracteres.", "err"); return; }
  await updateDoc(doc(db, "crm_leads", leadActual.id), {
    historial: arrayUnion(new Date().toISOString() + " · " + sesion.email + ": " + nota),
  });
  await auditar("nota_añadida", leadActual.id);
  $("#d-nota").value = "";
  await cargarLeads();
  await abrirLead(leadActual.id);
  aviso("Nota añadida al historial.", "ok");
});

/* ── cotización ── */
$("#btn-cotizar").addEventListener("click", async () => {
  if (!leadActual) { aviso("Abre un prospecto primero.", "err"); return; }
  const plan = $("#q-plan").value;
  const monto = plan === "medida" ? null : PRECIOS[plan];
  const ref = await addDoc(collection(db, "crm_quotes"), {
    lead_id: leadActual.id, plan, monto, moneda: "COP",
    estado: "enviada", creado_por: sesion.uid, creado_en: serverTimestamp(),
  });
  await auditar("cotizacion_creada", leadActual.id + " · " + plan + " · " + (monto ?? "a medida"));
  await abrirLead(leadActual.id);
  aviso("Cotización registrada (" + plan + "). Ojo: cotizar no es vender.", "ok");
});

/* ── venta confirmada (entidad separada) ── */
$("#btn-venta").addEventListener("click", async () => {
  if (!leadActual) { aviso("Abre un prospecto primero.", "err"); return; }
  const quoteId = $("#s-quote").value.trim();
  const monto = Number($("#s-monto").value);
  if (!quoteId) { aviso("Indica la cotización que originó la venta.", "err"); return; }
  if (!Number.isInteger(monto) || monto <= 0) { aviso("El monto debe ser un entero mayor que 0.", "err"); return; }

  const q = await getDoc(doc(db, "crm_quotes", quoteId));
  if (!q.exists() || q.data().lead_id !== leadActual.id) {
    aviso("La cotización no existe o no es de este prospecto.", "err"); return;
  }
  const cot = q.data();
  if (!["enviada", "aceptada"].includes(cot.estado)) {
    aviso("Esa cotización está «" + cot.estado + "»: sólo se puede vender desde una enviada o aceptada.", "err"); return;
  }
  /* El importe no se teclea libre: en los planes de lista lo fija la cotización. */
  if (cot.plan !== "medida" && monto !== cot.monto) {
    aviso("El importe debe ser el de la cotización (" + pesos(cot.monto) + ").", "err"); return;
  }

  /* La venta y el cambio de estado del prospecto van en la MISMA operación: o se
     guardan las dos cosas o ninguna (SEG-09). Y el documento de venta usa el id de
     la cotización, de modo que el almacén impide vender dos veces lo mismo (SEG-01). */
  try {
    const lote = writeBatch(db);
    lote.set(doc(db, "crm_sales", quoteId), {
      lead_id: leadActual.id, quote_id: quoteId, monto, moneda: "COP",
      confirmado_por: sesion.uid, confirmado_en: serverTimestamp(),
    });
    lote.update(doc(db, "crm_leads", leadActual.id), {
      estado: "ganado",
      historial: arrayUnion(new Date().toISOString() + " · venta confirmada " + pesos(monto)),
    });
    await lote.commit();
  } catch (e) {
    aviso(e.code === "already-exists"
      ? "Esa cotización ya tiene una venta registrada."
      : "No se registró la venta: " + (e.code || e.message), "err");
    return;
  }
  await auditar("venta_confirmada", leadActual.id + " · " + monto);
  await cargarLeads(); await pintarStats();
  aviso("Venta confirmada registrada por " + pesos(monto) + ".", "ok");
});

/* ── privacidad: supresión de datos y borrado (sólo administración) ── */
$("#btn-anonimizar").addEventListener("click", async () => {
  if (!leadActual) return;
  if (sesion.rol !== "admin") { aviso("Tu rol no puede suprimir datos de prospectos.", "err"); return; }
  if (!window.confirm("¿Suprimir los datos personales de este prospecto?\n\nSe borrarán el nombre y todo el historial de notas. Se conservará el número de teléfono, porque es el identificador que impide volver a duplicarlo. Esta acción no se puede deshacer.")) return;
  try {
    /* SEG-02: se vacía el historial, que es donde de verdad viven los datos
       personales (nombres, direcciones, notas libres). El teléfono se conserva
       porque ES el id del documento; por eso esto se presenta como supresión
       parcial y no como anonimización completa. */
    await updateDoc(doc(db, "crm_leads", leadActual.id), {
      nombre: "[eliminado]",
      servicio_interes: null,
      anonimizado: true,
      historial: [],
    });
    await auditar("lead_anonimizado", leadActual.id);
    await cargarLeads(); await pintarStats(); await abrirLead(leadActual.id);
    await pintarAuditoria();
    aviso("Datos personales suprimidos: nombre e historial borrados. El número se conserva para no volver a duplicarlo.", "ok");
  } catch (e) {
    aviso("No se pudieron suprimir los datos: " + (e.code || e.message), "err");
  }
});

$("#btn-borrar-lead").addEventListener("click", async () => {
  if (!leadActual) return;
  if (sesion.rol !== "admin") { aviso("Tu rol no puede borrar prospectos.", "err"); return; }
  const id = leadActual.id;
  if (!window.confirm("¿Borrar definitivamente el prospecto " + id + "? Esta acción no se puede deshacer.")) return;
  try {
    await auditar("lead_borrado", id);
    await deleteDoc(doc(db, "crm_leads", id));
    $("#detalle").hidden = true;
    leadActual = null;
    await cargarLeads(); await pintarStats();
    aviso("Prospecto borrado. El número queda libre.", "ok");
  } catch (e) {
    aviso("No se pudo borrar: " + (e.code || e.message), "err");
  }
});

/* ── estadísticas y auditoría ── */
async function pintarStats() {
  const estados = ["nuevo", "contactado", "cotizado", "ganado", "perdido"];
  const cuenta = {};
  estados.forEach((e) => { cuenta[e] = leads.filter((l) => l.estado === e).length; });

  /* SEG-04 (auditoría KZ-CRM-017): las ventas sólo las puede leer admin y ventas.
     Antes esta función las pedía siempre, así que el rol comercial entraba y se
     quedaba con un error de permisos sin manejar. Ahora se piden sólo si el rol
     puede leerlas, y si la lectura falla el panel sigue funcionando sin ese dato. */
  let bloqueVentas = "";
  if (["admin", "ventas"].includes(sesion.rol)) {
    try {
      const snapS = await getDocs(collection(db, "crm_sales"));
      const vendido = snapS.docs.reduce((s, d) => s + (d.data().monto || 0), 0);
      bloqueVentas = `<div class="stat stat--venta"><b>${pesos(vendido)}</b><span>ventas confirmadas (${snapS.size})</span></div>`;
    } catch (e) {
      bloqueVentas = `<div class="stat stat--venta"><b>—</b><span>ventas no disponibles</span></div>`;
    }
  }
  $("#stats").innerHTML = estados.map((e) => `<div class="stat"><b>${cuenta[e]}</b><span>${e}</span></div>`).join("")
    + bloqueVentas;
}

async function pintarAuditoria() {
  const snap = await getDocs(query(collection(db, "crm_audit"), orderBy("fecha", "desc"), limit(30)));
  $("#tabla-audit").innerHTML = snap.docs.map((d) => {
    const a = d.data();
    return `<tr><td>${esc(a.accion)}</td><td>${esc(a.detalle)}</td><td>${esc(a.rol)}</td></tr>`;
  }).join("") || '<tr><td colspan="3">Sin registros.</td></tr>';
}

/* ── exportación autorizada ── */
/* SEG-07: una hoja de cálculo interpreta como fórmula lo que empieza por = + - @ o
   tabulador. Entrecomillar no lo evita. Se antepone un apóstrofo para forzar texto.
   Ojo: el archivo queda en el disco del operador y el CRM no lo controla. */
const celdaCSV = (v) => {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
$("#btn-exportar").addEventListener("click", () => {
  if (!["admin", "comercial"].includes(sesion.rol)) { aviso("Tu rol no puede exportar.", "err"); return; }
  const filas = leadsFiltrados();
  const csv = ["nombre,telefono,industria,servicio,estado,consentimiento"]
    .concat(filas.map((l) => [l.nombre, l.telefono, l.industria, l.servicio_interes || "", l.estado, l.consentimiento].map(celdaCSV).join(",")))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "crm-prospectos.csv";
  document.body.appendChild(a); a.click(); a.remove();
  auditar("exportacion_csv", filas.length + " filas");
  aviso("Exportadas " + filas.length + " filas.", "ok");
});

/* Superficie mínima de diagnóstico: permite a crm/pruebas-panel-real.cjs
   comprobar, sin credenciales, que el cliente apunta a la base correcta.
   No expone nada que no esté ya en el navegador. */
window.CRM = { sesion, db, baseDatos: ID_BASE, get leads() { return leads; } };
