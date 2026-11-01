import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, getDocs, query, orderBy, limit, updateDoc,
  addDoc, serverTimestamp, where, arrayUnion, writeBatch, startAfter }
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
let filtro = { estado: "", texto: "", sinAsignar: false };
/* Equipo cargado sólo por administración, para el selector de asignación. */
let usuariosCargados = [];

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
  const labSin = $("#lab-sin-asignar");
  if (labSin) labSin.hidden = sesion.rol !== "admin";
  await cargarUsuarios();
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
  const esAdmin = sesion.rol === "admin";
  const esLectura = sesion.rol === "lectura";
  const puedeCotizar = ["admin", "comercial"].includes(sesion.rol);
  const puedeVender = ["admin", "ventas"].includes(sesion.rol);
  /* El rol «lectura» no escribe nada: no ve ningún bloque de acción. */
  $("#bloque-cotizar").hidden = !puedeCotizar || esLectura;
  $("#bloque-venta").hidden = !puedeVender || esLectura;
  $("#btn-exportar").hidden = !["admin", "comercial"].includes(sesion.rol);
  $("#bloque-auditoria").hidden = !esAdmin;
  $("#bloque-privacidad").hidden = !esAdmin;
  /* Asignar y reasignar: sólo administración (coherente con las reglas). */
  $("#bloque-asignacion").hidden = !esAdmin;
  $("#bloque-equipo").hidden = !esAdmin;
  /* Alta de prospecto: lectura no crea; el resto sí, según las reglas. */
  $("#bloque-alta").hidden = esLectura;
  /* Estado y nota: lectura no modifica seguimiento. */
  $("#btn-estado").hidden = esLectura;
  $("#d-estado").disabled = esLectura;
  $("#btn-nota").hidden = esLectura;
  $("#d-nota").disabled = esLectura;
}

/* ── gestión de equipo (sólo administración) ──────────────────────────────────
   El administrador puede leer todas las fichas de rol; el resto sólo la suya.
   Las cuentas NO se crean desde el navegador: eso sigue siendo un procedimiento
   privilegiado. Aquí sólo se listan para poder asignar. */
async function cargarUsuarios() {
  if (sesion.rol !== "admin") { usuariosCargados = []; return; }
  /* R08: antes se pedía `limit(100)` y el equipo se daba por completo. Con más de 100
     cuentas, las siguientes no aparecerían en el selector de asignación y nadie lo
     sabría. Ahora se pagina hasta agotar. */
  try {
    const lista = [];
    let despues = null;
    for (;;) {
      const partes = [collection(db, "crm_usuarios")];
      if (despues) partes.push(startAfter(despues));
      partes.push(limit(100));
      const snap = await getDocs(query(...partes));
      snap.docs.forEach((d) => lista.push(Object.assign({ uid: d.id }, d.data())));
      if (snap.docs.length < 100) break;
      despues = snap.docs[snap.docs.length - 1];
    }
    usuariosCargados = lista;
    usuariosCargados.sort((a, b) => String(a.rol).localeCompare(String(b.rol)));
  } catch (e) {
    usuariosCargados = [];
    console.warn("no se pudo cargar el equipo:", e.code || e.message);
  }
  pintarSelectorAsesores();
}

function pintarSelectorAsesores() {
  const sel = $("#a-asesor");
  if (!sel) return;
  const activos = usuariosCargados.filter((u) => u.activo === true);
  sel.innerHTML = '<option value="">— sin asignar —</option>' + activos.map((u) =>
    `<option value="${esc(u.uid)}">${esc((u.nombre || u.email || u.uid) + " · " + u.rol)}</option>`
  ).join("");
}

