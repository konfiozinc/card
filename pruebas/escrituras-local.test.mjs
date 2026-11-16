/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · pruebas/escrituras-local.test.mjs
   Prueba de la lógica de pagos (CR-04 · KZ-FORENSIC-001) SIN emulador:
   se sustituyen `firebase/firestore` y `./core.js` por dobles, y se comprueba
   que las lecturas y el cálculo de fechas ocurren DENTRO de la transacción.

   Se ejecuta con el runner nativo de Node (no hay que instalar nada):
     node --experimental-test-module-mocks pruebas/escrituras-local.test.mjs

   Y contra la versión ANTERIOR del módulo, que DEBE fallar (PowerShell; ojo:
   `>` escribe UTF-16 y rompe el archivo, por eso se usa WriteAllText):
     $t = git show HEAD:assets/js/admin/escrituras-local.js | Out-String
     [System.IO.File]::WriteAllText("$pwd\assets\js\admin\.escrituras-local-HEAD.mjs", $t, (New-Object System.Text.UTF8Encoding($false)))
     $env:KZ_MODULO = 'assets/js/admin/.escrituras-local-HEAD.mjs'
     node --experimental-test-module-mocks pruebas/escrituras-local.test.mjs

   Por qué no vitest: Node 24 ya trae mock.module, mock.fn y mock.timers.
   Instalar vitest habría creado un package.json en la raíz del repo, que se
   publica a Firebase Hosting (no está en hosting.ignore).
   ═══════════════════════════════════════════════════════════════════ */

import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_ADMIN = path.join(RAIZ, 'assets', 'js', 'admin');
const MODULO = process.env.KZ_MODULO
  ? path.resolve(RAIZ, process.env.KZ_MODULO)
  : path.join(DIR_ADMIN, 'escrituras-local.js');

// ── Dobles ───────────────────────────────────────────────────────────
const ref = (col, id) => ({ col, id, toString: () => col + '/' + id });
const snap = (existe, datos) => ({ exists: () => existe, data: () => datos });

/* Las implementaciones viven en variables mutables a propósito: el módulo bajo
   prueba recibe los imports como bindings vivos, y reasignar propiedades del
   objeto de exports no siempre se refleja. */
let implGetDoc = async () => snap(false);
let implGetDocs = async () => ({ docs: [] });

const fsDoble = {
  doc: mock.fn((db, col, id) => ref(col, id)),
  collection: mock.fn((db, col) => ref(col, 'auto-id')),
  getDoc: mock.fn((...a) => implGetDoc(...a)),
  getDocs: mock.fn((...a) => implGetDocs(...a)),
  addDoc: mock.fn(async () => ref('auditoria', 'aud-1')),
  updateDoc: mock.fn(async () => undefined),
  setDoc: mock.fn(async () => undefined),
  deleteDoc: mock.fn(async () => undefined),
  writeBatch: mock.fn(() => ({ set() {}, update() {}, commit: async () => {} })),
  serverTimestamp: mock.fn(() => 'SERVER_TIMESTAMP'),
  query: mock.fn((...a) => ({ q: a })),
  where: mock.fn((...a) => ({ where: a })),
  limit: mock.fn((n) => ({ limit: n })),
  runTransaction: mock.fn(async (db, cb) => cb(txActual)),
};

let txActual = null;
const sesion = { currentUser: { uid: 'operador-1', email: 'operador-1@konfiozinc.test' } };
let rolActual = 'OPERADOR';

globalThis.window = {
  KZ_CONFIG: {
    negocio: { mesesSuscripcion: 12, diasPorVencer: 15 },
    roles: { niveles: { OPERADOR: 1, ADMIN: 2, SUPERADMIN: 3 } },
    conceptosPago: [{ codigo: 'RENOVACION_DOMINIO', extensible: true, meses: 12 }],
  },
};

mock.module(pathToFileURL(path.join(DIR_ADMIN, 'core.js')).href, {
  exports: { db: { doble: true }, auth: sesion },
});
mock.module('firebase/firestore', { exports: fsDoble });

/* Se importa DESPUÉS de montar los dobles: el módulo lee window.KZ_CONFIG al
   cargarse y resuelve sus imports en ese momento. */
const { registrarPago, confirmarPago } = await import(pathToFileURL(MODULO).href);

// ── Utilidades ───────────────────────────────────────────────────────
const ficha = (rol) => ({ activo: true, rol, nombre: 'Prueba', uid: sesion.currentUser.uid });

const fechaLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

beforeEach(() => {
  rolActual = 'OPERADOR';
  txActual = null;
  implGetDoc = async () => snap(false);
  implGetDocs = async () => ({ docs: [] });
  for (const f of ['getDoc', 'getDocs', 'addDoc', 'updateDoc', 'runTransaction']) fsDoble[f].mock.resetCalls();
});
afterEach(() => { mock.timers.reset(); });

