/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · pruebas/verificar-reglas-cotizaciones.cjs
   Verificación de comportamiento de los hallazgos KZ-FORENSIC-001
   (CR-01, CR-02, CR-03) sobre las reglas REALES, contra el emulador.

   Se ejecuta con el emulador levantado, una fase por proceso:
     firebase emulators:exec --only firestore "node pruebas/verificar-reglas-cotizaciones.cjs parche && node pruebas/verificar-reglas-cotizaciones.cjs viejo"

   Dos fases, y la segunda es la importante:
     · FASE 1 · reglas del parche  → cada caso debe comportarse como se espera.
     · FASE 2 · reglas ANTERIORES (git show HEAD:firestore.rules) → los mismos
       ataques deben PASAR. Si no pasan, la prueba no demuestra nada.
   Es la exigencia de la casa: «la prueba tiene que saber fallar».

   Nota sobre el defecto que traía el test pegado: sin sembrar la ficha
   `usuarios/{uid}` con `activo:true`, esOperador() es false y TODA escritura
   se deniega — los assertFails habrían pasado por el motivo equivocado.
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment, assertFails, assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp } = require('firebase/firestore');

const RAIZ = path.resolve(__dirname, '..');
const REGLAS_PARQUE = path.join(RAIZ, 'firestore.rules');
const REGLAS_VIEJAS = path.join(__dirname, '.reglas-originales.rules');
const UID = 'operador-1';

let env;
let fallos = 0;
let total = 0;

const valido = (nombre) => { total++; console.log('  ✔ ' + nombre); };
const roto = (nombre, e) => {
  total++; fallos++;
  console.log('  ✘ ' + nombre + '\n      ' + String(e && e.message ? e.message : e).split('\n')[0]);
};

async function debePermitir(nombre, fn) {
  try { await assertSucceeds(fn()); valido(nombre); } catch (e) { roto(nombre, e); }
}
async function debeDenegar(nombre, fn) {
  try { await assertFails(fn()); valido(nombre); } catch (e) { roto(nombre, e); }
}

// ── Datos de prueba ──────────────────────────────────────────────────
const item = (n, valor) => ({
  concepto: 'Concepto ' + n, detalle: '', cantidad: n, valorUnitario: valor, subtotal: n * valor,
});
// 1×100 + 2×200 = 500
const ITEMS = [item(1, 100), item(2, 200)];
const TOKEN = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';

const cotizacion = (extra = {}) => ({
  numero: null, version: 1, estado: 'BORRADOR',
  items: ITEMS, subtotal: 500, descuento: 0, total: 500,
  moneda: 'COP', formaPago: 'UNICO', notaCliente: '', notasInternas: '',
  validaHasta: '2026-12-31', prospectoId: null, clienteId: null,
  prospectoNombre: 'Cliente Prueba', prospectoTelefono: '3000000000',
  creadoPor: UID, creadoPorNombre: 'Prueba',
  creadoEn: new Date(), actualizadoEn: new Date(), actualizadoPor: 'Prueba',
  enviadaEn: null, respondidaEn: null, motivoRechazo: '', token: null,
  ...extra,
});

const proyeccion = (extra = {}) => ({
  cotizacionId: 'c1', numero: 'COT-2026-0001', version: 1, negocio: 'Cliente Prueba',
  items: ITEMS, subtotal: 500, descuento: 0, total: 500, moneda: 'COP',
  formaPago: 'UNICO', notaCliente: '', validaHasta: '2026-12-31',
  estado: 'ENVIADA', emitidaEn: new Date(), respondidaEn: null,
  ...extra,
});

/* UNA sola instancia por proceso y por usuario. `authenticatedContext().firestore()`
   devuelve una instancia nueva cada vez, y mezclar referencias de dos instancias
   hace que runTransaction aborte con «different Firestore instance» (fue el primer
   error de este arnés, no de las reglas). */
const _dbs = {};
function db(uid = UID) {
  if (!_dbs[uid]) {
    _dbs[uid] = env.authenticatedContext(uid, { email: uid + '@konfiozinc.test' }).firestore();
  }
  return _dbs[uid];
}
const ADMIN_UID = 'admin-1';

async function sembrarOperador() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const [uid, rol] of [[UID, 'OPERADOR'], [ADMIN_UID, 'ADMIN']]) {
      await setDoc(doc(d, 'usuarios', uid), { activo: true, rol, nombre: rol + ' de prueba' });
      /* Ficha heredada por correo: `esOperador()` la consulta cuando la ficha por
         uid no basta, y si el documento no existe el motor anota «Null value
         error» en el rastro de las escrituras denegadas. Sembrarla deja el banco
         de pruebas igual que el panel real, que arrastra esas fichas. */
      await setDoc(doc(d, 'usuarios', uid + '@konfiozinc.test'),
        { activo: true, rol, nombre: rol + ' de prueba', uid });
    }
  });
}

