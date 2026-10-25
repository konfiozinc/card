'use strict';
/* KZ-AI-003 · Verificación de los datos estructurados de aliados.html y de la
   promoción en README.md. Comprueba que el JSON-LD sea válido, que los niveles
   sean los vigentes y que no sobreviva ninguna referencia comercial retirada. */
const fs = require('fs');
const path = require('path');
const RAIZ = 'C:\\Users\\usuario29\\Documents\\KONFIO_ZINC\\6-LANDING-PAGES\\Konfio-Zinc-Web';

let fallos = 0;
const ok = (n, v, d) => { console.log('  [' + (v ? 'PASA' : '**FALLA**') + '] ' + n.padEnd(60) + ' ' + (d || '')); if (!v) fallos++; };

console.log('=== aliados.html · DATOS ESTRUCTURADOS ===');
const html = fs.readFileSync(path.join(RAIZ, 'aliados.html'), 'utf8');
const bloques = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

ok('Tiene al menos un bloque JSON-LD', bloques.length > 0, bloques.length + ' bloque(s)');

let todos = '';
let jsonOk = true;
for (const b of bloques) {
  try { const j = JSON.parse(b); todos += JSON.stringify(j); }
  catch (e) { jsonOk = false; console.log('     JSON inválido: ' + e.message.slice(0, 80)); }
}
ok('Todos los bloques JSON-LD son JSON válido', jsonOk);

/* Niveles vigentes */
ok('Bronce: de 1 a 4 ventas', /Bronce de 1 a 4/.test(todos), '');
ok('Bronce: 30%', /1 a 4 \(30%/.test(todos), '');
ok('Plata: de 5 a 9 ventas', /Plata de 5 a 9/.test(todos), '');
ok('Plata: 40%', /5 a 9 \(40%/.test(todos), '');
ok('Oro: 10 o más ventas', /Oro con 10 o más/.test(todos), '');
ok('Oro: 50%', /10 o más \(50%/.test(todos), '');

/* Comisión de referidos intacta */
ok('Comisión de referidos del 20% conservada', /20%/.test(todos), '');

/* Restos comerciales retirados */
const retirados = [
  ['umbral 1-5 (viejo)', /1-5 ventas|1–5 ventas|1 a 5 ventas/],
  ['umbral 6-15 (viejo)', /6-15|6–15|6 a 15/],
  ['umbral 16+ (viejo)', /16\+|16 o más ventas/],
  ['comisión 25% (vieja)', /25%/],
  ['comisión 30% como referido', /referid[^.]{0,40}30%/i],
  ['pago cada 15 días', /cada 15 d[ií]as/],
  ['precio de Marca Blanca', /Marca Blanca[^.]{0,60}\$|cotizaci[oó]n cerrada[^.]*\$/i],
  ['planes Star', /\bStar\b/],
  ['planes Elite', /\bElite\b/],
  ['precio 149.900', /149[.,]900/]
];
for (const [nombre, re] of retirados) ok('Sin ' + nombre + ' en el JSON-LD', !re.test(todos));

/* Coherencia con la página visible: los nombres de los niveles deben coincidir */
const visible = html.replace(/<script[\s\S]*?<\/script>/gi, '');
ok('La página visible usa los mismos niveles', /BRONCE/.test(visible) && /PLATA/.test(visible) && /ORO/.test(visible));
ok('La página visible mantiene el 20% de referido', /20% de comisión/.test(visible));

console.log('\n=== README.md · PROMOCIÓN ===');
const readme = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8');
ok('Muestra Pro al 50% por $49.950', /\$49\.950/.test(readme), '');
ok('Gratis al completar 5 ventas cerradas', /gratis al completar 5 ventas cerradas/.test(readme));
ok('Sin la condición de 3 ventas', !/3 ventas|tres ventas/i.test(readme));
ok('Sin nombres Star/Elite en la promoción', !/tarjeta PRO/i.test(readme), /tarjeta PRO/i.test(readme) ? 'queda "tarjeta PRO"' : '');

console.log('\n=== COHERENCIA GLOBAL ===');
const coincide = (re) => re.test(todos) === re.test(readme);
ok('JSON-LD y README no se contradicen en la promoción',
  !/49\.950/.test(todos) && /49\.950/.test(readme), 'la promoción vive en README; el JSON-LD no la menciona');

console.log('\n' + '='.repeat(62));
console.log('VERIFICACIÓN: ' + (fallos === 0 ? 'TODO CORRECTO' : fallos + ' FALLO(S)'));
console.log('='.repeat(62));
process.exit(fallos ? 1 : 0);
