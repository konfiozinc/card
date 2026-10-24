/* CARD-SPARK-002 · pagos por CONCEPTO: desarrollo pago único (sin renovación),
   concepto inválido denegado, renovación con periodo. Requiere emulador. */
'use strict';
const FS = 'http://127.0.0.1:8080', AUTH = 'http://127.0.0.1:9099', P = 'demo-card-seguridad', K = 'clave-ficticia';
const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v }), n = (v) => ({ integerValue: String(v) }), b = (v) => ({ booleanValue: v });
const salida = [];
function chequear(nombre, ok, det) { salida.push(!!ok); console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${det || ''}`); }
async function pedir(m, url, cuerpo, token) { const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token; const r = await fetch(url, { method: m, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }); let j = null; try { j = JSON.parse(await r.text()); } catch (e) {} return { st: r.status, j }; }
const crear = (c, id, f, t) => pedir('POST', `${u(c)}?documentId=${id}`, { fields: f }, t);
const parchear = (r, f, t) => pedir('PATCH', `${u(r)}?updateMask.fieldPaths=${Object.keys(f).join('&updateMask.fieldPaths=')}`, { fields: f }, t);
async function alta(e, p) { let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email: e, password: p, returnSecureToken: true }); if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email: e, password: p, returnSecureToken: true }); return { uid: r.j.localId, token: r.j.idToken }; }

(async () => {
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
  const op = await alta('op.pago2@crm.test', 'Ficticia#1');
  const ad = await alta('ad.pago2@crm.test', 'Ficticia#1');
  await crear('usuarios', op.uid, { email: s('op.pago2@crm.test'), nombre: s('Op'), rol: s('OPERADOR'), activo: b(true) }, 'owner');
  await crear('usuarios', ad.uid, { email: s('ad.pago2@crm.test'), nombre: s('Ad'), rol: s('ADMIN'), activo: b(true) }, 'owner');
  await crear('clientes', 'cli-pago2', { nombre: s('Cliente Pago'), servicio: s('tarjetas'), telefono: s('3000000000'), precio: n(49900), fechaActivacion: s('2026-01-01'), fechaVencimiento: s('2027-01-01'), estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), eliminado: b(false) }, ad.token);

  // Pago de DESARROLLO: pago único, sin periodo
  const pDev = await crear('pagos', 'pago-dev', { clienteId: s('cli-pago2'), clienteNombre: s('Cliente Pago'), monto: n(49900), concepto: s('DESARROLLO'), metodoPago: s('Nequi'), fechaPago: s('2026-01-02'), estado: s('PENDIENTE'), registradoPor: s(op.uid), registradoPorNombre: s('Op'), createdAt: { timestampValue: new Date().toISOString() } }, op.token);
  chequear('Pago DESARROLLO (sin periodo) creado', pDev.st === 200, String(pDev.st));
  const confDev = await parchear('pagos/pago-dev', { estado: s('CONFIRMADO'), confirmadoPor: s(ad.uid), confirmadoEn: { timestampValue: new Date().toISOString() } }, ad.token);
  chequear('Confirmar DESARROLLO sin periodoFin: PERMITIDO', confDev.st === 200, String(confDev.st));

  // Pago de RENOVACIÓN con periodo
  const pRen = await crear('pagos', 'pago-ren', { clienteId: s('cli-pago2'), clienteNombre: s('Cliente Pago'), monto: n(15000), concepto: s('RENOVACION_DOMINIO'), metodoPago: s('Nequi'), fechaPago: s('2026-01-03'), estado: s('PENDIENTE'), registradoPor: s(op.uid), registradoPorNombre: s('Op'), createdAt: { timestampValue: new Date().toISOString() } }, op.token);
  chequear('Pago RENOVACION_DOMINIO creado', pRen.st === 200, String(pRen.st));
  const confRen = await parchear('pagos/pago-ren', { estado: s('CONFIRMADO'), confirmadoPor: s(ad.uid), confirmadoEn: { timestampValue: new Date().toISOString() }, periodoInicio: s('2026-01-03'), periodoFin: s('2027-01-03') }, ad.token);
  chequear('Confirmar RENOVACIÓN con periodo: PERMITIDO', confRen.st === 200, String(confRen.st));

  // Concepto inválido
  const pBad = await crear('pagos', 'pago-bad', { clienteId: s('cli-pago2'), clienteNombre: s('Cliente Pago'), monto: n(1000), concepto: s('INVENTADO'), metodoPago: s('Nequi'), fechaPago: s('2026-01-04'), estado: s('PENDIENTE'), registradoPor: s(op.uid), registradoPorNombre: s('Op'), createdAt: { timestampValue: new Date().toISOString() } }, op.token);
  chequear('Concepto inválido: DENEGADO', pBad.st === 403 || pBad.st === 401, String(pBad.st));

  console.log(`\nTOTAL: ${salida.length} · PASAN: ${salida.filter(Boolean).length} · FALLAN: ${salida.filter(x => !x).length}`);
  process.exitCode = salida.every(Boolean) ? 0 : 1;
})();
