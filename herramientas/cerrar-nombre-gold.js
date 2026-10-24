'use strict';
/* Cierra la deuda del nombre --gold: renombra a tokens y elimina las declaraciones. */
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

const tok = fs.readFileSync(path.join(R, 'assets/css/kz-tokens.css'), 'utf8');
console.log('--- TOKENS DESTINO ---');
let faltan = [];
for (const n of ['--kz-cyan', '--kz-cyan-light', '--kz-rgb-cyan']) {
  const m = tok.match(new RegExp('\\s' + n + '\\s*:\\s*([^;]+);'));
  const v = m ? m[1].trim() : null;
  console.log('  ' + n.padEnd(18) + ' -> ' + (v || '** NO EXISTE **'));
  if (!v) faltan.push(n);
}
if (faltan.length) { console.log('\nABORTADO: faltan tokens destino.'); process.exit(1); }

console.log('\n--- FALLBACKS CON ORO ---');
const reFb = /var\(\s*--gold(2|-rgb)?\s*,[^)]*\)/g;
let totalFb = 0;
for (const f of walk(R)) {
  const m = fs.readFileSync(f, 'utf8').match(reFb);
  if (m) { totalFb += m.length; console.log('  ' + String(m.length).padStart(3) + '  ' + path.relative(R, f)); }
}
console.log('  total: ' + totalFb);

console.log('\n--- RENOMBRADO ---');
let archivos = 0, cambios = 0, decl = 0;
for (const f of walk(R)) {
  let t = fs.readFileSync(f, 'utf8');
  const antes = t;
  if (!/--gold/.test(t)) continue;

  /* 1. Elimina las declaraciones legacy --gold*: ahora sobran. */
  t = t.replace(/^[ \t]*--gold(?:2|-rgb)?[ \t]*:[^;]*;[ \t]*\r?\n/gm, (s) => { decl++; return ''; });

  /* 2. Renombra los usos, incluidos los que llevan fallback. */
  t = t.replace(/var\(\s*--gold-rgb\s*,[^)]*\)/g, 'var(--kz-rgb-cyan)');
  t = t.replace(/var\(\s*--gold2\s*,[^)]*\)/g, 'var(--kz-cyan-light)');
  t = t.replace(/var\(\s*--gold\s*,[^)]*\)/g, 'var(--kz-cyan)');
  t = t.replace(/var\(\s*--gold-rgb\s*\)/g, 'var(--kz-rgb-cyan)');
  t = t.replace(/var\(\s*--gold2\s*\)/g, 'var(--kz-cyan-light)');
  t = t.replace(/var\(\s*--gold\s*\)/g, 'var(--kz-cyan)');

  if (t !== antes) {
    fs.writeFileSync(f, t, 'utf8');
    archivos++;
    cambios += (antes.match(/--gold/g) || []).length - (t.match(/--gold/g) || []).length;
  }
}
console.log('  archivos modificados: ' + archivos);
console.log('  menciones --gold eliminadas: ' + cambios);
console.log('  declaraciones retiradas: ' + decl);

console.log('\n--- VERIFICACION FINAL ---');
let resto = 0;
for (const f of walk(R)) {
  const t = fs.readFileSync(f, 'utf8');
  const m = t.match(/--gold/g);
  if (m) { resto += m.length; console.log('  QUEDA ' + m.length + ' en ' + path.relative(R, f)); }
}
console.log('  --gold restantes: ' + resto);

/* Integridad de codificacion: sin BOM y sin caracteres de reemplazo. */
let malos = [];
for (const f of walk(R)) {
  const b = fs.readFileSync(f);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) malos.push('BOM ' + path.relative(R, f));
  if (fs.readFileSync(f, 'utf8').includes('\uFFFD')) malos.push('MOJIBAKE ' + path.relative(R, f));
}
console.log('  archivos con BOM o mojibake: ' + malos.length + (malos.length ? ' -> ' + malos.slice(0, 5).join(', ') : ''));

process.exit(resto === 0 && malos.length === 0 ? 0 : 1);