/* Asignar o reasignar. Sólo admin lo intenta; las reglas lo exigen igualmente. */
$("#btn-asignar").addEventListener("click", async () => {
  if (!leadActual) return;
  if (sesion.rol !== "admin") { aviso("Sólo administración puede asignar prospectos.", "err"); return; }
  const nuevo = $("#a-asesor").value || null;
  const antes = leadActual.asignado_a || null;
  if (nuevo === antes) { aviso("El prospecto ya está asignado así.", "err"); return; }

  const destino = nuevo ? nombreAsesor(nuevo) : "nadie";
  const texto = new Date().toISOString() + " · " +
    (antes ? "reasignado de " + nombreAsesor(antes) : "asignado") +
    " a " + destino + " (por " + sesion.email + ")";
  try {
    await updateDoc(doc(db, "crm_leads", leadActual.id), {
      asignado_a: nuevo,
      asignado_en: serverTimestamp(),
      asignado_por: sesion.uid,
    });
    /* El rastro de la asignación va como nota inmutable (H03), no al historial. */
    await agregarNota(leadActual.id, texto, "evento");
  } catch (e) {
    aviso("No se pudo asignar: " + (e.code || e.message), "err");
    return;
  }
  await auditar(antes ? "prospecto_reasignado" : "prospecto_asignado", leadActual.id + " → " + destino);
  await cargarLeads(); await pintarStats(); await abrirLead(leadActual.id);
  await pintarAuditoria();
  aviso(antes ? "Prospecto reasignado a " + destino + "." : "Prospecto asignado a " + destino + ".", "ok");
});

/* ── Equipo: solicitudes e indicadores por asesor (sólo administración) ──────
   El panel NO crea cuentas ni cambia roles: deja una solicitud en crm_invitaciones
   que ejecuta un procedimiento privilegiado. Así se incorporan asesores desde la
   interfaz sin que ninguna credencial administrativa llegue al navegador. */
/* Indicadores por asesor: se calculan sobre la cartera que el admin ya ve.
   No hay consulta global nueva: se reutilizan los prospectos cargados y las ventas. */
