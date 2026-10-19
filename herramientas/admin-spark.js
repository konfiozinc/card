#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/admin-spark.js
   Administración privilegiada del panel en MODO SPARK.

   En el plan gratuito no hay Cloud Functions, así que el navegador no puede
   crear cuentas ni cambiar roles (las reglas cierran `usuarios` a escritura).
   Eso se hace aquí, en el ASUS autorizado, con Admin SDK y la credencial
   privada que vive fuera del repositorio.

   Seguro por diseño:
     · SIN --aplicar: SIMULA y dice exactamente qué haría. No escribe nada.
     · Aplicar exige además --autorizado-por "nombre y apellido".
     · Nunca imprime contraseñas; los correos salen enmascarados.
     · Se niega si la credencial no es del proyecto autorizado.
     · Se puede ensayar entero contra los emuladores (proyecto demo-*).

   Órdenes:
     --diagnostico                     estado de identidades (solo lectura)
     --crear-cuenta --email … --rol … [--nombre …] [--password …]
     --rol --email … | --uid … --valor ADMIN|OPERADOR|SUPERADMIN
     --deshabilitar --email … | --uid …
     --vincular --email …              mueve la ficha heredada al UID real

   Ejemplos:
     node herramientas/admin-spark.js --diagnostico
     node herramientas/admin-spark.js --crear-cuenta --email ana@dominio.com --rol OPERADOR --nombre "Ana"
     node herramientas/admin-spark.js --crear-cuenta --email ana@dominio.com --rol OPERADOR --nombre "Ana" --aplicar --autorizado-por "Darwin M."
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const MODULOS = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/functions/node_modules';
const CREDENCIAL = process.env.KZ_CREDENCIAL ||
  'C:/Users/usuario29/Documents/KONFIO_ZINC/14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json';
const PROYECTO_REAL = 'konfio-zinc';

const ARGS = process.argv.slice(2);
const hay = (f) => ARGS.includes(f);
const val = (f) => { const i = ARGS.indexOf(f); return i !== -1 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : null; };

const APLICAR = hay('--aplicar');
const AUTORIZADO = val('--autorizado-por');
const ROLES = ['OPERADOR', 'ADMIN', 'SUPERADMIN'];

const EMULADOR_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const EMULADOR_FS = process.env.FIRESTORE_EMULATOR_HOST || '';
const ES_EMULADOR = !!(EMULADOR_AUTH || EMULADOR_FS);
const PROYECTO = process.env.KZ_PROYECTO || (ES_EMULADOR ? 'demo-card-seguridad' : PROYECTO_REAL);

const enmascarar = (e) => (typeof e === 'string' ? e.replace(/^(.{0,2})[^@]*@/, '$1***@') : '(sin correo)');
const hoyISO = () => new Date().toISOString().slice(0, 10);

function salir(codigo, mensaje) { console.log(mensaje || ''); process.exit(codigo); }

/* ── Auditoría local de lo que hace la herramienta ─────────────────── */
function registrarLocal(accion, detalle) {
  const linea = `[${new Date().toISOString()}] ${accion} · ${detalle}\n`;
  const ruta = path.join(__dirname, 'admin-spark.log');
  try { fs.appendFileSync(ruta, linea); } catch (e) { /* el log local no debe romper la operación */ }
}

/* ── Conexión ──────────────────────────────────────────────────────── */
function conectar() {
  const admin = require(path.join(MODULOS, 'firebase-admin'));
  if (ES_EMULADOR) {
    if (!PROYECTO.startsWith('demo-')) salir(2, '\n  ✖ En modo emulador el proyecto debe empezar por demo-.\n');
    /* Clave efímera solo para satisfacer al SDK: el emulador ignora el token y
       no sale de este proceso (no se escribe en disco ni se imprime). */
    const { generateKeyPairSync } = require('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    admin.initializeApp({
      projectId: PROYECTO,
      credential: admin.credential.cert({ project_id: PROYECTO, client_email: 'emulador@demo.test', private_key: privateKey })
    });
    console.log(`  conexión: EMULADOR · proyecto ${PROYECTO}`);
  } else {
    if (!fs.existsSync(CREDENCIAL)) salir(2, `\n  ✖ No existe la credencial:\n    ${CREDENCIAL}\n`);
    const sa = JSON.parse(fs.readFileSync(CREDENCIAL, 'utf8'));
    if (sa.project_id !== PROYECTO_REAL) salir(2, `\n  ✖ La credencial es del proyecto «${sa.project_id}», no de «${PROYECTO_REAL}». Abortado.\n`);
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROYECTO_REAL });
    console.log(`  conexión: REAL · proyecto ${PROYECTO_REAL} · cuenta ${enmascarar(sa.client_email)}`);
  }
  return { admin, db: admin.firestore() };
}

