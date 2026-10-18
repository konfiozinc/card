/* ═══════════════════════════════════════════════════════════════════
   pruebas-pagos-p1.js · KONFÍO ZINC — CARD
   Regresión del defecto P1 (integridad financiera de pagos).

   La MISMA suite se ejecuta contra dos juegos de reglas:
     · reglas originales  → los ataques deben PASAR (defecto vivo)
     · reglas de la rama  → los ataques deben ser RECHAZADOS

   Los updates usan updateMask para emular exactamente `updateDoc` del CRM
   (actualización parcial). Sin máscara, PATCH reemplaza el documento entero
   y la prueba no representaría lo que hace el CRM.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const PROYECTO = process.env.KZ_PROYECTO || 'demo-card-pagos-p1';
const K = 'clave-ficticia';

const u = (r) => `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
/* El CRM usa serverTimestamp() en los campos de auditoría: son marcas de
   tiempo, no cadenas. La regla lo verifica con `is timestamp`. */
const ts = (iso) => ({ timestampValue: iso });

const r = { pass: 0, fail: 0, filas: [] };
function chequear(nombre, ok, detalle) {
  r.filas.push({ nombre, ok, detalle });
  if (ok) r.pass++; else r.fail++;
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = {};
  if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const resp = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  let json = null;
  const txt = await resp.text();
  try { json = JSON.parse(txt); } catch (e) { json = { crudo: txt }; }
  return { st: resp.status, j: json };
}

const crear = (coleccion, id, campos, token) =>
  pedir('POST', `${u(coleccion)}?documentId=${id}`, { fields: campos }, token);

/* update PARCIAL, como updateDoc: solo los campos indicados */
function parchear(ruta, campos, token) {
  const mascara = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  return pedir('PATCH', `${u(ruta)}?${mascara}`, { fields: campos }, token);
}

const leer = (ruta, token) => pedir('GET', u(ruta), undefined, token);
const montoDe = (resp) => resp.j.fields?.monto?.integerValue;

/* Equivalente a where('campo', '==', valor): lo que hará el CRM en el historial */
async function consultar(coleccion, campo, valor, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const resp = await fetch(`${FS}/v1/projects/${PROYECTO}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } },
      },
    }),
  });
  const txt = await resp.text();
  let docs = [];
  /* El emulador responde un array JSON (a veces con NDJSON): se aceptan ambos. */
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) docs = parsed.filter((x) => x && x.document).map((x) => x.document);
  } catch (e) {
    docs = txt.trim().split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch (e2) { return null; } })
      .filter((x) => x && x.document).map((x) => x.document);
  }
  return { st: resp.status, docs };
}

/* ── Campos EXACTOS que escribe registrarPago() del CRM ───────────── */
const pagoDelCRM = (monto, extra) => ({
  clienteId: s('cliente-1'),
  clienteNombre: s('Cliente Ficticio'),
  servicioId: { nullValue: null },
  monto: n(monto),
  metodoPago: s('Nequi'),
  fechaPago: s('2026-10-18'),
  referencia: s('REF-1'),
  comprobanteUrl: { nullValue: null },
  estado: s('PENDIENTE'),
  registradoPor: s('uid-operador'),
  registradoPorNombre: s('Operador Ficticio'),
  createdAt: s('2026-10-18T10:00:00Z'),
  ...(extra || {}),
});

const confirmar = (extra) => ({
  estado: s('CONFIRMADO'), confirmadoPor: s('uid-admin'), confirmadoPorNombre: s('Admin Ficticio'),
  periodoInicio: s('2026-10-18'), periodoFin: s('2027-10-18'), confirmadoEn: ts('2026-10-18T12:00:00Z'),
  ...(extra || {}),
});
const anular = (extra) => ({
  estado: s('ANULADO'), anuladoPor: s('uid-admin'), motivo: s('Motivo ficticio'),
  anuladoEn: ts('2026-10-18T13:00:00Z'), ...(extra || {}),
});

/* ── Preparación ──────────────────────────────────────────────────── */
async function preparar() {
  await fetch(`${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });

  const cuentas = {};
  for (const rol of ['OPERADOR', 'ADMIN', 'SUPERADMIN']) {
    const email = `${rol.toLowerCase()}@pagos.test`;
    let alta = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email, password: 'Ficticia#1', returnSecureToken: true });
    if (alta.st !== 200) {
      alta = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email, password: 'Ficticia#1', returnSecureToken: true });
    }
    cuentas[rol] = { uid: alta.j.localId, token: alta.j.idToken, email };
    await crear('usuarios', alta.j.localId, { email: s(email), rol: s(rol), activo: b(true) }, 'owner');
  }
  await crear('clientes', 'cliente-1', { nombre: s('Cliente Ficticio'), servicio: s('Tarjetas Digitales') }, 'owner');
  return cuentas;
}

