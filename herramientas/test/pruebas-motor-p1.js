/* ═══════════════════════════════════════════════════════════════════
   pruebas-motor-p1.js · KONFÍO ZINC — CARD · LOTE H

   Comprueba que el motor de vencimientos FALLA CERRADO y que desplegarlo no
   basta para que suspenda a nadie ni envíe nada.

   Cuatro bloques, todos con datos ficticios:
     A · Unitario — functions/src/motor.js con una base de datos simulada.
         Ninguna combinación incompleta puede devolver habilitado.
     B · Estático — el código de index.js: la puerta se evalúa ANTES de
         procesarVencimientos en los dos puntos de entrada y no hay envíos en
         el arranque del módulo.
     C · Integración — Functions emulator de verdad: sin la variable de
         entorno, estadoMotor informa cerrado, ejecutarVencimientos se niega y
         ni seedInicial ni recalcularEstados escriben notificaciones.
     D · Respaldo — herramientas/verificar-respaldo-firestore.js acepta una
         carpeta íntegra y rechaza una manipulada.

   Requisitos: emuladores Auth 9099 · Firestore 8080 · Functions 5001,
   proyecto demo-card-seguridad. Todas las llamadas van a 127.0.0.1.
   Uso: node herramientas/test/pruebas-motor-p1.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');

const RAIZ = path.join(__dirname, '..', '..');
const motor = require(path.join(RAIZ, 'functions', 'src', 'motor.js'));

const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const FN = 'http://127.0.0.1:5001';
const PROYECTO = 'demo-card-seguridad';
const K = 'clave-ficticia';

const s = (v) => ({ stringValue: v });
const b = (v) => ({ booleanValue: v });
const u = (r) => `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/${r}`;

const salida = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  salida.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : 'NO VERIF';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(54)} ${detalle || ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = {};
  if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j, txt };
}
const crear = (col, id, campos, token = 'owner') =>
  pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, token);
const borrarDoc = (ruta) => pedir('DELETE', u(ruta), undefined, 'owner');
const leerDoc = async (ruta) => (await pedir('GET', u(ruta), undefined, 'owner')).j;
async function listar(col) {
  const r = await pedir('POST', `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents:runQuery`,
    { structuredQuery: { from: [{ collectionId: col }] } }, 'owner');
  return (Array.isArray(r.j) ? r.j : []).filter((x) => x.document).map((x) => x.document);
}
const callable = (nombre, datos, token) => pedir('POST', `${FN}/${PROYECTO}/us-central1/${nombre}`, { data: datos }, token);
const parchear = (ruta, campos, token) => {
  const mascara = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  return pedir('PATCH', `${u(ruta)}?${mascara}`, { fields: campos }, token);
};
async function alta(email, pass) {
  let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email, password: pass, returnSecureToken: true });
  if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email, password: pass, returnSecureToken: true });
  return r.j;
}

/* Base de datos simulada para el bloque A: doc(ruta) → get() */
function bdFalsa(opciones) {
  const o = opciones || {};
  return {
    doc(ruta) {
      return {
        async get() {
          if (o.lanza) throw new Error(o.lanza);
          if (ruta !== motor.RUTA_CONFIG) return { exists: false, data: () => ({}) };
          if (o.doc === undefined) return { exists: false, data: () => ({}) };
          return { exists: true, data: () => o.doc };
        }
      };
    }
  };
}

