/**
 * Prueba de enrutamiento del respaldo local del Asesor IA (getLocalResponse).
 * Extrae la función real de assets/js/main.js y ejecuta una batería de
 * consultas típicas de clientes para verificar que cada una caiga en la
 * respuesta correcta.
 *
 * Uso:  node herramientas/probar-agente.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(REPO, 'assets/js/main.js'), 'utf8');

const ini = main.indexOf('function getLocalResponse(userMsg)');
const fin = main.indexOf('function callBackend(message)');
if (ini === -1 || fin === -1) {
  console.error('No se pudo extraer getLocalResponse de main.js');
  process.exit(1);
}
const cuerpo = main.slice(ini, fin);

/* El normalize del archivo real, replicado para la prueba */
const normalize = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* Se construye la función en un contexto aislado */
const getLocalResponse = new Function('normalize', `${cuerpo}; return getLocalResponse;`)(normalize);

/* ── Batería de pruebas: [consulta, patrón esperado, descripción] ───── */
const PRUEBAS = [
  // Productos
  ['cuanto cuesta una tarjeta', /STAR/, 'precio de tarjeta → planes Star/Pro/Elite'],
  ['que incluye la tarjeta pro', /tres planes/, 'detalle de tarjeta'],
  ['quiero una tarjeta digital', /tres planes/, 'intención de compra de tarjeta'],
  ['cuanto vale el menu digital', /150\.000/, 'menú digital con precio'],
  ['cuanto cuesta el catalogo', /120\.000/, 'catálogo digital con precio'],
  ['necesito un agente ia', /250\.000/, 'agente IA con precio'],
  ['hacen landing pages?', /350\.000/, 'landing page con precio'],
  ['quiero codigos qr', /50\.000/, 'códigos QR con precio'],
  ['tienen paquetes?', /KZ Inicio/, 'paquetes todo en uno'],

  // Programa de aliados (lo nuevo)
  ['quiero ser aliado', /Bronce/, 'ser aliado'],
  ['me interesa el programa de aliados', /Oro/, 'programa de aliados'],
  ['cuanto gano si vendo una tarjeta', /Bronce/, 'ganancia por vender tarjetas'],
  ['quiero revender sus tarjetas', /Bronce/, 'revender tarjetas'],
  ['que es un distribuidor', /Bronce/, 'qué es un distribuidor'],
  ['cual es la comision por referido', /20%/, 'comisión por referido'],
  ['quiero ser afiliado', /aliados\.html/, 'afiliado → enlace a aliados.html'],
  ['quiero comprar al por mayor', /Bronce/, 'compra al por mayor'],
  ['como gano dinero con ustedes', /Bronce/, 'ganar dinero'],

  // Servicios que NO se ofrecen (deben redirigir a los reales)
  ['hacen SEO?', /no los ofrecemos/, 'rechazo de SEO'],
  ['manejan redes sociales', /no los ofrecemos/, 'rechazo de redes sociales'],
  ['hacen branding?', /no los ofrecemos/, 'rechazo de branding'],
  ['tienen email marketing?', /no los ofrecemos/, 'rechazo de email marketing'],

  // Información general
  ['que servicios ofrecen', /seis soluciones/, 'listado de servicios'],
  ['precios', /50\.000/, 'lista de precios'],
  ['hola', /seis soluciones/, 'saludo inicial'],
  ['cuanto tardan en entregar', /24 a 48 horas/, 'tiempos de entrega']
];

let ok = 0;
const fallos = [];

console.log('\n=== PRUEBA DEL ASESOR IA (respaldo local) ===\n');

for (const [consulta, patron, descripcion] of PRUEBAS) {
  const respuesta = getLocalResponse(consulta).text;
  if (patron.test(respuesta)) {
    ok++;
    console.log(`  OK    ${descripcion}`);
  } else {
    fallos.push({ consulta, descripcion, inicio: respuesta.slice(0, 70).replace(/\n/g, ' ') });
    console.log(`  FALLA ${descripcion}`);
  }
}

console.log(`\n  Resultado: ${ok}/${PRUEBAS.length} correctas`);

if (fallos.length) {
  console.log('\n  Detalle de las fallidas:');
  for (const f of fallos) {
    console.log(`   · "${f.consulta}"`);
    console.log(`     respuesta: ${f.inicio}…`);
  }
  console.log('');
  process.exit(1);
}

/* Comprobación extra: que ya no se ofrezcan servicios retirados */
const SERVICE_RETIRADO = /Gestionamos (tus redes|publicidad)|Impulsamos marcas con estrategia digital/;
const SOSPECHOSAS = ['redes', 'publicidad', 'seo', 'branding', 'marketing', 'asesoría'];
const fuga = SOSPECHOSAS.some((w) => SERVICE_RETIRADO.test(getLocalResponse(w).text));
if (fuga) {
  console.log('  ❌ Alguna respuesta sigue ofreciendo servicios retirados.\n');
  process.exit(1);
}

console.log('  ✅ Ninguna respuesta ofrece servicios retirados.\n');
