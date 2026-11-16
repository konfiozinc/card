/* KZ-UNIFICACION-002 - Prueba focalizada de INICIALIZACION del módulo Seguimiento.
 *
 * POR QUE EXISTE
 * La corrida real del 15-nov-2026 (21:16-21:19) aprobó toda la infraestructura
 * (Auth, Firestore, siembra, login, reglas) y aun así falló 9 comprobaciones:
 * `#app-shell` no tenía navegación, no se redirigía al login sin sesión y el
 * módulo nunca dejó `data-listo`. La causa era una sola: `admin/seguimiento.html`
 * era la ÚNICA de las 17 páginas de /admin/ sin <script type="importmap">, y
 * shell.js/core.js importan con especificadores desnudos ('firebase/auth', …).
 * Sin importmap no se resuelve el grafo de módulos: seguimiento.js no se evalúa
 * y requireAuth() no llega a ejecutarse.
 *
 * Esta prueba comprueba SOLO el arranque, en este orden:
 *   1. La página servida declara el importmap con firebase/auth.
 *   2. Sin sesión: redirige al login y la sección no se ve.
 *   3. ADMIN: el shell pinta la navegación y el enlace «Seguimiento comercial».
 *   4. ADMIN: el módulo inicializa (data-listo), sección visible y servicios cargados.
 *   5. OPERADOR: el enlace NO se pinta y la sección sigue oculta; la página lo
 *      devuelve al dashboard por falta de rol.
 *   6. Ningún error de JavaScript no capturado (pageerror) en todo el recorrido.
 *
 * Uso: node pruebas/inicializacion.mjs <raiz> <evidencias>
 * Salidas: 0 = PASS | 1 = FAIL | 2 = abortado en la preparacion.
 */
import { chromium } from '../herramientas/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { esperarEmuladores, sembrarAdmin, comprobarLogin } from './entorno-emuladores.mjs';

const evid = process.argv[3];
const BASE = 'http://127.0.0.1:5500';
const PROYECTO = process.env.KZ_PROYECTO_DEMO || 'demo-kz-crm-prospectos';
const ADMIN = { email: 'admin.prueba@demo.test', clave: 'PruebaDemo123!' };
const OPERADOR = { email: 'operador.prueba@demo.test', clave: 'PruebaDemo123!' };
const LIMITE_PREP = Number(process.env.KZ_LIMITE_EMULADORES || 180000);
const ESPERA_UI = 25000;

if (!evid) { console.log('FALTA el directorio de evidencias: node pruebas/inicializacion.mjs <raiz> <evidencias>'); process.exit(2); }
mkdirSync(evid, { recursive: true });

const preparacion = [];
const resultados = [];
const pageerrors = [];
let produccion = 0;

const guardar = (extra = {}) => writeFileSync(evid + '/resultado-inicializacion.json', JSON.stringify({
  ...extra, preparacion, resultados, pageerrors, peticiones_a_produccion: produccion,
}, null, 2));

