/* KZ-DESIGN-001 · Diagnostico de paleta e identidad visual.
   Inventaria TODAS las variables de color y todos los colores duros de las hojas
   del sitio y del panel, y los clasifica:
     · identidad  -> tokens oficiales Neon (cian, violeta, navy)
     · heredado   -> restos del sistema anterior (oro, naranjas, grises viejos)
     · neutral    -> blanco, negro, transparentes (no definen identidad)
     · externo    -> colores de marca de terceros (WhatsApp, Facebook)
   Tambien detecta variables declaradas DOS veces con valores distintos, que es la
   causa de que unas paginas se vean diferentes de otras.

   Uso: node auditar-paleta.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');

const HOJAS = [
  'assets/css/kz-neon.css',
  'assets/css/styles.css',
  'assets/css/admin.css',
  'premium-assets/styles.css',
  'premium-assets/chat.css'
];

/* ── Clasificacion de colores ─────────────────────────────────────── */
const IDENTIDAD = {
  '#00E5FF': 'acento cian (oficial)',
  '#39DFF5': 'cian claro (oficial)',
  '#8B5CF6': 'violeta (oficial, decorativo)',
  '#A78BFA': 'violeta claro (texto)',
  '#050B14': 'fondo base (oficial)',
  '#0A1424': 'fondo de seccion (oficial)',
  '#101C35': 'superficie (oficial)',
  '#152746': 'superficie elevada (oficial)',
  '#D4DEED': 'texto secundario (oficial)',
  '#A7B8D1': 'texto apagado (oficial)',
  '#52678F': 'borde (oficial)'
};

const HEREDADO = {
  '#F0B429': 'ORO viejo (retirado)',
  '#FFD978': 'ORO claro viejo (retirado)',
  '#f0b429': 'ORO viejo (retirado)',
  '#F97316': 'naranja viejo',
  '#ff7b7b': 'rojo viejo',
  '#55d98b': 'verde viejo',
  '#55D674': 'verde viejo',
  '#83EFB3': 'verde claro viejo',
  '#00D4FF': 'cian duplicado (no es el token)',
  '#000000': 'negro puro viejo',
  '#07070A': 'gris viejo',
  '#0A0A0A': 'gris viejo',
  '#0A0A0C': 'gris viejo',
  '#111114': 'gris viejo',
  '#17171B': 'gris viejo',
  '#2A2A2A': 'gris viejo',
  '#4A4A4A': 'gris viejo',
  '#6B6B6B': 'gris viejo',
  '#052E16': 'verde oscuro viejo',
  '#2A1A06': 'marron viejo',
  '#071D32': 'azul viejo',
  '#082218': 'verde oscuro viejo',
  '#341119': 'granate viejo',
  '#E93D68': 'rosa viejo',
  '#FF6F7F': 'rosa viejo'
};

const EXTERNO = {
  '#25D366': 'WhatsApp',
  '#1877F2': 'Facebook',
  '#E4405F': 'Instagram',
  '#000000': 'negro'
};

const NEUTRAL = new Set(['#FFFFFF', '#FFF', '#000', 'TRANSPARENT', 'INHERIT', 'CURRENTCOLOR', 'NONE']);

/* ── Extraccion ───────────────────────────────────────────────────── */
const hexs = (t) => (t.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((h) => h.toUpperCase());
const vars = (t) => {
  const out = [];
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(t)) !== null) out.push({ nombre: m[1], valor: m[2].trim() });
  return out;
};

console.log('\n=== KZ-DESIGN-001 · DIAGNOSTICO DE PALETA ===\n');

const declaraciones = new Map();   // nombre -> [{archivo, valor}]
const porArchivo = [];

for (const rel of HOJAS) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) { console.log('  (no existe) ' + rel); continue; }
  const bruto = fs.readFileSync(p, 'utf8');
  /* Se separa el codigo de los comentarios: un comentario que menciona el oro
     viejo para explicar por que se elimino NO es un uso activo. */
  const t = bruto.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const v of vars(t)) {
    if (!declaraciones.has(v.nombre)) declaraciones.set(v.nombre, []);
    declaraciones.get(v.nombre).push({ archivo: rel, valor: v.valor });
  }

  const todos = hexs(t);
  const conteo = { identidad: 0, heredado: 0, neutral: 0, externo: 0, desconocido: 0 };
  const heredados = new Set();
  const desconocidos = new Set();
  for (const h of todos) {
    if (IDENTIDAD[h]) conteo.identidad++;
    else if (HEREDADO[h]) { conteo.heredado++; heredados.add(h); }
    else if (EXTERNO[h]) conteo.externo++;
    else if (NEUTRAL.has(h)) conteo.neutral++;
    else { conteo.desconocido++; desconocidos.add(h); }
  }
  porArchivo.push({ archivo: rel, total: todos.length, ...conteo, heredados: [...heredados], desconocidos: [...desconocidos], vars: vars(t).length });
}

