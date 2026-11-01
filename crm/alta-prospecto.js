/* KZ-CRM-016 · alta de prospecto desde el formulario público.
   ─────────────────────────────────────────────────────────────────────────────
   Único punto del sitio autorizado a escribir en `crm_leads`. Es deliberadamente
   pequeño y sin estado: recibe una instancia de Firestore ya inicializada y devuelve
   un resultado tipado. NO lee nada del CRM y no puede: las reglas sólo permiten
   `create` al anónimo.

   DECISIONES DE SEGURIDAD QUE ESTE ARCHIVO NO PUEDE SALTARSE
   · El identificador del documento ES el teléfono, así que la deduplicación la impone
     Firestore y no una comprobación previa (que sería una carrera).
   · NO se consulta antes si el teléfono existe: el anónimo no tiene permiso de lectura
     sobre crm_leads y dárselo convertiría el formulario en un oráculo para averiguar
     quién está en el CRM. La garantía es la regla: al anónimo sólo se le permite
     `create`. Escribir sobre un documento que ya existe es un `update`, y se rechaza.
     Por eso un `permission-denied` aquí significa, en la práctica, teléfono repetido.
   · `creado_en` se envía como serverTimestamp(): lo pone el servidor, no el navegador.
   · `retencion_hasta` se calcula aquí y las reglas comprueban que esté en el futuro y
     no supere el máximo legal de 3 años.
   · El consentimiento lleva versión explícita. Cambiar el texto legal exige subir la
     versión en las reglas, aquí y en el HTML: si no coinciden, la escritura falla. */