/* ── Búsqueda de identidades ───────────────────────────────────────── */
async function porUid(admin, db, uid) {
  const ficha = await db.doc(`usuarios/${uid}`).get();
  const cuenta = await admin.auth().getUser(uid).catch(() => null);
  return { uid, ficha: ficha.exists ? ficha.data() : null, cuenta };
}

async function porEmail(admin, db, email) {
  const correo = String(email || '').trim().toLowerCase();
  const cuenta = await admin.auth().getUserByEmail(correo).catch(() => null);
  const fichaEmail = await db.doc(`usuarios/${correo}`).get();
  const fichaUid = cuenta ? await db.doc(`usuarios/${cuenta.uid}`).get() : null;
  return {
    email: correo, cuenta,
    fichaHeredada: fichaEmail.exists ? fichaEmail.data() : null,
    fichaUid: fichaUid && fichaUid.exists ? fichaUid.data() : null,
    uid: cuenta ? cuenta.uid : null
  };
}

function exigirAplicar(queHaria) {
  if (!APLICAR) {
    console.log('\n  SIMULACIÓN (no se escribió nada). Para ejecutarlo de verdad:');
    console.log('    --aplicar --autorizado-por "nombre y apellido"\n');
    return false;
  }
  if (!AUTORIZADO) salir(2, '\n  ✖ --aplicar exige --autorizado-por "nombre y apellido".\n');
  console.log(`  AUTORIZADO POR: ${AUTORIZADO}`);
  return true;
}

/* ── Órdenes ───────────────────────────────────────────────────────── */
async function diagnostico(admin, db) {
  console.log('\n═══ DIAGNÓSTICO DE IDENTIDADES ═══');
  const cuentas = [];
  let pagina = await admin.auth().listUsers(1000).catch((e) => { salir(1, '  ✖ No se pudo listar Authentication: ' + e.message); });
  cuentas.push(...pagina.users);
  while (pagina.pageToken) { pagina = await admin.auth().listUsers(1000, pagina.pageToken); cuentas.push(...pagina.users); }

  const fichas = await db.collection('usuarios').get();
  const porId = new Map(fichas.docs.map((d) => [d.id, d.data()]));
  const uidsConCuenta = new Set(cuentas.map((u) => u.uid));
  const correosConCuenta = new Map(cuentas.map((u) => [(u.email || '').toLowerCase(), u]));

  let heredadas = 0, vinculadas = 0, fichasSinCuenta = 0, cuentasSinFicha = 0, sinRol = 0, inactivas = 0;
  const roles = {};
  for (const [id, d] of porId) {
    const esHeredada = id.includes('@');
    if (esHeredada) heredadas++; else vinculadas++;
    const rol = String(d.rol || '').toUpperCase();
    roles[rol || '(sin rol)'] = (roles[rol || '(sin rol)'] || 0) + 1;
    if (!ROLES.includes(rol)) sinRol++;
    if (d.activo !== true) inactivas++;
    if (esHeredada) { if (!correosConCuenta.has(id.toLowerCase())) fichasSinCuenta++; }
    else if (!uidsConCuenta.has(id)) fichasSinCuenta++;
  }
  for (const u of cuentas) {
    const email = (u.email || '').toLowerCase();
    if (!porId.has(u.uid) && !(email && porId.has(email))) cuentasSinFicha++;
  }

  /* BUG corregido: porId es un Map y Object.entries(Map) devuelve [] — el
     contador marcaba siempre 0 y el diagnóstico avisaba «no hay ningún
     SUPERADMIN activo» aunque la ficha existiera y estuviera activa. Se
     recorren los valores del Map. */
  const superadmins = [...porId.values()]
    .filter((d) => String(d.rol || '').toUpperCase() === 'SUPERADMIN' && d.activo === true).length;

  console.log(`  cuentas de Authentication: ${cuentas.length}`);
  console.log(`  fichas en Firestore:       ${porId.size}  (vinculadas al UID: ${vinculadas} · heredadas por correo: ${heredadas})`);
  console.log(`  roles: ${Object.entries(roles).map(([r, n]) => `${r}=${n}`).join(', ') || 'ninguno'}`);
  console.log(`  SUPERADMIN activos: ${superadmins}`);
  console.log('');
  const problemas = [];
  if (heredadas) problemas.push(`${heredadas} ficha(s) heredada(s) por correo: el panel las reconoce, pero conviene vincularlas con --vincular`);
  if (fichasSinCuenta) problemas.push(`${fichasSinCuenta} ficha(s) sin cuenta de Authentication: ese usuario no puede entrar`);
  if (cuentasSinFicha) problemas.push(`${cuentasSinFicha} cuenta(s) de Authentication sin ficha: entraría y el panel le negaría todo`);
  if (sinRol) problemas.push(`${sinRol} ficha(s) sin rol válido`);
  if (inactivas) problemas.push(`${inactivas} ficha(s) desactivada(s)`);
  if (superadmins === 0) problemas.push('no hay ningún SUPERADMIN activo: nadie podría administrar el panel');
  if (superadmins === 1) problemas.push('solo hay un SUPERADMIN activo: si esa cuenta se pierde, no hay forma de administrar desde el panel');
  if (!problemas.length) console.log('  ✓ sin problemas de identidad');
  else { console.log('  hallazgos:'); for (const p of problemas) console.log('   · ' + p); }
  console.log('');
  return problemas.length ? 1 : 0;
}

