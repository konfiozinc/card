/* KZ-UNIFICACION-002 - Caso aislado: disponibilidad, siembra y login.
 *
 * Se ejecuta ANTES del recorrido visual y sin navegador. Si esto no pasa, el
 * recorrido completo no debe ejecutarse: sin sesion no hay operaciones
 * comerciales que probar, y un PASS en ese estado seria falso.
 *
 * Uso: node pruebas/siembra-login.mjs <proyecto-demo> [limiteMs]
 *   node pruebas/siembra-login.mjs demo-kz-crm-prospectos
 * Sale con 0 solo si las cuatro comprobaciones dan PASS.
 */
import { esperarEmuladores, sembrarAdmin, comprobarLogin, comprobarReglasActivas } from './entorno-emuladores.mjs';

const proyecto = process.argv[2];
const limiteMs = Number(process.argv[3] || 180000);
const EMAIL = 'admin.prueba@demo.test';
const CLAVE = 'PruebaDemo123!';

if (!proyecto) { console.log('FALTA el proyecto demo: uso -> node pruebas/siembra-login.mjs demo-kz-crm-prospectos'); process.exit(1); }
if (!proyecto.startsWith('demo-')) { console.log('ABORTADO: el proyecto debe empezar por demo- (' + proyecto + ')'); process.exit(1); }

const resultados = [];
const anota = (nombre, error, detalle) => {
  const e = error ? 'FAIL' : 'PASS';
  resultados.push({ nombre, e, d: detalle || '' });
  console.log(`${e} - ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

let uid = '';

/* 1 - los dos servicios responden de verdad, comprobados con peticiones reales */
try {
  console.log('Esperando emuladores (auth 9099 + firestore 8080), limite ' + limiteMs + ' ms...');
  const t = await esperarEmuladores({ proyecto, limiteMs, log: (m) => console.log(m) });
  anota('Emuladores Auth y Firestore disponibles', null, `auth en ${t.auth} ms, firestore en ${t.firestore} ms`);
} catch (e) {
  anota('Emuladores Auth y Firestore disponibles', e, e.message);
  console.log(`\nRESUMEN: ${resultados.length} comprobaciones | PASS=0 | FAIL=${resultados.length}`);
  console.log('RESULTADO AISLADO: FAIL (no se siembra ni se inicia sesion)');
  process.exit(1);
}

/* 2 - usuario de Auth + ficha en usuarios/<uid> (la ruta que lee shell.js) */
try {
  const r = await sembrarAdmin({ proyecto, email: EMAIL, clave: CLAVE, log: (m) => console.log(m) });
  uid = r.uid;
  anota('Sembrar usuario ADMIN y su ficha', null, `uid=${uid}`);
} catch (e) {
  anota('Sembrar usuario ADMIN y su ficha', e, e.message);
  console.log(`\nRESUMEN: ${resultados.length} comprobaciones | PASS=1 | FAIL=${resultados.length - 1}`);
  console.log('RESULTADO AISLADO: FAIL (sin usuario no hay login ni recorrido)');
  process.exit(1);
}

/* 3 - la cuenta sirve para iniciar sesion y el panel encontrara activo=true */
try {
  const r = await comprobarLogin({ proyecto, email: EMAIL, clave: CLAVE, uidEsperado: uid });
  anota('Iniciar sesion con la cuenta sembrada', null, `rol=${r.rol} uid=${r.uid}`);
} catch (e) {
  anota('Iniciar sesion con la cuenta sembrada', e, e.message);
  console.log(`\nRESUMEN: ${resultados.length} comprobaciones | PASS=2 | FAIL=${resultados.length - 2}`);
  console.log('RESULTADO AISLADO: FAIL (el navegador repetiria este mismo login)');
  process.exit(1);
}

/* 4 - control negativo: sin credenciales la coleccion nueva esta cerrada */
try {
  const r = await comprobarReglasActivas({ proyecto });
  anota('Reglas del repositorio cargadas (anonimo denegado)', null, `lectura HTTP ${r.lectura}, escritura HTTP ${r.escritura}`);
} catch (e) {
  anota('Reglas del repositorio cargadas (anonimo denegado)', e, e.message);
}

const fallos = resultados.filter((r) => r.e !== 'PASS').length;
console.log(`\nRESUMEN: ${resultados.length} comprobaciones | PASS=${resultados.length - fallos} | FAIL=${fallos}`);
console.log(fallos === 0 ? 'RESULTADO AISLADO: PASS' : 'RESULTADO AISLADO: FAIL');
process.exit(fallos === 0 ? 0 : 1);
