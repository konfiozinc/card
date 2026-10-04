const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto('https://konfiozinc.github.io/card/portafolio.html', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2500);

  const sels = [
    '.page-hero-title', '.page-hero-sub', '.eyebrow',
    '.section-title', '.section-sub',
    '.filters', '.filter-btn',
    '.testimonial-text', '.faq-question', '.faq-answer p',
    '.related strong', '.related span',
    '.cta-final h2', '.cta-final p'
  ];

  const rows = await page.evaluate((sels) => {
    const out = [];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el, i) => {
        const cs = getComputedStyle(el);
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44);
        out.push({
          sel,
          i,
          tag: el.tagName.toLowerCase(),
          align: cs.textAlign,
          txt
        });
      });
    }
    return out;
  }, sels);

  for (const r of rows) {
    console.log(`${r.align.padEnd(9)} | ${(r.sel + '[' + r.i + ']').padEnd(22)} | <${r.tag}> ${r.txt}`);
  }
  await browser.close();
})();