async function crearCuenta(admin, db) {
  const email = (val('--email') || '').trim().toLowerCase();
  const rol = String(val('--rol') || '').toUpperCase();
  const nombre = val('--nombre') || '';
  const password = val('--password') || null;
  if (!email.includes('@')) salir(2, '\n  ✖ Falta --email válido.\n');
  if (!ROLES.includes(rol)) salir(2, `\n  ✖ --rol debe ser uno de: ${ROLES.join(', ')}\n`);

  const estado = await porEmail(admin, db, email);
  console.log('\n═══ CREAR CUENTA ═══');
  console.log(`  correo: ${enmascarar(email)} · rol: ${rol} · nombre: ${nombre ? '(dado)' : '(vacío)'}`);
  console.log(`  cuenta de Authentication: ${estado.cuenta ? 'YA EXISTE (uid ' + estado.cuenta.uid.slice(0, 6) + '…)' : 'no existe → se crearía'}`);
  console.log(`  ficha por UID:  ${estado.fichaUid ? 'ya existe' : 'se crearía'}`);
  console.log(`  ficha heredada: ${estado.fichaHeredada ? 'existe (se deja intacta)' : 'no hay'}`);
  if (estado.fichaUid && String(estado.fichaUid.rol || '').toUpperCase() === rol) {
    console.log('  resultado: ya está así, no hay nada que hacer'); return 0;
  }
  if (!exigirAplicar()) return 0;

  let cuenta = estado.cuenta;
  if (!cuenta) {
    if (!password || password.length < 6) salir(2, '\n  ✖ Para crear la cuenta hace falta --password de al menos 6 caracteres.\n');
    cuenta = await admin.auth().createUser({ email, password, displayName: nombre || email });
    console.log(`  ✓ cuenta creada (uid ${cuenta.uid.slice(0, 6)}…)`);
  }
  await db.doc(`usuarios/${cuenta.uid}`).set({
    email, nombre: nombre || email, rol, activo: true,
    creadoPor: 'admin-spark', creadoEn: hoyISO(), actualizadoEn: hoyISO()
  }, { merge: true });
  console.log('  ✓ ficha vinculada al UID con el rol indicado');
  registrarLocal('CREAR_CUENTA', `rol=${rol} · ${AUTORIZADO}`);
  return 0;
}

async function cambiarRol(admin, db) {
  const email = val('--email');
  const uid = val('--uid');
  const rol = String(val('--valor') || '').toUpperCase();
  if (!ROLES.includes(rol)) salir(2, `\n  ✖ --valor debe ser uno de: ${ROLES.join(', ')}\n`);
  const objetivo = uid ? await porUid(admin, db, uid) : await porEmail(admin, db, email || '');
  const idFicha = uid || objetivo.uid;
  if (!idFicha) salir(1, '\n  ✖ No se encontró la cuenta. Crea primero la cuenta o usa --uid.\n');
  console.log('\n═══ CAMBIAR ROL ═══');
  console.log(`  destino: ${enmascarar(objetivo.email || (objetivo.cuenta && objetivo.cuenta.email))} · uid ${String(idFicha).slice(0, 6)}…`);
  console.log(`  rol actual: ${(objetivo.ficha || objetivo.fichaHeredada || {}).rol || '(sin ficha)'} → propuesto: ${rol}`);
  if (!exigirAplicar()) return 0;
  await db.doc(`usuarios/${idFicha}`).set({ rol, actualizadoEn: hoyISO(), actualizadoPor: 'admin-spark' }, { merge: true });
  console.log('  ✓ rol actualizado');
  registrarLocal('CAMBIAR_ROL', `rol=${rol} · ${AUTORIZADO}`);
  return 0;
}

