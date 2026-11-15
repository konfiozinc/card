/* KZ-UNIFICACION-002 · Batería de reglas de crm_prospectos (emulador oficial).
 * Se ejecuta con: npx firebase-tools emulators:exec --only firestore --project konfio-zinc "..."
 * Datos 100% ficticios. Aborta con código != 0 si algo falla.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, collection, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let fallos = 0;
const ok = (nombre) => console.log('  PASS · ' + nombre);
const ko = (nombre, e) => { fallos += 1; console.log('  FAIL · ' + nombre + ' → ' + (e && (e.code || e.message))); };

const entorno = await initializeTestEnvironment({
  projectId: 'demo-kz-crm-prospectos',   /* demo-*: nunca contacta produccion */
  firestore: { rules: reglas, host: '127.0.0.1', port: 8080 },
});

/* Datos ficticios: usuarios y roles del esquema real de Card Spark. */
await entorno.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'usuarios', 'uid-admin@ejemplo.test'), { rol: 'ADMIN', email: 'uid-admin@ejemplo.test' });
  await setDoc(doc(db, 'usuarios', 'uid-super@ejemplo.test'), { rol: 'SUPERADMIN', email: 'uid-super@ejemplo.test' });
  await setDoc(doc(db, 'usuarios', 'uid-oper@ejemplo.test'), { rol: 'OPERADOR', email: 'uid-oper@ejemplo.test' });
  await setDoc(doc(db, 'usuarios', 'uid-raro@ejemplo.test'), { rol: 'INVENTADO', email: 'uid-raro@ejemplo.test' });
});

const base = (uid, email) => entorno.authenticatedContext(uid, { email }).firestore();
const admin = base('uid-admin@ejemplo.test', 'uid-admin@ejemplo.test');
const supera = base('uid-super@ejemplo.test', 'uid-super@ejemplo.test');
const oper = base('uid-oper@ejemplo.test', 'uid-oper@ejemplo.test');
const raro = base('uid-raro@ejemplo.test', 'uid-raro@ejemplo.test');
const anon = entorno.unauthenticatedContext().firestore();
const inexistente = base('uid-fantasma@ejemplo.test', 'uid-fantasma@ejemplo.test');

const ficha = (extra = {}) => ({
  nombre: 'Ficticio Uno', telefono: '3000000000', servicio: 'Mini Web Pro', origen: 'manual',
  estado: 'NUEVO', proximaFecha: '', notas: [], huella: 'h-ficticia',
  historial: [{ tipo: 'alta', autor: 'uid-admin@ejemplo.test', fecha: Timestamp.now() }],
  creadoPor: 'uid-admin@ejemplo.test', creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(), version: 1,
  ...extra,
});

async function prueba(nombre, fn) { try { await fn(); ok(nombre); } catch (e) { ko(nombre, e); } }

/* Altas y roles */
await prueba('ADMIN crea prospecto válido', () => assertSucceeds(setDoc(doc(admin, 'crm_prospectos', 'p1'), ficha())));
await prueba('SUPERADMIN crea prospecto válido', () => assertSucceeds(setDoc(doc(supera, 'crm_prospectos', 'p2'), ficha({ creadoPor: 'uid-super@ejemplo.test', historial: [{ tipo: 'alta', autor: 'uid-super@ejemplo.test', fecha: Timestamp.now() }] }))));
await prueba('OPERADOR NO crea', () => assertFails(setDoc(doc(oper, 'crm_prospectos', 'p3'), ficha({ creadoPor: 'uid-oper@ejemplo.test', historial: [{ tipo: 'alta', autor: 'uid-oper@ejemplo.test', fecha: Timestamp.now() }] }))));
await prueba('rol desconocido NO crea', () => assertFails(setDoc(doc(raro, 'crm_prospectos', 'p4'), ficha({ creadoPor: 'uid-raro@ejemplo.test' }))));
await prueba('UID inexistente NO crea', () => assertFails(setDoc(doc(inexistente, 'crm_prospectos', 'p5'), ficha({ creadoPor: 'uid-fantasma@ejemplo.test' }))));
await prueba('anónimo NO crea ni lee', async () => { await assertFails(getDocs(collection(anon, 'crm_prospectos'))); await assertFails(setDoc(doc(anon, 'crm_prospectos', 'p6'), ficha())); });

/* Suplantación y campos */
await prueba('ADMIN no puede suplantar creadoPor', () => assertFails(setDoc(doc(admin, 'crm_prospectos', 'p7'), ficha({ creadoPor: 'uid-super@ejemplo.test' }))));
await prueba('campo no autorizado se rechaza', () => assertFails(setDoc(doc(admin, 'crm_prospectos', 'p8'), ficha({ campoInventado: 'x' }))));
await prueba('estado inventado se rechaza', () => assertFails(setDoc(doc(admin, 'crm_prospectos', 'p9'), ficha({ estado: 'CASI' }))));
await prueba('nombre demasiado corto se rechaza', () => assertFails(setDoc(doc(admin, 'crm_prospectos', 'p10'), ficha({ nombre: 'X' }))));

/* Actualizaciones y auditoría */
const upd = (db, id, cambios) => updateDoc(doc(db, 'crm_prospectos', id), { actualizadoEn: serverTimestamp(), version: 2, historial: [{ tipo: 'alta', autor: 'uid-admin@ejemplo.test', fecha: Timestamp.now() }, { tipo: 'estado', desde: 'NUEVO', hacia: 'CONTACTADO', autor: 'uid-admin@ejemplo.test', fecha: Timestamp.now() }], ...cambios });
await prueba('ADMIN cambia estado con historial append-only', () => assertSucceeds(upd(admin, 'p1', { estado: 'CONTACTADO' })));
await prueba('no se puede reescribir el historial (no append)', () => assertFails(updateDoc(doc(admin, 'crm_prospectos', 'p1'), { estado: 'GANADO', actualizadoEn: serverTimestamp(), version: 3, historial: [] })));
await prueba('no se puede tocar creadoPor en edición', () => assertFails(upd(admin, 'p1', { estado: 'NEGOCIACION', creadoPor: 'uid-oper@ejemplo.test' })));
await prueba('OPERADOR no edita', () => assertFails(upd(oper, 'p1', { estado: 'PERDIDO' })));

/* Borrado */
await prueba('nadie borra prospectos', async () => { await assertFails(deleteDoc(doc(admin, 'crm_prospectos', 'p1'))); await assertFails(deleteDoc(doc(supera, 'crm_prospectos', 'p2'))); });

/* Regresión: colecciones anteriores conservan sus permisos */
await prueba('anónimo NO lee clientes ni pagos ni contactos', async () => {
  await assertFails(getDocs(collection(anon, 'clientes')));
  await assertFails(getDocs(collection(anon, 'pagos')));
  await assertFails(getDocs(collection(anon, 'contactos')));
});
await prueba('OPERADOR sigue sin escribir clientes', () => assertFails(setDoc(doc(oper, 'clientes', 'c1'), { nombre: 'Ficticio' })));

await entorno.cleanup();
console.log(fallos === 0 ? '\nRESULTADO: PASS (reglas verificadas, sin publicar)' : '\nRESULTADO: FAIL (' + fallos + ' pruebas fallidas)');
process.exit(fallos === 0 ? 0 : 1);
