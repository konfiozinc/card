/* ═══════════════════════════════════════════════════════════════════
   pruebas-spark-reglas-p1.js · KONFÍO ZINC — CARD — MODO SPARK

   Comprueba las reglas de Firestore como ÚNICA autoridad del panel: sin Cloud
   Functions, cada escritura del navegador tiene que pasar por aquí.

   Cubre, con datos ficticios y llamadas REST reales al emulador:
     · rol leído de Firestore, por UID y por ficha heredada (usuarios/correo)
     · usuarios: solo lectura, nadie puede escribirlos (ni un SUPERADMIN)
     · clientes: OPERADOR contacto, ADMIN comerciales, SUPERADMIN baja lógica
     · pagos: importe inmutable, transiciones únicas, doble confirmación imposible
     · auditoría e historial: se crean con el uid propio, no se modifican
     · notificaciones: PREPARADA y marca de enviado, nada automático
     · configuración: el interruptor del motor sigue cerrado al navegador

   Requisitos: Auth 9099 · Firestore 8080 · proyecto demo-card-seguridad.
   Uso: node herramientas/test/pruebas-spark-reglas-p1.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const P = 'demo-card-seguridad';
const K = 'clave-ficticia';

const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
const ts = (x) => ({ timestampValue: x });

const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(62)} ${detalle || ''}`);
}

async function pedir(metodo, url, cuerpo, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j, txt };
}
const crear = (col, id, campos, token = 'owner') => pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, token);
function parchear(ruta, campos, token) {
  const mascara = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  return pedir('PATCH', `${u(ruta)}?${mascara}`, { fields: campos }, token);
}
const leer = (ruta, token) => pedir('GET', u(ruta), undefined, token);
const borrar = (ruta, token) => pedir('DELETE', u(ruta), undefined, token);

async function alta(email, pass) {
  let r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  if (r.st !== 200) r = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`,
    { email, password: pass, returnSecureToken: true });
  return { uid: r.j.localId, token: r.j.idToken, email };
}

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mas = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); return iso(d); };

(async () => {
  console.log('\n═══ PREPARACIÓN ═══');
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });

  const op = await alta('op.spark@crm.test', 'Ficticia#1');
  const ad = await alta('ad.spark@crm.test', 'Ficticia#1');
  const su = await alta('su.spark@crm.test', 'Ficticia#1');
  const legado = await alta('legado.spark@crm.test', 'Ficticia#1');

  await crear('usuarios', op.uid, { email: s(op.email), nombre: s('Operador Ficticio'), rol: s('OPERADOR'), activo: b(true) });
  await crear('usuarios', ad.uid, { email: s(ad.email), nombre: s('Admin Ficticio'), rol: s('ADMIN'), activo: b(true) });
  await crear('usuarios', su.uid, { email: s(su.email), nombre: s('Superadmin Ficticio'), rol: s('SUPERADMIN'), activo: b(true) });
  /* Ficha HEREDADA: el id es el correo, como las que quedaron de antes. */
  await crear('usuarios', legado.email, { email: s(legado.email), nombre: s('Legado Ficticio'), rol: s('ADMIN'), activo: b(true) });

  const clienteBase = {
    nombre: s('Cliente Spark'), servicio: s('Tarjetas Digitales'), telefono: s('3001234567'),
    precio: n(99900), fechaActivacion: s(iso(hoy)), fechaVencimiento: s(mas(30)),
    estadoCliente: s('ACTIVO'), estadoServicio: s('ACTIVO'), activo: b(true), eliminado: b(false)
  };
  await crear('clientes', 'cli-1', clienteBase);
  await crear('pagos', 'pg-1', {
    clienteId: s('cli-1'), clienteNombre: s('Cliente Spark'), monto: n(99900),
    metodoPago: s('Nequi'), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'),
    registradoPor: s(op.uid), registradoPorNombre: s('Operador Ficticio'),
    createdAt: ts(new Date().toISOString())
  });
  console.log('  3 fichas por uid + 1 heredada · 1 cliente · 1 pago PENDIENTE\n');

  /* ── A · Identidad y rol ─────────────────────────────────────────── */
  console.log('═══ A · IDENTIDAD Y ROL ═══');
  let r = await leer('clientes/cli-1');
  chequear('Sin sesión no se lee nada', r.st === 403, `HTTP ${r.st}`);
  r = await leer('clientes/cli-1', op.token);
  chequear('OPERADOR lee clientes', r.st === 200, `HTTP ${r.st}`);
  r = await leer('clientes/cli-1', legado.token);
  chequear('La ficha heredada por correo también da rol (sigue leyendo)', r.st === 200, `HTTP ${r.st}`);

  /* ── B · usuarios: solo lectura ──────────────────────────────────── */
  console.log('\n═══ B · USUARIOS: NADIE ESCRIBE DESDE EL NAVEGADOR ═══');
  r = await leer(`usuarios/${op.uid}`, op.token);
  chequear('Cada uno lee su propia ficha', r.st === 200, `HTTP ${r.st}`);
  r = await leer(`usuarios/${ad.uid}`, op.token);
  chequear('Un OPERADOR no lee la ficha de otro', r.st === 403, `HTTP ${r.st}`);
  r = await leer(`usuarios/${ad.uid}`, su.token);
  chequear('Un SUPERADMIN lee la ficha de otro', r.st === 200, `HTTP ${r.st}`);
  r = await leer(`usuarios/${legado.email}`, legado.token);
  chequear('El dueño de una ficha heredada la lee', r.st === 200, `HTTP ${r.st}`);
  r = await parchear(`usuarios/${op.uid}`, { rol: s('SUPERADMIN') }, op.token);
  chequear('Auto-promoción de rol: DENEGADA', r.st === 403, `HTTP ${r.st}`);
  r = await parchear(`usuarios/${op.uid}`, { rol: s('SUPERADMIN') }, su.token);
  chequear('Un SUPERADMIN tampoco puede cambiar roles desde el navegador', r.st === 403, `HTTP ${r.st}`);
  r = await crear('usuarios', 'intruso@crm.test', { rol: s('SUPERADMIN'), activo: b(true) }, op.token);
  chequear('Crear una ficha de usuario desde el navegador: DENEGADO', r.st === 403, `HTTP ${r.st}`);

  /* ── C · clientes por rol ────────────────────────────────────────── */
  console.log('\n═══ C · CLIENTES: CONTACTO vs COMERCIAL vs BAJA ═══');
  r = await parchear('clientes/cli-1', { telefono: s('3009998877') }, op.token);
  chequear('OPERADOR edita un dato de contacto', r.st === 200, `HTTP ${r.st}`);
  r = await parchear('clientes/cli-1', { precio: n(1) }, op.token);
  chequear('OPERADOR no puede tocar el precio', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('clientes/cli-1', { fechaVencimiento: s(mas(365)) }, op.token);
  chequear('OPERADOR no puede regalar vigencia', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('clientes/cli-1', { precio: n(120000) }, ad.token);
  chequear('ADMIN sí ajusta el precio', r.st === 200, `HTTP ${r.st}`);
  r = await parchear('clientes/cli-1', { eliminado: b(true), estadoCliente: s('INHABILITADO') }, ad.token);
  chequear('ADMIN no puede dar de baja lógica', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('clientes/cli-1', { eliminado: b(true), activo: b(false), estadoCliente: s('INHABILITADO'), estadoServicio: s('INHABILITADO') }, su.token);
  chequear('SUPERADMIN da de baja lógica', r.st === 200, `HTTP ${r.st}`);
  r = await borrar('clientes/cli-1', su.token);
  chequear('Borrado físico de cliente: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await crear('clientes', 'cli-sin-servicio', { nombre: s('Incompleto') }, op.token);
  chequear('Alta sin servicio: DENEGADA', r.st === 403, `HTTP ${r.st}`);

  /* ── D · pagos ──────────────────────────────────────────────────── */
  console.log('\n═══ D · PAGOS: IMPORTE INMUTABLE Y UNA SOLA CONFIRMACIÓN ═══');
  r = await crear('pagos', 'pg-op', {
    clienteId: s('cli-1'), clienteNombre: s('Cliente Spark'), monto: n(50000), metodoPago: s('Efectivo'),
    fechaPago: s(iso(hoy)), estado: s('PENDIENTE'), registradoPor: s(op.uid), registradoPorNombre: s('Operador Ficticio'),
    createdAt: ts(new Date().toISOString())
  }, op.token);
  chequear('OPERADOR registra un pago PENDIENTE', r.st === 200, `HTTP ${r.st}`);
  r = await crear('pagos', 'pg-malo1', {
    clienteId: s('cli-1'), monto: n(0), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'),
    registradoPor: s(op.uid), createdAt: ts(new Date().toISOString())
  }, op.token);
  chequear('Pago con monto 0: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await crear('pagos', 'pg-malo2', {
    clienteId: s('cli-1'), monto: n(1000), fechaPago: s(iso(hoy)), estado: s('PENDIENTE'),
    registradoPor: s(ad.uid), createdAt: ts(new Date().toISOString())
  }, op.token);
  chequear('Pago atribuido a otro usuario: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await crear('pagos', 'pg-malo3', {
    clienteId: s('cli-1'), monto: n(1000), fechaPago: s(iso(hoy)), estado: s('CONFIRMADO'),
    registradoPor: s(op.uid), createdAt: ts(new Date().toISOString())
  }, op.token);
  chequear('Pago que nace CONFIRMADO: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-1', {
    estado: s('CONFIRMADO'), confirmadoPor: s(ad.uid), confirmadoEn: ts(new Date().toISOString()), periodoFin: s(mas(365))
  }, op.token);
  chequear('OPERADOR no confirma pagos', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-1', { monto: n(1) }, ad.token);
  chequear('Nadie altera el importe de un pago', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-1', {
    estado: s('CONFIRMADO'), confirmadoPor: s(su.uid), confirmadoEn: ts(new Date().toISOString()), periodoFin: s(mas(365))
  }, ad.token);
  chequear('Confirmar atribuyendo a otro usuario: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-1', {
    estado: s('CONFIRMADO'), confirmadoPor: s(ad.uid), confirmadoEn: ts(new Date().toISOString()), periodoFin: s(mas(365))
  }, ad.token);
  chequear('ADMIN confirma el pago una vez', r.st === 200, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-1', {
    estado: s('CONFIRMADO'), confirmadoPor: s(ad.uid), confirmadoEn: ts(new Date().toISOString()), periodoFin: s(mas(365))
  }, ad.token);
  chequear('Segunda confirmación del mismo pago: DENEGADA', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-op', { estado: s('ANULADO'), anuladoPor: s(ad.uid), anuladoEn: ts(new Date().toISOString()) }, ad.token);
  chequear('Anular sin motivo: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-op', {
    estado: s('ANULADO'), anuladoPor: s(ad.uid), motivo: s('Comprobante inválido'), anuladoEn: ts(new Date().toISOString())
  }, ad.token);
  chequear('Anular con motivo: PERMITIDO', r.st === 200, `HTTP ${r.st}`);
  r = await parchear('pagos/pg-op', { motivo: s('otra cosa') }, ad.token);
  chequear('Reabrir o editar un pago anulado: DENEGADO', r.st === 403, `HTTP ${r.st}`);

  /* ── E · auditoría e historial ──────────────────────────────────── */
  console.log('\n═══ E · AUDITORÍA E HISTORIAL ═══');
  r = await crear('auditoria', 'aud-1', { usuarioId: s(op.uid), accion: s('PRUEBA'), entidad: s('clientes'), fecha: ts(new Date().toISOString()) }, op.token);
  chequear('El equipo registra auditoría con su propio uid', r.st === 200, `HTTP ${r.st}`);
  r = await crear('auditoria', 'aud-2', { usuarioId: s(ad.uid), accion: s('SUPLANTAR'), entidad: s('clientes') }, op.token);
  chequear('Registrar auditoría a nombre de otro: DENEGADO', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('auditoria/aud-1', { accion: s('BORRADA') }, su.token);
  chequear('La auditoría no se puede modificar', r.st === 403, `HTTP ${r.st}`);
  r = await borrar('auditoria/aud-1', su.token);
  chequear('La auditoría no se puede borrar', r.st === 403, `HTTP ${r.st}`);
  r = await leer('auditoria/aud-1', op.token);
  chequear('Un OPERADOR no lee la auditoría', r.st === 403, `HTTP ${r.st}`);
  r = await leer('auditoria/aud-1', su.token);
  chequear('El SUPERADMIN sí lee la auditoría', r.st === 200, `HTTP ${r.st}`);
  r = await crear('historial_estados', 'his-1', { clienteId: s('cli-1'), estadoNuevo: s('SUSPENDIDO'), usuarioId: s(op.uid), fecha: ts(new Date().toISOString()) }, op.token);
  chequear('El historial de estados se escribe con el uid propio', r.st === 200, `HTTP ${r.st}`);
  r = await parchear('historial_estados/his-1', { estadoNuevo: s('ACTIVO') }, su.token);
  chequear('El historial no se puede reescribir', r.st === 403, `HTTP ${r.st}`);

  /* ── F · notificaciones: nada automático ────────────────────────── */
  console.log('\n═══ F · NOTIFICACIONES: PREPARADAS, NO ENVIADAS ═══');
  r = await crear('notificaciones', 'not-1', {
    clienteId: s('cli-1'), clienteNombre: s('Cliente Spark'), tipo: s('VENCIMIENTO'),
    mensaje: s('Mensaje ficticio de prueba'), estado: s('PREPARADA'), canal: s('WHATSAPP'),
    usuarioId: s(op.uid), usuarioNombre: s('Operador Ficticio'), preparadaEn: ts(new Date().toISOString())
  }, op.token);
  chequear('Se prepara un aviso (estado PREPARADA)', r.st === 200, `HTTP ${r.st}`);
  r = await crear('notificaciones', 'not-2', {
    clienteId: s('cli-1'), mensaje: s('Inventado'), estado: s('ENVIADA'), canal: s('WHATSAPP'),
    usuarioId: s(op.uid), preparadaEn: ts(new Date().toISOString())
  }, op.token);
  chequear('Un aviso no puede nacer «ENVIADA»', r.st === 403, `HTTP ${r.st}`);
  r = await parchear('notificaciones/not-1', { estado: s('ENVIADA'), enviadoPor: s(op.uid), enviadoEn: ts(new Date().toISOString()) }, op.token);
  chequear('El operador marca enviado su propio aviso', r.st === 200, `HTTP ${r.st}`);
  r = await parchear('notificaciones/not-1', { mensaje: s('otro texto') }, op.token);
  chequear('Un aviso ya enviado no se reescribe', r.st === 403, `HTTP ${r.st}`);

  /* ── G · configuración e interruptor del motor ──────────────────── */
  console.log('\n═══ G · CONFIGURACIÓN E INTERRUPTOR DEL MOTOR ═══');
  r = await crear('configuracion', 'diasPorVencer', { clave: s('diasPorVencer'), valor: n(15) }, su.token);
  chequear('El SUPERADMIN escribe configuración normal', r.st === 200, `HTTP ${r.st}`);
  r = await crear('configuracion', 'motorVencimientos', { habilitado: b(true) }, su.token);
  chequear('Nadie abre el interruptor del motor desde el navegador', r.st === 403, `HTTP ${r.st}`);
  r = await crear('planes', 'plan-ficticio', { nombre: s('Mini Web Básica'), precio: n(49900), servicio: s('tarjetas') }, ad.token);
  chequear('ADMIN crea un plan válido', r.st === 200, `HTTP ${r.st}`);
  r = await crear('planes', 'plan-malo', { nombre: s('Sin precio'), precio: n(-5), servicio: s('tarjetas') }, ad.token);
  chequear('Plan con precio negativo: DENEGADO', r.st === 403, `HTTP ${r.st}`);

  /* ── Resumen ────────────────────────────────────────────────────── */
  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · PASAN: ${salida.length - fallos.length} · FALLAN: ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log('\nFALLOS:'); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  console.log('');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.stack || e)); process.exit(2); });
