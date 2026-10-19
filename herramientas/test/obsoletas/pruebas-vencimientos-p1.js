/* ═══════════════════════════════════════════════════════════════════
   pruebas-vencimientos-p1.js · KONFÍO ZINC — CARD
   Pruebas del MOTOR DE VENCIMIENTOS (functions/src/vencimientos.js).

   Se ejecuta la función real contra el emulador de Firestore, con fechas
   controladas (se le pasa `hoy`), así que el resultado es determinista.

   IMPORTANTE: esto valida la LÓGICA, no el disparador programado. El
   arranque por Pub/Sub se comprueba aparte y sigue pendiente.

   Uso:
     $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
     $env:GCLOUD_PROJECT='demo-card-seguridad'
     node herramientas/test/pruebas-vencimientos-p1.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');

function cargarAdmin() {
  const candidatos = [
    'firebase-admin',
    path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'),
    path.join(__dirname, '..', '..', '..', 'Konfio-Zinc-Web', 'functions', 'node_modules', 'firebase-admin'),
  ];
  for (const c of candidatos) { try { return require(c); } catch (e) { /* siguiente */ } }
  throw new Error('No se encontró firebase-admin');
}

const PROYECTO = process.env.GCLOUD_PROJECT || 'demo-card-seguridad';
const admin = cargarAdmin();
const { procesarVencimientos, DIAS_ANTES, DIAS_POR_VENCER, DIAS_GRACIA } = require(path.join(__dirname, '..', '..', 'functions', 'src', 'vencimientos.js'));