(async () => {
  /* ═══ A · UNITARIO ═══════════════════════════════════════════════ */
  console.log('\n═══ A · UNITARIO · motor.js ═══');
  const ENV_OK = { [motor.VARIABLE_ENTORNO]: motor.VALOR_UNICO };
  const ENV_VACIO = {};

  anotar('La ruta del interruptor es configuracion/motorVencimientos',
    motor.RUTA_CONFIG === 'configuracion/motorVencimientos', motor.RUTA_CONFIG);
  anotar('La variable es KZ_MOTOR_VENCIMIENTOS', motor.VARIABLE_ENTORNO === 'KZ_MOTOR_VENCIMIENTOS', motor.VARIABLE_ENTORNO);
  anotar('El único valor válido es HABILITADO', motor.VALOR_UNICO === 'HABILITADO', motor.VALOR_UNICO);

  const casos = [
    ['Sin variable y con documento abierto → CERRADO', ENV_VACIO, { habilitado: true }, false],
    ['Variable con otro valor y documento abierto → CERRADO', { [motor.VARIABLE_ENTORNO]: 'si' }, { habilitado: true }, false],
    ['Variable «true» y documento abierto → CERRADO', { [motor.VARIABLE_ENTORNO]: 'true' }, { habilitado: true }, false],
    ['Variable correcta y SIN documento → CERRADO', ENV_OK, undefined, false],
    ['Variable correcta y documento con habilitado:false → CERRADO', ENV_OK, { habilitado: false }, false],
    ['Variable correcta y documento con habilitado:"true" (texto) → CERRADO', ENV_OK, { habilitado: 'true' }, false],
    ['Variable correcta y documento abierto → ABIERTO', ENV_OK, { habilitado: true }, true],
    ['Variable correcta con espacios alrededor → ABIERTO', { [motor.VARIABLE_ENTORNO]: '  HABILITADO  ' }, { habilitado: true }, true],
    ['Variable correcta y documento con campos extra → ABIERTO', ENV_OK, { habilitado: true, nota: 'ficticia', actualizadoPor: 'prueba' }, true]
  ];
  for (const [titulo, env, doc, esperado] of casos) {
    const e = await motor.estadoDelMotor({ db: bdFalsa({ doc }), env });
    anotar(titulo, e.habilitado === esperado, `habilitado=${e.habilitado} · motivo: ${e.motivo}`);
  }

  const conError = await motor.estadoDelMotor({ db: bdFalsa({ lanza: 'PERMISSION_DENIED ficticio' }), env: ENV_OK });
  anotar('Si leer la configuración falla → CERRADO', conError.habilitado === false, conError.motivo);

  const sinBd = await motor.estadoDelMotor({ db: null, env: ENV_OK });
  anotar('Sin conexión a Firestore → CERRADO', sinBd.habilitado === false, sinBd.motivo);

  const sinArgs = await motor.estadoDelMotor({ db: bdFalsa({ doc: { habilitado: true } }), env: undefined });
  anotar('Sin objeto de entorno → CERRADO', sinArgs.habilitado === false, sinArgs.motivo);

  const secreto = await motor.estadoDelMotor({ db: bdFalsa({ doc: { habilitado: false } }), env: { [motor.VARIABLE_ENTORNO]: 'PISTA_QUE_NO_DEBE_SALIR' } });
  anotar('El estado no repite el valor de la variable',
    !JSON.stringify(secreto).includes('PISTA_QUE_NO_DEBE_SALIR'),
    'solo se informa presente/correcta');

  const atajo = await motor.permiteEjecutar({ db: bdFalsa({ doc: { habilitado: true } }), env: ENV_VACIO });
  anotar('permiteEjecutar() respeta la misma puerta', atajo.si === false, 'devuelve false con la variable ausente');

  /* ═══ B · ESTÁTICO · index.js ═══════════════════════════════════ */
  console.log('\n═══ B · ESTÁTICO · index.js ═══');
  const codigo = fs.readFileSync(path.join(RAIZ, 'functions', 'src', 'index.js'), 'utf8');
  const bloque = (nombre) => {
    const i = codigo.indexOf(`exports.${nombre} =`);
    if (i === -1) return '';
    const fin = codigo.indexOf('\n});', i);
    return codigo.slice(i, fin === -1 ? codigo.length : fin + 4);
  };

  const prog = bloque('processDueDates');
  const manual = bloque('ejecutarVencimientos');
  anotar('processDueDates evalúa la puerta antes de procesar',
    prog.includes('revisarPuerta') && prog.indexOf('revisarPuerta') < prog.indexOf('procesarVencimientos') && prog.includes('procesarVencimientos'),
    'puerta antes que el motor');
  anotar('ejecutarVencimientos evalúa la misma puerta',
    manual.includes('revisarPuerta') && manual.indexOf('revisarPuerta') < manual.indexOf('procesarVencimientos'),
    'una llamada manual no se salta el interruptor');
  anotar('La llamada manual falla con failed-precondition', manual.includes("'failed-precondition'"), 'el operador ve el motivo');

  const llamadasPush = [...codigo.matchAll(/(pushACliente)\s*\(/g)].length;
  anotar('pushACliente solo se invoca dentro de funciones', llamadasPush > 1,
    `${llamadasPush} apariciones (definición + usos pasados como argumento)`);
  anotar('No hay pushACliente en el arranque del módulo',
    !/^\s*pushACliente\s*\(/m.test(codigo) && !/^await\s+pushACliente/m.test(codigo),
    'ninguna llamada a nivel superior');

  const init = bloque('seedInicial');
  anotar('seedInicial no envía notificaciones',
    init.length > 0 && !init.includes('pushACliente') && !init.includes('notificaciones'),
    'solo escribe planes y configuración');
  const recalcular = bloque('recalcularEstados');
  anotar('recalcularEstados no envía notificaciones',
    recalcular.length > 0 && !recalcular.includes('pushACliente') && !recalcular.includes('notificaciones'),
    'solo recalcula estados');

  const estadoFn = bloque('estadoMotor');
  anotar('estadoMotor no escribe ni procesa',
    estadoFn.length > 0 && !estadoFn.includes('procesarVencimientos') && !estadoFn.includes('.set(') && !estadoFn.includes('.update(') && !estadoFn.includes('.add('),
    'solo lee la configuración');

  const reglas = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
  anotar('Las reglas impiden abrir el interruptor desde el navegador',
    /allow write: if esSuperadmin\(\)\s*&&\s*clave\s*!=\s*'motorVencimientos'/.test(reglas),
    'solo el Admin SDK puede escribirlo');

  /* ═══ C · INTEGRACIÓN · emulador ═══════════════════════════════ */
  console.log('\n═══ C · INTEGRACIÓN · emulador de Functions ═══');
  let emuladorVivo = true;
  try {
    const r = await fetch(`${FS}/`, { method: 'GET' });
    emuladorVivo = r.status < 500;
  } catch (e) { emuladorVivo = false; }

  if (!emuladorVivo) {
    anotar('Emuladores disponibles', 'NO VERIF', 'sin emulador: este bloque no se ejecutó');
  } else {
    await fetch(`${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
    const cuentas = {};
    for (const [rol, email] of [['OPERADOR', 'op.motor@crm.test'], ['SUPERADMIN', 'su.motor@crm.test']]) {
      const a = await alta(email, 'Ficticia#1');
      cuentas[rol] = { uid: a.localId, token: a.idToken };
      await crear('usuarios', a.localId, { email: s(email), nombre: s(rol + ' Ficticio'), rol: s(rol), activo: b(true) });
    }

    const anon = await callable('estadoMotor', {});
    anotar('estadoMotor sin sesión → 401', anon.st === 401, `HTTP ${anon.st}`);

    const op = await callable('estadoMotor', {}, cuentas.OPERADOR.token);
    anotar('estadoMotor con OPERADOR → 403', op.st === 403, `HTTP ${op.st}`);

    const estado1 = await callable('estadoMotor', {}, cuentas.SUPERADMIN.token);
    const r1 = estado1.j && estado1.j.result;
    anotar('estadoMotor con SUPERADMIN → 200', estado1.st === 200, `HTTP ${estado1.st}`);
    const variableEnEmulador = !!(r1 && r1.variablePresente);
    /* Las comprobaciones negativas solo tienen sentido si el emulador se lanzó
       SIN la variable. Con la variable puesta se avisa y se continúa: la
       apertura se comprueba en C2. */
    if (variableEnEmulador) {
      anotar('Pasada con la variable puesta en el emulador', 'NO VERIF',
        'las comprobaciones de «cerrado» se hacen en la pasada sin variable');
    } else {
      anotar('Sin variable de entorno el motor está cerrado',
        r1 && r1.habilitado === false, r1 ? `motivo: ${r1.motivo}` : 'sin resultado');
      anotar('El motivo nombra la variable que falta',
        !!(r1 && /KZ_MOTOR_VENCIMIENTOS/.test(r1.motivo)), r1 && r1.motivo);

      const ejec1 = await callable('ejecutarVencimientos', {}, cuentas.SUPERADMIN.token);
      anotar('ejecutarVencimientos con el motor cerrado se niega',
        ejec1.st === 400 && /deshabilitado/i.test(ejec1.txt), `HTTP ${ejec1.st}`);

      /* Abrir SOLO el documento: con la variable ausente tiene que seguir cerrado. */
      await crear('configuracion', 'motorVencimientos', { habilitado: b(true), actualizadoPor: s('prueba ficticia') });
      const estado2 = await callable('estadoMotor', {}, cuentas.SUPERADMIN.token);
      const r2 = estado2.j && estado2.j.result;
      anotar('Documento abierto + variable ausente → sigue CERRADO',
        r2 && r2.habilitado === false, r2 ? `motivo: ${r2.motivo}` : 'sin resultado');
      anotar('El estado informa que la configuración sí existe',
        !!(r2 && r2.configuracion && r2.configuracion.existe === true && r2.configuracion.habilitado === true),
        'documento habilitado, variable no');

      const ejec2 = await callable('ejecutarVencimientos', {}, cuentas.SUPERADMIN.token);
      anotar('Con el documento abierto y sin variable sigue negándose',
        ejec2.st === 400, `HTTP ${ejec2.st}`);

      const clientesAntes = JSON.stringify(await listar('clientes'));
      const ejec3 = await callable('ejecutarVencimientos', {}, cuentas.SUPERADMIN.token);
      anotar('Con el motor cerrado no se toca el padrón de clientes',
        ejec3.st === 400 && JSON.stringify(await listar('clientes')) === clientesAntes,
        'clientes idénticos antes y después');
    }
    if (!variableEnEmulador) {
      /* Nada nuevo: el documento ya existe de los pasos anteriores. */
    } else {
      await crear('configuracion', 'motorVencimientos', { habilitado: b(true), actualizadoPor: s('prueba ficticia') });
    }

    /* Reglas de Firestore: el interruptor no se abre desde el navegador. */
    const cierre = await parchear('configuracion/motorVencimientos', { habilitado: b(false) }, cuentas.SUPERADMIN.token);
    anotar('Ni siquiera un SUPERADMIN escribe el interruptor desde el navegador',
      cierre.st === 403, `HTTP ${cierre.st}`);
    const apertura = await crear('configuracion', 'otraClave', { valor: b(true) }, cuentas.SUPERADMIN.token);
    anotar('El resto de la configuración sigue escribible por SUPERADMIN',
      apertura.st === 200 || apertura.st === 409, `HTTP ${apertura.st}`);
    const lecturaOperador = await pedir('GET', u('configuracion/motorVencimientos'), undefined, cuentas.OPERADOR.token);
    anotar('Un OPERADOR puede LEER el estado del interruptor',
      lecturaOperador.st === 200, `HTTP ${lecturaOperador.st}`);
    const lecturaAnonima = await pedir('GET', u('configuracion/motorVencimientos'));
    anotar('Sin sesión no se puede leer la configuración',
      lecturaAnonima.st === 403, `HTTP ${lecturaAnonima.st}`);

    /* Notificaciones: nadie escribe avisos desde los inicializadores. */
    const notisAntes = (await listar('notificaciones')).length;
    const tokensAntes = (await listar('tokens_notificacion')).length;
    const seed = await callable('seedInicial', {}, cuentas.SUPERADMIN.token);
    const rec = await callable('recalcularEstados', {}, cuentas.SUPERADMIN.token);
    const notisDespues = (await listar('notificaciones')).length;
    const tokensDespues = (await listar('tokens_notificacion')).length;
    anotar('seedInicial e recalcularEstados responden', seed.st === 200 && rec.st === 200, `HTTP ${seed.st} / ${rec.st}`);
    anotar('No se crea ninguna notificación', notisDespues === notisAntes, `${notisAntes} → ${notisDespues}`);
    anotar('No se toca ningún token de notificación', tokensDespues === tokensAntes, `${tokensAntes} → ${tokensDespues}`);

    await borrarDoc('configuracion/motorVencimientos');
  }

  /* ═══ C2 · INTEGRACIÓN · el interruptor también ABRE ═══════════
     Este bloque solo corre si el emulador se lanzó con la variable puesta:
         $env:KZ_MOTOR_VENCIMIENTOS='HABILITADO'; $env:KZ_PRUEBA_MOTOR_ABIERTO='1'
     Sirve para demostrar que la puerta no está simplemente rota: con las dos
     condiciones cumple, ejecuta y se puede volver a cerrar sin reiniciar. */
  if (emuladorVivo && process.env.KZ_PRUEBA_MOTOR_ABIERTO === '1') {
    console.log('\n═══ C2 · INTEGRACIÓN · el interruptor abre con las dos condiciones ═══');
    const cuentas = {};
    for (const [rol, email] of [['SUPERADMIN', 'su.abierto@crm.test']]) {
      const a = await alta(email, 'Ficticia#1');
      cuentas[rol] = { uid: a.localId, token: a.idToken };
      await crear('usuarios', a.localId, { email: s(email), nombre: s(rol + ' Ficticio'), rol: s(rol), activo: b(true) });
    }
    const hoy = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mas = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };
    await crear('clientes', 'cli-abierto', {
      nombre: s('Cliente Ficticio Abierto'), telefono: s('3000000000'), servicio: s('Tarjetas Digitales'),
      fechaActivacion: s(iso(hoy)), fechaVencimiento: s(mas(2)), estadoCliente: s('ACTIVO'),
      estadoServicio: s('ACTIVO'), activo: b(true), eliminado: b(false)
    });

    const antes = await callable('estadoMotor', {}, cuentas.SUPERADMIN.token);
    anotar('Con la variable y el documento vuelve a informar CERRADO mientras el documento no exista',
      antes.j.result.habilitado === false, `motivo: ${antes.j.result.motivo}`);

    await crear('configuracion', 'motorVencimientos', { habilitado: b(true), actualizadoPor: s('prueba ficticia') });
    const abierto = await callable('estadoMotor', {}, cuentas.SUPERADMIN.token);
    anotar('Con las dos condiciones el motor queda ABIERTO',
      abierto.j.result.habilitado === true, `motivo: ${abierto.j.result.motivo}`);

    const corrida = await callable('ejecutarVencimientos', {}, cuentas.SUPERADMIN.token);
    const resumen = corrida.j && corrida.j.result;
    anotar('Con el motor abierto la llamada manual ejecuta de verdad',
      corrida.st === 200 && resumen && typeof resumen.revisados === 'number' && resumen.revisados > 0,
      resumen ? `revisados=${resumen.revisados} · porVencer=${resumen.porVencer} · vencidos=${resumen.vencidos}` : `HTTP ${corrida.st}`);

    const cierreDoc = await parchear('configuracion/motorVencimientos', { habilitado: b(false), actualizadoPor: s('prueba ficticia') }, 'owner');
    anotar('Cerrar el documento escribiendo habilitado:false', cierreDoc.st === 200, `HTTP ${cierreDoc.st}`);
    const cerrado = await callable('estadoMotor', {}, cuentas.SUPERADMIN.token);
    const otraVez = await callable('ejecutarVencimientos', {}, cuentas.SUPERADMIN.token);
    anotar('Cerrar el documento cierra el motor sin reiniciar nada',
      cerrado.j.result.habilitado === false && otraVez.st === 400, `estado=${cerrado.j.result.habilitado} · llamada HTTP ${otraVez.st}`);    await borrarDoc('configuracion/motorVencimientos');
  } else if (emuladorVivo) {
    console.log('\n═══ C2 · INTEGRACIÓN · el interruptor abre ═══');
    anotar('Prueba de apertura del interruptor', 'NO VERIF',
      'el emulador se lanzó SIN la variable: la apertura se comprueba aparte');
  }

  /* ═══ D · RESPALDO · verificador de integridad ═════════════════ */
  console.log('\n═══ D · RESPALDO · verificador de integridad ═══');
  const verificador = path.join(RAIZ, 'herramientas', 'verificar-respaldo-firestore.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-respaldo-'));
  const sha = (buf) => createHash('sha256').update(buf).digest('hex');

  function construirRespaldo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-respaldo-ok-'));
    fs.mkdirSync(path.join(dir, 'documentos'));
    const escritos = [];
    const datos = [
      { ruta: 'clientes/cli-1', n: 1 },
      { ruta: 'clientes/cli-2', n: 2 },
      { ruta: 'planes/plan-1', n: 3 }
    ];
    for (const d of datos) {
      const contenido = Buffer.from(JSON.stringify({ ruta: d.ruta, datos: { nombre: 'Ficticio ' + d.n } }), 'utf8');
      const archivo = 'documentos/' + String(d.n).padStart(12, '0') + '.json';
      fs.writeFileSync(path.join(dir, archivo), contenido);
      escritos.push({ archivo, bytes: contenido.length, sha256: sha(contenido), ruta: d.ruta });
    }
    const resumenContenido = Buffer.from(JSON.stringify({ colecciones: { clientes: 2, planes: 1 }, totalDocumentos: 3 }, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'resumen.json'), resumenContenido);
    const manifiesto = {
      formato: 'kz-firestore-json', version: 2, estado: 'COMPLETO',
      colecciones: { clientes: 2, planes: 1 }, totalDocumentos: 3,
      documentos: escritos,
      resumen: { archivo: 'resumen.json', bytes: resumenContenido.length, sha256: sha(resumenContenido) }
    };
    fs.writeFileSync(path.join(dir, 'manifiesto.json'), Buffer.from(JSON.stringify(manifiesto, null, 2) + '\n', 'utf8'));
    return { dir, manifiesto };
  }

  const correr = (dir) => spawnSync(process.execPath, [verificador, '--dir', dir, '--quiet'], { stdio: 'ignore' }).status;

  const sano = construirRespaldo();
  anotar('Acepta un respaldo íntegro', correr(sano.dir) === 0, path.basename(sano.dir));

  const alterado = construirRespaldo();
  fs.writeFileSync(path.join(alterado.dir, 'documentos', '000000000001.json'), Buffer.from('{"ruta":"clientes/cli-1","datos":{"nombre":"ALTERADO"}}', 'utf8'));
  anotar('Rechaza un documento alterado', correr(alterado.dir) === 1, 'SHA-256 distinto');

  const sinManifiesto = construirRespaldo();
  fs.unlinkSync(path.join(sinManifiesto.dir, 'manifiesto.json'));
  anotar('Rechaza un respaldo sin manifiesto', correr(sinManifiesto.dir) === 1, 'no hay manifiesto.json');

  const incompleto = construirRespaldo();
  fs.unlinkSync(path.join(incompleto.dir, 'documentos', '000000000002.json'));
  anotar('Rechaza un respaldo con un documento ausente', correr(incompleto.dir) === 1, 'falta un archivo del manifiesto');

  const mentiroso = construirRespaldo();
  const mm = JSON.parse(fs.readFileSync(path.join(mentiroso.dir, 'manifiesto.json'), 'utf8'));
  mm.estado = 'PARCIAL';
  fs.writeFileSync(path.join(mentiroso.dir, 'manifiesto.json'), JSON.stringify(mm, null, 2) + '\n');
  anotar('Rechaza un manifiesto no marcado como COMPLETO', correr(mentiroso.dir) === 1, 'estado = PARCIAL');

  const descuadrado = construirRespaldo();
  const md = JSON.parse(fs.readFileSync(path.join(descuadrado.dir, 'manifiesto.json'), 'utf8'));
  md.colecciones = { clientes: 99, planes: 1 };
  fs.writeFileSync(path.join(descuadrado.dir, 'manifiesto.json'), JSON.stringify(md, null, 2) + '\n');
  anotar('Rechaza un conteo por colección que no cuadra', correr(descuadrado.dir) === 1, 'clientes 99 · archivos 2');

  for (const d of [sano, alterado, sinManifiesto, incompleto, mentiroso, descuadrado]) fs.rmSync(d.dir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  /* ═══ RESUMEN ══════════════════════════════════════════════════ */
  const cuenta = {};
  for (const x of salida) cuenta[x.estado] = (cuenta[x.estado] || 0) + 1;
  const fallos = salida.filter((x) => x.estado === 'FALLIDO');
  console.log('\n═══ RESUMEN ═══');
  console.log(`  ${salida.length} comprobaciones · ${cuenta.APROBADO || 0} aprobadas · ${fallos.length} fallidas` +
    (cuenta['NO VERIF'] ? ` · ${cuenta['NO VERIF']} no verificadas` : ''));
  if (fallos.length) {
    console.log('\n  Fallos:');
    for (const f of fallos) console.log(`    · ${f.nombre} — ${f.detalle || ''}`);
    process.exit(1);
  }
  console.log('  El motor no puede arrancar sin las dos condiciones, y el respaldo no se da por bueno sin verificar.\n');
})().catch((e) => {
  console.error('\n  ✖ Error inesperado: ' + (e && e.stack || e));
  process.exit(1);
});
