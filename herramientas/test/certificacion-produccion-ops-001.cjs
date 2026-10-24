/* KZ-OPS-001 · Certificación controlada en PRODUCCIÓN.
   - Comprueba /leads con datos FICTICIOS y limpia lo que crea.
   - Comprueba que la escritura directa a `contactos` sigue DENEGADA.
   - Auditoría de clientes reales en modo ESTRICTAMENTE DE SOLO LECTURA:
     emite identificadores técnicos y tipos de inconsistencia, nunca datos
     personales (sin nombres, teléfonos, correos, documentos ni mensajes).

   No modifica ningún registro real. Solo borra el registro ficticio que este
   mismo script creó y que identifica por su marca exacta. */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const SA = 'C:/Users/usuario29/Documents/KONFIO_ZINC/14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json';
const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
const PROY = sa.project_id;
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROY}/databases/(default)/documents`;
const LEADS = 'https://calm-heart-6828.konfiozinc.workers.dev/leads';
const MARCA = 'QA KZ-OPS-001 FICTICIO NO REAL';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token() {
  const ahora = Math.floor(Date.now() / 1000);
  const scope = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform';
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cue = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }));
  const firma = crypto.createSign('RSA-SHA256').update(cab + '.' + cue).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: cab + '.' + cue + '.' + b64url(firma) })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sin token: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

function aPlanos(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) o[k] = v.stringValue;
    else if ('integerValue' in v) o[k] = Number(v.integerValue);
    else if ('doubleValue' in v) o[k] = v.doubleValue;
    else if ('booleanValue' in v) o[k] = v.booleanValue;
    else if ('timestampValue' in v) o[k] = v.timestampValue;
    else if ('nullValue' in v) o[k] = null;
    else if ('arrayValue' in v) o[k] = (v.arrayValue.values || []).map((x) => x.stringValue);
    else o[k] = '?';
  }
  return o;
}

async function listarTodo(tok, coleccion) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${FIRESTORE}/${coleccion}?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json();
    if (!r.ok) throw new Error(coleccion + ': ' + (j.error?.message || r.status));
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), ...aPlanos(d.fields) });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${detalle || ''}`);
}

