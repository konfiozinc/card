/* KZ-UNIFICACION-002 - Recorrido visual completo (Playwright) contra emuladores demo-*.
 *
 * Uso: node pruebas/visual-completo.mjs <raiz> <evidencias>
 *
 * CAMBIO DE COMPORTAMIENTO (corrida real del 15-nov-2026)
 * Aquella corrida siguio con las operaciones comerciales despues de fallar la
 * siembra y el login, y produjo un PASS falso ("Abrir Seguimiento sin segundo
 * inicio de sesion") sobre una sesion que no existia. Ahora:
 *   1. La preparacion va PRIMERO y sin navegador: disponibilidad real de Auth y
 *      Firestore, siembra de la ficha en usuarios/<uid>, login REST y control de
 *      que las reglas del repositorio estan cargadas.
 *   2. Si la preparacion falla, el proceso sale con codigo 2 SIN ejecutar ninguna
 *      operacion comercial.
 *   3. Solo se da por bueno el acceso a Seguimiento si el modulo dejo su marca
 *      `data-listo="1"`, es decir, si requireAuth confirmo una ficha activa.
 *
 * Salidas: 0 = todo PASS | 1 = fallo comercial | 2 = abortado en la preparacion.
 */
import { chromium } from '../herramientas/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { esperarEmuladores, sembrarAdmin, comprobarLogin, comprobarReglasActivas } from './entorno-emuladores.mjs';

const raiz = process.argv[2];
const evid = process.argv[3];
const BASE = 'http://127.0.0.1:5500';
const PROYECTO = process.env.KZ_PROYECTO_DEMO || 'demo-kz-crm-prospectos';
const EMAIL = 'admin.prueba@demo.test';
const CLAVE = 'PruebaDemo123!';
const LIMITE_PREP = Number(process.env.KZ_LIMITE_EMULADORES || 180000);

if (!evid) { console.log('FALTA el directorio de evidencias: node pruebas/visual-completo.mjs <raiz> <evidencias>'); process.exit(2); }
mkdirSync(evid, { recursive: true });

const preparacion = [];
const resultados = [];
const consola = [];
const red = [];
const pageerrors = [];
let produccion = 0;

const guardar = (extra = {}) => writeFileSync(evid + '/resultado-visual.json', JSON.stringify({
  ...extra, preparacion, resultados, consola, red, pageerrors, peticiones_a_produccion: produccion,
}, null, 2));

const anota = (n, e, d = '') => {
  resultados.push({ n, e, d });
  console.log(`${e} - ${n}${d ? ' -> ' + d : ''}`);
};

const paso = async (n, fn) => {
  try { const d = await fn(); anota(n, 'PASS', d || ''); return true; }
  catch (e) { anota(n, 'FAIL', String((e && e.message) || e).slice(0, 200)); return false; }
};

/* -- Fase 1: preparacion. Cualquier fallo aborta sin tocar el navegador. -- */
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
    console.log('No se ejecuta ninguna operacion comercial: sin sesion verificada no hay nada que probar.');
    console.log('RESULTADO GLOBAL: FAIL (abortado antes del navegador)');
    process.exit(2);
  }
};

const tiempos = await exigir('Emuladores Auth y Firestore disponibles', async () => {
  const t = await esperarEmuladores({ proyecto: PROYECTO, limiteMs: LIMITE_PREP });
  return { valor: t, detalle: `auth en ${t.auth} ms, firestore en ${t.firestore} ms` };
});

const uid = await exigir('Sembrar usuario ADMIN y su ficha', async () => {
  const r = await sembrarAdmin({ proyecto: PROYECTO, email: EMAIL, clave: CLAVE });
  return { valor: r.uid, detalle: `uid=${r.uid}` };
});

const sesionRest = await exigir('Iniciar sesion con la cuenta sembrada', async () => {
  const r = await comprobarLogin({ proyecto: PROYECTO, email: EMAIL, clave: CLAVE, uidEsperado: uid });
  return { valor: r, detalle: `rol=${r.rol} uid=${r.uid}` };
});

const reglas = await exigir('Reglas del repositorio cargadas en el emulador', async () => {
  const r = await comprobarReglasActivas({ proyecto: PROYECTO });
  return { valor: r, detalle: `anonimo denegado: lectura HTTP ${r.lectura}, escritura HTTP ${r.escritura}` };
});

