'use strict';
/* Retira las declaraciones --cyan / --violet que quedaron sin consumidores. */
const fs = require('fs');
const path = require('path');
const R = process.cwd();

const objetivos = [
  { rel: 'assets/css/kz-tokens.css', linea: '  --cyan: var(--kz-cyan);' },
  { rel: 'assets/css/styles.css', linea: '  --cyan: var(--kz-cyan);' },
  { rel: 'premium-assets/styles.css', linea: '  --cyan:var(--kz-cyan);' },
  { rel: 'premium-assets/styles.css', linea: '  --violet:var(--kz-violet-light);' },
  { rel: 'styles.css', linea: '  --cyan: #00E5FF;' }
];

for (const o of objetivos) {
  const p = path.join(R, o.rel);
  const lineas = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const antes = lineas.length;
  const fuera = lineas.filter((l) => l !== o.linea);
  if (fuera.length === antes) { console.log('  [--] ' + o.rel + ' : no encontrada -> ' + o.linea); continue; }
  fs.writeFileSync(p, fuera.join('\n'), 'utf8');
  console.log('  [OK] ' + o.rel + ' : ' + (antes - fuera.length) + ' linea(s) -> ' + o.linea.trim());
}

console.log('\n--- VERIFICACION FINAL ---');
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o); else if (/\.(css|html|js)$/.test(e.name)) o.push(p);
  }
  return o;
}
let pend = 0, bom = 0, moji = 0;
for (const f of walk(R)) {
  const rel = path.relative(R, f).replace(/\\/g, '/');
  if (/herramientas\//.test(rel)) continue;
  const t = fs.readFileSync(f, 'utf8');
  const m = t.match(/^\s*--(cyan|violet|gold|gold2|gold-rgb)\s*:/gm);
  if (m) { pend += m.length; console.log('  PENDIENTE ' + rel + ' x' + m.length); }
  const b = fs.readFileSync(f);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { bom++; console.log('  BOM ' + rel); }
  if (t.includes('\uFFFD')) { moji++; console.log('  MOJIBAKE ' + rel); }
}
console.log('  declaraciones legacy restantes: ' + pend + ' · BOM: ' + bom + ' · mojibake: ' + moji);
process.exit(pend === 0 && bom === 0 && moji === 0 ? 0 : 1);
