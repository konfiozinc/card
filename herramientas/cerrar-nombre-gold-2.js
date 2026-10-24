'use strict';
/* Cierra el resto de la deuda "gold": declaraciones inline, clases y rotulos del laboratorio. */
const fs = require('fs');
const path = require('path');
const R = process.cwd();
const leer = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const escribir = (p, t) => fs.writeFileSync(path.join(R, p), t, 'utf8');
let cambios = 0;
function sust(p, pares) {
  let t = leer(p);
  const antes = t;
  for (const [de, a] of pares) t = t.split(de).join(a);
  if (t !== antes) { escribir(p, t); cambios++; console.log('  [OK] ' + p); }
  else console.log('  [--] ' + p + ' (sin cambios)');
}

console.log('--- DECLARACIONES INLINE ---');
sust('panel.html', [
  ['--gold:var(--kz-cyan);--gold2:var(--kz-cyan-light);', '']
]);
sust('premium-assets/styles.css', [
  ['  --gold:var(--kz-cyan);          /* acento corporativo (antes dorado) */\n', '']
]);

console.log('\n--- SISTEMA DE DISENO: nombres que pintan violeta ---');
sust('design-system/tokens.css', [
  ['--kz-tech-gold-500: var(--kz-violet);        /* oro retirado → violeta de Neon */',
   '--kz-tech-violet-500: var(--kz-violet);      /* acento de marca (el oro esta retirado) */'],
  ['--kz-tech-gold-300: var(--kz-violet-light);  /* oro retirado → violeta claro */',
   '--kz-tech-violet-300: var(--kz-violet-light); /* acento claro */']
]);
sust('design-system/components.css', [
  ['.kz-tech-button--gold', '.kz-tech-button--violet'],
  ['.kz-tech-badge--gold', '.kz-tech-badge--violet'],
  ['var(--kz-tech-gold-500)', 'var(--kz-tech-violet-500)'],
  ['var(--kz-tech-gold-300)', 'var(--kz-tech-violet-300)']
]);
sust('design-system/lab.html', [
  ['kz-tech-badge--gold', 'kz-tech-badge--violet'],
  ['kz-tech-button--gold', 'kz-tech-button--violet'],
  ['Oro · marca', 'Violeta · acento'],
  ['#F0B429', '#8B5CF6'],
  ['El cian guía la interacción, el oro conserva la marca',
   'El cian guía la interacción, el violeta aporta el acento']
]);
sust('design-system/README.md', [
  ['| `--kz-tech-gold-500` | `#f0b429` | **`--kz-violet`** | el oro está retirado; la identida',
   '| `--kz-tech-violet-500` | `#8B5CF6` | *(nativo)* | el oro está retirado; la identida'],
  ['| `--kz-tech-gold-300` | `#ffd978` | **`--kz-violet-light`** | idem |',
   '| `--kz-tech-violet-300` | `#A78BFA` | *(nativo)* | idem |']
]);

console.log('\n--- VERIFICACION ---');
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o); else if (/\.(css|html|js|md)$/.test(e.name)) o.push(p);
  }
  return o;
}
const HERRAMIENTAS = /herramientas[\\/]/;
let prod = 0, tool = 0;
for (const f of walk(R)) {
  const rel = path.relative(R, f).replace(/\\/g, '/');
  const t = fs.readFileSync(f, 'utf8');
  const decl = t.match(/--gold(?:2|-rgb)?\s*:/g);
  if (decl) {
    if (HERRAMIENTAS.test(rel)) tool += decl.length;
    else { prod += decl.length; console.log('  DECLARACION PENDIENTE: ' + rel + ' x' + decl.length); }
  }
}
console.log('  declaraciones --gold* en producto: ' + prod);
console.log('  declaraciones --gold* en herramientas (patron de deteccion): ' + tool);

let bom = 0, moji = 0;
for (const f of walk(R)) {
  const b = fs.readFileSync(f);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { bom++; console.log('  BOM: ' + path.relative(R, f)); }
  if (fs.readFileSync(f, 'utf8').includes('\uFFFD')) { moji++; console.log('  MOJIBAKE: ' + path.relative(R, f)); }
}
console.log('  archivos con BOM: ' + bom + ' · con mojibake: ' + moji);
process.exit(prod === 0 && bom === 0 && moji === 0 ? 0 : 1);
