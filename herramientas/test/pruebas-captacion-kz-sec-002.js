/* ═══════════════════════════════════════════════════════════════════
   pruebas-captacion-kz-sec-002.js · KONFÍO ZINC — KZ-SEC-002

   Arquitectura final: el navegador NO escribe en Firestore. Solo el Worker
   `/leads` (cuenta de servicio) escribe en `contactos`. Estas pruebas
   demuestran que una ESCRITURA DIRECTA a Firestore queda DENEGADA (no se
   puede saltar el control de abuso) y que el panel sigue leyendo.

   Requisitos: Auth 9099 · Firestore 8080 · proyecto demo-card-seguridad.
   Uso: node herramientas/test/pruebas-captacion-kz-sec-002.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const P = 'demo-card-seguridad';
const K = 'clave-ficticia';

const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const b = (v) => ({ booleanValue: v });

const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(64)} ${detalle || ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j };
}
const crearAuto = (col, campos, token) => pedir('POST', u(col), { fields: campos }, token);
const crear = (col, id, campos, token) => pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, token);
const leer = (ruta, token) => pedir('GET', u(ruta), undefined, token);

async function alta(email, pass) {
  let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  return { uid: r.j.localId, token: r.j.idToken, email };
}
const DENEGADO = (r) => r.st === 403 || r.st === 401;

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
  const op = await alta('op.lead2@crm.test', 'Ficticia#1');
  await crear('usuarios', op.uid, { email: s(op.email), nombre: s('Op Lead2'), rol: s('OPERADOR'), activo: b(true) }, 'owner');
  /* Un contacto histórico que el panel debe poder leer. */
  await crear('contactos', 'c-historico', {
    nombre: s('Cliente Histórico'), telefono: s('3000000000'),
    servicio: s('Mini Web Básica'), mensaje: s('Solicitud de prueba'),
    origen: s('premium'), estado: s('NUEVO')
  }, 'owner');

  const lead = {
    nombre: s('Cliente Premium'),
    telefono: s('+57 300 111 2233'),
    servicio: s('Mini Web Básica'),
    mensaje: s('Negocio: panadería. Objetivo: aparecer en Google y recibir pedidos'),
    origen: s('premium'), estado: s('NUEVO'),
    createdAt: { timestampValue: new Date().toISOString() }
  };

  console.log('\n═══ A · ESCRITURA DIRECTA A FIRESTORE: DENEGADA ═══');
  chequear('Formulario premium (directo): DENEGADO', DENEGADO(await crearAuto('contactos', lead, undefined)));
  chequear('Formulario estándar con email (directo): DENEGADO', DENEGADO(await crearAuto('contactos', { ...lead, email: s('cliente@x.com') }, undefined)));
  chequear('Contacto sin mensaje (directo): DENEGADO', DENEGADO(await crearAuto('contactos', { nombre: s('X'), telefono: s('1') }, undefined)));
  chequear('Campo administrativo inyectado (directo): DENEGADO', DENEGADO(await crearAuto('contactos', { ...lead, rol: s('SUPERADMIN') }, undefined)));
  chequear('Contacto desde OPERADOR autenticado: DENEGADO', DENEGADO(await crearAuto('contactos', lead, op.token)));

  console.log('\n═══ B · EL PANEL SIGUE LEYENDO CONTACTOS ═══');
  const r2 = await leer('contactos/c-historico', op.token);
  chequear('El panel (OPERADOR) lee un contacto', r2.st === 200 && r2.j.fields && r2.j.fields.nombre.stringValue === 'Cliente Histórico', r2.st + '');
  chequear('El panel no puede crear contactos (create=false)', DENEGADO(await crear('contactos', 'c-op', lead, op.token)));

  console.log('\n══════════════════════════════════════════════════════════════');
  const fallan = salida.filter((x) => !x.ok).length;
  console.log(`TOTAL: ${salida.length} · PASAN: ${salida.length - fallan} · FALLAN: ${fallan}`);
  console.log('══════════════════════════════════════════════════════════════');
  process.exitCode = fallan ? 1 : 0;
})();
