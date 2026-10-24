'use strict';
/* Mueve los archivos fuente del propietario a una carpeta versionada que NO se
   publica (la raíz del repo sí se sirve en GitHub Pages). */
const fs = require('fs');
const path = require('path');
const R = process.cwd();
const destino = path.join(R, 'assets/img/marca/fuente');
fs.mkdirSync(destino, { recursive: true });

const movidos = [];
for (const nombre of fs.readdirSync(R, { withFileTypes: true })) {
  if (!e_esImagenLogotipo(nombre)) continue;
  const origen = path.join(R, nombre.name);
  const nuevo = path.join(destino, nombre.name.replace(/\s+/g, '-'));
  fs.renameSync(origen, nuevo);
  movidos.push(nombre.name + '  ->  assets/img/marca/fuente/' + path.basename(nuevo));
}
function e_esImagenLogotipo(e) {
  if (!e.isFile()) return false;
  return /^logo\.jpe?g$/i.test(e.name) || /^Logotipo .*\.png$/i.test(e.name);
}
console.log('=== ARCHIVOS FUENTE MOVIDOS ===');
if (!movidos.length) console.log('  (ninguno: ya estaban movidos)');
movidos.forEach((m) => console.log('  ' + m));

console.log('\n=== CONTENIDO DE LA CARPETA FUENTE ===');
fs.readdirSync(destino).forEach((f) => {
  const s = fs.statSync(path.join(destino, f));
  console.log('  ' + f.padEnd(40) + Math.round(s.size / 1024) + ' KB');
});
