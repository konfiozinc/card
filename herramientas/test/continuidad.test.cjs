'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

// Solo interfaces ficticias. Ningún SDK, credencial, petición ni cuenta real.
const PASSWORD = 'MARCADOR_CLAVE_' + 'SOLO_FICTICIA_019';
const fixtures = {
  'clientes/a': { nombre: 'CLIENTE_FICTICIO_A', activo: true },
  'clientes/b': { nombre: 'CLIENTE_FICTICIO_B' },
  'clientes/a/pagos/igual': { monto: 100, etiquetas: [null, false, 'ficticio'] },
  'clientes/b/pagos/igual': { monto: 200 },
  'clientes/a/pagos/igual/items/x': { monto: 25 },
  'clientes--a--pagos/igual': { monto: 300 },
  'clientes/ñ--../pagos/igual': { monto: 400 },
  'clientes/ñ--..': { ficticio: true },
  'resumen/igual': { ficticio: true },
  '__proto__/igual': JSON.parse('{"__proto__":{"conservado":true},"valor":"ficticio"}')
};

function fakeDb(data = fixtures, fail = () => false) {
  const calls = [];
  const documentos = new Set(), colecciones = new Set(['clientes/a/vacia']);
  for (const ruta of Object.keys(data)) {
    const partes = ruta.split('/');
    for (let n = 1; n < partes.length; n += 2) {
      colecciones.add(partes.slice(0, n).join('/'));
      documentos.add(partes.slice(0, n + 1).join('/'));
    }
  }
  const check = (op) => { calls.push(op); if (fail(op)) throw new Error('Fallo ficticio de ' + op); };
  const hijos = (paths, parent) => [...paths].filter((p) => p.startsWith(parent + '/') && p.split('/').length === parent.split('/').length + 1).sort();
  function doc(ruta) {
    return { path: ruta, id: ruta.split('/').at(-1),
      async get() { check('leer:' + ruta); return { exists: Object.hasOwn(data, ruta) && data[ruta] !== null, data: () => data[ruta] }; },
      async listCollections() { check('subcolecciones:' + ruta); return hijos(colecciones, ruta).map(col); }
    };
  }
  function col(ruta) {
    return { path: ruta, id: ruta.split('/').at(-1),
      async listDocuments() { check('documentos:' + ruta); return hijos(documentos, ruta).map(doc); }
    };
  }
  return { calls, async listCollections() { check('raiz'); return [...colecciones].filter((p) => !p.includes('/')).sort().map(col); } };
}

function entorno(t, { io = fs, cli = false, admin, env = {}, argv = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'card-ficticio-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const logs = [], errors = [], module = { exports: {} };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-18T15:00:00Z'])); }
    static now() { return Date.parse('2026-10-18T15:00:00Z'); }
  }
  const process = { argv: ['node', 'herramienta.js', ...argv], env, exitCode: 0,
    exit(code) {
      this.exitCode = code;
      if (code !== 0) { const e = new Error('Salida ficticia'); e.simulatedExit = true; throw e; }
    } };
  function requireMock(name) {
    if (name === 'fs') return io;
    if (name === 'path') return path;
    if (name === 'crypto') return require('node:crypto');
    if (name === 'firebase-admin' && admin) return admin;
    if (name === '../serviceAccount.json' && admin) return { project_id: 'proyecto-ficticio', private_key: PASSWORD };
    throw new Error('Acceso externo bloqueado en pruebas');
  }
  requireMock.main = cli ? module : {};
  const context = { module, require: requireMock, __dirname: root, Buffer, Date: FixedDate, process,
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')) } };
  return { root, logs, errors, process, module,
    async cargar(file) {
      const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      try { await vm.runInNewContext(source, context, { filename: file }); }
      catch (error) { if (!error.simulatedExit) throw error; }
      return module.exports;
    }
  };
}

async function backup(t, options = {}) {
  const e = entorno(t, options);
  const { exportarRespaldo } = await e.cargar('respaldar-firestore.js');
  return { ...e, run: (db = fakeDb()) => exportarRespaldo(db, path.join(e.root, 'backups')) };
}

function carpetas(e) {
  const root = path.join(e.root, 'backups');
  return fs.existsSync(root) ? fs.readdirSync(root).map((p) => path.join(root, p)) : [];
}
function sinFinalizacion(e) {
  for (const dir of carpetas(e)) assert.equal(fs.existsSync(path.join(dir, 'manifiesto.json')), false);
}