async function pintarEquipo() {
  const tbody = $("#tabla-equipo");
  if (!tbody || sesion.rol !== "admin") return;

  let ventas = [];
  try {
    const snapS = await getDocs(collection(db, "crm_sales"));
    ventas = snapS.docs.map((d) => d.data());
  } catch (e) { ventas = []; }

  const porLead = {};
  for (const l of leads) porLead[l.id] = l.asignado_a || null;
  const vendidoPorAsesor = {};
  for (const v of ventas) {
    const asesor = porLead[v.lead_id] || null;
    if (asesor) vendidoPorAsesor[asesor] = (vendidoPorAsesor[asesor] || 0) + (v.monto || 0);
  }

  const filas = usuariosCargados.length ? usuariosCargados : [];
  const asignados = (uid) => leads.filter((l) => (l.asignado_a || null) === uid);
  const sinAsignar = leads.filter((l) => !l.asignado_a).length;

  tbody.innerHTML = filas.map((u) => {
    const mios = asignados(u.uid);
    const ganados = mios.filter((l) => l.estado === "ganado").length;
    const perdidos = mios.filter((l) => l.estado === "perdido").length;
    const enCurso = mios.length - ganados - perdidos;
    return `<tr>
      <td>${esc(u.nombre || u.email || u.uid)}</td>
      <td>${esc(u.rol)}${u.activo === true ? "" : " · <b>inactivo</b>"}</td>
      <td>${mios.length}</td>
      <td>${ganados}</td>
      <td>${perdidos}</td>
      <td>${enCurso}</td>
      <td>${pesos(vendidoPorAsesor[u.uid] || 0)}</td>
    </tr>`;
  }).join("") + `<tr>
      <td><i>sin asignar</i></td><td>—</td><td>${sinAsignar}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td>
    </tr>`;
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
  }, { uid: sesion.uid, esAdmin: sesion.rol === "admin" });

  const MENSAJES_ALTA = {
    nombre: "Escribe el nombre (entre 2 y 60 caracteres).",
    telefono: "El WhatsApp debe tener entre 10 y 15 dígitos.",
    industria: "Elige una industria válida.",
    consentimiento: "Debes confirmar que el prospecto autorizó el contacto.",
    duplicado: "Ya existe un prospecto con ese WhatsApp.",
    conflicto: "Otra operación simultánea está registrando ese WhatsApp. Vuelve a intentarlo.",
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
/* ── Carga de prospectos, según el rol ────────────────────────────────────────
   KZ-CRM-018 · esto no es cosmética: Firestore RECHAZA una consulta que no pueda
   demostrar que todos sus resultados cumplen las reglas. Un `collection('crm_leads')`
   a secas falla con permission-denied para comercial/ventas/lectura, porque el
   servidor no puede probar que cada documento esté asignado a quien pregunta.
   Por eso el filtro por `asignado_a` es obligatorio, no opcional.

   Se evita además `orderBy('creado_en')` en ese caso, porque exigiría un índice
   compuesto (asignado_a + creado_en) que habría que desplegar aparte. Se ordena en
   el cliente: mismo resultado, sin dependencia de índices nuevos.

   R08 · PAGINACIÓN REAL (H08). Antes se pedía `limit(200)` y lo que llegaba se
   presentaba como «la cartera»: a partir del prospecto 201 la lista se cortaba EN
   SILENCIO, sin aviso y sin forma de ver el resto. Ahora se recorre página a página
   hasta agotar la consulta. Además, si una página falla, NO se presenta lo leído como
   si fuera la cartera completa: se dice explícitamente cuántos se leyeron y que la
   lista está incompleta. */
const PAGINA_LEADS = 200;
const TOPE_PAGINAS_LEADS = 50;   // 10.000 prospectos: tope de seguridad, no de diseño
let carteraAviso = null;         // null = cartera completa y sin incidencias
let carteraPaginas = 0;

async function leerCartera() {
  const admin = sesion.rol === "admin";
  const construir = (despues) => {
    const partes = admin
      ? [collection(db, "crm_leads"), orderBy("creado_en", "desc")]
      : [collection(db, "crm_leads"), where("asignado_a", "==", sesion.uid)];
    if (despues) partes.push(startAfter(despues));
    partes.push(limit(PAGINA_LEADS));
    return query(...partes);
  };

  const todos = [];
  let despues = null, paginas = 0;
  for (;;) {
    let snap;
    try {
      snap = await getDocs(construir(despues));
    } catch (e) {
      const fallo = new Error(e && e.code ? e.code : String(e && e.message));
      fallo.pagina = paginas + 1;
      fallo.leidos = todos.length;
      throw fallo;
    }
    snap.docs.forEach((d) => todos.push(Object.assign({ id: d.id }, d.data())));
    paginas++;
    if (snap.docs.length < PAGINA_LEADS) return { leads: todos, paginas, completo: true };
    if (paginas >= TOPE_PAGINAS_LEADS) return { leads: todos, paginas, completo: false };
    despues = snap.docs[snap.docs.length - 1];
  }
}

async function cargarLeads() {
  const admin = sesion.rol === "admin";
  carteraAviso = null;
  try {
    const r = await leerCartera();
    leads = r.leads;
    carteraPaginas = r.paginas;
    if (!r.completo) {
      carteraAviso = "Se alcanzó el tope de " + TOPE_PAGINAS_LEADS +
        " páginas: puede haber más prospectos sin cargar.";
    }
  } catch (e) {
    leads = [];
    carteraPaginas = e.pagina || 0;
    carteraAviso = "No se pudo leer la página " + (e.pagina || 1) + " de la cartera (" +
      e.message + "). Se leyeron " + (e.leidos || 0) +
      " prospectos: la lista está INCOMPLETA, no vacía.";
  }

  if (!admin) {
    leads.sort((a, b) => {
      const fa = a.creado_en && a.creado_en.toMillis ? a.creado_en.toMillis() : 0;
      const fb = b.creado_en && b.creado_en.toMillis ? b.creado_en.toMillis() : 0;
      return fb - fa;
    });
  }
  pintarTabla();
  pintarResumenBandeja();
  if (admin) await pintarEquipo();
}

/* Bandeja personal: deja claro de quién es la cartera que se está viendo.
   R08: si la cartera no se pudo leer entera, se dice aquí mismo. Un inventario cortado
   sin aviso es peor que un error visible: se toman decisiones sobre datos que faltan. */
function pintarResumenBandeja() {
  const caja = $("#bandeja");
  if (!caja) return;
  const base = sesion.rol === "admin"
    ? "Cartera completa · " + leads.length + " prospectos · " +
      leads.filter((l) => !l.asignado_a).length + " sin asignar"
    : "Tu bandeja · " + leads.length + " prospectos asignados";
  caja.textContent = carteraAviso ? base + " · " + carteraAviso : base;
  caja.classList.toggle("bandeja--aviso", !!carteraAviso);
}

function leadsFiltrados() {
  return leads.filter((l) => {
    const okEstado = !filtro.estado || l.estado === filtro.estado;
    const t = (filtro.texto || "").toLowerCase();
    const okTexto = !t || [l.nombre, l.telefono, l.industria, l.servicio_interes].join(" ").toLowerCase().includes(t);
    const okAsig = !filtro.sinAsignar || !l.asignado_a;
    return okEstado && okTexto && okAsig;
  });
}

function nombreAsesor(uid) {
  if (!uid) return "sin asignar";
  const u = usuariosCargados.find((x) => x.uid === uid);
  if (u) return u.nombre || u.email || uid;
  return uid === sesion.uid ? "ti" : uid.slice(0, 6) + "…";
}

function pintarTabla() {
  const filas = leadsFiltrados();
  const esAdmin = sesion.rol === "admin";
  const cab = $("#tabla-cabecera");
  if (cab) {
    cab.innerHTML = esAdmin
      ? "<tr><th>Nombre</th><th>Teléfono</th><th>Industria</th><th>Estado</th><th>Asignado a</th><th>Consent.</th><th></th></tr>"
      : "<tr><th>Nombre</th><th>Teléfono</th><th>Industria</th><th>Estado</th><th>Consent.</th><th></th></tr>";
  }
  $("#tabla-leads").innerHTML = filas.length ? filas.map((l) => `
    <tr data-id="${esc(l.id)}">
      <td>${esc(l.nombre)}</td>
      <td>${esc(l.telefono)}</td>
      <td>${esc(l.industria)}</td>
      <td><span class="pill pill--${esc(l.estado)}">${esc(l.estado)}</span></td>
      ${esAdmin ? `<td>${esc(nombreAsesor(l.asignado_a))}</td>` : ""}
      <td>${esc(l.consentimiento ? "sí" : "no")}</td>
      <td><button class="mini" data-abrir="${esc(l.id)}">Abrir</button></td>
    </tr>`).join("")
    : `<tr><td colspan="${esAdmin ? 7 : 6}">Sin prospectos que coincidan.</td></tr>`;
  $("#contador").textContent = filas.length + " de " + leads.length + " prospectos";
}

$("#f-estado").addEventListener("change", (e) => { filtro.estado = e.target.value; pintarTabla(); });
$("#f-texto").addEventListener("input", (e) => { filtro.texto = e.target.value; pintarTabla(); });
$("#f-sin-asignar").addEventListener("change", (e) => { filtro.sinAsignar = e.target.checked; pintarTabla(); });
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

  /* Asignación: el admin ve a quién está asignado y puede cambiarlo; el resto
     ve una frase informativa (y, si no es suyo, ni siquiera llega aquí). */
  const cajaAsig = $("#d-asignado");
  if (cajaAsig) {
    cajaAsig.textContent = leadActual.asignado_a
      ? "Asignado a: " + nombreAsesor(leadActual.asignado_a)
      : "Sin asignar";
  }
  const selAsesor = $("#a-asesor");
  if (selAsesor && sesion.rol === "admin") selAsesor.value = leadActual.asignado_a || "";

  /* H03: el historial heredado se muestra como legado de sólo lectura; las notas
     reales viven en la subcolección inmutable y se muestran cronológicamente. */
  /* A10: en datos heredados el campo puede no ser un array; sin esta guarda el
     panel revienta al pintar y ni siquiera el bloque de recuperación lo salva. */
  const legado = Array.isArray(leadActual.historial) ? leadActual.historial : [];
  $("#d-historial").innerHTML = "<li>Cargando notas…</li>";
  try {
    pintarNotas(await cargarNotas(leadActual.id));
    if (legado.length) {
      $("#d-historial").innerHTML += legado.map((h) =>
        `<li class="muted">[historial anterior] ${esc(h)}</li>`).join("");
    }
  } catch (e) {
    $("#d-historial").innerHTML = legado.map((h) => `<li class="muted">[historial anterior] ${esc(h)}</li>`).join("")
      || "<li>No se pudieron cargar las notas (" + esc(e.code || "error") + ").</li>";
  }
  $("#d-cotizaciones").textContent = "—";
  try {
    const snapQ = await getDocs(query(collection(db, "crm_quotes"), where("lead_id", "==", id)));
    const qs = snapQ.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    $("#d-cotizaciones").innerHTML = qs.length
      ? qs.map((q) => `<div>${esc(q.plan)} · ${pesos(q.monto)} · ${esc(q.estado)} <span class="muted">(${esc(q.id)})</span></div>`).join("")
      : "Sin cotizaciones.";
  } catch (e) {
    $("#d-cotizaciones").textContent = "No se pudieron cargar las cotizaciones (" + (e.code || "error") + ").";
  }
}