async function deshabilitar(admin, db) {
  const email = val('--email');
  const uid = val('--uid');
  const objetivo = uid ? await porUid(admin, db, uid) : await porEmail(admin, db, email || '');
  const idFicha = uid || objetivo.uid;
  console.log('\n═══ DESHABILITAR CUENTA ═══');
  console.log(`  destino: ${enmascarar(objetivo.email || (objetivo.cuenta && objetivo.cuenta.email))}`);
  if (!objetivo.cuenta && !objetivo.fichaHeredada && !objetivo.fichaUid) salir(1, '\n  ✖ No existe ni cuenta ni ficha con ese correo.\n');
  if (!exigirAplicar()) return 0;
  if (objetivo.cuenta) { await admin.auth().updateUser(objetivo.cuenta.uid, { disabled: true }); console.log('  ✓ Authentication: cuenta deshabilitada'); }
  if (idFicha) { await db.doc(`usuarios/${idFicha}`).set({ activo: false, actualizadoEn: hoyISO() }, { merge: true }); console.log('  ✓ ficha: activo=false'); }
  if (objetivo.fichaHeredada) { await db.doc(`usuarios/${objetivo.email}`).set({ activo: false, actualizadoEn: hoyISO() }, { merge: true }); console.log('  ✓ ficha heredada: activo=false'); }
  registrarLocal('DESHABILITAR', `${AUTORIZADO}`);
  return 0;
}

async function vincular(admin, db) {
  const email = (val('--email') || '').trim().toLowerCase();
  const estado = await porEmail(admin, db, email);
  console.log('\n═══ VINCULAR FICHA HEREDADA CON SU UID ═══');
  console.log(`  correo: ${enmascarar(email)}`);
  if (!estado.cuenta) salir(1, '\n  ✖ No hay cuenta de Authentication con ese correo: créala primero con --crear-cuenta.\n');
  if (!estado.fichaHeredada) salir(1, '\n  ✖ No existe ficha heredada (usuarios/correo). Nada que vincular.\n');
  if (estado.fichaUid) salir(1, '\n  ✖ Ya existe una ficha vinculada al UID. No se sobrescribe: revísalo a mano.\n');
  console.log(`  ficha heredada → usuarios/${estado.cuenta.uid.slice(0, 6)}… (se copia tal cual y se borra la del correo)`);
  if (!exigirAplicar()) return 0;
  const lote = db.batch();
  lote.set(db.doc(`usuarios/${estado.cuenta.uid}`), { ...estado.fichaHeredada, vinculadaEn: hoyISO(), vinculadaPor: 'admin-spark' });
  lote.delete(db.doc(`usuarios/${email}`));
  await lote.commit();
  console.log('  ✓ ficha vinculada al UID y ficha heredada retirada');
  registrarLocal('VINCULAR', `${AUTORIZADO}`);
  return 0;
}

/* ── Entrada ───────────────────────────────────────────────────────── */
(async () => {
  console.log('\n═══ ADMINISTRACIÓN PRIVILEGIADA · MODO SPARK ═══');
  console.log(`  modo: ${APLICAR ? 'APLICAR' : 'SIMULACIÓN'}${ES_EMULADOR ? ' · emulador' : ''}`);
  const { admin, db } = conectar();

  let codigo = 0;
  if (hay('--diagnostico')) codigo = await diagnostico(admin, db);
  else if (hay('--crear-cuenta')) codigo = await crearCuenta(admin, db);
  else if (hay('--rol')) codigo = await cambiarRol(admin, db);
  else if (hay('--deshabilitar')) codigo = await deshabilitar(admin, db);
  else if (hay('--vincular')) codigo = await vincular(admin, db);
  else {
    console.log('\n  Órdenes: --diagnostico | --crear-cuenta | --rol | --deshabilitar | --vincular');
    console.log('  Todas simulan por omisión; para ejecutar: --aplicar --autorizado-por "nombre"\n');
    codigo = 2;
  }
  process.exit(codigo);
})().catch((e) => { console.error('\n  ✖ ' + (e && e.message)); process.exit(1); });
