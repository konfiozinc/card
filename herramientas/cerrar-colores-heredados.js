/* KZ-DESIGN-001 · Cierre: colores heredados en los archivos que quedaban.
   admin.html (redirección al panel), panel.html (informe heredado noindex),
   styles.css de la raíz y premium/premium.css (componentes no servidos).

   No se borra nada: se sustituye el color heredado por el token oficial y, si el
   archivo usa var(--kz-*), se le añade la hoja de tokens para que resuelva.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

const MAPA = {
  '#F0B429': 'var(--kz-cyan)', '#f0b429': 'var(--kz-cyan)',
  '#FFD97D': 'var(--kz-cyan-light)', '#FFD978': 'var(--kz-cyan-light)',
  '#F97316': 'var(--kz-violet)', '#f97316': 'var(--kz-violet)',
  '#1a1a1a': 'var(--kz-surface)', '#1A1A1A': 'var(--kz-surface)'
};

const ARCHIVOS = ['admin.html', 'panel.html', 'styles.css', 'premium/premium.css'];
console.log('\n=== CIERRE DE COLORES HEREDADOS ===\n');

for (const rel of ARCHIVOS) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) { console.log('  (no existe) ' + rel); continue; }
  let t = fs.readFileSync(p, 'utf8');
  const antes = t;
  for (const [hex, tok] of Object.entries(MAPA)) t = t.split(hex).join(tok);

  /* Si usa tokens y es una página que se abre sola, necesita la hoja de tokens. */
  if (rel.endsWith('.html') && /var\(--kz-/.test(t) && t.indexOf('kz-tokens.css') === -1) {
    if (/<link[^>]*stylesheet/i.test(t)) {
      t = t.replace(/(<link[^>]*stylesheet[^>]*>)/i, '<link rel="stylesheet" href="assets/css/kz-tokens.css" />\n$1');
    } else if (/<\/head>/i.test(t)) {
      t = t.replace(/<\/head>/i, '  <link rel="stylesheet" href="assets/css/kz-tokens.css" />\n</head>');
    }
  }
  if (t !== antes) { fs.writeFileSync(p, t, 'utf8'); console.log('  ' + rel + ' → actualizado'); }
  else console.log('  ' + rel + ' → sin cambios');
}

/* ── Verificación final en todo el repositorio ─────────────────────── */
console.log('\n=== VERIFICACION: rastros de la visual vieja ===\n');
const LEGADO = /#F0B429|#f0b429|#FFD978|#FFD97D|#F97316|#f97316|#00D4FF|#00d4ff|#F5F5F0|#17171B|#17171b/;
let conLegado = 0, revisados = 0;
const detalle = [];

(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs', 'design-system', 'tools'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { recorrer(p); continue; }
    if (!/\.(html|css)$/.test(e.name)) continue;
    revisados++;
    const bruto = fs.readFileSync(p, 'utf8');
    /* Los comentarios que explican el cambio NO son uso activo. */
    const t = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    if (LEGADO.test(t)) {
      conLegado++;
      const m = t.match(LEGADO);
      detalle.push(path.relative(RAIZ, p).replace(/\\/g, '/') + ' → ' + [...new Set((t.match(new RegExp(LEGADO.source, 'gi')) || []))].join(' '));
    }
  }
})(RAIZ);

console.log('  archivos HTML/CSS revisados: ' + revisados);
console.log('  con color heredado activo  : ' + conLegado);
detalle.forEach((d) => console.log('     ' + d));
console.log('\n' + (conLegado === 0 ? '  ✓ ninguna hoja ni página conserva la paleta anterior' : '  ✗ quedan restos'));
process.exit(conLegado === 0 ? 0 : 1);