$("#btn-estado").addEventListener("click", async () => {
  if (!leadActual) return;
  const nuevo = $("#d-estado").value;
  /* H03: el historial del prospecto está congelado en las reglas. El cambio de estado
     se guarda en el prospecto y el rastro va como nota inmutable aparte. */
  try {
    await updateDoc(doc(db, "crm_leads", leadActual.id), { estado: nuevo });
  } catch (e) {
    aviso("No se pudo cambiar el estado: " + (e.code || e.message), "err"); return;
  }
  await agregarNota(leadActual.id, "estado → " + nuevo, "evento");
  await auditar("estado_cambiado", leadActual.id + " → " + nuevo);
  await cargarLeads(); await pintarStats();
  abrirLead(leadActual.id);
  aviso("Estado actualizado a «" + nuevo + "».", "ok");
});

$("#btn-nota").addEventListener("click", async () => {
  if (!leadActual) return;
  const nota = $("#d-nota").value.trim();
  if (nota.length < 3) { aviso("Escribe una nota de al menos 3 caracteres.", "err"); return; }
  /* H03: la nota se guarda como documento propio e inmutable. Corregirla después no
     la sobrescribe: se añade otra de tipo «correccion» que la referencia. */
  const r = await agregarNota(leadActual.id, nota, "nota");
  if (!r.ok) { aviso("No se pudo guardar la nota: " + (r.motivo || "error"), "err"); return; }
  await auditar("nota_añadida", leadActual.id);
  $("#d-nota").value = "";
  await abrirLead(leadActual.id);
  aviso("Nota añadida. Las notas no se pueden modificar ni borrar.", "ok");
});

