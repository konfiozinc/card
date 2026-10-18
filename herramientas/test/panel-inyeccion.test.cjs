'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright'); // dependencia de pruebas ya declarada en herramientas/package.json

const root = path.resolve(__dirname, '../..');
const current = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
const base = execFileSync('git', ['show', 'ac4411580a7af00d428d137fb068b6fe5327b7b9:panel.html'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }
});
const URL_PANEL = 'https://panel.card.invalid/panel.html';
const validos = [
  { tarjeta: 'Álamo ficticio', evento: 'generate_lead', etiqueta: 'Cita confirmada', ts: 1792321200000 },
  { tarjeta: 'Tarjeta B', evento: 'click_whatsapp', etiqueta: 'Contacto', ts: 1792321100000 },
  { tarjeta: 'Álamo ficticio', evento: 'click_whatsapp', etiqueta: '', ts: 1792321000000 }
];
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CARD_CHROMIUM || '/usr/bin/chromium',
    args: ['--disable-background-networking', '--no-sandbox'] });
  console.log('Chromium local:', browser.version());
});
after(async () => { if (browser) await browser.close(); });

function fixture(html, datos, authenticated) {
  // Solo la copia de prueba elimina SDK/favicon externos y bloquea toda conexión.
  const sdk = html.match(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+"><\/script>/g) || [];
  assert.equal(sdk.length, 3);
  html = html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+"><\/script>/g, '')
    .replace(/<link rel="icon"[^>]+>/g, '')
    .replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'">');
  const data = JSON.stringify(datos).replace(/</g, '\\u003c');
  const stub = `<script>
    window.__datos=${data}; window.__consultas=[]; window.__intervalos=[]; window.__fallo=false;
    window.setInterval=(fn,ms)=>{window.__intervalos.push({fn,ms});return 1;};
    const authFicticia={
      onAuthStateChanged(fn){window.__auth=fn;fn(${authenticated ? '{uid:"admin-ficticio"}' : 'null'});},
      async signInWithEmailAndPassword(email,pass){
        if(email!=='administrador@example.invalid'||pass!=='CLAVE_FICTICIA') throw {code:'auth/invalid-credential',message:'Credencial ficticia'};
        window.__auth({uid:'admin-ficticio'});
      },
      async signOut(){window.__auth(null);}
    };
    window.firebase={initializeApp(){},auth:()=>authFicticia,firestore:()=>({collection(nombre){
      if(nombre!=='eventos') throw new Error('Colección no prevista');
      return {orderBy(campo,orden){
        if(campo!=='ts'||orden!=='desc') throw new Error('Orden no previsto');
        return {
          limit(n){
            if(n!==500)throw new Error('Límite no previsto');
            return {
              async get(){
                window.__consultas.push({nombre,campo,orden,n});
                if(window.__fallo)throw new Error('PERMISO_FICTICIO');
                return {docs:window.__datos.slice(0,n).map((data,i)=>({id:'ficticio-'+i,data:()=>data}))};
              }
            };
          }
        };
      }};
    }})};
  </script>`;
  new vm.Script(stub.slice('<script>'.length, stub.lastIndexOf('</script>')));
  return html.replace('<script>', stub + '<script>');
}

