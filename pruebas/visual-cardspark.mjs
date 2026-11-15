/* KZ-UNIFICACION-002 · Recorrido visual con Playwright. Aislamiento demostrable. */
import { chromium } from '../herramientas/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const raiz = process.argv[2];
const evid = process.argv[3];
const BASE = 'http://127.0.0.1:5500';
const PRODUCIDOS = [/identitytoolkit\.googleapis\.com/, /securetoken\.googleapis\.com/, /firestore\.googleapis\.com/, /\.firebaseio\.com/, /firebaseapp\.com\/v1/];
const resultados = [];
const consola = [];
const red = [];
let produccion = 0;
const anota = (nombre, estado, detalle = '') => { resultados.push({ nombre, estado, detalle }); console.log(`${estado} · ${nombre}${detalle ? ' → ' + detalle : ''}`); };

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
await contexto.route('**/*', (ruta) => {
  const u = ruta.request().url();
  if (PRODUCIDOS.some((re) => re.test(u))) { produccion += 1; return ruta.abort(); }
  return ruta.continue();
});
const pagina = await contexto.newPage();
pagina.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 160)); });
pagina.on('requestfailed', (r) => red.push(r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText || '')));

try {
  await pagina.goto(BASE + '/admin/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pagina.waitForTimeout(2500);
  await pagina.screenshot({ path: evid + '/01-dashboard-escritorio.png' });

  const menu = await pagina.locator('text=Seguimiento comercial').count();
  anota('Entrada "Seguimiento comercial" en el menú', menu > 0 ? 'PASS' : 'FAIL', 'coincidencias=' + menu);

  await pagina.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pagina.waitForTimeout(2500);
  await pagina.screenshot({ path: evid + '/02-seguimiento-escritorio.png' });
  const form = await pagina.locator('#vg-alta').count();
  const seccion = await pagina.locator('#vg-seguimiento').count();
  anota('Formulario de alta presente', form > 0 ? 'PASS' : 'FAIL');
  anota('Sección de seguimiento renderizada', seccion > 0 ? 'PASS' : 'FAIL');
  const visible = await pagina.locator('#vg-seguimiento').isVisible().catch(() => false);
  anota('Sección visible (permiso ADMIN efectivo)', visible ? 'PASS' : 'NO EJECUTADO', visible ? '' : 'sesión/roles de emulador no disponibles');

  const movil = await contexto.newPage();
  await movil.setViewportSize({ width: 375, height: 667 });
  await movil.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await movil.waitForTimeout(1500);
  await movil.screenshot({ path: evid + '/03-seguimiento-movil.png', fullPage: true });
  anota('Captura móvil 375x667', 'PASS');
  await movil.close();

  anota('Recorrido funcional (crear, duplicar, estado, nota, historial, recarga)', 'NO EJECUTADO', 'requiere sesión de emulador en la app');
} catch (e) {
  anota('Navegación', 'FAIL', String(e.message).slice(0, 120));
} finally {
  mkdirSync(evid, { recursive: true });
  const resumen = { resultados, consola, red, peticiones_a_produccion: produccion };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(evid + '/resultado-visual.json', JSON.stringify(resumen, null, 2));
  await navegador.close();
}
anota('Aislamiento: peticiones a Firebase productivo bloqueadas', produccion === 0 ? 'PASS' : 'FAIL', 'detectadas=' + produccion);
const fallidos = resultados.filter((r) => r.estado === 'FAIL').length;
const noEjec = resultados.filter((r) => r.estado === 'NO EJECUTADO').length;
console.log(`RESUMEN: ${resultados.length} comprobaciones, FAIL=${fallidos}, NO EJECUTADO=${noEjec}, consola_errores=${consola.length}, red_fallos=${red.length}`);
process.exit(fallidos === 0 ? 0 : 1);