// ════════════════════════════════════════════════════════════════════
// 1 · TOCTOU: el cliente se lee DENTRO de la transacción
// ════════════════════════════════════════════════════════════════════
test('CR-04 · el pago se guarda con el cliente que hay DENTRO de la transacción', async () => {
  // Fuera de la transacción el cliente se llama "VIEJO"; dentro, "NUEVO".
  implGetDoc = async (r) => {
    if (r.col === 'usuarios') return snap(true, ficha('OPERADOR'));
    if (r.col === 'clientes') return snap(true, { nombre: 'Cliente VIEJO' });
    if (r.col === 'servicios') return snap(true, { clienteId: 'cli-1' });
    return snap(false);
  };

  const escritos = [];
  txActual = {
    get: mock.fn(async (r) => {
      if (r.col === 'pagos') return snap(false);                                 // idempotencia
      if (r.col === 'clientes') return snap(true, { nombre: 'Cliente NUEVO' }); // dato fresco
      if (r.col === 'servicios') return snap(true, { clienteId: 'cli-1' });
      return snap(false);
    }),
    set: mock.fn((r, datos) => escritos.push({ ref: r, datos })),
    update: mock.fn(),
  };

  await registrarPago({ clienteId: 'cli-1', servicioId: 'srv-1', monto: 100, concepto: 'RENOVACION_DOMINIO' });

  assert.equal(escritos.length, 1, 'debe escribir un solo pago');
  assert.equal(escritos[0].datos.clienteNombre, 'Cliente NUEVO',
    'el nombre guardado tiene que ser el de dentro de la transacción, no el de fuera');

  const fuera = fsDoble.getDoc.mock.calls.filter((c) => c.arguments[0].col === 'clientes');
  assert.equal(fuera.length, 0, 'no debe leer el cliente con getDoc fuera de la transacción');
});

// ════════════════════════════════════════════════════════════════════
// 2 · La fecha de pago se calcula al ESCRIBIR, no al abrir el formulario
// ════════════════════════════════════════════════════════════════════
test('CR-04 · la fecha por omisión se calcula dentro de la transacción', async () => {
  implGetDoc = async (r) => {
    if (r.col === 'usuarios') return snap(true, ficha('OPERADOR'));
    if (r.col === 'clientes') return snap(true, { nombre: 'Cliente' });
    if (r.col === 'servicios') return snap(true, { clienteId: 'cli-1' });
    return snap(false);
  };
  const T1 = new Date(2026, 10, 16, 23, 50, 0);   // al abrir el formulario
  const T2 = new Date(2026, 10, 17, 0, 10, 0);    // al escribir: ya es otro día
  mock.timers.enable({ apis: ['Date'], now: T1.getTime() });

  const escritos = [];
  txActual = {
    get: mock.fn(async (r) => {
      mock.timers.setTime(T2.getTime());          // el reloj avanza MIENTRAS corre la transacción
      if (r.col === 'pagos') return snap(false);
      if (r.col === 'clientes') return snap(true, { nombre: 'Cliente' });
      if (r.col === 'servicios') return snap(true, { clienteId: 'cli-1' });
      return snap(false);
    }),
    set: mock.fn((r, datos) => escritos.push({ ref: r, datos })),
    update: mock.fn(),
  };

  await registrarPago({ clienteId: 'cli-1', servicioId: 'srv-1', monto: 100, concepto: 'RENOVACION_DOMINIO' });

  const esperado = fechaLocal(T2);
  assert.equal(escritos[0].datos.fechaPago, esperado,
    'la fecha debe ser la del momento de escribir (' + esperado + '), no la del formulario (' + fechaLocal(T1) + ')');
});

// ════════════════════════════════════════════════════════════════════
// 3 · confirmarPago: los hermanos se releen DENTRO de la transacción
// ════════════════════════════════════════════════════════════════════
test('CR-04 · confirmarPago usa el vencimiento FRESCO del hermano', async () => {
  rolActual = 'ADMIN';
  const pago = {
    clienteId: 'cli-1', servicioId: 'srv-1', concepto: 'RENOVACION_DOMINIO',
    estado: 'PENDIENTE', monto: 100,
  };
  implGetDoc = async (r) => {
    if (r.col === 'usuarios') return snap(true, ficha('ADMIN'));
    if (r.col === 'pagos') return snap(true, pago);
    return snap(false);
  };
  // La consulta de FUERA trae el hermano con un vencimiento viejo.
  implGetDocs = async () => ({
    docs: [{ id: 'srv-2', ref: ref('servicios', 'srv-2'), data: () => ({ fechaVencimiento: '2020-01-01' }) }],
  });

  const actualizados = [];
  txActual = {
    get: mock.fn(async (r) => {
      if (r.col === 'pagos') return snap(true, pago);
      if (r.col === 'servicios' && r.id === 'srv-1') return snap(true, { clienteId: 'cli-1', fechaVencimiento: '2026-11-01' });
      if (r.col === 'servicios' && r.id === 'srv-2') return snap(true, { fechaVencimiento: '2030-01-01' }); // fresco
      if (r.col === 'clientes') return snap(true, { nombre: 'Cliente' });
      return snap(false);
    }),
    set: mock.fn(),
    update: mock.fn((r, datos) => actualizados.push({ ref: r, datos })),
  };

  await confirmarPago('pago-1');

  const cliente = actualizados.find((x) => x.ref.col === 'clientes');
  assert.ok(cliente, 'debe actualizar la fecha genérica del cliente');
  assert.equal(cliente.datos.fechaVencimiento, '2030-01-01',
    'la fecha tiene que salir del hermano releído dentro de la transacción, no de la consulta previa');
});
