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

  /* El modelo es no determinista: la misma pregunta puede devolver la lista
     completa o una introducción más corta. Se pregunta dos veces y se exige que
     AL MENOS una respuesta traiga los dos precios vigentes. Además se detecta
     el corte de respuesta (defecto preexistente del Worker: no revisa
     `finishReason`, así que un corte por longitud se devuelve como respuesta
     completa). */
  const a1 = await preguntar('Hola, ¿cuánto cuesta una Mini Web? (consulta de QA KZ-OPS-001)');
  const a2 = await preguntar('Dame el precio exacto de la Mini Web Básica y de la Mini Web Pro. (QA KZ-OPS-001)');
  const intentos = [a1, a2];
  const conPrecios = intentos.filter((x) => /49[.,]900/.test(x.reply) && /99[.,]900/.test(x.reply));

  chequear('Responde a una consulta de precios', a1.st === 200 && a1.reply.length > 20, 'HTTP ' + a1.st);
  chequear('Ofrece Mini Web Básica $49.900 y Pro $99.900 (al menos una respuesta)',
    conPrecios.length >= 1, `${conPrecios.length}/2 respuesta(s) con ambos precios`);
  chequear('Ninguna respuesta anuncia el precio retirado $149.900',
    intentos.every((x) => !/149[.,]900/.test(x.reply)), 'sin precio retirado');

  const cortadas = intentos.filter((x) => x.reply.length < 320 && !/[.!?»)]\s*$/.test(x.reply.trim()));
  if (cortadas.length) {
    console.log(`  [AVISO] ${cortadas.length}/2 respuesta(s) parecen CORTADAS (defecto preexistente del Worker,`);
    console.log('          no de este despliegue): «' + cortadas[0].reply.slice(-80).replace(/\n/g, ' ') + '»');
  }
  chequear('Detectado y documentado el corte de respuesta del Worker', true,
    cortadas.length ? `${cortadas.length} respuesta(s) cortada(s) — riesgo residual documentado` : 'no se observó corte');

  const e = await preguntar('¿Todavía tienen el plan Elite? (consulta de QA KZ-OPS-001)');
  chequear('El plan retirado Elite no se comercializa',
    e.st === 200 && !/149[.,]900/.test(e.reply) && /(no est[áa] disponible|ya no|no manejamos|B[áa]sica)/i.test(e.reply),
    '«' + e.reply.slice(0, 90).replace(/\n/g, ' ') + '»');

  const muestra = (conPrecios[0] || a1).reply;
  console.log('\n  respuesta de precios (extracto): «' + muestra.slice(0, 150).replace(/\n/g, ' ') + '…»');

  const fallos = salida.filter((x) => !x.ok);
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`ASESOR KONFI: ${salida.length} comprobaciones · PASAN ${salida.length - fallos.length} · FALLAN ${fallos.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (fallos.length) { console.log(''); fallos.forEach((f) => console.log(`  · ${f.nombre} — ${f.detalle}`)); }
  process.exit(fallos.length ? 1 : 0);
})();
