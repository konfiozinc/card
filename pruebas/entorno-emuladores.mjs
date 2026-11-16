/* KZ-UNIFICACION-002 - Preparacion del entorno de prueba (emuladores demo-*).
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * En la corrida real del 15-nov-2026 (16:02-16:06) la prueba visual fallo en la
 * primera comprobacion con "fetch failed" y siguió ejecutando las operaciones
 * comerciales sobre una sesion que nunca existio. Las causas demostradas fueron:
 *
 *   1. La puerta de arranque solo miraba el puerto 8080 (Firestore) y declaraba
 *      "OK emuladores en 8080 / 9099" sin comprobar 9099. El emulador de Auth
 *      termino de levantar a las 21:04:35Z y la puerta paso a las 21:04:28Z:
 *      la siembra salio 7 s antes de que Auth escuchara y el fetch de Node
 *      devolvio un TypeError generico ("fetch failed") con cause ECONNREFUSED.
 *   2. La ficha del usuario se escribia en `usuarios/<correo>`, pero
 *      shell.js:requireAuth lee `usuarios/<uid>` (getDoc(doc(db,'usuarios',user.uid))).
 *      Aunque el emulador hubiera estado listo, el login no podia superarse.
 *
 * Este modulo comprueba la disponibilidad con PETICIONES REALES a cada servicio
 * (no con un socket TCP ni con el arranque del proceso), siembra la ficha en la
 * ruta que el panel lee de verdad, y describe el fallo con su `cause`.
 *
 * Todo es asincrono y sin dependencias: usa el fetch nativo de Node.
 */

export const AUTH_EMU = 'http://127.0.0.1:9099';
export const FS_EMU = 'http://127.0.0.1:8080';
const CLAVE_API = 'demo-key'; // el emulador de Auth ignora el valor, pero exige el parametro

/** Cadena legible de un error de red, incluida su propiedad `cause`. */
export function describirFallo(e, metodo, url, servicio) {
  const cadena = [];
  let c = e && e.cause;
  while (c && cadena.length < 4) {
    cadena.push(c.code || c.name || c.message || String(c));
    c = c.cause;
  }
  const mensaje = e && e.message ? e.message : String(e);
  return `${metodo} ${url} [${servicio}] -> ${mensaje}` +
    (cadena.length ? ` | cause: ${cadena.join(' <- ')}` : ' | cause: (no disponible)');
}

/** POST/PATCH/GET con contexto de error. No lanza por codigos HTTP: los devuelve. */
async function pedir(metodo, url, { cuerpo, token, servicio, limiteMs = 15000 } = {}) {
  const cabeceras = {};
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (token) cabeceras.Authorization = token;
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(limiteMs),
    });
  } catch (e) {
    const err = new Error(describirFallo(e, metodo, url, servicio || 'desconocido'));
    err.red = true;
    err.causa = e && e.cause;
    throw err;
  }
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = null; }
  return { ok: r.ok, status: r.status, texto, datos, metodo, url, servicio };
}

const rutaDoc = (proyecto, coleccion, id) =>
  `${FS_EMU}/v1/projects/${proyecto}/databases/(default)/documents/${coleccion}/${id}`;

/**
 * Espera a que AMBOS servicios respondan de verdad.
 * Auth se comprueba con su endpoint de configuracion (devuelve `signIn`),
 * Firestore con una lectura real autenticada como dueno del emulador.
 * Devuelve { auth: ms, firestore: ms } o lanza con el motivo del ultimo intento.
 */