async function abrir(t, { html = current, datos = validos, authenticated = true, viewport = { width: 1024, height: 768 } } = {}) {
  const body = fixture(html, datos, authenticated);
  const context = await browser.newContext({ viewport, locale: 'es-CO', timezoneId: 'America/Bogota', serviceWorkers: 'block' });
  t.after(() => context.close());
  const unexpected = [], errores = [];
  await context.route('**/*', async (route) => {
    if (route.request().url() === URL_PANEL) await route.fulfill({ status: 200, contentType: 'text/html', body });
    else { unexpected.push(route.request().url()); await route.abort(); }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => errores.push(e.message));
  t.after(() => { assert.deepEqual(unexpected, []); assert.deepEqual(errores, []); });
  await page.goto(URL_PANEL);
  if (authenticated) await page.waitForFunction(() => document.querySelector('#kTarjetas').textContent !== '—');
  else await page.locator('#login').waitFor({ state: 'visible' });
  return page;
}

test('estructura, estilos, autenticación y consulta fuera de render no cambian', () => {
  const start = 'function render(docs){', end = '\nsetInterval(cargar';
  assert.equal(current.slice(0, current.indexOf(start)), base.slice(0, base.indexOf(start)));
  assert.equal(current.slice(current.indexOf(end)), base.slice(base.indexOf(end)));
  const render = current.slice(current.indexOf(start), current.indexOf(end));
  assert.doesNotMatch(render, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('nombre y etiqueta con HTML inocuo se muestran literalmente en ambas vistas', async (t) => {
  const nombre = '<b data-marca-ficticia>Tarjeta ficticia</b>';
  const etiqueta = '<em data-etiqueta-ficticia>Contacto ficticio</em>';
  const page = await abrir(t, { datos: [{ tarjeta: nombre, evento: 'click_whatsapp', etiqueta, ts: 1792321200000 }] });
  assert.equal(await page.locator('#tablaTarjetas td.tarjeta').textContent(), nombre);
  assert.equal(await page.locator('#recientes b.tarjeta').textContent(), nombre);
  assert.ok((await page.locator('#recientes .t').textContent()).startsWith(etiqueta + ' · '));
  assert.equal(await page.locator('[data-marca-ficticia], [data-etiqueta-ficticia]').count(), 0);
  assert.equal(await page.locator('#recientes em').count(), 0);
});

test('comillas, ampersands, Unicode y URL ordinaria no se convierten en atributos ni enlaces', async (t) => {
  const nombre = 'Tarjeta "Ficticia" & Niño <em>texto</em>';
  const etiqueta = 'https://ejemplo.invalid/recurso?uno=1&dos=2';
  const page = await abrir(t, { datos: [{ tarjeta: nombre, etiqueta, evento: 'generate_lead', ts: 0 }] });
  assert.equal(await page.locator('td.tarjeta').textContent(), nombre);
  assert.equal(await page.locator('#recientes .t').textContent(), etiqueta + ' · ');
  assert.equal(await page.locator('#recientes a, #recientes img, #recientes em').count(), 0);
  assert.equal(await page.locator('#kLeads').textContent(), '1');
});

test('claves homónimas a propiedades de Object conservan grupos y contadores independientes', async (t) => {
  const datos = ['__proto__', 'constructor', 'toString'].flatMap((tarjeta) => [
    { tarjeta, evento: 'click_whatsapp' }, { tarjeta, evento: 'generate_lead' }
  ]);
  const page = await abrir(t, { datos });
  assert.equal(await page.locator('#kTarjetas').textContent(), '3');
  assert.equal(await page.locator('#kClicks').textContent(), '3');
  assert.equal(await page.locator('#kLeads').textContent(), '3');
  assert.deepEqual(await page.locator('td.tarjeta').allTextContents(), ['__proto__', 'constructor', 'toString']);
  assert.deepEqual(await page.locator('td .badge').allTextContents(), ['1', '1', '1', '1', '1', '1']);
  assert.equal(await page.evaluate(() => Object.prototype.clicks), undefined);
});

test('conteos, orden, etiquetas, barras y límite de veinte eventos conservados', async (t) => {
  const datos = Array.from({ length: 25 }, (_, i) => ({ tarjeta: i % 2 ? 'B' : 'A', evento: i % 2 ? 'generate_lead' : 'click_whatsapp', etiqueta: 'Evento ' + i }));
  const page = await abrir(t, { datos });
  assert.equal(await page.locator('#kClicks').textContent(), '13');
  assert.equal(await page.locator('#kLeads').textContent(), '12');
  assert.equal(await page.locator('#recientes .fila').count(), 20);
  assert.deepEqual(await page.locator('td.tarjeta').allTextContents(), ['A', 'B']);
  assert.deepEqual(await page.locator('.bar span').evaluateAll((els) => els.map((e) => e.style.width)), ['100%', '0%']);
  assert.equal(await page.locator('#recientes .badge.lead').count(), 10);
});

test('tipos inesperados y fechas inválidas no se interpretan como HTML, estilos o fechas válidas', async (t) => {
  const page = await abrir(t);
  await page.evaluate(() => render([null, [], 4, { tarjeta: { dato: 'ficticio' }, etiqueta: ['ficticio'], ts: 'fecha-ficticia-inválida' },
    { tarjeta: 'Fechas', etiqueta: 12, ts: Infinity }, { tarjeta: 'Fechas', ts: { dato: 'ficticio' } }]));
  assert.equal(await page.locator('#kTarjetas').textContent(), '2');
  assert.equal(await page.locator('#recientes .fila').count(), 3);
  assert.deepEqual(await page.locator('#recientes .t').allTextContents(), [' · ', ' · ', ' · ']);
  assert.equal(await page.locator('#recientes').getAttribute('style'), null);
  assert.deepEqual(await page.locator('.bar span').evaluateAll((els) => els.map((e) => e.style.width)), ['0%', '0%']);
});

test('fechas numéricas, ISO, Date y Timestamp simulado admiten texto de fecha válido', async (t) => {
  const page = await abrir(t);
  await page.evaluate(() => render([
    { tarjeta: 'Numérica', ts: 1792321200000 },
    { tarjeta: 'ISO', ts: '2026-10-18T11:00:00.000Z' },
    { tarjeta: 'Date', ts: new Date('2026-10-18T11:00:00.000Z') },
    { tarjeta: 'Timestamp', ts: { toDate: () => new Date('2026-10-18T11:00:00.000Z') } }
  ]));
  for (const texto of await page.locator('#recientes .t').allTextContents()) {
    assert.match(texto, /18/); assert.doesNotMatch(texto, /Invalid|undefined|object/);
  }
});

test('render repetido reemplaza nodos y no necesita ningún sumidero HTML', async (t) => {
  const page = await abrir(t);
  await page.evaluate(() => {
    Object.defineProperty(Element.prototype, 'innerHTML', { set() { throw new Error('innerHTML prohibido en esta prueba'); } });
    render([{ tarjeta: '<b>Nombre ficticio</b>', evento: 'generate_lead', etiqueta: '<em>Etiqueta ficticia</em>' }]);
    render([{ tarjeta: 'Nueva ficticia', evento: 'click_whatsapp', etiqueta: '' }]);
  });
  assert.equal(await page.locator('#tablaTarjetas tr').count(), 1);
  assert.equal(await page.locator('#recientes .fila').count(), 1);
  assert.equal(await page.locator('td.tarjeta').textContent(), 'Nueva ficticia');
  await page.evaluate(() => render([]));
  assert.equal(await page.locator('td').textContent(), 'Aún no hay eventos.');
  assert.equal(await page.locator('td').getAttribute('colspan'), '4');
  assert.equal(await page.locator('#recientes p').textContent(), 'Sin eventos.');
  assert.equal(await page.locator('#kClicks').textContent(), '0');
});

for (const viewport of [{ width: 375, height: 667 }, { width: 1024, height: 768 }]) {
  test(`apariencia idéntica a la base con datos válidos en ${viewport.width}×${viewport.height}`, async (t) => {
    const old = await abrir(t, { html: base, viewport });
    const fixed = await abrir(t, { viewport });
    const before = await old.screenshot({ fullPage: true, animations: 'disabled' });
    const after = await fixed.screenshot({ fullPage: true, animations: 'disabled' });
    assert.deepEqual(after, before, 'PNG diferente: revisar compatibilidad visual');
    assert.equal(await fixed.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
}

test('login, error de credenciales, refresco, intervalo y cierre de sesión siguen operativos con Auth ficticio', async (t) => {
  const page = await abrir(t, { authenticated: false });
  await page.locator('#email').fill('administrador@example.invalid');
  await page.locator('#pass').fill('INCORRECTA_FICTICIA');
  await page.locator('#btnLogin').click();
  await page.locator('#loginErr').waitFor({ state: 'visible' });
  assert.match(await page.locator('#loginErr').textContent(), /correo o contraseña incorrectos/);
  await page.locator('#pass').fill('CLAVE_FICTICIA');
  await page.locator('#btnLogin').click();
  await page.locator('#dash').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#kTarjetas').textContent === '2');
  await page.evaluate(() => { window.__datos = [{ tarjeta: 'Refresco ficticio', evento: 'generate_lead' }]; });
  await page.locator('#btnRefresh').click();
  await page.waitForFunction(() => document.querySelector('#kTarjetas').textContent === '1');
  assert.equal(await page.locator('td.tarjeta').textContent(), 'Refresco ficticio');
  assert.equal(await page.evaluate(() => window.__intervalos[0].ms), 30000);
  await page.evaluate(async () => { await window.__intervalos[0].fn(); });
  assert.equal(await page.evaluate(() => window.__consultas.length), 3);
  await page.locator('#btnSalir').click();
  await page.locator('#login').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#dash').isVisible(), false);
});

test('fallo de permiso ficticio en lectura mantiene el tratamiento de error existente', async (t) => {
  const page = await abrir(t);
  await page.evaluate(() => { window.__fallo = true; });
  const pending = page.waitForEvent('dialog');
  const click = page.locator('#btnRefresh').click();
  const dialog = await pending;
  assert.match(dialog.message(), /PERMISO_FICTICIO/);
  await dialog.dismiss();
  await click;
  assert.equal(await page.locator('#kTarjetas').textContent(), '2');
});