import { doc, setDoc, getDoc, writeBatch, serverTimestamp, Timestamp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Versión vigente del consentimiento. Debe coincidir con la función
 *  `versionConsentimiento()` de crm/firestore.rules. */
export const VERSION_CONSENTIMIENTO = "v1-2026-11";

/** Días de retención que se solicitan al usuario. El máximo duro de las reglas es 1095. */
export const DIAS_RETENCION = 365;

/** Deja el teléfono en dígitos: el id del documento y el campo deben coincidir
 *  exactamente, y las reglas lo verifican. */
export function normalizarTelefono(valor) {
  return String(valor == null ? "" : valor).replace(/\D/g, "");
}

/** Valida en cliente para dar mensajes útiles. NO sustituye a las reglas: la
 *  validación que cuenta es la del servidor. */
export function validar(datos) {
  const telefono = normalizarTelefono(datos.telefono);
  const nombre = String(datos.nombre == null ? "" : datos.nombre).trim();
  const industria = String(datos.industria == null ? "" : datos.industria).trim();

  if (nombre.length < 2 || nombre.length > 60) return { ok: false, motivo: "nombre" };
  if (telefono.length < 10 || telefono.length > 15) return { ok: false, motivo: "telefono" };
  if (!/^[a-z0-9-]{2,40}$/.test(industria)) return { ok: false, motivo: "industria" };
  if (datos.consentimiento !== true) return { ok: false, motivo: "consentimiento" };

  return { ok: true, telefono, nombre, industria };
}

/** UUID v4 de reserva cuando el navegador no ofrece crypto.randomUUID.
 *  IMPORTANTE: tiene que cumplir la forma 8-4-4-4-12 con versión 4 y variante RFC 4122.
 *  Antes, el respaldo generaba algo como «u<base36>», que las reglas rechazan por no ser
 *  un UUID v4: en un navegador antiguo el alta fallaba y el mensaje decía «duplicado»,
 *  que era engañoso. */
function uuidV4Reserva() {
  const hex = "0123456789abcdef";
  const rnd = (n) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join("");
  const variante = "89ab"[Math.floor(Math.random() * 4)];
  return rnd(8) + "-" + rnd(4) + "-4" + rnd(3) + "-" + variante + rnd(3) + "-" + rnd(12);
}
const nuevoUuid = () => (globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : uuidV4Reserva();

/**
 * Registra un prospecto. Devuelve { ok, motivo, telefono }.
 * Motivos de rechazo: "nombre" | "telefono" | "industria" | "consentimiento" |
 *                     "duplicado" | "conflicto" | "red" | "permiso".
 *
 * OJO (KZ-CRM-018 · P4): esta función es la del FORMULARIO PÚBLICO, que está
 * DESHABILITADO. Se adapta al modelo UUID sólo por coherencia técnica: ya no usa el
 * teléfono como identificador, sino un UUID, y reserva el número con el marcador
 * crm_dedup en el mismo lote. No se ha habilitado ninguna captación pública ni se ha
 * desplegado firestore.rules.captacion.
 */
export async function registrarProspecto(db, datos) {
  const v = validar(datos);
  if (!v.ok) return v;

  /* R06: el identificador es un UUID, nunca el teléfono. Un id derivado del número
     sobrevive a cualquier supresión, que es justo lo que el modelo evita. */
  const id = nuevoUuid();

  const ref = doc(db, "crm_leads", id);
  /* A03: la unicidad del número la garantiza el marcador, no el id del prospecto. */
  const refDedup = doc(db, "crm_dedup", v.telefono);
  const retencion = Timestamp.fromDate(
    new Date(Date.now() + DIAS_RETENCION * 24 * 60 * 60 * 1000)
  );

  /* Sólo se escriben campos admitidos por la lista blanca de las reglas. En
     particular `servicio_interes` se OMITE cuando no hay valor: enviarlo a null
     incumpliría `servicio_interes is string` y haría fallar el alta entera. */
  const registro = {
    nombre: v.nombre,
    telefono: v.telefono,
    industria: v.industria,
    consentimiento: true,
    consentimiento_version: VERSION_CONSENTIMIENTO,
    retencion_hasta: retencion,
    estado: "nuevo",
    creado_en: serverTimestamp(),
    historial: [],
    origen: "formulario-web",
  };
  const servicio = String(datos.servicioInteres == null ? "" : datos.servicioInteres).slice(0, 40);
  if (servicio) registro.servicio_interes = servicio;

  try {
    /* Prospecto + marcador en el MISMO lote: o nacen los dos o no nace ninguno. Las
       reglas lo verifican con getAfter(), así que dos envíos simultáneos del mismo
       número no pueden prosperar los dos. */
    const lote = writeBatch(db);
    lote.set(ref, registro);
    lote.set(refDedup, {
      lead_id: id,
      creado_en: serverTimestamp(),
      creado_por: "formulario-web",
    });
    await lote.commit();
    return { ok: true, id, telefono: v.telefono };
  } catch (err) {
    if (err && err.code === "already-exists") return { ok: false, motivo: "duplicado" };
    /* El marcador ya existe y las reglas no permiten sobrescribirlo: es un duplicado. */
    if (err && err.code === "permission-denied") return { ok: false, motivo: "duplicado" };
    /* Escritura concurrente abortada: otra pestaña registró el número en el mismo instante. */
    if (err && err.code === "aborted") return { ok: false, motivo: "duplicado" };
    return { ok: false, motivo: "red", detalle: err && err.code ? err.code : String(err) };
  }
}

/**
 * Alta registrada por un OPERADOR del equipo (modo privado, el único activo).
 * Diferencias con la alta pública:
 * · El equipo SÍ puede leer, así que se consulta antes y el mensaje de duplicado
 *   es exacto en lugar de deducido de un permission-denied.
 * · Se rellena `creado_por`, que las reglas exigen y comparan con el uid real.
 * · El consentimiento lo confirma el operador: queda constancia de la versión.
 * Devuelve { ok, motivo, telefono }.
 */
export async function registrarProspectoInterno(db, datos, usuario) {
  const v = validar(datos);
  if (!v.ok) return v;
  if (!usuario || !usuario.uid) return { ok: false, motivo: "sesion" };

  /* A03: el prospecto se identifica con un UUID v4, NO con el teléfono. El número
     pasa a ser un atributo de contacto. La unicidad del número la garantiza el
     marcador crm_dedup/{telefono}, que se crea en la MISMA transacción: o nacen los
     dos o no nace ninguno. Las reglas lo verifican con getAfter(), así que dos altas
     simultáneas del mismo número no pueden prosperar las dos. */
  const id = nuevoUuid();

  const ref = doc(db, "crm_leads", id);
  const refDedup = doc(db, "crm_dedup", v.telefono);
  const retencion = Timestamp.fromDate(
    new Date(Date.now() + DIAS_RETENCION * 24 * 60 * 60 * 1000)
  );

  /* Consulta previa: sólo administración puede leer; y ahora lo que se consulta es el
     MARCADOR, no el prospecto, así que nunca se revela un prospecto ajeno. */
  if (usuario && usuario.esAdmin) {
    try {
      const yaEsta = await getDoc(refDedup);
      if (yaEsta.exists()) return { ok: false, motivo: "duplicado" };
    } catch (err) {
      if (err && err.code === "permission-denied") return { ok: false, motivo: "permiso" };
      return { ok: false, motivo: "red", detalle: err && err.code ? err.code : String(err) };
    }
  }

  const registro = {
    nombre: v.nombre,
    telefono: v.telefono,
    industria: v.industria,
    consentimiento: true,
    consentimiento_version: VERSION_CONSENTIMIENTO,
    retencion_hasta: retencion,
    estado: "nuevo",
    creado_en: serverTimestamp(),
    creado_por: usuario.uid,
    historial: [],
    origen: datos.origen || "manual",
  };
  const servicio = String(datos.servicioInteres == null ? "" : datos.servicioInteres).slice(0, 40);
  if (servicio) registro.servicio_interes = servicio;

  try {
    /* R02 (auditoría Codex): antes esto era una transacción que hacía tx.get(refDedup),
       y sólo administración puede leer el marcador: comercial y ventas recibían
       «permiso» y NO podían registrar prospectos.
       Ahora es un writeBatch SIN lecturas: se escriben los dos documentos o ninguno
       (la atomicidad se mantiene), y el duplicado lo detecta el almacén —el marcador
       ya existe y la segunda escritura choca con ALREADY_EXISTS—. Así no se concede
       ninguna lectura nueva sobre crm_dedup ni se revela si un teléfono es de otro. */
    const lote = writeBatch(db);
    lote.set(ref, registro);
    lote.set(refDedup, {
      lead_id: id,
      creado_en: serverTimestamp(),
      creado_por: usuario.uid,
    });
    await lote.commit();
    return { ok: true, id, telefono: v.telefono };
  } catch (err) {
    if (err && err.message === "KZ_DUPLICADO") return { ok: false, motivo: "duplicado" };
    if (err && err.code === "already-exists") return { ok: false, motivo: "duplicado" };
    /* R02 (certificado en crm-dev/pruebas-r02.cjs): con ocho altas simultáneas del mismo
       número, los lotes perdedores se rechazan de dos maneras — 403 porque las reglas no
       permiten sobrescribir el marcador, o `aborted` (409) porque el almacén detecta la
       escritura concurrente y aborta el lote antes de aplicarlo. `aborted` NO es un fallo
       de red: es una carrera perdida, y decírselo al operador evita que reintente a ciegas
       creyendo que se cayó la conexión. */
    if (err && err.code === "aborted") return { ok: false, motivo: "conflicto" };
    if (err && err.code === "permission-denied") return { ok: false, motivo: "permiso" };
    return { ok: false, motivo: "red", detalle: err && err.code ? err.code : String(err) };
  }
}