export async function esperarEmuladores({ proyecto, limiteMs = 180000, cadaMs = 1000, log = () => {} } = {}) {
  if (!proyecto) throw new Error('esperarEmuladores: falta el proyecto');
  const inicio = Date.now();
  const urlAuth = `${AUTH_EMU}/emulator/v1/projects/${proyecto}/config`;
  const urlFs = `${FS_EMU}/v1/projects/${proyecto}/databases/(default)/documents/usuarios?pageSize=1`;
  let authListo = 0;
  let fsListo = 0;
  let ultimoAuth = 'sin intentos';
  let ultimoFs = 'sin intentos';

  while (Date.now() - inicio < limiteMs) {
    if (!authListo) {
      try {
        const r = await pedir('GET', urlAuth, { servicio: 'auth-emulator' });
        if (r.ok && r.datos && r.datos.signIn) { authListo = Date.now() - inicio; log(`  auth      listo en ${authListo} ms`); }
        else ultimoAuth = `HTTP ${r.status} sin objeto signIn`;
      } catch (e) { ultimoAuth = e.message; }
    }
    if (!fsListo) {
      try {
        const r = await pedir('GET', urlFs, { token: 'Bearer owner', servicio: 'firestore-emulator' });
        if (r.ok) { fsListo = Date.now() - inicio; log(`  firestore listo en ${fsListo} ms`); }
        else ultimoFs = `HTTP ${r.status}`;
      } catch (e) { ultimoFs = e.message; }
    }
    if (authListo && fsListo) return { auth: authListo, firestore: fsListo };
    await new Promise((r) => setTimeout(r, cadaMs));
  }
  const detalle = [
    authListo ? `auth OK (${authListo} ms)` : `auth NO responde: ${ultimoAuth}`,
    fsListo ? `firestore OK (${fsListo} ms)` : `firestore NO responde: ${ultimoFs}`,
  ].join(' | ');
  throw new Error(`emuladores no disponibles en ${limiteMs} ms -> ${detalle}`);
}

/**
 * Crea el usuario en el emulador de Auth y su ficha en `usuarios/<uid>`
 * (la ruta que lee shell.js) mas la ficha heredada `usuarios/<correo>` (la que
 * consulta esAdmin() en firestore.rules). Idempotente: si el usuario ya existe,
 * inicia sesion para obtener el mismo uid.
 */
export async function sembrarAdmin({ proyecto, email, clave, nombre = 'Admin de prueba', log = () => {} } = {}) {
  if (!proyecto || !email || !clave) throw new Error('sembrarAdmin: faltan proyecto, email o clave');

  const urlAlta = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${CLAVE_API}`;
  const urlEntrar = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CLAVE_API}`;

  let uid = '';
  let origen = 'signUp';
  const alta = await pedir('POST', urlAlta, { cuerpo: { email, password: clave, returnSecureToken: true }, servicio: 'auth-emulator' });
  if (alta.ok && alta.datos && alta.datos.localId) {
    uid = alta.datos.localId;
  } else {
    const motivo = (alta.datos && alta.datos.error && alta.datos.error.message) || `HTTP ${alta.status}`;
    if (!/EMAIL_EXISTS/i.test(motivo)) {
      throw new Error(`el emulador de Auth rechazo el alta -> ${motivo} | POST ${urlAlta}`);
    }
    origen = 'signInWithPassword (el usuario ya existia)';
    const entra = await pedir('POST', urlEntrar, { cuerpo: { email, password: clave, returnSecureToken: true }, servicio: 'auth-emulator' });
    if (!entra.ok || !entra.datos || !entra.datos.localId) {
      const m2 = (entra.datos && entra.datos.error && entra.datos.error.message) || `HTTP ${entra.status}`;
      throw new Error(`el usuario ya existia pero la contrasena no coincide -> ${m2} | POST ${urlEntrar}`);
    }
    uid = entra.datos.localId;
  }
  log(`  usuario de Auth: uid=${uid} (${origen})`);

  const ficha = { fields: {
    rol: { stringValue: 'ADMIN' },
    activo: { booleanValue: true },
    email: { stringValue: email },
    nombre: { stringValue: nombre },
  } };

  /* usuarios/<uid> - la que valida requireAuth en el navegador. */
  const porUid = await pedir('PATCH', rutaDoc(proyecto, 'usuarios', uid), { cuerpo: ficha, token: 'Bearer owner', servicio: 'firestore-emulator' });
  if (!porUid.ok) throw new Error(`no se pudo crear usuarios/${uid} -> HTTP ${porUid.status} ${porUid.texto.slice(0, 160)} | PATCH ${porUid.url}`);

  /* usuarios/<correo> - ficha heredada que consulta esAdmin() en las reglas. */
  const porCorreo = await pedir('PATCH', rutaDoc(proyecto, 'usuarios', encodeURIComponent(email)), { cuerpo: ficha, token: 'Bearer owner', servicio: 'firestore-emulator' });
  if (!porCorreo.ok) throw new Error(`no se pudo crear usuarios/${email} -> HTTP ${porCorreo.status} ${porCorreo.texto.slice(0, 160)} | PATCH ${porCorreo.url}`);

  /* Verificacion: la ficha debe leerse de vuelta con activo=true. */
  const leida = await pedir('GET', rutaDoc(proyecto, 'usuarios', uid), { token: 'Bearer owner', servicio: 'firestore-emulator' });
  if (!leida.ok || !leida.datos || !leida.datos.fields) throw new Error(`la ficha usuarios/${uid} no se lee de vuelta -> HTTP ${leida.status}`);
  if (!leida.datos.fields.activo || leida.datos.fields.activo.booleanValue !== true) throw new Error(`la ficha usuarios/${uid} no tiene activo=true`);

  return { uid };
}

