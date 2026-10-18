/* ═══════════════════════════════════════════════════════════════════
   pruebas-loteB-p1.js · KONFÍO ZINC — CARD
   Cobertura pendiente del CRM (LOTE B):

     1. Eliminar cliente (baja lógica) y qué pasa con la restauración.
     2. Crear un plan nuevo desde el panel.
     3. Exportar el CSV de contactos.
     4. Exactitud de los KPIs del dashboard (conteos e ingresos del mes).

   Contra Auth 9099 / Firestore 8080 / Hosting 5000 en 127.0.0.1,
   proyecto demo-card-seguridad, con datos ficticios.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5000';
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const PROYECTO = 'demo-card-seguridad';
const K = 'clave-ficticia';
const DESCARGAS = path.join(process.env.TEMP, 'kz-descargas-loteB');

const u = (r) => `${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
const ts = (x) => ({ timestampValue: x });

const LOCAL = (url) => {
  try { const x = new URL(url); return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(x.hostname); }
  catch (e) { return true; }
};

const ROLES = {
  OPERADOR: { email: 'operador@crm.test', pass: 'Ficticia#1' },
  ADMIN: { email: 'admin@crm.test', pass: 'Ficticia#1' },
  SUPERADMIN: { email: 'superadmin@crm.test', pass: 'Ficticia#1' },
};

async function pedir(metodo, url, cuerpo, token) {
  const h = {};
  if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = { crudo: txt }; }
  return { st: r.status, j };
}
async function crear(coleccion, id, campos, token = 'owner') {
  const r = await pedir('POST', `${u(coleccion)}?documentId=${id}`, { fields: campos }, token);
  if (r.st === 409) return pedir('PATCH', `${u(coleccion + '/' + id)}`, { fields: campos }, token);
  return r;
}
const leerDoc = async (ruta) => (await pedir('GET', u(ruta), undefined, 'owner')).j;

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = (d) => { const x = new Date(hoy); x.setDate(x.getDate() + d); return iso(x); };
const mesAnterior = () => { const x = new Date(hoy); x.setMonth(x.getMonth() - 1); return iso(x); };

const salida = [];
function anotar(nombre, estado, detalle) {
  /* Acepta true/false además de 'APROBADO'/'FALLIDO'/'BLOQUEADO'. */
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  salida.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : 'BLOQ';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(44)} ${detalle || ''}`);
}

async function login(pag, rol) {
  await pag.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1200);
  await pag.fill('#login-email', ROLES[rol].email);
  await pag.fill('#login-pass', ROLES[rol].pass);
  await pag.click('#login-btn');
  await pag.waitForURL('**/dashboard.html', { timeout: 20000 });
}
const toasts = (pag) => pag.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' | '));

/* ── Siembra con cifras conocidas para auditar los KPIs ───────────── */
async function sembrar() {
  await fetch(`${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  const ids = {};
  for (const [rol, r] of Object.entries(ROLES)) {
    let a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { email: r.email, password: r.pass, returnSecureToken: true });
    if (a.st !== 200) a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { email: r.email, password: r.pass, returnSecureToken: true });
    ids[rol] = a.j.localId;
    await crear('usuarios', a.j.localId, { email: s(r.email), nombre: s(rol + ' Ficticio'), rol: s(rol), activo: b(true) });
  }

  /* 3 ACTIVO · 1 POR_VENCER · 1 PENDIENTE_PAGO · 1 INACTIVO · 1 SUSPENDIDO · 1 INHABILITADO */
  const clientes = [
    ['c1', 'ACTIVO', 60], ['c2', 'ACTIVO', 90], ['c3', 'ACTIVO', 200],
    ['c4', 'POR_VENCER', 10], ['c5', 'PENDIENTE_PAGO', -20],
    ['c6', 'INACTIVO', 45], ['c7', 'SUSPENDIDO', 70], ['c8', 'INHABILITADO', 120],
  ];
  for (const [id, estado, dv] of clientes) {
    await crear('clientes', id, {
      nombre: s('Cliente ' + id.toUpperCase()), telefono: s('30000000' + id.slice(-1)),
      servicio: s('Tarjetas Digitales'), precio: n(99900), fechaActivacion: s(masDias(-100)),
      fechaVencimiento: s(masDias(dv)), estadoCliente: s(estado), estadoServicio: s(estado),
      estado: s(estado), activo: b(estado !== 'INACTIVO'), eliminado: b(false),
    });
  }

  /* Pagos: uno CONFIRMADO de este mes (cuenta), otro del mes pasado y uno PENDIENTE (no cuentan) */
  await crear('pagos', 'pago-mes', {
    clienteId: s('c1'), clienteNombre: s('Cliente C1'), monto: n(99900), metodoPago: s('Nequi'),
    fechaPago: s(iso(hoy)), estado: s('CONFIRMADO'), registradoPor: s(ids.OPERADOR),
    registradoPorNombre: s('Operador Ficticio'), createdAt: ts(new Date().toISOString()),
  });
  await crear('pagos', 'pago-viejo', {
    clienteId: s('c1'), clienteNombre: s('Cliente C1'), monto: n(50000), metodoPago: s('Nequi'),
    fechaPago: s(mesAnterior()), estado: s('CONFIRMADO'), registradoPor: s(ids.OPERADOR),
    registradoPorNombre: s('Operador Ficticio'), createdAt: ts(new Date().toISOString()),
  });
  await crear('pagos', 'pago-pend', {
    clienteId: s('c2'), clienteNombre: s('Cliente C2'), monto: n(20000), metodoPago: s('Nequi'),
    fechaPago: s(iso(hoy)), estado: s('PENDIENTE'), registradoPor: s(ids.OPERADOR),
    registradoPorNombre: s('Operador Ficticio'), createdAt: ts(new Date().toISOString()),
  });

  /* Contactos para el CSV */
  for (let i = 1; i <= 3; i++) {
    await crear('contactos', 'con-' + i, {
      nombre: s('Contacto Ficticio ' + i), email: s('contacto' + i + '@ficticio.test'),
      telefono: s('30011100' + i), servicio: s('Tarjetas Digitales'),
      mensaje: s('Mensaje ficticio número ' + i), origen: s('contacto'), estado: s('NUEVO'),
      createdAt: ts(new Date().toISOString()),
    });
  }
  return ids;
}

