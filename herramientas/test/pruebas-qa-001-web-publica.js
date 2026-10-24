/* ═══════════════════════════════════════════════════════════════════
   pruebas-qa-001-web-publica.js · KONFÍO ZINC — CARD — PUERTA DE CALIDAD

   KZ-QA-001 · Puerta de calidad de la web pública.

   ORIGEN Y HONESTIDAD SOBRE LA PROCEDENCIA
   La misión pedía integrar la rama `codex/kz-qa-001` (commit 76057470). Esa rama
   y ese commit NO existen en este entorno: no están en el repositorio, ni en
   `origin`, ni en ningún worktree, y no hay artefactos QA en disco. Se verificó
   con `git cat-file`, `git fetch`, `git branch -r` y búsqueda en el árbol.
   Por eso esta puerta la redacta Harness, cubriendo los mismos objetivos que
   describía el encargo. Si la suite de Codex aparece después, se integra sin
   sustituir estas comprobaciones.

   QUÉ COMPRUEBA
     A · Privacidad: ningún dato personal del formulario se persiste en el
         navegador; sin endpoints ficticios; sin destinos externos en <form>.
     B · Captación: ambos formularios van al Worker `/leads` y el éxito solo se
         muestra con `saved:true`.
     C · Recursos: cada `src`/`href` local de las páginas existe (rutas rotas).
     D · Runtime (con --base): somete los formularios a un envío FALLIDO real y
         verifica que no se guarda nada, que el mensaje es honesto y que no sale
         ninguna petición a un tercero.
     E · Accesibilidad y responsive básicos en 375×667.
     F · Ausencia de credenciales privadas en el código de cliente.

   Uso:
     node herramientas/test/pruebas-qa-001-web-publica.js                 # solo A, B, C, F
     node herramientas/test/pruebas-qa-001-web-publica.js --base http://127.0.0.1:5000
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const argBase = process.argv.indexOf('--base');
const BASE = argBase !== -1 ? process.argv[argBase + 1] : null;

const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(60)} ${detalle || ''}`);
}

const leer = (rel) => {
  const p = path.join(RAIZ, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

/* Páginas públicas que pueden recibir un formulario. */
const PAGINAS = ['index.html', 'contacto.html', 'gracias.html', 'servicios/tarjetas-digitales.html',
  'servicios/catalogos-digitales.html', 'servicios/menus-digitales.html',
  'servicios/landing-pages.html', 'servicios/codigos-qr.html', 'servicios/agentes-ia.html',
  'portafolio.html', 'nosotros.html', 'blog.html'];

const JS_CLIENTE = ['assets/js/main.js', 'premium-assets/app.js', 'assets/js/config.js',
  'assets/js/push.js', 'assets/js/firebase-config.js'];

/* ── Patrones prohibidos ──────────────────────────────────────────────
   Se busca el USO EN CÓDIGO, no la mención en un comentario: quitar una
   comprobación porque una nota explica el defecto sería absurdo. */
