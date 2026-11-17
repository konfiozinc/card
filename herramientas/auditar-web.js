/* Auditoria medible de la web corporativa (KZ-WEB-BLOQUEOS).
   En vez de "esta pagina se ve distinta", mide propiedades computadas
   comparables entre paginas y comprueba que el menu movil FUNCIONA de verdad
   (se pulsa y se abre). Complementa a verificar-calidad-html.js, que cubre el
   estandar y la consola pero no la coherencia visual.

   Uso: node herramientas/auditar-web.js [salida.json]
   Necesita un servidor local sirviendo el repo (por ejemplo python -m http.server).
*//* Auditoria medible de la web corporativa: en vez de "se ve distinto", mide
   propiedades computadas comparables entre paginas y comprueba que el menu
   movil FUNCIONA (se pulsa y se abre).

   Uso: node _tmp-auditar-web.js <json-salida> */
const fs = require('fs');
const { chromium } = require('playwright');

const SALIDA = process.argv[2];
const BASE = 'http://127.0.0.1:8099/';
const PAGINAS = ['index.html', 'precios.html', 'nosotros.html', 'contacto.html', '404.html',
  'politica-privacidad.html', 'recursos.html', 'soluciones.html'];
const TAMANOS = [{ w: 1280, h: 900, n: 'desk' }, { w: 375, h: 812, n: 'movil' }];

async function medir(page, url, tam) {
  const errores = [];
  page.removeAllListeners('console');
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 120)); });
  const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const g = (el, prop) => (el ? getComputedStyle(el)[prop] : null);
    const header = document.querySelector('header');
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    const cta = document.querySelector('.nav-cta');
    const btn = document.querySelector('a.btn-primary, .btn-primary, a.button--primary');
    const fab = document.querySelector('.kz-fab-wrapper');
    const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && g(el, 'display') !== 'none' && g(el, 'visibility') !== 'hidden';
    const cajaCta = cta ? cta.getBoundingClientRect() : null;
    const cajaFab = fab ? fab.getBoundingClientRect() : null;
    return {
      titulo: document.title,
      headerClase: header ? header.className : null,
      headerFondo: g(header, 'backgroundColor'),
      headerAlto: header ? Math.round(header.getBoundingClientRect().height) : 0,
      tieneToggle: !!toggle,
      toggleVisible: visible(toggle),
      tieneNavLinks: !!links,
      ctaTexto: cta ? cta.textContent.trim().replace(/\s+/g, ' ') : null,
      ctaVisible: visible(cta),
      ctaEnViewport: cajaCta ? (cajaCta.top >= 0 && cajaCta.bottom <= window.innerHeight && cajaCta.right <= window.innerWidth) : false,
      /* El CTA flotante del sitio es el Asesor (.kz-fab-wrapper): kz-neon.css
         oculta .wa-float con !important a proposito, para no duplicar accesos. */
      asesorVisible: visible(fab),
      asesorEnViewport: cajaFab ? (cajaFab.top >= 0 && cajaFab.bottom <= window.innerHeight && cajaFab.width > 0) : false,
      fuenteCuerpo: g(document.body, 'fontFamily'),
      colorMarca: btn ? g(btn, 'backgroundColor') : null,
      footerColumnas: document.querySelectorAll('footer .footer-col').length,
      mainJs: !!Array.from(document.scripts).find((s) => (s.src || '').includes('assets/js/main.js')),
    };
  }).catch(() => ({ error: 'evaluate fallÃƒÂ³' }));

  // Ã‚Â¿El menu movil funciona de verdad? Solo tiene sentido en movil y si hay boton.
  let menuAbre = null;
  if (tam.n === 'movil' && r.tieneToggle && r.toggleVisible) {
    try {
      await page.click('#navToggle');
      await page.waitForTimeout(350);
      menuAbre = await page.evaluate(() => {
        const body = document.body.classList.contains('menu-open');
        const links = document.getElementById('navLinks');
        const visible = !!links && links.getBoundingClientRect().width > 0 && getComputedStyle(links).visibility !== 'hidden';
        return body || visible;
      });
      await page.click('#navToggle').catch(() => {});
    } catch (e) {
      menuAbre = 'error: ' + e.message.slice(0, 60);
    }
  }

  return { pagina: url, tam: tam.n, http: resp ? resp.status() : null, erroresConsola: errores.length, ...r, menuAbre };
}

(async () => {
  const navegador = await chromium.launch();
  const filas = [];
  for (const t of TAMANOS) {
    const ctx = await navegador.newContext({ viewport: { width: t.w, height: t.h } });
    const page = await ctx.newPage();
    for (const p of PAGINAS) filas.push(await medir(page, p, t));
    await ctx.close();
  }
  await navegador.close();
  fs.writeFileSync(SALIDA, JSON.stringify(filas, null, 1), 'utf8');

  const cab = ['pagina', 'tam', 'header', 'tog', 'togVis', 'menuAbre', 'cta', 'ctaVis', 'ctaVP', 'asesor', 'asesVP', 'footCol', 'mainJs', 'consola'];
  console.log(cab.map((c) => c.padEnd(8)).join(' '));
  for (const f of filas) {
    console.log([
      f.pagina.replace('.html', '').slice(0, 8).padEnd(8),
      f.tam.padEnd(8),
      String(f.headerClase || '(sin)').slice(0, 8).padEnd(8),
      (f.tieneToggle ? 'si' : 'NO').padEnd(8),
      (f.toggleVisible ? 'si' : 'NO').padEnd(8),
      String(f.menuAbre === null ? '-' : f.menuAbre).padEnd(8),
      (f.ctaTexto ? 'si' : 'NO').padEnd(8),
      (f.ctaVisible ? 'si' : 'NO').padEnd(8),
      (f.ctaEnViewport ? 'si' : 'NO').padEnd(8),
      (f.asesorVisible ? 'si' : 'NO').padEnd(8),
      (f.asesorEnViewport ? 'si' : 'NO').padEnd(8),
      String(f.footerColumnas).padEnd(8),
      (f.mainJs ? 'si' : 'NO').padEnd(8),
      String(f.erroresConsola),
    ].join(' '));
  }
})();