/* -- Fase 2: navegador -- */
const navegador = await chromium.launch();
const instalarRutas = async (contexto) => contexto.route('**/*', (ruta) => {
  const u = ruta.request().url();
  if (!u.includes('127.0.0.1') && /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|firebaseio\.com|firebaseapp\.com/.test(u)) {
    produccion += 1;
    return ruta.abort();
  }
  return ruta.continue();
});

try {
  /* Control negativo: sin sesion NO se debe ver el modulo. Esta comprobacion
     existe porque la corrida anterior aprobo esa entrada sin sesion. */
  const contextoAnonimo = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
  await instalarRutas(contextoAnonimo);
  const anon = await contextoAnonimo.newPage();
  await paso('Control negativo: sin sesión no se ve Seguimiento', async () => {
    const html = await fetch(BASE + '/admin/seguimiento.html').then((r) => r.text());
    if (!/<section id="vg-seguimiento"[^>]*\bhidden\b/.test(html)) throw new Error('la seccion no nace oculta en el HTML');
    await anon.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await anon.waitForURL(/index\.html/, { timeout: 25000 }).catch(() => {});
    if (!/index\.html/.test(anon.url())) throw new Error('no redirigio al login: ' + anon.url().replace(BASE, ''));
    if (await anon.locator('#vg-seguimiento').isVisible().catch(() => false)) throw new Error('la seccion se ve sin sesion');
    return 'redirigido a ' + anon.url().replace(BASE, '');
  });
  await contextoAnonimo.close();

  /* -- Sesion real por la interfaz -- */
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
  await instalarRutas(contexto);
  const pagina = await contexto.newPage();
  pagina.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 160)); });
  pagina.on('requestfailed', (r) => red.push(r.url().slice(0, 120)));
  /* Los fallos de resolución de módulos (importmap ausente) NO llegan como
     mensaje de consola: llegan como excepción no capturada. Sin este listener la
     corrida del 15-nov los vio como "consola=0" y siguió adelante. */
  pagina.on('pageerror', (e) => pageerrors.push(String((e && e.message) || e).slice(0, 200)));

  const entrar = async () => {
    await pagina.goto(BASE + '/admin/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pagina.waitForSelector('#login-form', { timeout: 25000 });
    await pagina.fill('#login-email', EMAIL);
    await pagina.fill('#login-pass', CLAVE);
    await pagina.click('#login-btn');
    try {
      await pagina.waitForURL(/dashboard\.html/, { timeout: 35000 });
    } catch {
      const ver = await pagina.locator('#login-error').isVisible().catch(() => false);
      const txt = ver ? (await pagina.locator('#login-error').innerText()).trim().slice(0, 140) : '(sin aviso visible)';
      throw new Error(`login no superado: ${txt} | url=${pagina.url().replace(BASE, '')}`);
    }
    if (await pagina.locator('#login-pass').count()) throw new Error('el formulario de login sigue presente');
    return 'sesion iniciada, url=' + pagina.url().replace(BASE, '');
  };

  const loginOk = await paso('Iniciar sesión en Card Spark con la cuenta ficticia', entrar);
  if (!loginOk) {
    /* Sin sesion no se ejecuta nada mas: es exactamente lo que exigio la mision. */
    guardar({ abortado: true, paso_fallido: 'Iniciar sesion por la interfaz' });
    console.log('');
    console.log('ABORTADO EN EL LOGIN: no se ejecuta ninguna operacion comercial.');
    console.log('RESULTADO GLOBAL: FAIL (abortado en el login)');
    await navegador.close();
    process.exit(2);
  }

  await paso('Dashboard original visible con sesión', async () => {
    /* El shell se pinta de forma asíncrona (onAuthStateChanged + getDoc). Un
       count() inmediato tras waitForURL daba 0 por carrera, no porque faltara la
       navegación: aquí se espera el enlace real del DOM de shell.js. */
    await pagina.waitForSelector('#app-shell .side__link', { timeout: 25000 });
    const n = await pagina.locator('#app-shell .side__link').count();
    if (n === 0) throw new Error('sin navegacion en #app-shell');
    await pagina.screenshot({ path: evid + '/01-dashboard.png' });
    return 'enlaces=' + n;
  });

  await paso('Entrada "Seguimiento comercial" en el menú', async () => {
    const n = await pagina.locator('.side__link', { hasText: 'Seguimiento comercial' }).count();
    if (n === 0) throw new Error('no esta en el menu lateral');
    return 'coincidencias=' + n;
  });

  await paso('Abrir Seguimiento sin segundo inicio de sesión', async () => {
    await pagina.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pagina.waitForFunction(() => {
      const s = document.querySelector('#vg-seguimiento');
      return !!s && s.dataset.listo === '1';
    }, null, { timeout: 30000 });
    if (await pagina.locator('#login-pass').count()) throw new Error('pidio login otra vez');
    if (/index\.html/.test(pagina.url())) throw new Error('redirigido al login: la sesion no se conservo');
    const opciones = await pagina.locator('#vg-servicio option').count();
    if (opciones < 6) throw new Error('select de servicios sin poblar (' + opciones + ' opciones)');
    if (!(await pagina.locator('#vg-seguimiento').isVisible())) throw new Error('seccion no visible con sesion');
    await pagina.screenshot({ path: evid + '/02-seguimiento.png' });
    return 'modulo listo, servicios=' + opciones;
  });

  /* CANDADO DE ESTILOS (KZ-UNIFICACION-004).
     La corrida anterior dio PASS validando sólo el DOM mientras la página se veía
     como HTML crudo: enlazar las hojas no basta, el marcado tiene que usar sus
     clases. Esta comprobación mide lo que el navegador pinta de verdad y FALLA si
     el fondo es blanco. */
  await paso('Estilos del panel aplicados (fondo e inputs oscuros)', async () => {
    const BLANCO = 'rgb(255, 255, 255)';
    const m = await pagina.evaluate(() => {
      const inp = document.querySelector('#vg-nombre');
      const sel = document.querySelector('#vg-servicio');
      const btn = document.querySelector('#vg-alta button[type=submit]');
      const sInp = inp ? getComputedStyle(inp) : null;
      return {
        fondoBody: getComputedStyle(document.body).backgroundColor,
        colorBody: getComputedStyle(document.body).color,
        fuente: getComputedStyle(document.body).fontFamily,
        fondoInput: sInp ? sInp.backgroundColor : null,
        colorInput: sInp ? sInp.color : null,
        bordeInput: sInp ? sInp.borderTopWidth + ' ' + sInp.borderTopStyle : null,
        enCampo: !!document.querySelector('.campo > input'),
        fondoSelect: sel ? getComputedStyle(sel).backgroundColor : null,
        btnClase: btn ? btn.className : '(sin boton)',
        avisoClase: (document.getElementById('vg-aviso') || {}).className || '(sin aviso)',
        tablaConClase: !!document.querySelector('.tabla__wrap > table.tabla'),
      };
    });
    if (m.fondoBody === BLANCO) throw new Error('el fondo del body es BLANCO: la hoja del panel no está aplicada');
    if (m.fondoBody === 'rgba(0, 0, 0, 0)') throw new Error('el body no tiene fondo propio: el tema del panel no llegó');
    if (m.fondoInput === BLANCO) throw new Error('el input tiene fondo BLANCO: no usa la clase .campo del panel');
    if (!m.enCampo) throw new Error('los campos no están dentro de .campo');
    if (!/\bbtn\b/.test(m.btnClase)) throw new Error('el botón no usa la clase .btn: ' + m.btnClase);
    if (!/^aviso/.test(m.avisoClase)) throw new Error('el aviso no usa la clase .aviso: ' + m.avisoClase);
    if (!m.tablaConClase) throw new Error('la tabla no usa .tabla__wrap + .tabla');
    await pagina.screenshot({ path: evid + '/04-estilos-seguimiento.png' });
    return `body=${m.fondoBody} texto=${m.colorBody} input=${m.fondoInput} borde=${m.bordeInput} select=${m.fondoSelect} boton=.btn fuente=${m.fuente}`;
  });

  await paso('Crear prospecto ficticio', async () => {
    await pagina.fill('#vg-nombre', 'Prospecto Ficticio V2');
    await pagina.fill('#vg-telefono', '3001234567');
    await pagina.locator('#vg-servicio').selectOption({ index: 1 });
    await pagina.locator('#vg-alta button[type=submit]').click();
    /* Se espera al NOMBRE, no a que exista "alguna fila": la lista vacía también
       trae un <tr> ("Sin prospectos todavía."), así que la condición anterior se
       cumplía al instante y la aserción de texto fallaba después aunque la
       escritura sí estaba en curso (la corrida de las 21:38 lo demostró: el
       prospecto apareció en los pasos siguientes). */
    try {
      await pagina.waitForFunction(
        (nombre) => {
          const c = document.querySelector('#vg-lista');
          return !!c && c.textContent.includes(nombre) && !/Cargando/.test(c.textContent);
        },
        'Prospecto Ficticio V2',
        { timeout: 25000 },
      );
    } catch {
      const aviso = await pagina.locator('#vg-aviso').innerText().catch(() => '(sin aviso)');
      const lista = await pagina.locator('#vg-lista').innerText().catch(() => '(sin lista)');
      throw new Error(`el prospecto no apareció. aviso="${aviso.slice(0, 80)}" lista="${lista.slice(0, 80)}"`);
    }
    const filas = await pagina.locator('#vg-lista tr').count();
    return 'filas=' + filas;
  });

  await paso('Rechazo de duplicado', async () => {
    await pagina.fill('#vg-nombre', 'Prospecto Ficticio V2');
    await pagina.fill('#vg-telefono', '3001234567');
    await pagina.locator('#vg-servicio').selectOption({ index: 1 });
    await pagina.locator('#vg-alta button[type=submit]').click();
    await pagina.waitForTimeout(3000);
    const aviso = await pagina.locator('#vg-aviso').innerText();
    if (!/ya existe|duplicad/i.test(aviso)) throw new Error('no rechazado: ' + aviso.slice(0, 60));
    return 'aviso mostrado';
  });

  await paso('Cambiar estado (transición permitida)', async () => {
    const b = pagina.locator('#vg-lista button[data-mover]').first();
    if (!(await b.count())) throw new Error('sin boton de transicion');
    await b.click();
    await pagina.waitForTimeout(3500);
    const t = await pagina.locator('#vg-lista').innerText();
    if (!/CONTACTADO|PENDIENTE_CONTACTAR/.test(t)) throw new Error('estado sin cambiar');
    return 'avanzo';
  });

  await paso('Registrar nota interna', async () => {
    pagina.once('dialog', (d) => d.accept('Nota ficticia de prueba'));
    const b = pagina.locator('#vg-lista button[data-nota]').first();
    if (!(await b.count())) throw new Error('sin boton de nota');
    await b.click();
    await pagina.waitForTimeout(3500);
    return 'nota enviada';
  });

  await paso('Persistencia tras recargar', async () => {
    await pagina.reload({ waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction(() => {
      const s = document.querySelector('#vg-seguimiento');
      const c = document.querySelector('#vg-lista');
      return !!s && s.dataset.listo === '1' && !!c && !/Cargando/.test(c.textContent);
    }, null, { timeout: 30000 });
    if (!/Prospecto Ficticio V2/.test(await pagina.locator('#vg-lista').innerText())) throw new Error('no persistio');
    return 'sobrevive a la recarga';
  });

  await paso('Apariencia móvil 375x667', async () => {
    const m = await contexto.newPage();
    await m.setViewportSize({ width: 375, height: 667 });
    await m.goto(BASE + '/admin/seguimiento.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await m.waitForTimeout(2500);
    await m.screenshot({ path: evid + '/03-movil.png', fullPage: true });
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    await m.close();
    if (ancho > 400) throw new Error('desbordamiento ' + ancho);
    return 'sin desbordamiento (scrollWidth=' + ancho + ')';
  });

  await paso('Sin errores críticos de consola ni de JavaScript', async () => {
    if (pageerrors.length) throw new Error('pageerror: ' + pageerrors[0]);
    const graves = consola.filter((c) => /Uncaught|is not a function|permission-denied/i.test(c));
    if (graves.length) throw new Error(graves[0]);
    return 'consola=' + consola.length + ', pageerror=0';
  });

  await paso('Cero conexiones a Firebase de producción', async () => {
    const r = await fetch(BASE + '/__intentos-produccion').then((x) => x.json()).catch(() => ({ total: 0 }));
    if (produccion + (r.total || 0) > 0) throw new Error('intentos=' + (produccion + r.total));
    return 'bloqueado y contado';
  });
} finally {
  guardar();
  await navegador.close();
}

const fallos = resultados.filter((r) => r.e !== 'PASS').length;
console.log(`RESUMEN: ${preparacion.length + resultados.length} comprobaciones (preparacion=${preparacion.length}, navegador=${resultados.length}) | PASS=${preparacion.filter((p) => p.e === 'PASS').length + resultados.length - fallos} | FAIL=${fallos}`);
console.log(`emuladores: auth ${tiempos.auth} ms, firestore ${tiempos.firestore} ms | uid=${uid} | rol=${sesionRest.rol} | anonimo denegado: lectura ${reglas.lectura}, escritura ${reglas.escritura}`);
console.log(fallos === 0 ? 'RESULTADO GLOBAL: PASS' : 'RESULTADO GLOBAL: FAIL');
process.exit(fallos === 0 ? 0 : 1);