// Reconstrucción independiente, verificando ruta, bytes, hash y cardinalidad.
function reconstruir(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifiesto.json'), 'utf8'));
  assert.equal(m.version, 2);
  assert.equal(m.estado, 'COMPLETO');
  const resultado = new Map(), files = new Set(), counts = new Map();
  for (const d of m.documentos) {
    assert.match(d.archivo, /^documentos\/[0-9]{12}\.json$/);
    assert.equal(files.has(d.archivo), false); files.add(d.archivo);
    const b = fs.readFileSync(path.join(dir, d.archivo));
    assert.equal(b.length, d.bytes);
    assert.equal(createHash('sha256').update(b).digest('hex'), d.sha256);
    const value = JSON.parse(b.toString('utf8'));
    assert.equal(value.ruta, d.ruta);
    assert.equal(resultado.has(value.ruta), false);
    resultado.set(value.ruta, value.datos);
    const col = value.ruta.split('/').slice(0, -1).join('/');
    counts.set(col, (counts.get(col) || 0) + 1);
  }
  assert.equal(m.totalDocumentos, resultado.size);
  for (const [col, n] of Object.entries(m.colecciones)) assert.equal(counts.get(col) || 0, n);
  const b = fs.readFileSync(path.join(dir, m.resumen.archivo));
  assert.equal(b.length, m.resumen.bytes);
  assert.equal(createHash('sha256').update(b).digest('hex'), m.resumen.sha256);
  assert.equal(JSON.parse(b).totalDocumentos, resultado.size);
  return resultado;
}

test('rutas completas: dos clientes, pagos homónimos, anidación, delimitadores, Unicode y nombres reservados', async (t) => {
  const e = await backup(t), db = fakeDb();
  const r = await e.run(db);
  assert.equal(r.resumen.totalDocumentos, Object.keys(fixtures).length);
  assert.deepEqual(Object.fromEntries(reconstruir(r.outDir)), fixtures);
  assert.equal(r.resumen.colecciones['clientes/a/vacia'], 0);
  assert.ok(db.calls.includes('subcolecciones:clientes/a/pagos/igual/items/x'));
  assert.equal(e.logs.length + e.errors.length, 0);
});

test('ejecuciones repetidas y simultáneas no reutilizan carpetas ni modifican históricos', async (t) => {
  const e = await backup(t);
  const old = path.join(e.root, 'backups', 'firestore_2026-10-18_1500');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'clientes--pagos.json'), 'HISTORICO_FICTICIO_NO_TOCAR');
  const [a, b] = await Promise.all([e.run(), e.run()]);
  assert.notEqual(a.outDir, b.outDir);
  assert.deepEqual(reconstruir(a.outDir), reconstruir(b.outDir));
  assert.equal(fs.readFileSync(path.join(old, 'clientes--pagos.json'), 'utf8'), 'HISTORICO_FICTICIO_NO_TOCAR');
});

for (const fallo of ['raiz', 'documentos:clientes', 'leer:clientes/a', 'subcolecciones:clientes/a']) {
  test('fallo de lectura/enumeración ' + fallo + ' impide finalización', async (t) => {
    const e = await backup(t);
    await assert.rejects(e.run(fakeDb(fixtures, (op) => op === fallo)), /Fallo ficticio/);
    sinFinalizacion(e);
  });
}

test('padre inexistente con subcolecciones aborta explícitamente, sin éxito incompleto', async (t) => {
  const e = await backup(t);
  await assert.rejects(e.run(fakeDb({ 'clientes/a/pagos/igual': { monto: 10 } })), /Documento ausente/);
  sinFinalizacion(e);
});

test('documento desaparecido durante lectura no se omite silenciosamente', async (t) => {
  const e = await backup(t);
  await assert.rejects(e.run(fakeDb({ 'clientes/a': null })), /Documento ausente/);
  sinFinalizacion(e);
});

test('enumeración duplicada o ruta inconsistente falla sin sobrescribir', async (t) => {
  for (const duplicate of [false, true]) {
    const e = await backup(t), db = fakeDb();
    const cols = await db.listCollections();
    db.listCollections = async () => duplicate ? [cols[0], cols[0]] : [{ ...cols[0], path: 'otra-ruta' }];
    await assert.rejects(e.run(db), /Ruta de colección/);
    sinFinalizacion(e);
  }
});