(async () => {
  fs.mkdirSync(DESCARGAS, { recursive: true });
  for (const f of fs.readdirSync(DESCARGAS)) fs.unlinkSync(path.join(DESCARGAS, f));

  console.log('\n═══ SIEMBRA ═══');
  await sembrar();
  console.log('  8 clientes (3 activos, 1 por vencer, 1 vencido, 1 inactivo, 1 suspendido, 1 inhabilitado)');
  console.log('  3 pagos (1 confirmado del mes: 99.900 · 1 confirmado del mes pasado · 1 pendiente) · 3 contactos');

  const nav = await chromium.launch({ headless: true });
  let peticiones = 0; const externas = [];

  async function sesion(rol) {
    const ctx = await nav.newContext({ acceptDownloads: true });
    const pag = await ctx.newPage();
    const errores = [];
    pag.on('pageerror', (e) => errores.push(e.message));
    await pag.route('**/*', async (ruta) => {
      const url = ruta.request().url();
      peticiones++;
      if (!LOCAL(url)) { externas.push(url); await ruta.abort('blockedbyclient'); } else await ruta.continue();
    });
    await login(pag, rol);
    return { ctx, pag, errores };
  }

  /* ═══ 1 · KPIs DEL DASHBOARD ═════════════════════════════════════ */
  console.log('\n═══ 1 · KPIs DEL DASHBOARD ═══');
  {
    const { ctx, pag } = await sesion('ADMIN');
    await pag.goto(`${BASE}/admin/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2500);
    const kpis = await pag.evaluate(() => {
      const out = {};
      document.querySelectorAll('.kpi').forEach((k) => {
        const label = (k.querySelector('.kpi__label') || {}).textContent || '';
        const valor = (k.querySelector('.kpi__valor') || {}).textContent || '';
        out[label.trim().toLowerCase()] = valor.trim();
      });
      return out;
    });
    const esperado = { 'clientes activos': '3', 'por vencer': '1', 'pendientes de pago': '1', 'inactivos': '1', 'suspendidos': '1' };
    let ok = true; const detalle = [];
    for (const [k, v] of Object.entries(esperado)) {
      const real = kpis[k];
      if (real !== v) ok = false;
      detalle.push(`${k}=${real === undefined ? 'AUSENTE' : real}${real === v ? '' : ' (esperado ' + v + ')'}`);
    }
    anotar('KPIs: conteos por estado', ok ? 'APROBADO' : 'FALLIDO', detalle.join(' · '));

    /* ingresos del mes: solo el pago CONFIRMADO de este mes */
    const textoIngresos = await pag.evaluate(() => {
      const k = [...document.querySelectorAll('.kpi')].find((x) => /ingresos/i.test(x.textContent || ''));
      return k ? k.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    const ingresosOk = /99\.900/.test(textoIngresos) && !/149\.900|169\.900/.test(textoIngresos);
    anotar('KPIs: ingresos del mes suman solo lo confirmado de este mes', ingresosOk ? 'APROBADO' : 'FALLIDO',
      textoIngresos || 'no se encontró el KPI de ingresos');
    await ctx.close();
  }

  /* ═══ 2 · CSV DE CONTACTOS ═══════════════════════════════════════ */
  console.log('\n═══ 2 · CSV DE CONTACTOS ═══');
  {
    const { ctx, pag } = await sesion('ADMIN');
    await pag.goto(`${BASE}/admin/contactos.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    try {
      const [descarga] = await Promise.all([
        pag.waitForEvent('download', { timeout: 25000 }),
        pag.click('#btn-csv'),
      ]);
      const destino = path.join(DESCARGAS, 'contactos.csv');
      await descarga.saveAs(destino);
      const contenido = fs.readFileSync(destino, 'utf8');
      const lineas = contenido.trim().split('\n');
      const tieneCabecera = /nombre|email|mensaje/i.test(lineas[0] || '');
      const filas = lineas.length - 1;
      anotar('CSV de contactos: se descarga con los datos ficticios',
        tieneCabecera && filas === 3 && /Contacto Ficticio/i.test(contenido),
        `${descarga.suggestedFilename()} · ${lineas.length} líneas (${filas} contactos) · ${contenido.length} B`);
      anotar('CSV de contactos: cabecera reconocible', tieneCabecera ? 'APROBADO' : 'FALLIDO', (lineas[0] || '').slice(0, 110));
    } catch (e) {
      anotar('CSV de contactos: se descarga con los datos ficticios', 'FALLIDO', 'sin descarga: ' + e.message.slice(0, 80));
    }
    await ctx.close();
  }

  /* ═══ 3 · ELIMINAR CLIENTE (baja lógica) ═════════════════════════ */
  console.log('\n═══ 3 · ELIMINAR CLIENTE ═══');
  {
    const { ctx, pag } = await sesion('SUPERADMIN');
    await pag.goto(`${BASE}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    const btn = await pag.$('tr[data-id="c2"] button[data-a="eliminar"]');
    if (!btn) {
      anotar('Eliminar cliente: baja lógica', 'FALLIDO', 'no hay botón eliminar para SUPERADMIN');
    } else {
      await btn.click();
      await pag.waitForTimeout(600);
      const conf = await pag.$('.modal.is-open button[data-r="1"]');
      if (conf) await conf.click();
      await pag.waitForTimeout(2800);
      const doc = await leerDoc('clientes/c2');
      const eliminado = doc.fields.eliminado && doc.fields.eliminado.booleanValue;
      const activo = doc.fields.activo && doc.fields.activo.booleanValue;
      const estado = doc.fields.estadoCliente && doc.fields.estadoCliente.stringValue;
      anotar('Eliminar cliente: baja lógica (no borra el documento)',
        eliminado === true && activo === false && estado === 'INHABILITADO',
        `eliminado=${eliminado} · activo=${activo} · estadoCliente=${estado}`);

      const enLista = await pag.evaluate(() => !!document.querySelector('tr[data-id="c2"]'));
      anotar('Eliminar cliente: desaparece de la lista', enLista === false, enLista ? 'sigue visible' : 'oculto de la lista');

      /* el filtro de eliminados lo muestra (hay que volver a buscar el
         checkbox: la tabla se repinta después de eliminar) */
      let vuelve = false;
      if (await pag.$('#f-eliminados')) {
        await pag.check('#f-eliminados');
        await pag.waitForTimeout(2200);
        vuelve = await pag.evaluate(() => !!document.querySelector('tr[data-id="c2"]'));
      }
      anotar('Eliminar cliente: el filtro «mostrar eliminados» lo recupera', vuelve, vuelve ? 'visible con el filtro' : 'no aparece ni con el filtro');

      /* ¿existe restauración? */
      const hayRestaurar = await pag.evaluate(() => {
        const acciones = [...document.querySelectorAll('tr[data-id="c2"] button[data-a]')].map((x) => x.dataset.a);
        return acciones;
      });
      const puedeRestaurar = hayRestaurar.some((a) => /restaur|activar/i.test(a));
      anotar('Eliminar cliente: existe acción de restauración',
        puedeRestaurar ? 'APROBADO' : 'BLOQUEADO',
        puedeRestaurar ? 'botones: ' + hayRestaurar.join(', ') : 'no hay acción de restaurar (botones: ' + hayRestaurar.join(', ') + ')');
    }
    await ctx.close();
  }

  /* ═══ 4 · CREAR PLAN NUEVO ═══════════════════════════════════════ */
  console.log('\n═══ 4 · CREAR PLAN NUEVO ═══');
  {
    /* El catálogo inicial es acción de SUPERADMIN: el botón solo lo ve ese rol
       (lo comprueba el LOTE C). Se entra con SUPERADMIN para ejercitarlo; con
       ADMIN la página no lo muestra, y esperarlo provocaba un tiempo de espera
       de 30 s que no era un fallo del panel. */
    const { ctx, pag } = await sesion('SUPERADMIN');
    await pag.goto(`${BASE}/admin/planes.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2000);
    const panorama = await pag.evaluate(() => ({
      botones: [...document.querySelectorAll('button, a.btn')].map((x) => (x.id || '') + '|' + (x.textContent || '').trim().slice(0, 28)),
      accionesFila: [...document.querySelectorAll('button[data-a]')].map((x) => x.dataset.a),
      hayFormulario: !!document.getElementById('plan-form'),
      filas: document.querySelectorAll('table tbody tr').length,
    }));
    const botonNuevo = panorama.botones.some((t) => /nuevo|crear|añadir|agregar|new/i.test(t));
    anotar('Crear plan: ¿hay botón o formulario para crear uno nuevo?',
      botonNuevo ? 'APROBADO' : 'BLOQUEADO',
      `botones en la página: ${panorama.botones.join(' · ')} · acciones de fila: ${panorama.accionesFila.join(', ') || 'ninguna'} · filas: ${panorama.filas}`);

    /* Lo que sí existe: catálogo inicial y edición */
    const haySemilla = await pag.locator('#btn-seed').count();
    anotar('Planes: el SUPERADMIN ve «Cargar catálogo inicial»',
      haySemilla > 0 ? 'APROBADO' : 'FALLIDO', `${haySemilla} botón(es)`);
    if (haySemilla > 0) {
      await pag.click('#btn-seed');
      await pag.waitForTimeout(2800);
      const trasSeed = await pag.evaluate(() => document.querySelectorAll('table tbody tr').length);
      anotar('Planes: «Cargar catálogo inicial» funciona', trasSeed > 0 ? 'APROBADO' : 'FALLIDO', `${trasSeed} planes tras pulsar el botón`);
    } else {
      anotar('Planes: «Cargar catálogo inicial» funciona', 'BLOQUEADO', 'no hay botón para el rol de la prueba');
    }
    await ctx.close();
  }

  await nav.close();
  const fallos = salida.filter((x) => x.estado === 'FALLIDO');
  const bloqueos = salida.filter((x) => x.estado === 'BLOQUEADO');
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.filter(x => x.estado === 'APROBADO').length} · FALLIDAS: ${fallos.length} · BLOQUEADAS: ${bloqueos.length}`);
  console.log(`RED: ${peticiones} peticiones · externas: ${externas.length}`);
  if (externas.length) for (const x of [...new Set(externas)].slice(0, 5)) console.log('   EXTERNA → ' + x);
  if (bloqueos.length) {
    console.log('\nBLOQUEADAS (funcionalidad ausente, no error de ejecución):');
    for (const x of bloqueos) console.log(`  · ${x.nombre} — ${x.detalle}`);
  }
  console.log('══════════════════════════════════════════════════════════════\n');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(2); });
