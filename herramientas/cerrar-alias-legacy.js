'use strict';
/* Cierra los alias legacy --cyan / --violet y la paleta embebida de panel.html. */
const fs = require('fs');
const path = require('path');
const R = process.cwd();

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (/\.(css|html|js)$/.test(e.name)) o.push(p);
  }
  return o;
}

let cambios = 0;
function sust(rel, pares) {
  const p = path.join(R, rel);
  let t = fs.readFileSync(p, 'utf8');
  const antes = t;
  for (const [de, a] of pares) t = t.split(de).join(a);
  if (t !== antes) { fs.writeFileSync(p, t, 'utf8'); cambios++; console.log('  [OK] ' + rel); }
  else console.log('  [--] ' + rel + ' (sin cambios)');
}

console.log('--- ALIAS --cyan: 49 usos -> token real ---');
for (const rel of ['assets/css/styles.css', 'assets/css/admin.css', 'premium-assets/styles.css', 'styles.css']) {
  sust(rel, [['var(--cyan)', 'var(--kz-cyan)']]);
}

console.log('\n--- DECLARACIONES QUE SOBRAN ---');
/* --cyan: alias 1:1 al token, ahora sin usos. */
sust('assets/css/styles.css', [['  --cyan: var(--kz-cyan);\n', '']]);
sust('assets/css/admin.css', [['  --cyan: var(--kz-cyan);\n', '']]);
sust('premium-assets/styles.css', [['  --cyan:var(--kz-cyan);\n', '']]);
/* --violet: cero usos, estaba muerta. */
sust('premium-assets/styles.css', [['  --violet:var(--kz-violet-light);\n', '']]);

console.log('\n--- panel.html: paleta embebida -> tokens ---');
sust('panel.html', [[
  ':root{--bg:#0A0A0A;--panel:#141414;--line:#2a2a2a;--txt:#eee;--muted:#999;--green:#25d366}',
  ':root{--bg:var(--kz-bg);--panel:var(--kz-surface);--line:var(--kz-border);--txt:var(--kz-text);--muted:var(--kz-text-muted);--green:#25d366}'
]]);

console.log('\n--- VERIFICACION ---');
let pend = [];
for (const f of walk(R)) {
  const rel = path.relative(R, f).replace(/\\/g, '/');
  if (/herramientas\//.test(rel)) continue;
  const t = fs.readFileSync(f, 'utf8');
  for (const n of ['--cyan', '--violet', '--gold2', '--gold-rgb']) {
    const m = t.match(new RegExp(n + '\\s*:', 'g'));
    if (m) pend.push(rel + ' declara ' + n + ' x' + m.length);
  }
  const usoCyan = t.match(/var\(\s*--cyan\s*\)/g);
  if (usoCyan) pend.push(rel + ' usa var(--cyan) x' + usoCyan.length);
}
console.log('  pendientes: ' + (pend.length ? '\n    ' + pend.join('\n    ') : '0'));

let bom = 0, moji = 0;
for (const f of walk(R)) {
  const b = fs.readFileSync(f);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { bom++; console.log('  BOM: ' + path.relative(R, f)); }
  if (fs.readFileSync(f, 'utf8').includes('\uFFFD')) { moji++; console.log('  MOJIBAKE: ' + path.relative(R, f)); }
}
console.log('  BOM: ' + bom + ' · mojibake: ' + moji + ' · archivos tocados: ' + cambios);
process.exit(pend.length === 0 && bom === 0 && moji === 0 ? 0 : 1);