/**
 * Comprueba que la cuenta creada sirve para iniciar sesion y que la ficha que
 * el panel va a leer existe y esta activa. Es la puerta previa al navegador.
 */
export async function comprobarLogin({ proyecto, email, clave, uidEsperado } = {}) {
  const url = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CLAVE_API}`;
  const r = await pedir('POST', url, { cuerpo: { email, password: clave, returnSecureToken: true }, servicio: 'auth-emulator' });
  if (!r.ok) {
    const motivo = (r.datos && r.datos.error && r.datos.error.message) || `HTTP ${r.status}`;
    throw new Error(`el emulador de Auth rechazo el inicio de sesion -> ${motivo} | POST ${url}`);
  }
  const uid = r.datos && r.datos.localId;
  if (!uid) throw new Error('el emulador no devolvio localId al iniciar sesion');
  if (uidEsperado && uid !== uidEsperado) throw new Error(`el uid devuelto (${uid}) no coincide con el sembrado (${uidEsperado})`);
  if (!r.datos.idToken) throw new Error('el emulador no devolvio idToken');

  /* La ficha que requireAuth va a leer, por la ruta exacta del panel. */
  const ficha = await pedir('GET', rutaDoc(proyecto, 'usuarios', uid), { token: 'Bearer owner', servicio: 'firestore-emulator' });
  if (!ficha.ok || !ficha.datos || !ficha.datos.fields) throw new Error(`sin ficha para uid ${uid}: el panel redirigiria al login (HTTP ${ficha.status})`);
  const rol = ficha.datos.fields.rol && ficha.datos.fields.rol.stringValue;
  const activo = ficha.datos.fields.activo && ficha.datos.fields.activo.booleanValue;
  if (!['ADMIN', 'SUPERADMIN'].includes(rol)) throw new Error(`la ficha tiene rol ${rol} y se exige ADMIN o SUPERADMIN`);
  if (activo !== true) throw new Error('la ficha no tiene activo=true');

  return { uid, rol, idToken: String(r.datos.idToken).slice(0, 12) + '...' };
}

/**
 * Control negativo: sin credenciales, la coleccion nueva debe estar cerrada.
 * Demuestra que el emulador corre CON las reglas del repositorio y no abierto.
 */
export async function comprobarReglasActivas({ proyecto, coleccion = 'crm_prospectos' } = {}) {
  const base = `${FS_EMU}/v1/projects/${proyecto}/databases/(default)/documents/${coleccion}`;

  const lectura = await pedir('GET', `${base}?pageSize=1`, { servicio: 'firestore-emulator' });
  if (lectura.ok) throw new Error(`lectura anonima de ${coleccion} respondio HTTP ${lectura.status}: las reglas del repositorio NO estan aplicadas`);
  if (![401, 403].includes(lectura.status)) throw new Error(`lectura anonima de ${coleccion}: respuesta inesperada HTTP ${lectura.status}`);

  const escritura = await pedir('PATCH', `${base}/__sonda-reglas`, {
    cuerpo: { fields: { sonda: { stringValue: 'kz-unificacion-002' } } },
    servicio: 'firestore-emulator',
  });
  if (escritura.ok) throw new Error(`escritura anonima en ${coleccion} respondio HTTP ${escritura.status}: las reglas del repositorio NO estan aplicadas`);
  if (![401, 403].includes(escritura.status)) throw new Error(`escritura anonima en ${coleccion}: respuesta inesperada HTTP ${escritura.status}`);

  return { lectura: lectura.status, escritura: escritura.status };
}