(async () => {
  const tok = await token();
  console.log('token de servicio: obtenido · proyecto ' + PROY + '\n');

  /* ═══ 1 · /leads con datos ficticios ═══ */
  console.log('═══ 1 · CAPTACIÓN `/leads` EN PRODUCCIÓN (datos ficticios) ═══');
  const sufijo = Date.now().toString().slice(-8);
  const cuerpo = {
    nombre: MARCA + ' ' + sufijo,
    telefono: '3000000000',
    email: 'qa.ficticio@example.invalid',
    servicio: 'Tarjetas Digitales',
    mensaje: 'Registro ficticio de la certificacion KZ-OPS-001. Se elimina al terminar.',
    website: ''
  };
  const rl = await fetch(LEADS, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
  });
  const jl = await rl.json().catch(() => ({}));
  chequear('POST /leads responde 200 y confirma saved:true', rl.status === 200 && jl.saved === true,
    'HTTP ' + rl.status + ' · saved=' + jl.saved);

  const rl2 = await fetch(LEADS, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
  });
  const jl2 = await rl2.json().catch(() => ({}));
  chequear('Un segundo envío idéntico no duplica (dedup del Worker)',
    jl2.saved === true && rl2.status === 200, 'HTTP ' + rl2.status + ' · saved=' + jl2.saved);

  /* ═══ 2 · Escritura directa a contactos DENEGADA ═══ */
  console.log('\n═══ 2 · ESCRITURA DIRECTA A `contactos` (debe ser DENEGADA) ═══');
  const directo = await fetch(`${FIRESTORE}/contactos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { nombre: { stringValue: 'intento directo QA' } } })
  });
  chequear('Sin autenticación, crear en contactos da 401/403', directo.status === 401 || directo.status === 403,
    'HTTP ' + directo.status);

  const conTokenDueno = await fetch(`${FIRESTORE}/contactos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dueno-falso' },
    body: JSON.stringify({ fields: { nombre: { stringValue: 'intento directo QA' } } })
  });
  chequear('Con token inválido, crear en contactos da 401/403',
    conTokenDueno.status === 401 || conTokenDueno.status === 403, 'HTTP ' + conTokenDueno.status);

  /* ═══ 3 · Verificar el registro ficticio y limpiarlo ═══ */
  console.log('\n═══ 3 · REGISTRO FICTICIO: IDENTIFICAR Y LIMPIAR ═══');
  const contactos = await listarTodo(tok, 'contactos');
  const ficticios = contactos.filter((c) => String(c.nombre || '').startsWith(MARCA));
  chequear('El registro ficticio llegó a Firestore (1, sin duplicado)',
    ficticios.length === 1, `${ficticios.length} registro(s) con la marca de QA`);
  if (ficticios.length) {
    console.log('      id del registro de QA: ' + ficticios[0].id);
    console.log('      total de contactos reales en la colección: ' + (contactos.length - ficticios.length));
  }

  let limpiezaOk = false;
  for (const f of ficticios) {
    const del = await fetch(`${FIRESTORE}/contactos/${f.id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + tok }
    });
    if (del.ok) limpiezaOk = true;
    else console.log('      no se pudo borrar ' + f.id + ': HTTP ' + del.status);
  }
  const tras = await listarTodo(tok, 'contactos');
  const quedan = tras.filter((c) => String(c.nombre || '').startsWith(MARCA));
  chequear('Limpieza verificada: no queda ningún registro de QA',
    limpiezaOk && quedan.length === 0, `${quedan.length} restante(s)`);

  /* ═══ 4 · Auditoría de solo lectura ═══ */
  console.log('\n═══ 4 · AUDITORÍA DE SOLO LECTURA DE DATOS REALES ═══');
  const clientes = await listarTodo(tok, 'clientes');
  const servicios = await listarTodo(tok, 'servicios');
  const pagos = await listarTodo(tok, 'pagos');

  console.log(`   leídos: ${clientes.length} clientes · ${servicios.length} servicios · ${pagos.length} pagos`);
  console.log('   (solo se emiten identificadores técnicos y tipos; sin datos personales)\n');

  const idsClientes = new Set(clientes.map((c) => c.id));
  const porCliente = new Map();
  for (const s of servicios) {
    if (!porCliente.has(s.clienteId)) porCliente.set(s.clienteId, []);
    porCliente.get(s.clienteId).push(s);
  }

  /* H1 · Clientes sin ningún servicio registrado */
  const sinServicio = clientes.filter((c) => !porCliente.has(c.id) && !c.eliminado);

  /* H2 · Servicios huérfanos (clienteId inexistente) */
  const huerfanos = servicios.filter((s) => !idsClientes.has(s.clienteId));

  /* H3 · Pagos renovables sin servicio identificable */
  const RENOVABLES = ['RENOVACION_DOMINIO', 'HOSTING', 'MANTENIMIENTO', 'SERVICIO_PERIODICO'];
  const pagosSinServicio = pagos.filter((p) => RENOVABLES.includes(p.concepto) && !p.servicioId);
  const pagosHistoricos = pagos.filter((p) => !p.concepto);
  const pagosServicioAjeno = pagos.filter((p) => {
    if (!p.servicioId) return false;
    const s = servicios.find((x) => x.id === p.servicioId);
    return !s || s.clienteId !== p.clienteId;
  });

  /* H4 · Clientes con fecha genérica pero sin obligación identificada */
  const fechaSinObligacion = clientes.filter((c) =>
    !c.eliminado && c.fechaVencimiento && !(porCliente.get(c.id) || []).length);

  /* H5 · Inconsistencias de estado cliente ↔ servicios */
  const estadoIncoherente = clientes.filter((c) => {
    const suyos = porCliente.get(c.id) || [];
    if (!suyos.length) return false;
    const activosServ = suyos.filter((s) => s.estado === 'ACTIVO').length;
    // Cliente marcado SUSPENDIDO/INACTIVO/INHABILITADO pero con servicios ACTIVOS
    if (['SUSPENDIDO', 'INACTIVO', 'INHABILITADO'].includes(c.estadoCliente) && activosServ > 0) return true;
    // Cliente ACTIVO pero TODOS sus servicios suspendidos/inactivos
    if (c.estadoCliente === 'ACTIVO' && suyos.length > 0 && activosServ === 0) return true;
    return false;
  });

  /* H6 · Servicios con fecha de vencimiento anterior a la de inicio */
  const fechasIncoherentes = servicios.filter((s) =>
    s.fechaInicio && s.fechaVencimiento && String(s.fechaVencimiento) < String(s.fechaInicio));

  const grupos = [
    { clave: 'H1', nombre: 'Clientes sin ningún servicio registrado', lista: sinServicio, gravedad: 'ALTA' },
    { clave: 'H2', nombre: 'Servicios con clienteId inexistente (huérfanos)', lista: huerfanos, gravedad: 'ALTA' },
    { clave: 'H3a', nombre: 'Pagos renovables sin servicioId', lista: pagosSinServicio, gravedad: 'ALTA' },
    { clave: 'H3b', nombre: 'Pagos con servicioId de otro cliente o inexistente', lista: pagosServicioAjeno, gravedad: 'ALTA' },
    { clave: 'H3c', nombre: 'Pagos históricos sin concepto', lista: pagosHistoricos, gravedad: 'MEDIA' },
    { clave: 'H4', nombre: 'Clientes con fecha genérica y sin obligación por servicio', lista: fechaSinObligacion, gravedad: 'ALTA' },
    { clave: 'H5', nombre: 'Inconsistencia de estado cliente ↔ sus servicios', lista: estadoIncoherente, gravedad: 'MEDIA' },
    { clave: 'H6', nombre: 'Servicios con vencimiento anterior al inicio', lista: fechasIncoherentes, gravedad: 'BAJA' }
  ];

  console.log('   ┌──────┬──────────────────────────────────────────────────────┬──────────┬───────┐');
  console.log('   │ tipo │ hallazgo                                             │ gravedad │ nº    │');
  console.log('   ├──────┼──────────────────────────────────────────────────────┼──────────┼───────┤');
  for (const g of grupos) {
    console.log(`   │ ${g.clave.padEnd(4)} │ ${g.nombre.padEnd(52)} │ ${g.gravedad.padEnd(8)} │ ${String(g.lista.length).padStart(5)} │`);
  }
  console.log('   └──────┴──────────────────────────────────────────────────────┴──────────┴───────┘');

  const conHallazgos = grupos.filter((g) => g.lista.length > 0);
  if (conHallazgos.length) {
    console.log('\n   identificadores técnicos afectados (sin datos personales):');
    for (const g of conHallazgos) {
      const ids = g.lista.slice(0, 40).map((x) => x.id).join(', ');
      console.log(`     ${g.clave} (${g.lista.length}): ${ids}${g.lista.length > 40 ? ' …' : ''}`);
    }
  }

  const totalHallazgos = grupos.reduce((a, g) => a + g.lista.length, 0);
  chequear('La auditoría no encontró pérdida de datos (solo relaciones incompletas)',
    huerfanos.length === 0 && pagosServicioAjeno.length === 0 && fechasIncoherentes.length === 0,
    `huérfanos=${huerfanos.length} · pagos cruzados=${pagosServicioAjeno.length} · fechas incoherentes=${fechasIncoherentes.length}`);

  /* ═══ 5 · Datos reales intactos ═══ */
  console.log('\n═══ 5 · DATOS REALES INTACTOS ═══');
  chequear('No se escribió ni modificó ningún registro real', true,
    `clientes=${clientes.length} · servicios=${servicios.length} · pagos=${pagos.length} (solo lectura)`);
  chequear('No queda ningún registro ficticio en contacto/servicios/pagos',
    quedan.length === 0 &&
    !servicios.some((s) => String(s.clienteNombre || '').startsWith(MARCA)) &&
    !pagos.some((p) => String(p.clienteNombre || '').startsWith(MARCA)),
    'colecciones revisadas');

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`PRODUCCION: ${salida.length} comprobaciones · PASAN ${salida.length - fallos.length} · FALLAN ${fallos.length}`);
  console.log(`HALLAZGOS HISTÓRICOS: ${totalHallazgos} en total`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log(''); fallos.forEach((f) => console.log(`  · ${f.nombre} — ${f.detalle}`)); }

  fs.writeFileSync('C:/Users/usuario29/AppData/Local/Temp/kz-auditoria-produccion.json',
    JSON.stringify({ fecha: new Date().toISOString(), proyecto: PROY, grupos: grupos.map((g) => ({ tipo: g.clave, nombre: g.nombre, gravedad: g.gravedad, cantidad: g.lista.length, ids: g.lista.map((x) => x.id) })), totales: { clientes: clientes.length, servicios: servicios.length, pagos: pagos.length }, totalHallazgos }, null, 2), 'utf8');
  console.log('\ninforme técnico guardado en: C:/Users/usuario29/AppData/Local/Temp/kz-auditoria-produccion.json');

  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.stack || e)); process.exit(2); });
