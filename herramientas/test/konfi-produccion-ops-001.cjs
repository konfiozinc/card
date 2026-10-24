/* Asesor Konfi en producción · comprobaciones no destructivas.
   Envía dos mensajes marcados como QA y verifica la política comercial viva.
   No modifica nada: el Worker solo responde (y registra en KZ_LOGS, que es su
   comportamiento normal y con caducidad). */
'use strict';
const URL_W = 'https://calm-heart-6828.konfiozinc.workers.dev';
const salida = [];
function chequear(nombre, ok, detalle) {
  salida.push({ nombre, ok: !!ok, detalle });
  console.log(`  [${ok ? 'PASA' : '**FALLA**'}] ${nombre.padEnd(56)} ${detalle || ''}`);
}
async function preguntar(message) {
  const r = await fetch(URL_W, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, reply: String(j.reply || '') };
}
(async () => {
  console.log('═══ ASESOR KONFI EN PRODUCCIÓN ═══');

  const r0 = await fetch(URL_W, { method: 'GET' });
  chequear('El Worker responde (sin error 5xx)', r0.status < 500, 'HTTP ' + r0.status);

  const a = await preguntar('Hola, ¿cuánto cuesta una Mini Web? (consulta de QA KZ-OPS-001)');
  chequear('Responde a una consulta de precios', a.st === 200 && a.reply.length > 20, 'HTTP ' + a.st);
  chequear('Ofrece Mini Web Básica por $49.900', /49[.,]900/.test(a.reply), 'precio presente en la respuesta');
  chequear('Ofrece Mini Web Pro por $99.900', /99[.,]900/.test(a.reply), 'precio presente en la respuesta');
  chequear('No anuncia el precio retirado $149.900', !/149[.,]900/.test(a.reply), 'sin precio retirado');

  const e = await preguntar('¿Todavía tienen el plan Elite? (consulta de QA KZ-OPS-001)');
  chequear('El plan retirado Elite no se comercializa',
    e.st === 200 && !/149[.,]900/.test(e.reply) && /(no est[áa] disponible|ya no|no manejamos|B[áa]sica)/i.test(e.reply),
    '«' + e.reply.slice(0, 90).replace(/\n/g, ' ') + '»');

  console.log('\n  respuesta de precios (extracto): «' + a.reply.slice(0, 150).replace(/\n/g, ' ') + '…»');

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`ASESOR KONFI: ${salida.length} comprobaciones · PASAN ${salida.length - fallos.length} · FALLAN ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log(''); fallos.forEach((f) => console.log(`  · ${f.nombre} — ${f.detalle}`)); }
  process.exit(fallos.length ? 1 : 0);
})();