const PROHIBIDOS = [
  {
    nombre: 'Persistir los datos del formulario en localStorage',
    re: /(setItem|getItem)\s*\(\s*['"]kz_leads['"]/,
    gravedad: 'crítico'
  },
  {
    nombre: 'Endpoint ficticio de Formspree (formspree.io/f/xxxxx)',
    re: /formspree\.io\/f\/[xX]{3,}/,
    gravedad: 'crítico'
  },
  {
    nombre: 'Destino externo en un <form>',
    re: /<form\b[^>]*\baction\s*=\s*["']\s*https?:\/\//i,
    gravedad: 'crítico'
  },
  {
    nombre: 'Marcador de endpoint sin completar (xxxxx / TU_DOMINIO / TODO_URL)',
    re: /["']\s*https?:\/\/[^"']*(?:xxxxx|TU[_-]?DOMINIO|TODO[_-]?URL|ejemplo\.com\/f\/)/i,
    gravedad: 'crítico'
  }
];

const CREDENCIALES = [
  { nombre: 'Clave privada PEM cementada', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { nombre: 'Cuenta de servicio de Firebase', re: /"type"\s*:\s*"service_account"/ },
  { nombre: 'Clave de Admin SDK', re: /firebase-adminsdk[-\w]*@/ },
  { nombre: 'Secreto de cliente OAuth', re: /"client_secret"\s*:\s*"[^"]{8,}"/ },
  { nombre: 'Token de GitHub', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { nombre: 'Clave de Stripe', re: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ }
];

console.log('\n═══ A · PRIVACIDAD Y DESTINOS ═══');

const archivosRevisados = [];
for (const rel of [...PAGINAS, ...JS_CLIENTE]) {
  const t = leer(rel);
  if (t === null) continue;
  archivosRevisados.push(rel);
  for (const p of PROHIBIDOS) {
    const m = p.re.exec(t);
    chequear(`${p.nombre} · ${rel}`, !m, m ? `encontrado: «${m[0].slice(0, 50)}»` : 'ausente');
  }
}

/* Los formularios deben declarar el Worker autorizado como destino real. */
const mainJs = leer('assets/js/main.js') || '';
const appJs = leer('premium-assets/app.js') || '';
chequear('El formulario estándar apunta al Worker `/leads`',
  /WORKER_LEADS\s*=\s*['"]https:\/\/calm-heart-6828\.konfiozinc\.workers\.dev\/leads['"]/.test(mainJs),
  'main.js · WORKER_LEADS');
chequear('El formulario premium apunta al Worker `/leads`',
  /LEADS_URL\s*=\s*['"]https:\/\/calm-heart-6828\.konfiozinc\.workers\.dev\/leads['"]/.test(appJs),
  'premium-assets/app.js · LEADS_URL');

console.log('\n═══ B · CAPTACIÓN: EL ÉXITO NO SE ANUNCIA SIN CONFIRMACIÓN ═══');
chequear('Formulario estándar exige `saved === true`',
  /j\.saved\s*!==\s*true/.test(mainJs), 'main.js: guarda contra saved');
chequear('Formulario premium exige `saved === true`',
  /result\.saved\s*!==\s*true/.test(appJs), 'app.js: guarda contra saved');
chequear('El formulario estándar no tiene ninguna vía alternativa de envío',
  !/FormData\(/.test(mainJs), 'sin POST a action arbitrario');

/* La política de privacidad no puede prometer algo que el código incumpla. */
const politica = leer('politica-privacidad.html') || '';
const prometeNoGuardar = /no los guarda en localStorage/i.test(politica);
const mainSinPii = !/(setItem|getItem)\s*\(\s*['"]kz_leads['"]/.test(mainJs);
chequear('La política de privacidad y el código dicen lo mismo',
  !prometeNoGuardar || mainSinPii,
  prometeNoGuardar ? 'política promete no guardar · código cumple' : 'política no lo afirma');

console.log('\n═══ C · RECURSOS: RUTAS QUE EXISTEN ═══');
/* El sitio se publica en https://konfiozinc.github.io/card/, así que una ruta
   absoluta `/card/algo.html` es VÁLIDA y corresponde a `algo.html` en la raíz
   del repositorio. Sin descontar ese prefijo el verificador marca un enlace
   bueno como roto (pasó con `/card/servicios.html` en blog.html): un
   verificador automático se lee antes de creerle. */
const PREFIJO_SITIO = '/card/';
function resolverLocal(dir, ref) {
  let r = ref;
  if (r.startsWith(PREFIJO_SITIO)) return r.slice(PREFIJO_SITIO.length); // /card/x → x
  if (r.startsWith('/')) return r.slice(1);                              // absoluta del sitio
  return path.normalize(path.join(dir, r));
}
let rotos = 0;
for (const rel of PAGINAS) {
  const html = leer(rel);
  if (html === null) continue;
  const dir = path.dirname(rel);
  const refs = [];
  const re = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) refs.push(m[1]);
  for (const r of new Set(refs)) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(r)) continue;
    const destino = resolverLocal(dir, r);
    if (!fs.existsSync(path.join(RAIZ, destino))) {
      console.log(`      · roto en ${rel}: ${r}`);
      rotos++;
    }
  }
}
chequear('Todas las referencias locales de las páginas existen', rotos === 0, `${rotos} ruta(s) rota(s)`);

/* ── G · Oferta comercial vigente en lo que ve el cliente ───────────── */
console.log('\n═══ G · OFERTA VIGENTE EN EL CÓDIGO QUE VE EL CLIENTE ═══');
/* El respaldo local del chat y los textos del sitio son superficie comercial:
   si anuncian un precio retirado, el cliente lo lee. Mini Web Básica $49.900 y
   Pro $99.900 son los vigentes; $149.900 está retirado. */
const SUPERFICIE_COMERCIAL = ['assets/js/main.js', 'premium-assets/app.js', 'assets/js/config.js',
  'index.html', 'precios.html', 'servicios.html'];
for (const rel of SUPERFICIE_COMERCIAL) {
  const t = leer(rel);
  if (t === null) continue;
  const retirado = /149[.,]900|149\.9|Precio\s*Elite|\bplan\s+Elite\b/i.test(t);
  chequear(`Sin precios retirados ($149.900 / Elite) · ${rel}`, !retirado, retirado ? 'RETIRADO PRESENTE' : 'limpio');
}
const mainJs2 = leer('assets/js/main.js') || '';
chequear('El respaldo del chat anuncia Mini Web Básica $49.900', /49[.,]900/.test(mainJs2), 'main.js');
chequear('El respaldo del chat anuncia Mini Web Pro $99.900', /99[.,]900/.test(mainJs2), 'main.js');
chequear('El respaldo del chat no menciona planes Star/Elite',
  !/\bStar\b|\bElite\b/.test(mainJs2), 'main.js');

console.log('\n═══ F · CREDENCIALES PRIVADAS EN CÓDIGO DE CLIENTE ═══');for (const rel of [...PAGINAS, ...JS_CLIENTE]) {
  const t = leer(rel);
  if (t === null) continue;
  for (const c of CREDENCIALES) {
    const m = c.re.exec(t);
    chequear(`${c.nombre} · ${rel}`, !m, m ? 'PRESENTE' : 'ausente');
  }
}

/* ── D y E · Runtime contra staging ─────────────────────────────────── */
async function runtime() {
  const PW = path.join(RAIZ, 'herramientas', 'node_modules', 'playwright');
  const { chromium } = require(PW);
  const LOCAL = (url) => { try { const x = new URL(url); return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(x.hostname); } catch (e) { return true; } };

  const nav = await chromium.launch({ headless: true });

  async function nuevaPagina(viewport) {
    const ctx = await nav.newContext({ viewport: viewport || { width: 1280, height: 900 } });
    const pag = await ctx.newPage();
    const externas = [];
    const errores = [];
    pag.on('pageerror', (e) => errores.push(e.message));
    await pag.route('**/*', async (r) => {
      const url = r.request().url();
      if (LOCAL(url)) await r.continue();
      else { externas.push(url); await r.abort('blockedbyclient'); }
    });
    return { ctx, pag, externas, errores };
  }

  /* D1 · Formulario estándar con el Worker caído: no debe guardar nada. */
  console.log('\n═══ D · RUNTIME: ENVÍO FALLIDO SIN PERSISTENCIA (contacto.html) ═══');
  {
    const { ctx, pag, externas, errores } = await nuevaPagina();
    await pag.goto(`${BASE}/contacto.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1500);

    await pag.fill('#nombre', 'QA Ficticio');
    await pag.fill('#email', 'qa.ficticio@example.invalid');
    await pag.fill('#telefono', '3000000000');
    await pag.fill('#mensaje', 'Mensaje de prueba de la puerta de calidad.');
    const sel = await pag.$('#servicio');
    if (sel) await pag.selectOption('#servicio', { index: 1 }).catch(() => {});

    const antes = await pag.evaluate(() => localStorage.getItem('kz_leads'));
    await pag.click('#contactForm button[type="submit"]');
    await pag.waitForTimeout(4000);

    const estado = await pag.evaluate(() => ({
      kzLeads: localStorage.getItem('kz_leads'),
      claves: Object.keys(localStorage),
      almacen: { ...localStorage },
      success: (document.querySelector('#contactForm .form-success') || {}).textContent || '',
      error: (document.querySelector('#contactForm .form-error-box') || {}).textContent || ''
    }));

    chequear('No se crea `kz_leads` al fallar el envío',
      estado.kzLeads === null && antes === null, `claves en localStorage: [${estado.claves.join(', ')}]`);
    chequear('Ningún dato personal queda en el almacenamiento del navegador',
      !/qa\.ficticio@|3000000000|QA Ficticio/i.test(JSON.stringify(estado.almacen)),
      `claves revisadas: [${estado.claves.join(', ')}]`);
    chequear('Se muestra un mensaje de error honesto (los datos no se han guardado)',
      /no se han guardado|no pudimos registrar/i.test(estado.error), `«${estado.error.trim().slice(0, 70)}»`);
    chequear('NO se muestra un mensaje de éxito', !(/enviado|recibido/i.test(estado.success) && estado.success.trim() !== ''),
      `«${estado.success.trim().slice(0, 40)}»`);
    /* Una petición «externa» no es un fallo por sí misma: la página carga
       Google Tag Manager para analítica. Lo que NO puede ocurrir es que los
       datos del formulario salgan hacia un destino de envío (Formspree y
       similares). Se comprueban las dos cosas por separado y se listan los
       hosts efectivamente contactados. */
    const hosts = [...new Set(externas.map((u) => { try { return new URL(u).host; } catch (e) { return u; } }))];
    const destinosDeEnvio = externas.filter((u) => /formspree|web3forms|getform|mailgun|example\.(com|invalid)|\/f\/xxxxx/i.test(u));
    chequear('Ninguna petición va a un destino de envío de formularios',
      destinosDeEnvio.length === 0, destinosDeEnvio.length ? destinosDeEnvio[0] : 'ninguno');
    chequear('Los únicos hosts externos son de analítica conocida',
      hosts.every((h) => /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|(^|\.)google\.com$|gstatic\.com/i.test(h)),
      `[${hosts.join(', ') || 'ninguno'}]`);
    chequear('Sin errores de JavaScript en contacto.html', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');
    await ctx.close();
  }

  /* D2 · Formulario premium con el Worker caído: solo un timestamp, sin PII. */
  console.log('\n═══ D · RUNTIME: FORMULARIO PREMIUM (index.html) ═══');
  {
    const { ctx, pag, externas, errores } = await nuevaPagina();
    await pag.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1800);

    await pag.fill('#nombre', 'QA Ficticio Premium');
    await pag.fill('#telefono', '3010000000');
    await pag.fill('#negocio', 'Negocio Ficticio QA');
    await pag.selectOption('#servicio', { index: 1 }).catch(() => {});
    await pag.fill('#objetivo', 'Objetivo de prueba de la puerta de calidad.');
    await pag.click('.lead-form__submit');
    await pag.waitForTimeout(9000);

    const estado = await pag.evaluate(() => ({
      almacen: { ...localStorage },
      status: (document.getElementById('form-status') || {}).textContent || '',
      fallback: !document.getElementById('whatsapp-fallback').hidden
    }));
    const claves = Object.keys(estado.almacen);
    const valores = JSON.stringify(estado.almacen);

    chequear('El formulario premium no persiste datos personales',
      !/QA Ficticio Premium|3010000000|Negocio Ficticio QA/i.test(valores),
      `claves: [${claves.join(', ')}]`);
    chequear('La única marca local es el timestamp del cooldown',
      claves.every((k) => k === 'kz_lead_last'), `[${claves.join(', ')}]`);
    chequear('Avisa de que los datos no se dan por recibidos',
      /no se dan por recibidos|no pudimos registrar/i.test(estado.status), `«${estado.status.trim().slice(0, 70)}»`);
    chequear('Ofrece la alternativa de WhatsApp', estado.fallback, 'fallback visible');
    chequear('Ninguna petición salió a un tercero', externas.length === 0, `${externas.length} externas`);
    chequear('Sin errores de JavaScript en index.html', errores.length === 0, errores.slice(0, 2).join(' | ') || 'ninguno');
    await ctx.close();
  }

  /* E · Accesibilidad y responsive básicos. */
  console.log('\n═══ E · ACCESIBILIDAD Y MÓVIL 375×667 ═══');
  for (const [ruta, nombre, formSel] of [['contacto.html', 'Contacto', '#contactForm'], ['index.html', 'Inicio', '#lead-form']]) {
    const { ctx, pag } = await nuevaPagina({ width: 375, height: 667 });
    await pag.goto(`${BASE}/${ruta}`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1500);
    const a11y = await pag.evaluate((sel) => {
      const f = document.querySelector(sel);
      if (!f) return null;
      const campos = [...f.querySelectorAll('input:not([type=hidden]), textarea, select')]
        .filter((c) => c.id !== 'website');
      const sinEtiqueta = campos.filter((c) => {
        if (c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')) return false;
        return !document.querySelector(`label[for="${c.id}"]`);
      }).map((c) => c.id);
      const boton = f.querySelector('button[type="submit"]');
      return {
        campos: campos.length,
        sinEtiqueta,
        botonTexto: boton ? boton.textContent.trim() : '',
        desborda: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    }, formSel);
    if (!a11y) { chequear(`${nombre}: formulario presente en 375×667`, false, 'no encontrado'); await ctx.close(); continue; }
    chequear(`${nombre}: todos los campos tienen etiqueta`, a11y.sinEtiqueta.length === 0,
      a11y.sinEtiqueta.length ? `sin etiqueta: ${a11y.sinEtiqueta.join(', ')}` : `${a11y.campos} campos`);
    chequear(`${nombre}: el botón de envío tiene texto accesible`, a11y.botonTexto.length > 3, `«${a11y.botonTexto}»`);
    chequear(`${nombre}: no desborda en 375×667`, !a11y.desborda, `desborda=${a11y.desborda}`);
    await ctx.close();
  }

  await nav.close();
}

(async () => {
  if (BASE) {
    await runtime();
  } else {
    console.log('\n   (sin --base: se omiten las comprobaciones D y E de runtime)');
  }

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${salida.length} · PASAN: ${salida.length - fallos.length} · FALLAN: ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log(''); for (const f of fallos) console.log(`  · ${f.nombre} — ${f.detalle}`); }
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n[ERROR FATAL] ' + (e && e.stack || e)); process.exit(2); });
