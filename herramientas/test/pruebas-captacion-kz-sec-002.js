/* ═══════════════════════════════════════════════════════════════════
   pruebas-captacion-kz-sec-002.js · KONFÍO ZINC — KZ-SEC-002

   Verifica de extremo a extremo la captación de contactos:
     Formulario premium → Firestore `contactos` → panel Card Spark.

   Comprueba: creación confirmada (200 + nombre del documento), lectura
   desde el panel (OPERADOR), rechazo de campos omitidos/inválidos, sin
   campos administrativos, duplicados y no-regresión del formulario estándar.

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
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(62)} ${detalle || ''}`);
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
  const op = await alta('op.lead@crm.test', 'Ficticia#1');
  await crear('usuarios', op.uid, { email: s(op.email), nombre: s('Op Lead'), rol: s('OPERADOR'), activo: b(true) }, 'owner');

  const lead = {
    nombre: s('Cliente Premium'),
    telefono: s('+57 300 111 2233'),
    servicio: s('Mini Web Básica'),
    mensaje: s('Negocio: panadería. Objetivo: aparecer en Google y recibir pedidos'),
    origen: s('premium'),
    estado: s('NUEVO'),
    createdAt: { timestampValue: new Date().toISOString() }
  };

  console.log('\n═══ A · FORMULARIO PREMIUM → FIRESTORE → PANEL ═══');
  const r1 = await crearAuto('contactos', lead, undefined);
  chequear('Formulario premium: creación confirmada (200 + doc)', r1.st === 200 && !!r1.j.name, r1.st + ' ' + ((r1.j && r1.j.name) || ''));
  const docId = r1.j && r1.j.name ? r1.j.name.split('/').pop() : null;
  if (docId) {
    const r2 = await leer('contactos/' + docId, op.token);
    chequear('El panel (OPERADOR) lee el contacto creado', r2.st === 200 && r2.j.fields && r2.j.fields.nombre.stringValue === 'Cliente Premium', r2.st + '');
  } else {
    chequear('El panel (OPERADOR) lee el contacto creado', false, 'sin docId');
  }

  console.log('\n═══ B · ERRORES, CAMPOS OMITIDOS Y SEGURIDAD ═══');
  chequear('Sin mensaje: DENEGADO', DENEGADO(await crearAuto('contactos', { nombre: s('X'), telefono: s('1') })));
  chequear('Campo administrativo inyectado (rol): DENEGADO', DENEGADO(await crearAuto('contactos', { ...lead, rol: s('SUPERADMIN') })));
  chequear('Mensaje gigante (>2000): DENEGADO', DENEGADO(await crearAuto('contactos', { ...lead, mensaje: s('x'.repeat(2001)) })));
  chequear('Email inválido: DENEGADO', DENEGADO(await crearAuto('contactos', { ...lead, email: s('noesuncorreo') })));

  console.log('\n═══ C · DUPLICADOS Y NO-REGRESIÓN ═══');
  chequear('Envío duplicado crea otro documento (sin dedup server-side)', (await crearAuto('contactos', lead, undefined)).st === 200);
  chequear('Formulario estándar (con email): PERMITIDO', (await crearAuto('contactos', { ...lead, email: s('cliente@x.com') }, undefined)).st === 200);

  console.log('\n══════════════════════════════════════════════════════════════');
  const fallan = salida.filter((x) => !x.ok).length;
  console.log(`TOTAL: ${salida.length} · PASAN: ${salida.length - fallan} · FALLAN: ${fallan}`);
  console.log('══════════════════════════════════════════════════════════════');
  process.exitCode = fallan ? 1 : 0;
})();
