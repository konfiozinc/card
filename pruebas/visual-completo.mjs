/* KZ-UNIFICACION-002 · Recorrido visual completo (Playwright) contra emuladores demo-*.
 * Sale con 0 solo si TODAS las operaciones obligatorias dan PASS.
 * Uso: node pruebas/visual-completo.mjs <raiz> <evidencias>
 */
import { chromium } from '../herramientas/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const raiz = process.argv[2];
const evid = process.argv[3];
const BASE = 'http://127.0.0.1:5500';
const PROYECTO = 'demo-kz-crm-prospectos';
const AUTH_EMU = 'http://127.0.0.1:9099';
const FS_EMU = 'http://127.0.0.1:8080';
const EMAIL = 'admin.prueba@demo.test';
const CLAVE = 'PruebaDemo123!';

const resultados = [];
const consola = [];
const red = [];
let produccion = 0;
const anota = (n, e, d = '') => { resultados.push({ n, e, d }); console.log(`${e} · ${n}${d ? ' → ' + d : ''}`); };
const paso = async (n, fn) => { try { const d = await fn(); anota(n, 'PASS', d || ''); return true; } catch (e) { anota(n, 'FAIL', String((e && e.message) || e).slice(0, 140)); return false; } };
mkdirSync(evid, { recursive: true });