const anota = (n, ok, d = '') => {
  resultados.push({ n, e: ok ? 'PASS' : 'FAIL', d });
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${d ? ' -> ' + d : ''}`);
};

const paso = async (n, fn) => {
  try { const d = await fn(); anota(n, true, d || ''); return true; }
  catch (e) { anota(n, false, String((e && e.message) || e).slice(0, 200)); return false; }
};

const exigir = async (nombre, fn) => {
  try {
    const r = await fn();
    preparacion.push({ n: nombre, e: 'PASS', d: (r && r.detalle) || '' });
    console.log(`PASS - ${nombre}${r && r.detalle ? ' -> ' + r.detalle : ''}`);
    return r && r.valor;
  } catch (e) {
    const motivo = String((e && e.message) || e);
    preparacion.push({ n: nombre, e: 'FAIL', d: motivo });
    console.log(`FAIL - ${nombre} -> ${motivo}`);
    guardar({ abortado: true, paso_fallido: nombre, motivo });
    console.log('');
    console.log('ABORTADO EN LA PREPARACION: ' + nombre);
    console.log('RESULTADO INICIALIZACION: FAIL (abortado antes del navegador)');
    process.exit(2);
  }
};

/* ---------- Preparacion: usuarios ADMIN y OPERADOR ---------- */
await exigir('Emuladores Auth y Firestore disponibles', async () => {
  const t = await esperarEmuladores({ proyecto: PROYECTO, limiteMs: LIMITE_PREP });
  return { valor: t, detalle: `auth en ${t.auth} ms, firestore en ${t.firestore} ms` };
});

const uidAdmin = await exigir('Sembrar usuario ADMIN', async () => {
  const r = await sembrarAdmin({ proyecto: PROYECTO, email: ADMIN.email, clave: ADMIN.clave, rol: 'ADMIN', nombre: 'Admin prueba' });
  await comprobarLogin({ proyecto: PROYECTO, email: ADMIN.email, clave: ADMIN.clave, uidEsperado: r.uid });
  return { valor: r.uid, detalle: `uid=${r.uid} rol=ADMIN` };
});

const uidOperador = await exigir('Sembrar usuario OPERADOR', async () => {
  const r = await sembrarAdmin({ proyecto: PROYECTO, email: OPERADOR.email, clave: OPERADOR.clave, rol: 'OPERADOR', nombre: 'Operador prueba' });
  await comprobarLogin({ proyecto: PROYECTO, email: OPERADOR.email, clave: OPERADOR.clave, uidEsperado: r.uid, rolesPermitidos: ['OPERADOR', 'ADMIN', 'SUPERADMIN'] });
  return { valor: r.uid, detalle: `uid=${r.uid} rol=OPERADOR` };
});

/* ---------- Navegador ---------- */
const navegador = await chromium.launch();

const nuevoContexto = async () => {
  const c = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
  await c.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (!u.includes('127.0.0.1') && /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|firebaseio\.com|firebaseapp\.com/.test(u)) {
      produccion += 1;
      return ruta.abort();
    }
    return ruta.continue();
  });
  const p = await c.newPage();
  p.on('pageerror', (e) => pageerrors.push(String((e && e.message) || e).slice(0, 200)));
  return { c, p };
};

const entrar = async (p, cuenta) => {
  await p.goto(BASE + '/admin/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForSelector('#login-form', { timeout: ESPERA_UI });
  await p.fill('#login-email', cuenta.email);
  await p.fill('#login-pass', cuenta.clave);
  await p.click('#login-btn');
  try {
    await p.waitForURL(/dashboard\.html/, { timeout: 35000 });
  } catch {
    const ver = await p.locator('#login-error').isVisible().catch(() => false);
    const txt = ver ? (await p.locator('#login-error').innerText()).trim().slice(0, 140) : '(sin aviso visible)';
    throw new Error(`login no superado (${cuenta.email}): ${txt} | url=${p.url().replace(BASE, '')}`);
  }
};

try {
  /* 1 · El importmap es el defecto demostrado: se comprueba en el HTML servido. */
  await paso('La página declara importmap con firebase/auth', async () => {
    const html = await fetch(BASE + '/admin/seguimiento.html').then((r) => r.text());
    if (!/type="importmap"/.test(html)) throw new Error('falta <script type="importmap">: el grafo de módulos no se resuelve');
    if (!/"firebase\/auth"\s*:\s*"https:\/\/www\.gstatic\.com/.test(html)) throw new Error('el importmap no mapea "firebase/auth"');
    if (!/<section id="vg-seguimiento"[^>]*\bhidden\b/.test(html)) throw new Error('la seccion no nace oculta en el HTML');
    return 'importmap + seccion oculta por defecto';
  });

  /* 2 · Control negativo: sin sesión no se ve el módulo y se vuelve al login. */
  const anonimo = await nuevoContexto();
  await paso('Sin sesión: redirige al login y no muestra Seguimiento', async () => {
    await anonimo.p.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await anonimo.p.waitForURL(/index\.html/, { timeout: ESPERA_UI }).catch(() => {});
    if (!/index\.html/.test(anonimo.p.url())) throw new Error('no redirigió al login: ' + anonimo.p.url().replace(BASE, ''));
    if (await anonimo.p.locator('#vg-seguimiento').isVisible().catch(() => false)) throw new Error('la sección se ve sin sesión');
    return 'redirigido a ' + anonimo.p.url().replace(BASE, '');
  });
  await anonimo.c.close();

  /* 3 y 4 · ADMIN: shell con navegación y módulo inicializado. */
  const admin = await nuevoContexto();
  await paso('ADMIN inicia sesión', async () => { await entrar(admin.p, ADMIN); return 'url=' + admin.p.url().replace(BASE, ''); });

  await paso('ADMIN: #app-shell pinta la navegación', async () => {
    await admin.p.waitForSelector('#app-shell .side__link', { timeout: ESPERA_UI });
    const n = await admin.p.locator('#app-shell .side__link').count();
    if (n === 0) throw new Error('sin enlaces en #app-shell');
    await admin.p.screenshot({ path: evid + '/10-shell-admin.png' });
    return 'enlaces=' + n;
  });

  await paso('ADMIN: el enlace Seguimiento comercial está en el menú', async () => {
    const n = await admin.p.locator('#app-shell .side__link', { hasText: 'Seguimiento comercial' }).count();
    if (n !== 1) throw new Error('coincidencias=' + n);
    return 'presente 1 vez';
  });

  await paso('ADMIN: el módulo inicializa y deja data-listo', async () => {
    await admin.p.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await admin.p.waitForFunction(() => {
      const s = document.querySelector('#vg-seguimiento');
      return !!s && s.dataset.listo === '1';
    }, null, { timeout: ESPERA_UI });
    if (await admin.p.locator('#login-pass').count()) throw new Error('pidió login otra vez');
    if (!(await admin.p.locator('#vg-seguimiento').isVisible())) throw new Error('sección oculta con sesión ADMIN');
    const opciones = await admin.p.locator('#vg-servicio option').count();
    if (opciones < 6) throw new Error('servicios sin poblar (' + opciones + ')');
    await admin.p.screenshot({ path: evid + '/11-seguimiento-admin.png' });
    return 'data-listo=1, servicios=' + opciones;
  });

  /* 5 · OPERADOR: ni enlace ni sección, y la página lo devuelve al dashboard. */
  const operador = await nuevoContexto();
  await paso('OPERADOR inicia sesión', async () => { await entrar(operador.p, OPERADOR); return 'url=' + operador.p.url().replace(BASE, ''); });

  await paso('OPERADOR: NO ve el enlace Seguimiento comercial', async () => {
    await operador.p.waitForSelector('#app-shell .side__link', { timeout: ESPERA_UI });
    const totales = await operador.p.locator('#app-shell .side__link').count();
    if (totales === 0) throw new Error('el shell no pintó navegación (no se puede concluir nada)');
    const n = await operador.p.locator('#app-shell .side__link', { hasText: 'Seguimiento comercial' }).count();
    if (n !== 0) throw new Error('el enlace se pintó para OPERADOR');
    await operador.p.screenshot({ path: evid + '/12-shell-operador.png' });
    return `enlaces=${totales}, sin Seguimiento`;
  });

  await paso('OPERADOR: la sección sigue oculta y lo devuelven al dashboard', async () => {
    await operador.p.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await operador.p.waitForURL(/dashboard\.html/, { timeout: ESPERA_UI }).catch(() => {});
    if (!/dashboard\.html/.test(operador.p.url())) throw new Error('no lo devolvió al dashboard: ' + operador.p.url().replace(BASE, ''));
    const marcador = await operador.p.getByText('Seguimiento comercial').count();
    if (await operador.p.locator('#vg-seguimiento').isVisible().catch(() => false)) throw new Error('la sección se ve con rol OPERADOR');
    return 'redirigido a ' + operador.p.url().replace(BASE, '') + ' (coincidencias de texto=' + marcador + ')';
  });
  await operador.c.close();

  /* 6 · Ningún error de JavaScript sin capturar. */
  await paso('Sin errores de JavaScript (pageerror)', async () => {
    if (pageerrors.length) throw new Error(pageerrors[0]);
    return 'pageerror=0';
  });

  await paso('Cero conexiones a Firebase de producción', async () => {
    if (produccion > 0) throw new Error('intentos=' + produccion);
    return 'bloqueado y contado';
  });
} finally {
  guardar();
  await navegador.close();
}

const fallos = resultados.filter((r) => r.e !== 'PASS').length;
console.log(`\nRESUMEN INICIALIZACION: ${resultados.length} comprobaciones | PASS=${resultados.length - fallos} | FAIL=${fallos} | pageerror=${pageerrors.length} | produccion=${produccion}`);
console.log(`cuentas: ADMIN uid=${uidAdmin} | OPERADOR uid=${uidOperador}`);
console.log(fallos === 0 ? 'RESULTADO INICIALIZACION: PASS' : 'RESULTADO INICIALIZACION: FAIL');
process.exit(fallos === 0 ? 0 : 1);
