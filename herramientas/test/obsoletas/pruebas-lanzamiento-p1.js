/* ═══════════════════════════════════════════════════════════════════
   pruebas-lanzamiento-p1.js · KONFÍO ZINC — CARD

   Comprueba los dos escenarios que pueden arruinar una ventana de lanzamiento
   sin que nadie se entere:

     A · BACKEND AUSENTE — las Cloud Functions todavía no están desplegadas (o
         el despliegue falló). El panel NO puede fallar en silencio ni echar la
         culpa al registro: tiene que decir que habló con el servidor y qué
         revisar. Además, las lecturas tienen que seguir funcionando.

     B · CALLABLE CON ERROR — el backend responde y rechaza la operación. El
         panel tiene que mostrar el mensaje del servidor, no un texto genérico,
         y no debe crear nada.

   Datos ficticios. Auth 9099 · Firestore 8080 · Hosting 5000 · Functions 5001
   en 127.0.0.1 · proyecto demo-card-seguridad.

   Uso:
     node herramientas/test/pruebas-lanzamiento-p1.js            # detecta solo
     node herramientas/test/pruebas-lanzamiento-p1.js --modo ausente
     node herramientas/test/pruebas-lanzamiento-p1.js --modo presente
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const PW = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web\\herramientas\\node_modules\\playwright';
const { chromium } = require(PW);

const BASE = 'http://127.0.0.1:5000';
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const FN = 'http://127.0.0.1:5001';
const PROYECTO = 'demo-card-seguridad';

const argVal = (f) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : null; };

const LOCAL = (url) => { try { const x = new URL(url); return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(x.hostname); } catch (e) { return true; } };

const salida = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  salida.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : 'NO VERIF';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(56)} ${detalle || ''}`);
}

async function contar(coleccion) {
  const r = await fetch(`${FS}/v1/projects/${PROYECTO}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coleccion }] } })
  });
  const j = await r.json().catch(() => []);
  return (Array.isArray(j) ? j : []).filter((x) => x.document).length;
}

async function functionsVivas() {
  try { const r = await fetch(`${FN}/`, { method: 'GET' }); return r.status < 500; }
  catch (e) { return false; }
}

(async () => {
  const pedido = argVal('--modo');
  const vivas = await functionsVivas();
  const modo = pedido || (vivas ? 'presente' : 'ausente');
  if (modo === 'ausente' && vivas) { console.error('\n  ✖ Pediste el modo «ausente» pero las Functions responden en 5001.\n'); process.exit(2); }
  if (modo === 'presente' && !vivas) { console.error('\n  ✖ Pediste el modo «presente» pero las Functions no responden en 5001.\n'); process.exit(2); }

  console.log('');
  console.log('═══ PRUEBAS DE LANZAMIENTO · modo ' + modo.toUpperCase() + ' ═══');
  console.log('');

  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  const externas = [];
  await pag.route('**/*', async (r) => {
    const url = r.request().url();
    if (LOCAL(url)) await r.continue(); else { externas.push(url); await r.abort('blockedbyclient'); }
  });

  /* Sesión: el seed de demostración crea superadmin@demo.test */
  await pag.goto(`${BASE}/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1200);
  await pag.fill('#login-email', 'superadmin@demo.test');
  await pag.fill('#login-pass', 'Ficticia#1');
  await pag.click('#login-btn');
  await pag.waitForURL('**/dashboard.html', { timeout: 25000 });
  anotar('Inicio de sesión del panel', true, 'SUPERADMIN · lectura por Firestore');

  /* ── A · BACKEND AUSENTE ─────────────────────────────────────────── */
  if (modo === 'ausente') {
    /* El dashboard lee de Firestore: tiene que pintar aunque falten las
       Callables. Se espera al primer KPI en vez de mirar al instante. */
    let kpis = 0;
    try { await pag.waitForSelector('.kpi', { timeout: 15000 }); } catch (e) { kpis = 0; }
    kpis = await pag.evaluate(() => document.querySelectorAll('.kpi').length);
    anotar('Con el backend ausente el panel sigue mostrando los KPIs (lectura)', kpis > 0, `${kpis} KPIs`);

    const usuariosAntes = await contar('usuarios');
    await pag.goto(`${BASE}/admin/usuarios.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1800);
    await pag.click('#btn-nuevo');
    await pag.waitForTimeout(300);
    const correo = 'ausente.' + Date.now() + '@crm.test';
    await pag.fill('#u-nombre', 'Usuario Sin Backend');
    await pag.fill('#u-email', correo);
    await pag.fill('#u-pass', 'Ficticia#1');
    await pag.click('button[form="usr-form"]');
    await pag.waitForTimeout(6000);

    const vista = await pag.evaluate(() => {
      const e = document.getElementById('u-error');
      return {
        visible: !!(e && !e.hidden),
        texto: (e && e.textContent || '').trim(),
        toasts: [...document.querySelectorAll('.toast')].map((x) => x.innerText.replace(/\s+/g, ' ').trim())
      };
    });

    anotar('El panel avisa del error (no falla en silencio)', vista.visible, 'caja de error visible');
    anotar('El mensaje nombra el servidor y qué revisar',
      /servidor del panel/i.test(vista.texto) && /desplegad/i.test(vista.texto), `«${vista.texto.slice(0, 96)}»`);
    anotar('El mensaje NO culpa al registro',
      !/no existe o fue eliminado/i.test(vista.texto), 'no dice «el registro no existe»');
    anotar('No se anuncia un éxito falso',
      !vista.toasts.some((t) => /creado/i.test(t)), vista.toasts.join(' | ') || 'sin avisos de éxito');

    const usuariosDespues = await contar('usuarios');
    anotar('No se crea ninguna ficha de usuario', usuariosDespues === usuariosAntes, `${usuariosAntes} → ${usuariosDespues}`);

    const fichaFantasma = await fetch(`${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/usuarios?pageSize=100`,
      { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json()).catch(() => ({}));
    const existeCorreo = JSON.stringify(fichaFantasma).includes(correo);
    anotar('El correo intentado no aparece en Firestore', !existeCorreo, 'ni por correo ni por uid');
  }

  /* ── B · CALLABLE CON ERROR ──────────────────────────────────────── */
  if (modo === 'presente') {
    await pag.goto(`${BASE}/admin/usuarios.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1800);

    const correo = 'lanzamiento.' + Date.now() + '@crm.test';
    const usuariosAntes = await contar('usuarios');
    await pag.click('#btn-nuevo');
    await pag.waitForTimeout(300);
    await pag.fill('#u-nombre', 'Usuario Lanzamiento');
    await pag.fill('#u-email', correo);
    await pag.fill('#u-pass', 'Ficticia#1');
    await pag.selectOption('#u-rol', 'OPERADOR');
    await pag.click('button[form="usr-form"]');
    await pag.waitForTimeout(6000);
    const usuariosTras = await contar('usuarios');
    const creado = usuariosTras === usuariosAntes + 1;
    anotar('Con el backend desplegado se puede crear un usuario', creado, `${usuariosAntes} → ${usuariosTras} fichas`);

    /* Segundo intento con el mismo correo: el servidor debe rechazarlo y el
       panel mostrar SU mensaje, no un texto genérico. */
    await pag.goto(`${BASE}/admin/usuarios.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1500);
    await pag.click('#btn-nuevo');
    await pag.waitForTimeout(300);
    await pag.fill('#u-nombre', 'Usuario Duplicado');
    await pag.fill('#u-email', correo);
    await pag.fill('#u-pass', 'Ficticia#1');
    await pag.click('button[form="usr-form"]');
    await pag.waitForTimeout(6000);
    const dup = await pag.evaluate(() => {
      const e = document.getElementById('u-error');
      return { visible: !!(e && !e.hidden), texto: (e && e.textContent || '').trim() };
    });
    const usuariosDup = await contar('usuarios');
    anotar('El error del servidor por correo duplicado se muestra', dup.visible && /ya existe/i.test(dup.texto), `«${dup.texto.slice(0, 90)}»`);
    anotar('El intento duplicado no crea una segunda ficha', usuariosDup === usuariosTras, `${usuariosTras} → ${usuariosDup}`);
  }

  anotar('Ninguna petición salió a internet', externas.length === 0, `${externas.length} externas · ${externas.slice(0, 3).join(', ')}`);

  await nav.close();

  const fallos = salida.filter((x) => x.estado === 'FALLIDO');
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · APROBADAS: ${salida.length - fallos.length} · FALLIDAS: ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log('\nFALLOS:'); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle || ''}`); }
  console.log('');
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.message)); process.exit(2); });
