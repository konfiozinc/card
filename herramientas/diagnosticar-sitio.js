const { chromium } = require('playwright');

const pages = [
  'index.html',
  'nosotros.html',
  'servicios.html',
  'servicios/tarjetas-digitales.html',
  'servicios/landing-pages.html',
  'servicios/catalogos-digitales.html',
  'servicios/menus-digitales.html',
  'servicios/agentes-ia.html',
  'servicios/codigos-qr.html',
  'portafolio.html',
  'portafolio/tarjetas-digitales.html',
  'portafolio/landing-pages.html',
  'portafolio/catalogos-digitales.html',
  'portafolio/menus-digitales.html',
  'portafolio/agentes-ia.html',
  'portafolio/codigos-qr.html',
  'aliados.html',
  'contacto.html',
  'blog.html',
  'blog/index.html',
  'blog/agentes-ia-atencion-24-7.html',
  'blog/catalogos-y-menus-digitales.html',
  'blog/tarjeta-digital-para-medicos.html',
  'blog/tarjetas-digitales-star-pro-elite.html',
  'blog/menu-digital-para-restaurantes.html'
];

const BASE = process.env.BASE_URL || 'https://konfiozinc.github.io/card/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });

  for (const p of pages) {
    try {
      await page.goto(BASE + p, { waitUntil: 'load', timeout: 40000 });
      await page.waitForTimeout(1200);
      const info = await page.evaluate(() => {
        const hero = document.querySelector('.hero, .page-hero');
        const res = { hero: null, sectionHeads: [] };
        if (hero) {
          const t = hero.querySelector('h1, .hero-title, .page-hero-title');
          const s = hero.querySelector('.hero-sub, .page-hero-sub');
          const e = hero.querySelector('.eyebrow');
          const a = hero.querySelector('.hero-actions, .cta-actions');
          const cs = (el) => el ? getComputedStyle(el) : null;
          res.hero = {
            cls: hero.className,
            title: t ? t.textContent.replace(/\s+/g, ' ').trim().slice(0, 38) : '(sin h1)',
            titleAlign: cs(t) ? cs(t).textAlign : '-',
            subAlign: cs(s) ? cs(s).textAlign : '-',
            eyebrowAlign: cs(e) ? cs(e).textAlign : '-',
            actionsJustify: cs(a) ? cs(a).justifyContent : '-'
          };
        }
        document.querySelectorAll('.section-head').forEach((sh) => {
          res.sectionHeads.push(getComputedStyle(sh).textAlign);
        });
        return res;
      });

      const h = info.hero;
      const heads = info.sectionHeads;
      const allCenter = heads.every((x) => x === 'center');
      if (h) {
        console.log(`${p.padEnd(38)} HERO[${(h.titleAlign + '/' + h.subAlign + '/' + h.eyebrowAlign + '/' + h.actionsJustify).padEnd(26)}] secHead(${heads.length}): ${allCenter ? 'todos center' : JSON.stringify(heads)}`);
      } else {
        console.log(`${p.padEnd(38)} (sin .hero/.page-hero)  secHead(${heads.length}): ${allCenter ? 'todos center' : JSON.stringify(heads)}`);
      }
    } catch (e) {
      console.log(`${p.padEnd(38)} ERR ${String(e.message).split('\n')[0]}`);
    }
  }
  await browser.close();
})();