/* ── Notas inmutables del prospecto (H03) ────────────────────────────────────
   Cada nota es un documento propio en crm_leads/{id}/notas. Las reglas prohíben
   modificarlas y borrarlas —incluso para el administrador—, y exigen que `autor`
   sea el uid autenticado y que `fecha` caiga en la ventana del servidor.
   Corregir una nota NO la sobrescribe: se añade otra de tipo «correccion». */
async function agregarNota(leadId, texto, tipo, referencia) {
  try {
    const campos = {
      texto: String(texto).slice(0, 500),
      autor: sesion.uid,
      fecha: serverTimestamp(),
      tipo: tipo || "nota",
    };
    if (referencia) campos.referencia_a = referencia;
    await addDoc(collection(db, "crm_leads", leadId, "notas"), campos);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.code || e.message };
  }
}

async function cargarNotas(leadId) {
  const snap = await getDocs(query(collection(db, "crm_leads", leadId, "notas"), orderBy("fecha", "asc")));
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

function pintarNotas(lista) {
  const nuevas = lista.filter((n) => n.tipo !== "evento");
  const eventos = lista.filter((n) => n.tipo === "evento");
  const fmt = (n) => {
    const cuando = n.fecha && n.fecha.toDate ? n.fecha.toDate().toLocaleString("es-CO") : "(sin fecha)";
    const quien = n.autor === sesion.uid ? "ti" : nombreAsesor(n.autor);
    const tipo = n.tipo === "correccion" ? ' <b>[corrección]</b>' : "";
    return `<li><span class="muted">${esc(cuando)} · ${esc(quien)}${tipo}:</span> ${esc(n.texto)}</li>`;
  };
  $("#d-historial").innerHTML = (nuevas.length || eventos.length)
    ? nuevas.map(fmt).join("") + eventos.map(fmt).join("")
    : "<li>Sin notas todavía.</li>";
}

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
    lote.update(doc(db, "crm_leads", leadActual.id), { estado: "ganado" });
    await lote.commit();
    /* El rastro de la venta va como nota inmutable, fuera del lote: si fallara, la
       venta ya está confirmada y el hecho es real; la nota es el registro, no el dato. */
    await agregarNota(leadActual.id, "venta confirmada " + pesos(monto), "evento");
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

/* ── privacidad: los recorridos del navegador SE HAN RETIRADO (R05) ──────────
   Aquí vivían dos manejadores, «Suprimir datos personales» y «Borrar prospecto».
   Los dos eran incompletos y se han eliminado:
     · el de supresión escribía `historial: []`, que las reglas ya NO permiten —el
       historial es inmutable incluso para administración—, así que en la práctica
       fallaba con permission-denied; y aunque hubiera funcionado no tocaba la
       subcolección de notas ni el marcador del número;
     · el de borrado hacía un deleteDoc del prospecto y nada más: dejaba las notas, el
       marcador crm_dedup y las cotizaciones y ventas apuntando a un documento que ya no
       existía. Peor aún, avisaba de que «el número queda libre» cuando el marcador
       seguía reservándolo, de modo que el número NO se podía volver a registrar.
   La supresión y el borrado son ahora un procedimiento privilegiado (crm-dev/
   suprimir-datos.cjs) que se ejecuta desde un equipo de confianza. Esta página no
   conserva ninguna vía para hacerlo: el bloque de privacidad sólo informa. */

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
  /* H05 (auditoría KZ-CRM-018): antes «ventas» pedía TODA la colección crm_sales, pero
     las reglas sólo le permiten las ventas de sus prospectos asignados: la consulta
     global se rechaza y el panel lo disimulaba mostrando «no disponibles».
     Una consulta que la regla no puede demostrar segura no se disimula: el total
     agregado queda para administración, que sí puede verlo. */
  if (sesion.rol === "admin") {
    try {
      const snapS = await getDocs(collection(db, "crm_sales"));
      const vendido = snapS.docs.reduce((s, d) => s + (d.data().monto || 0), 0);
      bloqueVentas = `<div class="stat stat--venta"><b>${pesos(vendido)}</b><span>ventas confirmadas (${snapS.size})</span></div>`;
    } catch (e) {
      bloqueVentas = `<div class="stat stat--venta"><b>—</b><span>ventas no disponibles</span></div>`;
    }
  } else if (sesion.rol === "ventas") {
    bloqueVentas = `<div class="stat stat--venta"><b>—</b><span>consulta el detalle de cada prospecto</span></div>`;
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
