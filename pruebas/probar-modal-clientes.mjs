/* KZ-FORENSIC-FIX-002 · Prueba del MODAL DE EDICIÓN de clientes.
 *
 * POR QUE EXISTE
 * La puerta de calidad abre las 63 páginas, pero NO abre este modal: cuatro de
 * los ocho escapes XSS (precio, activación, vencimiento y monto) viven en su
 * plantilla y sólo se evalúan al pulsar «Editar». Aquí se abre de verdad, en un
 * navegador real, y se comprueba que:
 *   1. el modal abre y renderiza los campos,
 *   2. no se lanza ningún error de JavaScript (pageerror),
 *   3. un nombre con `<script>alert(1)</script>` se muestra COMO TEXTO, sin
 *      ejecutarse (no salta ningún diálogo) y sin perderse,
 *   4. los campos de fecha y precio llegan con su valor.
 *
 * Uso: node pruebas/probar-modal-clientes.mjs <raiz> <evidencias>
 * Requiere el servidor aislado en 5500 y los emuladores en 9099/8080.
 */
import { chromium } from '../herramientas/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { esperarEmuladores, sembrarAdmin, comprobarLogin } from './entorno-emuladores.mjs';

const evid = process.argv[3] || '.';
const BASE = 'http://127.0.0.1:5500';
const PROYECTO = process.env.KZ_PROYECTO_DEMO || 'demo-kz-crm-prospectos';
const ADMIN = { email: 'admin.prueba@demo.test', clave: 'PruebaDemo123!' };
const PAYLOAD = '<script>alert(1)</script> Cliente Prueba';
const FS = 'http://127.0.0.1:8080/v1/projects/' + PROYECTO + '/databases/(default)/documents';

mkdirSync(evid, { recursive: true });
const resultados = [];
const pageerrors = [];
const dialogos = [];
const anota = (n, ok, d = '') => { resultados.push({ n, e: ok ? 'PASS' : 'FAIL', d }); console.log(`${ok ? 'PASS' : 'FAIL'} - ${n}${d ? ' -> ' + d : ''}`); };
const paso = async (n, fn) => {
  try { const d = await fn(); anota(n, true, d || ''); return true; }
  catch (e) { anota(n, false, String((e && e.message) || e).slice(0, 200)); return false; }
};

/* ── preparación ─────────────────────────────────────────────────────── */
await esperarEmuladores({ proyecto: PROYECTO, limiteMs: 180000, log: () => {} });
const { uid } = await sembrarAdmin({ proyecto: PROYECTO, email: ADMIN.email, clave: ADMIN.clave, rol: 'ADMIN' });
await comprobarLogin({ proyecto: PROYECTO, email: ADMIN.email, clave: ADMIN.clave, uidEsperado: uid });

/* Cliente con carga maliciosa en el nombre, sembrado con permisos de dueño. */
const campos = { fields: {
  nombre: { stringValue: PAYLOAD },
  telefono: { stringValue: '3001234567' },
  servicio: { stringValue: 'Mini Web Basica' },
  precio: { integerValue: '49900' },
  fechaActivacion: { stringValue: '2026-01-15' },
  fechaVencimiento: { stringValue: '2027-01-15' },
  estadoCliente: { stringValue: 'ACTIVO' },
  estadoServicio: { stringValue: 'ACTIVO' },
  activo: { booleanValue: true },
} };
const alta = await fetch(`${FS}/clientes/cliente-modal-prueba`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify(campos),
});
if (!alta.ok) { console.log('No se pudo sembrar el cliente: HTTP ' + alta.status); process.exit(2); }

/* ── navegador ───────────────────────────────────────────────────────── */
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
const pagina = await contexto.newPage();
pagina.on('pageerror', (e) => pageerrors.push(String((e && e.message) || e).slice(0, 200)));
pagina.on('dialog', async (d) => { dialogos.push(d.type() + ':' + d.message()); await d.dismiss(); });
const consola = [];
pagina.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 160)); });

try {
  await paso('ADMIN inicia sesión', async () => {
    await pagina.goto(BASE + '/admin/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pagina.waitForSelector('#login-form', { timeout: 25000 });
    await pagina.fill('#login-email', ADMIN.email);
    await pagina.fill('#login-pass', ADMIN.clave);
    await pagina.click('#login-btn');
    await pagina.waitForURL(/dashboard\.html/, { timeout: 35000 });
    return 'url=' + pagina.url().replace(BASE, '');
  });

  const abierto = await paso('Abrir clientes.html y pulsar «Editar»', async () => {
    await pagina.goto(BASE + '/admin/clientes.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pagina.waitForSelector('button[data-a="editar"]', { timeout: 30000 });
    await pagina.locator('button[data-a="editar"]').first().click();
    await pagina.waitForSelector('#e-nombre', { state: 'visible', timeout: 20000 });
    return 'modal visible con #e-nombre';
  });

  if (abierto) {
    await paso('El nombre malicioso aparece como TEXTO y no se ejecuta', async () => {
      const enTabla = await pagina.locator('#app-content tbody').innerText();
      if (!enTabla.includes('<script>alert(1)</script>')) throw new Error('la tabla no muestra el texto literal');
      const valor = await pagina.locator('#e-nombre').inputValue();
      if (valor !== PAYLOAD) throw new Error('el campo no conserva el texto: ' + JSON.stringify(valor).slice(0, 60));
      if (dialogos.length) throw new Error('se ejecutó un diálogo: ' + dialogos.join(' | '));
      return 'tabla y campo conservan el literal';
    });

    await paso('Los campos de precio y fechas llegan con su valor', async () => {
      const precio = await pagina.locator('#e-precio').inputValue();
      const act = await pagina.locator('#e-activacion').inputValue();
      const ven = await pagina.locator('#e-vencimiento').inputValue();
      if (precio !== '49900') throw new Error('precio=' + precio);
      if (act !== '2026-01-15') throw new Error('activacion=' + act);
      if (ven !== '2027-01-15') throw new Error('vencimiento=' + ven);
      return `precio=${precio} activacion=${act} vencimiento=${ven}`;
    });

    await pagina.screenshot({ path: evid + '/13-modal-editar-cliente.png' });
  }

  await paso('Sin errores de JavaScript en todo el recorrido', async () => {
    if (pageerrors.length) throw new Error('pageerror: ' + pageerrors[0]);
    return 'pageerror=0';
  });

  await paso('Sin errores de consola', async () => {
    const graves = consola.filter((c) => /Uncaught|is not a function|permission-denied|ReferenceError|TypeError/i.test(c));
    if (graves.length) throw new Error(graves[0]);
    return 'consola=' + consola.length;
  });
} finally {
  await pagina.screenshot({ path: evid + '/14-clientes-tabla.png' }).catch(() => {});
  await navegador.close();
}

const fallos = resultados.filter((r) => r.e !== 'PASS').length;
console.log(`\nRESUMEN MODAL: ${resultados.length} comprobaciones | PASS=${resultados.length - fallos} | FAIL=${fallos} | pageerror=${pageerrors.length} | dialogos=${dialogos.length}`);
console.log(fallos === 0 ? 'RESULTADO MODAL: PASS' : 'RESULTADO MODAL: FAIL');
process.exit(fallos === 0 ? 0 : 1);