const semilla = async () => {
  const alta = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: CLAVE, returnSecureToken: true }),
  });
  const c = await alta.json().catch(() => ({}));
  const doc = `projects/${PROYECTO}/databases/(default)/documents/usuarios/${encodeURIComponent(EMAIL)}`;
  const r = await fetch(`${FS_EMU}/v1/${doc}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { rol: { stringValue: 'ADMIN' }, activo: { booleanValue: true }, email: { stringValue: EMAIL } } }),
  });
  if (!r.ok) throw new Error('siembra HTTP ' + r.status);
  return 'uid=' + String(c.localId || '').slice(0, 10) + '… ficha creada';
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
await contexto.route('**/*', (ruta) => {
  const u = ruta.request().url();
  if (!u.includes('127.0.0.1') && /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|firebaseio\.com/.test(u)) { produccion += 1; return ruta.abort(); }
  return ruta.continue();
});
const pagina = await contexto.newPage();
pagina.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 160)); });
pagina.on('requestfailed', (r) => red.push(r.url().slice(0, 120)));

const entrar = async () => {
  await pagina.goto(BASE + '/admin/dashboard.html', { waitUntil: 'networkidle', timeout: 45000 });
  const correo = pagina.locator('input[type=email], #email, #correo').first();
  if (await correo.count()) {
    await correo.fill(EMAIL);
    await pagina.locator('input[type=password]').first().fill(CLAVE);
    await pagina.locator('button[type=submit], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
    await pagina.waitForTimeout(4500);
  }
  if (await pagina.locator('input[type=password]').count()) throw new Error('login no superado');
  return (await pagina.title()).slice(0, 60);
};

try {
  await paso('Sembrar usuario ADMIN y su ficha en los emuladores', semilla);
  await paso('Iniciar sesión en Card Spark con la cuenta ficticia', entrar);
  await paso('Dashboard original visible', async () => {
    const n = await pagina.locator('nav a, aside a, .sidebar a').count();
    if (n === 0) throw new Error('sin navegación');
    await pagina.screenshot({ path: evid + '/01-dashboard.png' });
    return 'enlaces=' + n;
  });
  await paso('Entrada "Seguimiento comercial" en el menú', async () => {
    const n = await pagina.locator('text=Seguimiento comercial').count();
    if (n === 0) throw new Error('no está en el menú');
    return 'coincidencias=' + n;
  });
  await paso('Abrir Seguimiento sin segundo inicio de sesión', async () => {
    await pagina.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'networkidle', timeout: 45000 });
    if (await pagina.locator('input[type=password]').count()) throw new Error('pidió login otra vez');
    if (!(await pagina.locator('#vg-seguimiento').isVisible())) throw new Error('sección no visible');
    await pagina.screenshot({ path: evid + '/02-seguimiento.png' });
    return 'visible';
  });
  await paso('Crear prospecto ficticio', async () => {
    await pagina.fill('#vg-nombre', 'Prospecto Ficticio V2');
    await pagina.fill('#vg-telefono', '3001234567');
    await pagina.locator('#vg-servicio').selectOption({ index: 1 });
    await pagina.locator('#vg-alta button[type=submit]').click();
    await pagina.waitForTimeout(3200);
    const filas = await pagina.locator('#vg-lista tr').count();
    if (filas === 0) throw new Error('listado vacío');
    return 'filas=' + filas;
  });
  await paso('Rechazo de duplicado', async () => {
    await pagina.fill('#vg-nombre', 'Prospecto Ficticio V2');
    await pagina.fill('#vg-telefono', '3001234567');
    await pagina.locator('#vg-servicio').selectOption({ index: 1 });
    await pagina.locator('#vg-alta button[type=submit]').click();
    await pagina.waitForTimeout(2800);
    const aviso = await pagina.locator('#vg-aviso').innerText();
    if (!/ya existe|duplicad/i.test(aviso)) throw new Error('no rechazado: ' + aviso.slice(0, 50));
    return 'aviso mostrado';
  });
  await paso('Cambiar estado (transición permitida)', async () => {
    const b = pagina.locator('#vg-lista button[data-mover]').first();
    if (!(await b.count())) throw new Error('sin botón de transición');
    await b.click();
    await pagina.waitForTimeout(3200);
    const t = await pagina.locator('#vg-lista').innerText();
    if (!/CONTACTADO|PENDIENTE_CONTACTAR/.test(t)) throw new Error('estado sin cambiar');
    return 'avanzó';
  });
  await paso('Registrar nota interna', async () => {
    pagina.once('dialog', (d) => d.accept('Nota ficticia de prueba'));
    await pagina.locator('#vg-lista button[data-nota]').first().click();
    await pagina.waitForTimeout(3200);
    return 'nota enviada';
  });
  await paso('Persistencia tras recargar', async () => {
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForTimeout(2500);
    if (!/Prospecto Ficticio V2/.test(await pagina.locator('#vg-lista').innerText())) throw new Error('no persistió');
    return 'sobrevive a la recarga';
  });
  await paso('Apariencia móvil 375x667', async () => {
    const m = await contexto.newPage();
    await m.setViewportSize({ width: 375, height: 667 });
    await m.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'networkidle', timeout: 45000 });
    await m.waitForTimeout(1500);
    await m.screenshot({ path: evid + '/03-movil.png', fullPage: true });
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    await m.close();
    if (ancho > 400) throw new Error('desbordamiento ' + ancho);
    return 'sin desbordamiento';
  });
  await paso('Sin errores críticos de consola', async () => {
    const graves = consola.filter((c) => /Uncaught|is not a function|permission-denied/i.test(c));
    if (graves.length) throw new Error(graves[0]);
    return 'consola=' + consola.length;
  });
  await paso('Cero conexiones a Firebase de producción', async () => {
    const r = await fetch(BASE + '/__intentos-produccion').then((x) => x.json()).catch(() => ({ total: 0 }));
    if (produccion + (r.total || 0) > 0) throw new Error('intentos=' + (produccion + r.total));
    return 'bloqueado y contado';
  });
} finally {
  writeFileSync(evid + '/resultado-visual.json', JSON.stringify({ resultados, consola, red, peticiones_a_produccion: produccion }, null, 2));
  await navegador.close();
}

const fallos = resultados.filter((r) => r.e !== 'PASS').length;
console.log(`RESUMEN: ${resultados.length} comprobaciones · PASS=${resultados.length - fallos} · FAIL=${fallos} · consola=${consola.length} · produccion=${produccion}`);
console.log(fallos === 0 ? 'RESULTADO GLOBAL: PASS' : 'RESULTADO GLOBAL: FAIL');
process.exit(fallos === 0 ? 0 : 1);
