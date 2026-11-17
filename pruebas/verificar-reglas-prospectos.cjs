/* KZ-SEGUIMIENTO-001 · Pruebas de las reglas de crm_prospectos contra el emulador.
   Verifica que la fecha de próximo contacto (vencida incluida) se guarda, que la
   basura se rechaza y que la acción 'agenda' se acepta como historial inmutable.

   Uso:
     firebase emulators:exec --only firestore --project demo-kz-seguimiento \
       "node pruebas/verificar-reglas-prospectos.cjs"
*/
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');

const RAIZ = path.resolve(__dirname, '..');
const ADMIN_UID = 'admin-1';
const OPERADOR_UID = 'operador-1';
let env;
let fallos = 0;
let total = 0;

const valido = (n) => { total++; console.log('  ✔ ' + n); };
const roto = (n, e) => {
  total++; fallos++;
  console.log('  ✘ ' + n + '\n      ' + String(e && e.message ? e.message : e).split('\n')[0]);
};
const debePermitir = async (n, fn) => { try { await assertSucceeds(fn()); valido(n); } catch (e) { roto(n, e); } };
const debeDenegar = async (n, fn) => { try { await assertFails(fn()); valido(n); } catch (e) { roto(n, e); } };

const dbAdmin = () => env.authenticatedContext(ADMIN_UID, { email: 'admin@konfiozinc.test' }).firestore();
const dbAnon = () => env.unauthenticatedContext().firestore();
const dbOperador = () => env.authenticatedContext(OPERADOR_UID, { email: 'op@konfiozinc.test' }).firestore();

/** Prospecto con la forma que escribe el panel (todas las claves de camposAlta). */
const prospecto = (extra = {}) => ({
  nombre: 'Cliente de Prueba',
  telefono: '3000000000',
  servicio: 'Mini Web Básica',
  origen: 'manual',
  estado: 'NUEVO',
  proximaFecha: '',
  notas: [],
  huella: 'cliente de prueba|3000000000|mini web basica',
  creadoPor: ADMIN_UID,
  creadoEn: serverTimestamp(),
  actualizadoEn: serverTimestamp(),
  version: 1,
  ...extra,
});

/** Acción del historial inmutable. */
const accion = (extra = {}) => ({
  tipo: 'alta',
  autor: ADMIN_UID,
  fecha: serverTimestamp(),
  ...extra,
});

(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kz-seguimiento',
    firestore: { rules: fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8') },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'usuarios', ADMIN_UID), { activo: true, rol: 'ADMIN', nombre: 'Admin' });
    await setDoc(doc(d, 'usuarios', ADMIN_UID + '@konfiozinc.test'), { activo: true, rol: 'ADMIN', nombre: 'Admin' });
    await setDoc(doc(d, 'usuarios', OPERADOR_UID), { activo: true, rol: 'OPERADOR', nombre: 'Operador' });
    await setDoc(doc(d, 'usuarios', OPERADOR_UID + '@konfiozinc.test'), { activo: true, rol: 'OPERADOR', nombre: 'Operador' });
  });

  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'usuarios', ADMIN_UID), { activo: true, rol: 'ADMIN', nombre: 'Admin' });
    await setDoc(doc(d, 'usuarios', OPERADOR_UID), { activo: true, rol: 'OPERADOR', nombre: 'Operador' });
  });

  console.log('\n── Fecha de próximo contacto ──────────────────────────');
  await debePermitir('crea un prospecto CON fecha VENCIDA (2020-01-01)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-vencido'), prospecto({ proximaFecha: '2020-01-01' })));
  await debePermitir('crea un prospecto SIN fecha (cadena vacía)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-sin'), prospecto({ proximaFecha: '' })));
  await debeDenegar('rechaza una fecha que no es AAAA-MM-DD («mañana»)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-malo'), prospecto({ proximaFecha: 'mañana' })));
  await debeDenegar('rechaza una fecha imposible (2026-02-31)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-imposible'), prospecto({ proximaFecha: '2026-02-31' })));
  await debeDenegar('rechaza un 31 en mes de 30 días (2026-04-31)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-abril'), prospecto({ proximaFecha: '2026-04-31' })));
  await debeDenegar('rechaza un mes inexistente (2026-13-01)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-mes13'), prospecto({ proximaFecha: '2026-13-01' })));
  await debeDenegar('rechaza el 29 de febrero en año no bisiesto (2026-02-29)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-bis'), prospecto({ proximaFecha: '2026-02-29' })));
  await debePermitir('acepta el 29 de febrero de un año bisiesto (2024-02-29)', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-bisiesto'), prospecto({ proximaFecha: '2024-02-29' })));
  await debePermitir('actualiza la fecha de un prospecto existente', () =>
    updateDoc(doc(dbAdmin(), 'crm_prospectos', 'p-vencido'), {
      proximaFecha: '2026-12-01', actualizadoEn: serverTimestamp(), version: 2,
    }));
  await debeDenegar('rechaza actualizar a una fecha inválida', () =>
    updateDoc(doc(dbAdmin(), 'crm_prospectos', 'p-vencido'), {
      proximaFecha: '20/11/2026', actualizadoEn: serverTimestamp(), version: 3,
    }));

  console.log('\n── Historial inmutable: acción «agenda» ────────────────');
  await debePermitir('registra una acción de tipo agenda con su fecha', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-vencido', 'acciones', 'a-agenda'), accion({ tipo: 'agenda', detalle: '2026-12-01' })));
  await debeDenegar('rechaza un tipo de acción inventado', () =>
    setDoc(doc(dbAdmin(), 'crm_prospectos', 'p-vencido', 'acciones', 'a-raro'), accion({ tipo: 'reagendar' })));

  console.log('\n── Permisos: quién puede tocar el seguimiento ──────────');
  await debeDenegar('un OPERADOR no puede crear prospectos', () =>
    setDoc(doc(dbOperador(), 'crm_prospectos', 'p-op'), prospecto({ creadoPor: OPERADOR_UID })));
  await debeDenegar('sin sesión no se puede escribir', () =>
    setDoc(doc(dbAnon(), 'crm_prospectos', 'p-anon'), prospecto()));

  await env.cleanup();
  console.log('\n' + (fallos === 0 ? 'TODO OK' : 'FALLOS') + ' · ' + (total - fallos) + '/' + total + ' comprobaciones');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