console.log('1 · COLORES DUROS POR HOJA (fuera de comentarios)\n');
console.log('   archivo                          total  ident  hered  neutr  exter  desc');
for (const a of porArchivo) {
  console.log('   ' + a.archivo.padEnd(32) + String(a.total).padStart(5) + String(a.identidad).padStart(7) +
    String(a.heredado).padStart(7) + String(a.neutral).padStart(7) + String(a.externo).padStart(7) + String(a.desconocido).padStart(6));
}
const totalHered = porArchivo.reduce((s, a) => s + a.heredado, 0);
const totalDesc = porArchivo.reduce((s, a) => s + a.desconocido, 0);
console.log('\n   TOTAL heredado activo: ' + totalHered + ' · colores sin clasificar: ' + totalDesc);

if (totalHered) {
  console.log('\n   restos heredados por archivo:');
  for (const a of porArchivo) if (a.heredados.length) console.log('     ' + a.archivo.padEnd(32) + a.heredados.join(' '));
}
if (totalDesc) {
  console.log('\n   colores sin clasificar (hay que decidir si son identidad o restos):');
  for (const a of porArchivo) if (a.desconocidos.length) console.log('     ' + a.archivo.padEnd(32) + a.desconocidos.slice(0, 18).join(' '));
}

console.log('\n2 · VARIABLES DECLARADAS DOS O MAS VECES\n');
let duplicadas = 0;
const nombresOrden = [...declaraciones.keys()].sort();
for (const n of nombresOrden) {
  const d = declaraciones.get(n);
  const valores = [...new Set(d.map((x) => x.valor.toUpperCase()))];
  if (valuesDistintos(d)) {
    duplicadas++;
    console.log('   ' + n + '  (' + d.length + ' declaraciones, ' + valores.length + ' valores distintos)');
    for (const x of d) console.log('      ' + x.archivo.padEnd(30) + x.valor);
  }
}
function valuesDistintos(d) {
  return new Set(d.map((x) => x.valor.toUpperCase())).size > 1;
}
console.log('\n   variables con conflicto: ' + duplicadas);

console.log('\n3 · VARIABLES DE IDENTIDAD VIEJA QUE SIGUEN VIVAS\n');
const VIEJAS = ['--gold', '--gold-rgb', '--gold2', '--cyan', '--violet'];
for (const v of VIEJAS) {
  const d = declaraciones.get(v);
  if (!d) { console.log('   ' + v.padEnd(14) + ' no declarada'); continue; }
  console.log('   ' + v.padEnd(14) + d.map((x) => x.archivo + ' = ' + x.valor).join('   |   '));
}

console.log('\n4 · CSS EMBEBIDO EN HTML\n');
const paginas = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs', 'herramientas', 'functions'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (e.name.endsWith('.html')) paginas.push(p);
  }
})(RAIZ);
let conInline = 0, heredInline = 0;
const detalle = [];
for (const p of paginas) {
  const t = fs.readFileSync(p, 'utf8');
  const bloques = [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const estilosInline = [...t.matchAll(/style="([^"]*)"/gi)].map((m) => m[1]);
  const todo = bloques.join('\n') + '\n' + estilosInline.join('\n');
  if (!todo.trim()) continue;
  conInline++;
  const hs = hexs(todo);
  const malos = hs.filter((h) => HEREDADO[h]);
  if (malos.length) { heredInline++; detalle.push(path.relative(RAIZ, p).replace(/\\/g, '/') + ' → ' + [...new Set(malos)].join(' ')); }
}
console.log('   paginas con CSS embebido o inline: ' + conInline + '/' + paginas.length);
console.log('   con colores heredados: ' + heredInline);
detalle.slice(0, 15).forEach((d) => console.log('     ' + d));

console.log('\n=== FIN DEL DIAGNOSTICO ===');
console.log('Bloqueantes de identidad: ' + (totalHered + duplicadas + heredInline));
process.exit(totalHered + duplicadas + heredInline > 0 ? 1 : 0);
