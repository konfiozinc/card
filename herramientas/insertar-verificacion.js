const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TAG = '<meta name="google-site-verification" content="8cqMe9uCjlMuvUzvNSzgMcjifl9tCk17YhZJ04eFjwU" />';

// Patrones placeholder existentes en las páginas públicas (se reemplazan por la etiqueta real)
const PATTERNS = [
  '<!-- ⚠️ PLACEHOLDER: verificación de Google Search Console (pega tu código real) -->\n<!-- Search Console: pega aquí tu código de verificación cuando lo tengas. Ver docs/PANEL.md -->',
  '<!-- Search Console: pega aquí tu código de verificación cuando lo tengas. Ver docs/PANEL.md -->',
];

// Directorios del sitio a procesar
const DIRS = [
  '',                    // raíz: index, nosotros, servicios, portafolio, contacto, blog.html, aliados, gracias, 404, admin.html
  'servicios',
  'portafolio',
  'blog',
  'admin',
];

function listHtml(dir) {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(full, f));
}

let modified = [];
let skipped = [];

for (const dir of DIRS) {
  for (const file of listHtml(dir)) {
    let content = fs.readFileSync(file, 'utf8');

    if (content.includes('8cqMe9uCjlMuvUzvNSzgMcjifl9tCk17YhZJ04eFjwU')) {
      skipped.push(path.relative(ROOT, file) + ' (ya tenía la etiqueta)');
      continue;
    }

    let before = content;
    let done = false;

    // 1) Reemplazar placeholder público por la etiqueta real
    for (const p of PATTERNS) {
      if (content.includes(p)) {
        content = content.split(p).join(TAG);
        done = true;
        break;
      }
    }

    // 2) Si no había placeholder, insertar después del <title>...</title>
    if (!done) {
      const titleMatch = content.match(/<title>[\s\S]*?<\/title>/);
      if (titleMatch) {
        content = content.replace(titleMatch[0], titleMatch[0] + '\n' + TAG);
        done = true;
      }
    }

    if (!done) {
      skipped.push(path.relative(ROOT, file) + ' (no se encontró punto de inserción)');
      continue;
    }

    if (content !== before) {
      fs.writeFileSync(file, content, 'utf8');
      modified.push(path.relative(ROOT, file));
    }
  }
}

console.log('MODIFICADOS (' + modified.length + '):');
modified.forEach(f => console.log('  ' + f));
console.log('\nOMITIDOS (' + skipped.length + '):');
skipped.forEach(f => console.log('  ' + f));