(async () => {
  const c = await preparar();
  const op = c.OPERADOR.token, ad = c.ADMIN.token, su = c.SUPERADMIN.token;

  console.log('\n─── A · REGRESIÓN DEL DEFECTO (el OPERADOR no debe tocar el dinero) ──');

  let res = await crear('pagos', 'pago-a', pagoDelCRM(49900), op);
  chequear('A0 · OPERADOR registra un pago PENDIENTE de 49.900 (operación legítima)', res.st === 200, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-a', { monto: n(1), estado: s('PENDIENTE') }, op);
  chequear('A1 · OPERADOR NO puede cambiar 49.900 → 1 manteniendo el estado', res.st === 403, `HTTP ${res.st}`);

  const trasAtaque = await leer('pagos/pago-a', ad);
  chequear('A2 · el monto en la base sigue siendo 49.900', montoDe(trasAtaque) === '49900', `monto = ${montoDe(trasAtaque)}`);

  res = await parchear('pagos/pago-a', { monto: n(1), estado: s('CONFIRMADO') }, op);
  chequear('A3 · OPERADOR NO puede cambiar monto y estado a la vez', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-a', { clienteId: s('cliente-2') }, op);
  chequear('A4 · OPERADOR NO puede reasignar el pago a otro cliente', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-a', { createdAt: s('2020-01-01T00:00:00Z') }, op);
  chequear('A5 · OPERADOR NO puede falsificar la fecha de creación', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-a', { metodoPago: s('Efectivo') }, op);
  chequear('A6 · OPERADOR tampoco edita metadatos (el CRM nunca lo hace)', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-a', { estado: s('ANULADO') }, op);
  chequear('A7 · OPERADOR no puede anular un pago', res.st === 403, `HTTP ${res.st}`);

  console.log('\n─── B · OPERACIONES LEGÍTIMAS QUE NO DEBEN ROMPERSE ─────────────');

  res = await crear('pagos', 'pago-b', pagoDelCRM(49900), op);
  chequear('B1 · alta con los 12 campos reales del CRM', res.st === 200, `HTTP ${res.st}`);

  res = await crear('pagos', 'pago-c', pagoDelCRM(49900, { comision: n(10) }), op);
  chequear('B2 · se rechaza un campo que el CRM no escribe', res.st === 403, `HTTP ${res.st}`);

  res = await crear('pagos', 'pago-d', pagoDelCRM(0), op);
  chequear('B3 · se rechaza un pago de 0', res.st === 403, `HTTP ${res.st}`);

  res = await crear('pagos', 'pago-e', pagoDelCRM(-5), op);
  chequear('B4 · se rechaza un pago negativo', res.st === 403, `HTTP ${res.st}`);

  res = await crear('pagos', 'pago-f', { ...pagoDelCRM(49900), estado: s('CONFIRMADO') }, op);
  chequear('B5 · se rechaza crear un pago ya CONFIRMADO', res.st === 403, `HTTP ${res.st}`);

  const sinCliente = pagoDelCRM(49900); delete sinCliente.clienteId;
  res = await crear('pagos', 'pago-g', sinCliente, op);
  chequear('B6 · se rechaza un pago sin clienteId', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-b', confirmar(), ad);
  chequear('B7 · ADMIN confirma un pago PENDIENTE (camino real del CRM)', res.st === 200, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-b', anular(), ad);
  chequear('B8 · ADMIN anula un pago YA CONFIRMADO (la UI lo permite)', res.st === 200, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-a', anular(), ad);
  chequear('B9 · ADMIN anula un pago PENDIENTE', res.st === 200, `HTTP ${res.st}`);

  await crear('pagos', 'pago-j', pagoDelCRM(49900), op);
  res = await parchear('pagos/pago-j', { metodoPago: s('Transferencia'), referencia: s('REF-CORREGIDA') }, ad);
  chequear('B10 · ADMIN corrige metadatos (método y referencia)', res.st === 200, `HTTP ${res.st}`);

  await crear('pagos', 'pago-h', pagoDelCRM(49900), op);
  res = await parchear('pagos/pago-h', { monto: n(1) }, ad);
  chequear('B11 · ni ADMIN cambia el monto de un pago PENDIENTE', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-b', { monto: n(999999) }, ad);
  chequear('B12 · ni ADMIN cambia el monto de un pago ya confirmado/anulado', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-h', { clienteId: s('cliente-2') }, ad);
  chequear('B13 · ni ADMIN reasigna el pago de cliente', res.st === 403, `HTTP ${res.st}`);

  await crear('pagos', 'pago-i', pagoDelCRM(49900), op);
  res = await parchear('pagos/pago-i', { registradoPor: s('otro-uid') }, ad);
  chequear('B14 · nadie reescribe quién registró el pago', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-i', confirmar({ confirmadoPor: s('uid-super') }), su);
  chequear('B15 · SUPERADMIN confirma igual que ADMIN', res.st === 200, `HTTP ${res.st}`);

  res = await parchear('pagos/pago-i', { monto: n(1) }, su);
  chequear('B16 · SUPERADMIN tampoco cambia el monto', res.st === 403, `HTTP ${res.st}`);

  console.log('\n─── C · LECTURA Y BORRADO ──────────────────────────────────────');

  res = await leer('pagos', op);
  chequear('C1 · OPERADOR lee la lista de pagos', res.st === 200, `HTTP ${res.st}`);

  res = await leer('pagos', undefined);
  chequear('C2 · sin sesión no se leen los pagos', res.st === 403, `HTTP ${res.st}`);

  res = await pedir('DELETE', u('pagos/pago-h'), undefined, ad);
  chequear('C3 · borrar un pago sigue prohibido', res.st === 403, `HTTP ${res.st}`);

  res = await leer('eventos', op);
  chequear('C4 · las demás colecciones no se ven afectadas (eventos legible)', res.st === 200, `HTTP ${res.st}`);

  res = await crear('clientes', 'cliente-sonda', { nombre: s('Sonda'), servicio: s('QR') }, op);
  chequear('C5 · las demás colecciones no se ven afectadas (clientes creable)', res.st === 200, `HTTP ${res.st}`);

  console.log('\n─── D · TRANSICIONES AUTORIZADAS Y RECHAZADAS ──────────────────');

  await crear('pagos', 'tr-pend', pagoDelCRM(49900), op);
  await crear('pagos', 'tr-conf', pagoDelCRM(49900), op);
  await parchear('pagos/tr-conf', confirmar(), ad);
  await crear('pagos', 'tr-anu', pagoDelCRM(49900), op);
  await parchear('pagos/tr-anu', anular(), ad);

  res = await parchear('pagos/tr-pend', confirmar(), ad);
  chequear('D1 · PENDIENTE → CONFIRMADO permitido', res.st === 200, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-conf', anular(), ad);
  chequear('D2 · CONFIRMADO → ANULADO permitido', res.st === 200, `HTTP ${res.st}`);

  await crear('pagos', 'tr-pend2', pagoDelCRM(49900), op);
  res = await parchear('pagos/tr-pend2', anular(), ad);
  chequear('D3 · PENDIENTE → ANULADO permitido', res.st === 200, `HTTP ${res.st}`);

  await crear('pagos', 'tr-conf2', pagoDelCRM(49900), op);
  await parchear('pagos/tr-conf2', confirmar(), ad);
  res = await parchear('pagos/tr-conf2', { estado: s('PENDIENTE') }, ad);
  chequear('D4 · CONFIRMADO → PENDIENTE rechazado (transición inversa)', res.st === 403, `HTTP ${res.st}`);

  await crear('pagos', 'tr-anu2', pagoDelCRM(49900), op);
  await parchear('pagos/tr-anu2', anular(), ad);
  res = await parchear('pagos/tr-anu2', confirmar(), ad);
  chequear('D5 · ANULADO → CONFIRMADO rechazado (ANULADO es terminal)', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-anu2', { metodoPago: s('Efectivo') }, ad);
  chequear('D6 · un pago ANULADO ya no admite ni correcciones de metadatos', res.st === 403, `HTTP ${res.st}`);

  await crear('pagos', 'tr-met', pagoDelCRM(49900), op);
  res = await parchear('pagos/tr-met', { estado: s('CONFIRMADO') }, ad);
  chequear('D7 · confirmar sin confirmadoPor/confirmadoEn se rechaza', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', { estado: s('CONFIRMADO'), confirmadoPor: s('uid-admin'), confirmadoEn: s('2026-10-18T12:00:00Z') }, ad);
  chequear('D8 · confirmadoEn debe ser marca de tiempo, no cadena', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', confirmar({ anuladoPor: s('uid-admin') }), ad);
  chequear('D9 · al confirmar no se puede inyectar anuladoPor', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', { metodoPago: s('Daviplata'), confirmadoPor: s('uid-admin') }, ad);
  chequear('D10 · una corrección de metadatos no puede inyectar confirmadoPor', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', { metodoPago: s('Daviplata'), anuladoPor: s('uid-admin'), anuladoEn: ts('2026-10-18T13:00:00Z') }, ad);
  chequear('D11 · una corrección de metadatos no puede inyectar anuladoPor', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', { estado: s('ANULADO'), anuladoPor: s('uid-admin'), motivo: s(''), anuladoEn: ts('2026-10-18T13:00:00Z') }, ad);
  chequear('D12 · anular exige un motivo no vacío', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', anular({ confirmadoPor: s('uid-admin') }), ad);
  chequear('D13 · al anular no se puede inyectar confirmadoPor', res.st === 403, `HTTP ${res.st}`);

  res = await parchear('pagos/tr-met', { estado: s('ANULADO'), anuladoPor: s('uid-admin'), anuladoEn: ts('2026-10-18T13:00:00Z') }, ad);
  chequear('D14 · anular sin motivo se rechaza por completo', res.st === 403, `HTTP ${res.st}`);

  console.log('\n─── E · HISTORIAL DEL CLIENTE SIN ABRIR SUBSOLECCIONES ─────────');

  await crear('pagos', 'hist-1', pagoDelCRM(10000), op);
  await crear('pagos', 'hist-2', { ...pagoDelCRM(20000), fechaPago: s('2026-09-01') }, op);
  await crear('pagos', 'hist-otro', { ...pagoDelCRM(30000), clienteId: s('cliente-sonda') }, op);

  let con = await consultar('pagos', 'clienteId', 'cliente-1', op);
  chequear('E1 · OPERADOR consulta la raíz `pagos` filtrando por clienteId',
    con.st === 200 && con.docs.length > 0, `HTTP ${con.st} · ${con.docs.length} pagos`);

  const ajenos = con.docs.filter((d) => d.fields && d.fields.clienteId && d.fields.clienteId.stringValue !== 'cliente-1');
  chequear('E2 · la consulta solo devuelve los pagos de ese cliente', ajenos.length === 0, `${ajenos.length} ajenos`);

  con = await consultar('pagos', 'clienteId', 'cliente-1', undefined);
  chequear('E3 · sin sesión la consulta del historial se deniega', con.st === 403, `HTTP ${con.st}`);

  const sub = await leer('clientes/cliente-1/pagos', op);
  chequear('E4 · la subcolección sigue cerrada: no se ampliaron permisos', sub.st === 403, `HTTP ${sub.st}`);

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`TOTAL: ${r.pass + r.fail} · PASAN: ${r.pass} · FALLAN: ${r.fail}`);
  if (r.fail) {
    console.log('\nFALLOS:');
    for (const f of r.filas.filter((x) => !x.ok)) console.log(`  · ${f.nombre} — ${f.detalle}`);
  }
  console.log('──────────────────────────────────────────────────────────────\n');
  process.exit(r.fail ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + e.message); process.exit(2); });
