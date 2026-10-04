const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'https://konfiozinc.github.io/card/';
const pages = ['index.html', 'servicios.html', 'portafolio.html', 'nosotros.html'];
const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'desktop', width: 1440, height: 900 }
];

(async () => {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    for (const p of pages) {
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 80)); });
      page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 80)));
      try {
        await page.goto(BASE + p, { waitUntil: 'load', timeout: 40000 });
        await page.waitForTimeout(1500);
        const res = await page.evaluate(() => {
          const t = document.querySelector('.hero-title, .page-hero-title');
          const align = t ? getComputedStyle(t).textAlign : '-';
          const overflowX = document.documentElement.scrollWidth > window.innerWidth;
          return { align, overflowX, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
        });
        const status = (res.overflowX ? 'OVERFLOW-X' : 'ok') + ' ' + (errors.length ? 'CONSOLE-ERR(' + errors.length + ')' : 'console-ok');
        console.log(`${vp.name.padEnd(8)} ${p.padEnd(18)} hero=${res.align.padEnd(6)} ${status}  (scrollW=${res.sw}, innerW=${res.iw})`);
        if (errors.length) errors.slice(0, 3).forEach((e) => console.log('      └ ' + e));
      } catch (e) {
        console.log(`${vp.name.padEnd(8)} ${p.padEnd(18)} ERR ${String(e.message).split('\n')[0]}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