// Fallos reales del filesystem interpuestos sobre un directorio temporal.
for (const etapa of ['mkdirSync', 'mkdtempSync', 'openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'resumen', 'preparado', 'linkSync']) {
  test('fallo de escritura/publicación ' + etapa + ' no publica manifiesto completo', async (t) => {
    const fds = new Map(); let fired = false;
    const io = new Proxy(fs, { get(target, key) {
      if (typeof target[key] !== 'function') return target[key];
      return (...args) => {
        const file = key === 'openSync' ? String(args[0]) : (fds.get(args[0]) || '');
        const selected = key === etapa || (key === 'writeFileSync' && ((etapa === 'resumen' && file.endsWith('resumen.json')) || (etapa === 'preparado' && file.endsWith('manifiesto.preparado.json'))));
        if (!fired && selected) {
          fired = true;
          if (key === 'writeFileSync') fs.writeSync(args[0], Buffer.from('{"parcial":'));
          if (key === 'closeSync') fs.closeSync(args[0]);
          throw new Error('Fallo ficticio de filesystem');
        }
        const value = target[key](...args);
        if (key === 'openSync') fds.set(value, String(args[0]));
        return value;
      };
    } });
    const e = await backup(t, { io });
    await assert.rejects(e.run(), /Fallo ficticio de filesystem/);
    assert.equal(fired, true);
    sinFinalizacion(e);
  });
}

test('publicación exclusiva no reemplaza un manifiesto que ya existe', async (t) => {
  const io = new Proxy(fs, { get(target, key) {
    if (key !== 'linkSync') return target[key];
    return (from, to) => { fs.writeFileSync(to, 'DESTINO_FICTICIO_NO_TOCAR', { flag: 'wx' }); fs.linkSync(from, to); };
  } });
  const e = await backup(t, { io });
  await assert.rejects(e.run(), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(path.join(carpetas(e)[0], 'manifiesto.json'), 'utf8'), 'DESTINO_FICTICIO_NO_TOCAR');
});

test('lecturas incompletas no impiden reintentar en otra carpeta', async (t) => {
  const e = await backup(t);
  await assert.rejects(e.run(fakeDb(fixtures, (op) => op === 'subcolecciones:clientes/a')));
  const incomplete = carpetas(e)[0];
  const r = await e.run();
  assert.notEqual(r.outDir, incomplete);
  assert.equal(fs.existsSync(path.join(incomplete, 'manifiesto.json')), false);
  assert.deepEqual(Object.fromEntries(reconstruir(r.outDir)), fixtures);
});

test('alteración o truncado de un documento se detecta al reconstruir', async (t) => {
  const e = await backup(t), r = await e.run();
  fs.appendFileSync(path.join(r.outDir, r.manifiesto.documentos[0].archivo), 'ALTERADO_FICTICIO');
  assert.throws(() => reconstruir(r.outDir));
});

test('valores no representables no se convierten silenciosamente a null ni se omiten', async (t) => {
  for (const value of [NaN, Infinity, undefined, 1n]) {
    const e = await backup(t);
    await assert.rejects(e.run(fakeDb({ 'clientes/a': { value } })), /representable/);
    sinFinalizacion(e);
  }
});

test('representación legada de Timestamp y referencias se conserva, sin prometer restauración tipada', async (t) => {
  const e = await backup(t);
  const r = await e.run(fakeDb({ 'clientes/a': {
    fecha: { toDate: () => new Date('2026-10-18T00:00:00.000Z') },
    referencia: { path: 'clientes/b', firestore: {} }
  } }));
  assert.deepEqual(reconstruir(r.outDir).get('clientes/a'), { fecha: '2026-10-18T00:00:00.000Z', referencia: { __ref: 'clientes/b' } });
});

for (const falla of [false, true]) {
  test('ejecutable de respaldo ' + (falla ? 'fallido: salida no exitosa sin afirmar integridad' : 'exitoso: solo anuncia completo tras publicar'), async (t) => {
    const db = fakeDb(fixtures, (op) => falla && op === 'subcolecciones:clientes/a');
    const admin = { credential: { cert: () => ({ ficticio: true }) }, initializeApp() {}, firestore: () => db };
    const e = entorno(t, { cli: true, admin });
    const credencial = path.join(e.root, 'credencial-ficticia.json');
    fs.writeFileSync(credencial, JSON.stringify({ project_id: 'konfio-zinc', private_key: PASSWORD }));
    e.process.env.KZ_SERVICE_ACCOUNT = credencial;
    await e.cargar('respaldar-firestore.js');
    assert.equal(e.process.exitCode, falla ? 1 : 0);
    assert.equal(e.logs.join('\n').includes('Backup completo'), !falla);
    assert.equal([...e.logs, ...e.errors].join('\n').includes(PASSWORD), false);
    if (falla) sinFinalizacion(e);
    else assert.deepEqual(Object.fromEntries(reconstruir(carpetas(e)[0])), fixtures);
  });
}

test('base ficticia vacía se representa explícitamente con cero documentos', async (t) => {
  const e = await backup(t), r = await e.run(fakeDb({}));
  assert.equal(reconstruir(r.outDir).size, 0);
  assert.equal(r.manifiesto.totalDocumentos, 0);
});

test('permisos locales POSIX restringen carpeta y archivos; no usa credenciales al importarse', async (t) => {
  const e = await backup(t), r = await e.run();
  assert.equal(fs.statSync(r.outDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(r.outDir, r.manifiesto.documentos[0].archivo)).mode & 0o777, 0o600);
});

function fakeAdmin({ existing = false, failAt = '', configExists = false } = {}) {
  const calls = [], writes = [];
  const fault = () => { throw new Error('Error ficticio que incluye ' + PASSWORD); };
  const firestore = () => ({ doc(ruta) { return {
    async set(data, options) { calls.push('set:' + ruta); if (failAt === ruta || failAt === 'escritura') fault(); writes.push({ ruta, data, options }); },
    async get() { calls.push('get:' + ruta); if (failAt === 'configuracion') fault(); return { exists: configExists }; }
  }; } });
  firestore.FieldValue = { serverTimestamp: () => 'TIMESTAMP_FICTICIO' };
  return { calls, writes, credential: { cert: () => ({ ficticio: true }) },
    initializeApp() { if (failAt === 'inicializar') fault(); }, firestore,
    auth: () => ({
      async getUserByEmail(email) {
        calls.push('getUser:' + email);
        if (failAt === 'buscar') fault();
        if (existing) return { uid: 'uid-ficticio' };
        const error = new Error('Usuario ficticio ausente'); error.code = 'auth/user-not-found'; throw error;
      },
      async createUser(data) { calls.push('createUser'); if (failAt === 'crear') fault(); assert.equal(data.password, PASSWORD); return { uid: 'uid-ficticio' }; }
    })
  };
}

for (const existing of [false, true]) {
  test('administrador ' + (existing ? 'existente' : 'nuevo') + ': comportamiento conservado sin secretos en salidas', async (t) => {
    const admin = fakeAdmin({ existing });
    const e = entorno(t, { cli: true, admin, argv: ['administrador@example.invalid', PASSWORD] });
    await e.cargar('crear-superadmin.js');
    assert.equal(e.process.exitCode, 0);
    assert.equal(admin.calls.includes('createUser'), !existing);
    const user = admin.writes.find((w) => w.ruta === 'usuarios/uid-ficticio');
    assert.equal(user.data.rol, 'SUPERADMIN');
    assert.equal(user.data.activo, true);
    assert.equal(user.data.email, 'administrador@example.invalid');
    assert.equal(user.options.merge, true);
    assert.equal(admin.writes.filter((w) => w.ruta.startsWith('planes/')).length, 6);
    assert.equal(admin.writes.filter((w) => w.ruta.startsWith('configuracion/')).length, 5);
    assert.equal(JSON.stringify(admin.writes).includes(PASSWORD), false);
    assert.equal([...e.logs, ...e.errors].join('\n').includes(PASSWORD), false);
    assert.equal(e.errors.length, 0);
  });
}

for (const failAt of ['inicializar', 'buscar', 'crear', 'usuarios/uid-ficticio', 'planes/star', 'configuracion']) {
  test('error administrativo en ' + failAt + ' no filtra mensaje del SDK con contraseña ficticia', async (t) => {
    const admin = fakeAdmin({ failAt });
    const e = entorno(t, { cli: true, admin, env: { ADMIN_PASSWORD: PASSWORD }, argv: ['administrador@example.invalid'] });
    await e.cargar('crear-superadmin.js');
    assert.equal(e.process.exitCode, 1);
    assert.equal(e.errors.length, 1);
    assert.equal([...e.logs, ...e.errors].join('\n').includes(PASSWORD), false);
    assert.equal([...e.logs, ...e.errors].join('\n').includes('Error ficticio'), false);
  });
}

test('contraseña por entorno y usuario existente conservan configuración preexistente', async (t) => {
  const admin = fakeAdmin({ existing: true, configExists: true });
  const e = entorno(t, { cli: true, admin, env: { ADMIN_PASSWORD: PASSWORD }, argv: ['administrador@example.invalid'] });
  await e.cargar('crear-superadmin.js');
  assert.equal(e.process.exitCode, 0);
  assert.equal(admin.writes.some((w) => w.ruta.startsWith('configuracion/')), false);
  assert.equal([...e.logs, ...e.errors].join('\n').includes(PASSWORD), false);
});

test('ausencia de contraseña impide consultar/crear usuarios o sembrar datos', async (t) => {
  const admin = fakeAdmin(), e = entorno(t, { cli: true, admin });
  await e.cargar('crear-superadmin.js');
  assert.equal(e.process.exitCode, 1);
  assert.deepEqual(admin.calls, []);
  assert.deepEqual(admin.writes, []);
});