async function sembrarCotizacion(id, extra = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'cotizaciones', id), cotizacion(extra));
  });
}

/** Envía la cotización como lo hace el panel: registro + proyección en UNA transacción. */
async function enviarEnTransaccion(id, extrasProyeccion = {}) {
  return runTransaction(db(), async (tx) => {
    tx.update(doc(db(), 'cotizaciones', id), {
      estado: 'ENVIADA', numero: 'COT-2026-0001', token: TOKEN,
      enviadaEn: new Date(), actualizadoEn: new Date(), actualizadoPor: 'Operador de prueba',
    });
    tx.set(doc(db(), 'cotizaciones_publicas', TOKEN), proyeccion({ cotizacionId: id, ...extrasProyeccion }));
  });
}

/* En @firebase/rules-unit-testing v6 no existe loadFirestoreRules: cada fase se
   ejecuta en su propio proceso, con su propio entorno y su propio texto de
   reglas cargado al inicializar. */
const MODO = (process.argv[2] || 'parche').toLowerCase();

// ── FASE 1 · las reglas del parche ───────────────────────────────────
async function casosParche() {
  await env.clearFirestore(); await sembrarOperador();

  await debePermitir('CONTROL · una cotización coherente se puede crear', () =>
    setDoc(doc(db(), 'cotizaciones', 'ok'), cotizacion()));

  await debeDenegar('CR-03 · subtotal que no es la suma de los ítems', () =>
    setDoc(doc(db(), 'cotizaciones', 'inv1'), cotizacion({ subtotal: 900, total: 900 })));

  await debeDenegar('CR-03 · total que no es subtotal − descuento', () =>
    setDoc(doc(db(), 'cotizaciones', 'inv2'), cotizacion({ descuento: 100, total: 500 })));

  await debeDenegar('CR-01 · crear una cotización ya ENVIADA', () =>
    setDoc(doc(db(), 'cotizaciones', 'inv3'), cotizacion({ estado: 'ENVIADA', numero: 'COT-2026-0009', token: TOKEN })));

  await sembrarCotizacion('c1');
  await debeDenegar('CR-01 · BORRADOR → ACEPTADA sin enviarla al cliente', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      estado: 'ACEPTADA', respondidaEn: new Date(),
      actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await debeDenegar('CR-01 · BORRADOR → ENVIADA sin token', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      estado: 'ENVIADA', numero: 'COT-2026-0001',
      enviadaEn: new Date(), actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await debePermitir('CONTROL · BORRADOR → ENVIADA con número y token de 128 bits', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      estado: 'ENVIADA', numero: 'COT-2026-0001', token: TOKEN,
      enviadaEn: new Date(), actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await debeDenegar('CR-01 · reescribir importes de una cotización YA enviada', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      items: [item(1, 999)], subtotal: 999, descuento: 0, total: 999,
      actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await debePermitir('CONTROL · registrar la respuesta del cliente (ENVIADA → ACEPTADA)', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      estado: 'ACEPTADA', respondidaEn: new Date(),
      actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await debePermitir('CONTROL · convertir en cliente (ACEPTADA + clienteId)', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      clienteId: 'cliente-1', actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  /* Reabrir es la única rama que llama a esAdmin(): la que más lecturas suma. */
  const reaperturaA = () => ({
    estado: 'BORRADOR', respondidaEn: null, motivoRechazo: '',
    items: ITEMS, subtotal: 500, descuento: 0, total: 500,
    formaPago: 'UNICO', notaCliente: '', notasInternas: '', validaHasta: '2026-12-31',
    actualizadoEn: new Date(), actualizadoPor: 'Prueba',
  });

  await sembrarCotizacion('c6', { estado: 'ENVIADA', numero: 'COT-2026-0002', token: TOKEN, enviadaEn: new Date() });
  await debeDenegar('CR-01 · un OPERADOR no puede reabrir una ENVIADA', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c6'), reaperturaA()));

  await debePermitir('CONTROL · un ADMIN sí reabre una ENVIADA (rama esAdmin)', () =>
    updateDoc(doc(db(ADMIN_UID), 'cotizaciones', 'c6'), reaperturaA()));

  await sembrarCotizacion('c2');
  await debePermitir('CR-02 · enviar en transacción: registro + proyección fiel (valida getAfter)', () =>
    enviarEnTransaccion('c2'));

  await sembrarCotizacion('c3');
  await debeDenegar('CR-02 · proyección con importes falseados', () =>
    enviarEnTransaccion('c3', { total: 999999, subtotal: 999999 }));

  await sembrarCotizacion('c4');
  await debeDenegar('CR-02 · proyección que apunte a un registro inventado', () =>
    enviarEnTransaccion('c4', { cotizacionId: 'no-existe' }));

  await debeDenegar('CR-02 · OPERADOR que reescribe la proyección ya publicada', async () => {
    await enviarEnTransaccion('c4');
    return updateDoc(doc(db(), 'cotizaciones_publicas', TOKEN), {
      items: [item(1, 50)], subtotal: 50, total: 50,
    });
  });

  await debeDenegar('CR-02 · un OPERADOR no puede borrar la proyección del cliente', () =>
    deleteDoc(doc(db(), 'cotizaciones_publicas', TOKEN)));

  /* La ruta que más se usa de todas: el cliente abre el enlace SIN sesión.
     `respondidaEn` tiene que ser exactamente request.time, así que el panel y el
     cliente escriben serverTimestamp() y no la hora del navegador. */
  const anon = () => env.unauthenticatedContext().firestore();
  await debePermitir('CR-02 · el cliente sin sesión acepta desde el enlace público', () =>
    updateDoc(doc(anon(), 'cotizaciones_publicas', TOKEN),
      { estado: 'ACEPTADA', respondidaEn: serverTimestamp() }));

  await debeDenegar('CR-02 · el cliente sin sesión no puede tocar los importes', () =>
    updateDoc(doc(anon(), 'cotizaciones_publicas', TOKEN), { total: 1, subtotal: 1 }));
}

// ── FASE 2 · las reglas ANTERIORES: los ataques deben PASAR ──────────
async function casosReglasViejas() {
  if (!fs.existsSync(REGLAS_VIEJAS)) {
    console.log('\n  (sin archivo de reglas anteriores: se omite el control negativo)');
    return;
  }
  await env.clearFirestore(); await sembrarOperador();

  await debePermitir('ANTES · subtotal inventado se guardaba igual (CR-03 real)', () =>
    setDoc(doc(db(), 'cotizaciones', 'inv1'), cotizacion({ subtotal: 900, total: 900 })));

  await debePermitir('ANTES · crear ya ENVIADA sin enviar nada al cliente (CR-01 real)', () =>
    setDoc(doc(db(), 'cotizaciones', 'inv3'), cotizacion({ estado: 'ENVIADA', numero: 'COT-2026-0009', token: TOKEN })));

  await sembrarCotizacion('c1');
  await debePermitir('ANTES · aceptación falsa desde BORRADOR (CR-01 real)', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c1'), {
      estado: 'ACEPTADA', respondidaEn: new Date(),
      actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await sembrarCotizacion('c2');
  await debePermitir('ANTES · enviar sin token (CR-01 real)', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c2'), {
      estado: 'ENVIADA', numero: 'COT-2026-0001',
      enviadaEn: new Date(), actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }));

  await sembrarCotizacion('c3');
  await debePermitir('ANTES · reescribir importes de una ya enviada (CR-01 real)', () =>
    updateDoc(doc(db(), 'cotizaciones', 'c3'), {
      estado: 'ENVIADA', numero: 'COT-2026-0001', token: TOKEN,
      enviadaEn: new Date(), actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    }).then(() => updateDoc(doc(db(), 'cotizaciones', 'c3'), {
      items: [item(1, 999)], subtotal: 999, descuento: 0, total: 999,
      actualizadoEn: new Date(), actualizadoPor: 'Prueba',
    })));

  await sembrarCotizacion('c5');
  await debePermitir('ANTES · proyección con importes falseados (CR-02 real)', () =>
    enviarEnTransaccion('c5', { total: 999999, subtotal: 999999 }));
}

(async () => {
  const usaParche = MODO === 'parche';
  const archivo = usaParche ? REGLAS_PARQUE : REGLAS_VIEJAS;
  if (!fs.existsSync(archivo)) {
    console.log('ERROR: no existe el archivo de reglas ' + archivo);
    process.exit(2);
  }
  console.log('\n══ ' + (usaParche ? 'FASE 1 · reglas del PARCHE' : 'FASE 2 · reglas ANTERIORES') + ' ══');
  console.log('   archivo : ' + archivo);
  console.log('   emulador: ' + (process.env.FIRESTORE_EMULATOR_HOST || '(sin emulador)'));

  env = await initializeTestEnvironment({
    projectId: 'demo-kz-cotizaciones',
    firestore: { rules: fs.readFileSync(archivo, 'utf8') },
  });

  try {
    if (usaParche) await casosParche(); else await casosReglasViejas();
  } finally {
    await env.cleanup();
  }

  console.log('   ' + (fallos === 0 ? 'FASE OK' : 'FASE CON FALLOS') + ' · ' + (total - fallos) + '/' + total + ' comprobaciones');
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
