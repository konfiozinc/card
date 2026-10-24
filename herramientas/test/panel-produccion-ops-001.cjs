/* KZ-OPS-001 · Verificación del PANEL en producción con datos ficticios.
   Crea una cuenta de QA y un cliente de QA, prueba el recorrido de lectura y la
   creación de un servicio (el defecto D1), y limpia TODO lo creado.

   No toca ningún cliente, servicio ni pago real. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SA = 'C:/Users/usuario29/Documents/KONFIO_ZINC/14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json';
const sa = JSON.parse(fs.readFileSync(SA, 'utf8'));
const PROY = sa.project_id;
const FS = `https://firestore.googleapis.com/v1/projects/${PROY}/databases/(default)/documents`;
const SITIO = 'https://konfiozinc.github.io/card';
const MARCA = 'QA OPS-001 FICTICIO';
const CLAVE = 'AIzaSyDbwAk9APwP2SeaEfWxeQG_bdL9eatciEA';
const PASS = 'QaOps001#2026ficticio';

const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(58)} ${detalle || ''}`);
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token(scope) {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cue = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }));
  const firma = crypto.createSign('RSA-SHA256').update(cab + '.' + cue).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: cab + '.' + cue + '.' + b64url(firma) })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sin token');
  return j.access_token;
}

const F = {
  s: (v) => ({ stringValue: v }),
  i: (v) => ({ integerValue: String(v) }),
  b: (v) => ({ booleanValue: v }),
  nulo: () => ({ nullValue: null }),
  ts: () => ({ timestampValue: new Date().toISOString() })
};
const planos = (fields) => {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) o[k] = v.stringValue;
    else if ('integerValue' in v) o[k] = Number(v.integerValue);
    else if ('booleanValue' in v) o[k] = v.booleanValue;
    else if ('timestampValue' in v) o[k] = v.timestampValue;
    else if ('nullValue' in v) o[k] = null;
  }
  return o;
};

async function api(tok, metodo, url, cuerpo) {
  const h = { Authorization: 'Bearer ' + tok };
  if (cuerpo) h['Content-Type'] = 'application/json';
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { j = {}; }
  return { st: r.status, j };
}

async function crearUsuarioAuth(tok, email, password) {
  const r = await api(tok, 'POST',
    `https://identitytoolkit.googleapis.com/v1/projects/${PROY}/accounts`, { email, password });
  return r.j.localId || null;
}
async function borrarUsuarioAuth(tok, localId) {
  return api(tok, 'POST',
    `https://identitytoolkit.googleapis.com/v1/projects/${PROY}/accounts:delete`, { localId });
}

(async () => {
  const tok = await token('https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform');
  const email = `qa-ops-001-${Date.now().toString().slice(-6)}@konfio-zinc.invalid`;
  let uid = null;
  const ids = { cliente: null, servicios: [] };

  try {
    /* ═══ 1 · Cuenta de prueba ═══ */
    console.log('═══ 1 · CUENTA DE PRUEBA (ficticia) ═══');
    uid = await crearUsuarioAuth(tok, email, PASS);
    chequear('Se crea la cuenta de prueba', !!uid, uid ? 'uid ' + uid.slice(0, 8) + '…' : 'sin uid');
    const rUser = await api(tok, 'PATCH', `${FS}/usuarios/${uid}`, {
      fields: { email: F.s(email), nombre: F.s(MARCA + ' ADMIN'), rol: F.s('ADMIN'), activo: F.b(true), createdAt: F.ts() }
    });
    chequear('La ficha de usuario de prueba queda con rol ADMIN', rUser.st === 200, 'HTTP ' + rUser.st);

    /* ═══ 2 · Navegación del panel ═══ */
    console.log('\n═══ 2 · PANEL EN PRODUCCIÓN (lectura) ═══');
    const PW = path.join(__dirname, '..', 'node_modules', 'playwright');
    const { chromium } = require(PW);
    const nav = await chromium.launch({ headless: true });
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const pag = await ctx.newPage();
    const errores = [];
    pag.on('pageerror', (e) => errores.push(e.message));

    await pag.goto(`${SITIO}/admin/index.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(2500);
    await pag.fill('#login-email', email);
    await pag.fill('#login-pass', PASS);
    await pag.click('#login-btn');
    let loginOk = true;
    try { await pag.waitForURL('**/dashboard.html', { timeout: 30000 }); } catch (e) { loginOk = false; }
    chequear('Login con la cuenta de prueba y llegada al dashboard', loginOk, loginOk ? 'dashboard cargado' : 'no llegó');

    if (loginOk) {
      await pag.waitForSelector('.kpi', { timeout: 20000 }).catch(() => {});
      await pag.waitForTimeout(1500);
      const kpis = await pag.evaluate(() => document.querySelectorAll('.kpi').length);
      chequear('El dashboard pinta sus KPIs leyendo Firestore real', kpis >= 10, `${kpis} KPIs`);

      const paginas = [['clientes.html', 'Clientes'], ['servicios.html', 'Servicios'],
        ['contactos.html', 'Contactos'], ['vencimientos.html', 'Vencimientos'],
        ['pagos.html', 'Pagos'], ['notificaciones.html', 'Notificaciones']];
      for (const [ruta, nombre] of paginas) {
        await pag.goto(`${SITIO}/admin/${ruta}`, { waitUntil: 'domcontentloaded' });
        await pag.waitForTimeout(2500);
        const est = await pag.evaluate(() => ({
          contenido: (document.getElementById('app-content') || {}).children?.length || 0,
          texto: ((document.getElementById('app-content') || {}).innerText || '').slice(0, 120)
        }));
        chequear(`La página «${nombre}» carga con las reglas desplegadas`, est.contenido > 0,
          `${est.contenido} bloque(s) · «${est.texto.replace(/\n/g, ' ').slice(0, 60)}»`);
      }

      /* ═══ 3 · D1 en producción: crear un servicio ═══ */
      console.log('\n═══ 3 · DEFECTO D1 EN PRODUCCIÓN: ALTA DE SERVICIO ═══');
      const hoy = new Date();
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const vence = new Date(hoy); vence.setMonth(vence.getMonth() + 12);
      const rCli = await api(tok, 'POST', `${FS}/clientes`, {
        fields: {
          nombre: F.s(MARCA + ' CLIENTE'), telefono: F.s('3000000000'), whatsapp: F.s('3000000000'),
          email: F.s('qa.cliente@example.invalid'), empresa: F.s(''), documento: F.nulo(),
          ciudad: F.s(''), servicio: F.s('Tarjetas Digitales'), categoria: F.s('MINI WEB BÁSICA'),
          planId: F.nulo(), planNombre: F.nulo(), precio: F.i(49900), metodoPagoPreferido: F.nulo(),
          fechaActivacion: F.s(iso(hoy)), fechaVencimiento: F.s(iso(vence)),
          estadoCliente: F.s('ACTIVO'), estadoServicio: F.s('ACTIVO'),
          urlServicio: F.nulo(), proyectoId: F.nulo(), observaciones: F.s(MARCA),
          activo: F.b(true), eliminado: F.b(false), createdAt: F.ts(), updatedAt: F.ts()
        }
      });
      ids.cliente = rCli.j.name ? rCli.j.name.split('/').pop() : null;
      chequear('Se crea el cliente ficticio de prueba', rCli.st === 200 && !!ids.cliente, 'id ' + (ids.cliente || '—'));

      await pag.goto(`${SITIO}/admin/clientes.html`, { waitUntil: 'domcontentloaded' });
      await pag.waitForTimeout(3000);
      const fila = pag.locator('tbody tr', { hasText: 'QA OPS-001 FICTICIO CLIENTE' });
      const hayFila = await fila.count();
      chequear('El cliente ficticio aparece en la lista del panel', hayFila === 1, `${hayFila} fila(s)`);

      if (hayFila === 1) {
        await fila.locator('button[data-a="ver"]').click();
        await pag.waitForSelector('#det-servicio-form', { timeout: 20000 });
        await pag.waitForTimeout(2000);
        await pag.selectOption('#ds-servicio', 'Tarjetas Digitales');
        await pag.fill('#ds-precio', '49900');
        await pag.fill('#ds-vence', iso(vence));
        await pag.click('#det-servicio-form button[type="submit"]');
        await pag.waitForTimeout(4000);

        const snap = await api(tok, 'GET', `${FS}/servicios?pageSize=200`);
        const todos = (snap.j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...planos(d.fields) }));
        const suyos = todos.filter((s) => s.clienteId === ids.cliente);
        ids.servicios = suyos.map((s) => s.id);
        chequear('D1 CORREGIDO: el servicio se crea desde el panel en producción',
          suyos.length >= 1, `${suyos.length} servicio(s) asociado(s)`);
        if (suyos.length) {
          chequear('El servicio guarda createdAt (la clave que bloqueaba el alta)',
            !!suyos[0].createdAt, 'createdAt = ' + String(suyos[0].createdAt).slice(0, 19));
          chequear('El servicio nace ACTIVO con su vencimiento',
            suyos[0].estado === 'ACTIVO' && !!suyos[0].fechaVencimiento,
            `${suyos[0].estado} · vence ${suyos[0].fechaVencimiento}`);
        }
      }

      chequear('Sin errores de JavaScript en el recorrido del panel',
        errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');
    }

    await nav.close();
  } catch (e) {
    console.error('\n[ERROR durante la verificación] ' + (e && e.message || e));
  } finally {
    /* ═══ 4 · Limpieza de TODO lo ficticio ═══ */
    console.log('\n═══ 4 · LIMPIEZA DE DATOS FICTICIOS ═══');
    for (const id of ids.servicios) {
      const r = await api(tok, 'DELETE', `${FS}/servicios/${id}`);
      console.log('      servicio ' + id + ' → HTTP ' + r.st);
    }
    if (ids.cliente) {
      const r = await api(tok, 'DELETE', `${FS}/clientes/${ids.cliente}`);
      console.log('      cliente  ' + ids.cliente + ' → HTTP ' + r.st);
    }
    /* bitácora generada por la cuenta de prueba */
    for (const col of ['auditoria', 'historial_estados', 'notificaciones']) {
      const snap = await api(tok, 'GET', `${FS}/${col}?pageSize=300`);
      for (const d of snap.j.documents || []) {
        const id = d.name.split('/').pop();
        const p = planos(d.fields);
        const esQa = p.usuarioId === uid || (ids.cliente && p.clienteId === ids.cliente) ||
          String(p.usuarioNombre || '').includes(MARCA) || String(p.clienteNombre || '').includes(MARCA);
        if (esQa) {
          const r = await api(tok, 'DELETE', `${FS}/${col}/${id}`);
          console.log(`      ${col}/${id} → HTTP ${r.st}`);
        }
      }
    }
    if (uid) {
      const r = await borrarUsuarioAuth(tok, uid);
      console.log('      cuenta de prueba → HTTP ' + r.st);
    }

    /* verificación de la limpieza */
    const cli = await api(tok, 'GET', `${FS}/clientes?pageSize=300`);
    const sv = await api(tok, 'GET', `${FS}/servicios?pageSize=300`);
    const us = await api(tok, 'GET', `${FS}/usuarios?pageSize=300`);
    const quedaCli = (cli.j.documents || []).some((d) => String(planos(d.fields).nombre || '').includes(MARCA));
    const quedaSv = (sv.j.documents || []).some((d) => String(planos(d.fields).clienteNombre || '').includes(MARCA));
    const quedaUs = (us.j.documents || []).some((d) => String(planos(d.fields).nombre || '').includes(MARCA));
    chequear('Limpieza completa: no queda ningún registro de QA',
      !quedaCli && !quedaSv && !quedaUs,
      `clientes=${(cli.j.documents || []).length} · servicios=${(sv.j.documents || []).length} · usuarios=${(us.j.documents || []).length}`);

    const fallos = salida.filter((x) => !x.ok);
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(`PANEL EN PRODUCCIÓN: ${salida.length} comprobaciones · PASAN ${salida.length - fallos.length} · FALLAN ${fallos.length}`);
    console.log('══════════════════════════════════════════════════════════════');
    if (fallos.length) { console.log(''); fallos.forEach((f) => console.log(`  · ${f.nombre} — ${f.detalle}`)); }
    process.exit(fallos.length ? 1 : 0);
  }
})();