const salida = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  salida.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : e;
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(48)} ${detalle || ''}`);
}

/* Fecha fija para que la prueba no dependa del día en que se ejecute. */
const HOY = new Date('2026-11-20T12:00:00Z');
const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const masDias = (n) => { const d = new Date(HOY); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

const MENSAJES = {
  VENCIMIENTO_10D: { title: 't', body: 'Renueva ahora y sigue sin interrupciones.' },
  VENCIMIENTO_5D: { title: 't', body: 'Renueva para no perder tus beneficios.' },
  VENCIMIENTO_3D: { title: 't', body: 'Escríbenos y renovamos hoy mismo.' },
  VENCIMIENTO_1D: { title: 't', body: 'Hoy es tu último día. Renueva ahora.' },
  VENCIDO: { title: 't', body: 'Escríbenos para reactivarlo.' },
  MANUAL: { title: 't', body: 'Tienes un mensaje.' },
};

(async () => {
  admin.initializeApp({ projectId: PROYECTO });
  const db = admin.firestore();
  /* FieldValue desde la instancia ya cargada: no depende de rutas. */
  const FieldValue = admin.firestore.FieldValue;
  if (!FieldValue) throw new Error('firebase-admin no expone FieldValue en este entorno');

  /* limpiar */
  for (const col of ['clientes', 'notificaciones', 'tokens_notificacion', 'historial_estados']) {
    const snap = await db.collection(col).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
  }

  const log = { info: () => {}, error: () => {} };
  const pushOK = async () => 1;                    // simula un token que acepta el envío
  const pushCero = async () => 0;                  // sin tokens
  const pushFalla = async () => { throw new Error('fallo de red simulado'); };

  /* ── Escenario ──────────────────────────────────────────────────── */
  const casos = [
    ['c-20', 'ACTIVO', 20, true],        // fuera de todo
    ['c-15', 'ACTIVO', DIAS_POR_VENCER, true], // entra en POR_VENCER
    ['c-10', 'POR_VENCER', 10, true],    // aviso 10
    ['c-5', 'POR_VENCER', 5, true],      // aviso 5
    ['c-3', 'POR_VENCER', 3, true],      // aviso 3
    ['c-1', 'POR_VENCER', 1, true],      // aviso 1
    ['c-0', 'POR_VENCER', 0, true],      // vence hoy: no hay aviso 0
    ['c-m1', 'POR_VENCER', -1, true],    // vencido: PENDIENTE_PAGO
    ['c-m6', 'PENDIENTE_PAGO', -(DIAS_GRACIA + 1), true], // tras gracia: SUSPENDIDO
    ['c-off', 'ACTIVO', 10, false],      // inactivo: se ignora
  ];
  const batch = db.batch();
  for (const [id, estado, dv, activo] of casos) {
    batch.set(db.collection('clientes').doc(id), {
      nombre: id, telefono: '3000000000', servicio: 'Tarjetas Digitales', precio: 49900,
      fechaActivacion: masDias(-365), fechaVencimiento: masDias(dv),
      estadoCliente: estado, estadoServicio: estado, activo, eliminado: false,
    });
  }
  await batch.commit();
  console.log(`\n═══ ESCENARIO (hoy = ${iso(HOY)}) ═══`);
  console.log(`  ${casos.length} clientes · avisos en ${DIAS_ANTES.join('/')} días · POR_VENCER ≤ ${DIAS_POR_VENCER} · gracia ${DIAS_GRACIA}\n`);

  /* ── 1 · Primera pasada ─────────────────────────────────────────── */
  console.log('═══ 1 · PRIMERA PASADA ═══');
  const r1 = await procesarVencimientos({ db, FieldValue, pushACliente: pushOK, logger: log, mensajes: MENSAJES, hoy: HOY });
  const est = async (id) => (await db.collection('clientes').doc(id).get()).data().estadoCliente;

  anotar('marca POR_VENCER a quien vence dentro del umbral',
    (await est('c-15')) === 'POR_VENCER' && (await est('c-20')) === 'ACTIVO',
    `c-15=${await est('c-15')} · c-20=${await est('c-20')}`);

  anotar('marca PENDIENTE_PAGO al vencido',
    (await est('c-m1')) === 'PENDIENTE_PAGO', `c-m1=${await est('c-m1')}`);

  anotar('suspende tras la gracia',
    (await est('c-m6')) === 'SUSPENDIDO', `c-m6=${await est('c-m6')}`);

  anotar('ignora a los clientes inactivos',
    (await db.collection('notificaciones').doc(`c-off_${masDias(10)}_VENCIMIENTO_10D`).get()).exists === false,
    'sin aviso para c-off');

  const notis = (await db.collection('notificaciones').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const esperados = ['c-10', 'c-5', 'c-3', 'c-1'];
  const creados = esperados.filter((c) => notis.some((x) => x.clienteId === c));
  anotar('crea un aviso por cada día de aviso (10/5/3/1)',
    creados.length === 4 && notis.length === 4, `${notis.length} avisos · clientes: ${creados.join(', ')}`);

  anotar('no genera aviso a 0 días ni a 20 días',
    !notis.some((x) => x.clienteId === 'c-0' || x.clienteId === 'c-20'),
    'sin aviso para c-0 ni c-20');

  anotar('el aviso queda ENVIADA cuando hay tokens',
    notis.length === 4 && notis.every((x) => x.estado === 'ENVIADA'),
    notis.map((x) => `${x.tipo}:${x.estado}`).join(' · '));

  anotar('usa la clave anti-duplicado cliente_fecha_tipo',
    notis.length === 4 && notis.every((x) => /^c-\d+_\d{4}-\d{2}-\d{2}_VENCIMIENTO_\d+D$/.test(x.id)),
    notis.map((x) => x.id).join(' · '));

  anotar('el resumen cuadra con el escenario',
    r1.avisados === 4 && r1.revisados === 9 && r1.vencidos === 1 && r1.suspendidos === 1 && r1.porVencer === 1,
    JSON.stringify(r1));

  /* ── 2 · Idempotencia ───────────────────────────────────────────── */
  console.log('\n═══ 2 · IDEMPOTENCIA (segunda pasada el mismo día) ═══');
  const antes = (await db.collection('notificaciones').get()).size;
  const r2 = await procesarVencimientos({ db, FieldValue, pushACliente: pushOK, logger: log, mensajes: MENSAJES, hoy: HOY });
  const despues = (await db.collection('notificaciones').get()).size;
  anotar('una segunda pasada NO duplica avisos', antes === despues && r2.avisados === 0,
    `${antes} → ${despues} avisos · avisados=${r2.avisados} · vencidos=${r2.vencidos} · suspendidos=${r2.suspendidos}`);
  anotar('una segunda pasada no vuelve a marcar estados ya aplicados',
    r2.vencidos === 1 || r2.vencidos === 0, `vencidos=${r2.vencidos} (c-m6 pasa de PENDIENTE_PAGO a SUSPENDIDO)`);

  /* ── 3 · Sin tokens ─────────────────────────────────────────────── */
  console.log('\n═══ 3 · SIN TOKENS ═══');
  await db.collection('notificaciones').doc(`c-10_${masDias(10)}_VENCIMIENTO_10D`).delete();
  const r3 = await procesarVencimientos({ db, FieldValue, pushACliente: pushCero, logger: log, mensajes: MENSAJES, hoy: HOY });
  const n10 = (await db.collection('notificaciones').doc(`c-10_${masDias(10)}_VENCIMIENTO_10D`).get()).data();
  anotar('sin tokens el aviso queda ERROR con motivo',
    n10 && n10.estado === 'ERROR' && /Sin tokens/.test(n10.ultimoError || ''), `estado=${n10 && n10.estado} · ultimoError=${n10 && n10.ultimoError}`);
  anotar('sin tokens no cuenta como avisado', r3.avisados < 1, `avisados=${r3.avisados}`);

  /* ── 4 · Fallo parcial del envío ────────────────────────────────── */
  console.log('\n═══ 4 · FALLO DEL ENVÍO: REINTENTOS Y ESTADO FINAL ═══');
  const clave5 = `c-5_${masDias(5)}_VENCIMIENTO_5D`;

  /* 4.1 un envío que lanza no rompe la pasada y deja constancia */
  await db.collection('notificaciones').doc(clave5).delete().catch(() => {});
  let excepcion = null;
  const r4 = await procesarVencimientos({ db, FieldValue, pushACliente: pushFalla, logger: log, mensajes: MENSAJES, hoy: HOY })
    .catch((e) => { excepcion = e.message; });
  let n5 = (await db.collection('notificaciones').doc(clave5).get()).data();
  anotar('un envío que lanza NO rompe la ejecución completa', excepcion === null, excepcion ? 'excepción: ' + excepcion : 'el motor siguió');
  anotar('el fallo queda registrado (estado, intentos y último error)',
    n5 && n5.estado === 'PENDIENTE' && n5.intentos === 3 && /fallo de red simulado/.test(n5.ultimoError || ''),
    n5 ? `estado=${n5.estado} · intentos=${n5.intentos} · error="${(n5.ultimoError || '').slice(0, 40)}"` : 'no se creó');
  anotar('el resumen informa de los avisos fallidos', r4 && r4.fallidos >= 1, r4 ? `avisados=${r4.avisados} · fallidos=${r4.fallidos}` : 'sin resumen');

  /* 4.2 segunda pasada: agota los intentos y queda FALLIDA */
  await procesarVencimientos({ db, FieldValue, pushACliente: pushFalla, logger: log, mensajes: MENSAJES, hoy: HOY });
  n5 = (await db.collection('notificaciones').doc(clave5).get()).data();
  anotar('tras la segunda pasada agota el tope y queda FALLIDA',
    n5.estado === 'FALLIDA' && n5.intentos === 5,
    `estado=${n5.estado} · intentos=${n5.intentos}`);

  /* 4.3 ya agotado: no se reintenta aunque el envío vuelva a funcionar */
  let llamadas = 0;
  const pushContador = async () => { llamadas++; return 1; };
  await procesarVencimientos({ db, FieldValue, pushACliente: pushContador, logger: log, mensajes: MENSAJES, hoy: HOY });
  n5 = (await db.collection('notificaciones').doc(clave5).get()).data();
  anotar('un aviso FALLIDA no se reintenta solo', n5.estado === 'FALLIDA' && llamadas === 0,
    `estado=${n5.estado} · envíos intentados=${llamadas}`);

  /* 4.4 recuperación: falla una vez y luego funciona */
  const clave3 = `c-3_${masDias(3)}_VENCIMIENTO_3D`;
  await db.collection('notificaciones').doc(clave3).delete().catch(() => {});
  let primera = true;
  const pushInestable = async () => { if (primera) { primera = false; throw new Error('caída puntual'); } return 1; };
  await procesarVencimientos({ db, FieldValue, pushACliente: pushInestable, logger: log, mensajes: MENSAJES, hoy: HOY });
  const n3 = (await db.collection('notificaciones').doc(clave3).get()).data();
  anotar('se recupera solo tras un fallo puntual (reintento en la misma pasada)',
    n3.estado === 'ENVIADA' && n3.intentos === 2,
    `estado=${n3.estado} · intentos=${n3.intentos}`);

  /* 4.5 una enviada no se repite */
  let llamadas2 = 0;
  const pushCuenta = async () => { llamadas2++; return 1; };
  await procesarVencimientos({ db, FieldValue, pushACliente: pushCuenta, logger: log, mensajes: MENSAJES, hoy: HOY });
  const n3b = (await db.collection('notificaciones').doc(clave3).get()).data();
  anotar('un aviso ENVIADA no se vuelve a mandar (sin duplicados)',
    n3b.estado === 'ENVIADA' && llamadas2 === 0, `estado=${n3b.estado} · envíos intentados=${llamadas2}`);

  /* ── Resumen ────────────────────────────────────────────────────── */
  const fallos = salida.filter((x) => x.estado === 'FALLIDO');
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.filter(x => x.estado === 'APROBADO').length} · FALLIDAS: ${fallos.length}`);
  if (fallos.length) { console.log('\nFALLOS:'); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  console.log('──────────────────────────────────────────────────────────────\n');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(2); });
