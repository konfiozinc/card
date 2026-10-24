/* CARD-SPARK-002 · Migración segura de pagos históricos a CONCEPTO.
   NO adivina: solo reporta los pagos sin `concepto` (ambiguos) y aplica un
   mapa explícito que decide un humano. Nunca modifica el archivo de entrada.

   Uso:
     node herramientas/migrar-pagos-concepto.js <pagos.json> [--salida out.json]
        → simulación: reporta ambiguos y ya clasificados
     node herramientas/migrar-pagos-concepto.js <pagos.json> --aplicar \
          --map "id1:RENOVACION_DOMINIO,id2:DESARROLLO" --autorizado-por "Nombre"
        → escribe out.json con el concepto asignado (idempotente)

   El archivo de entrada queda intacto = respaldo/reversión trivial. */
import fs from 'node:fs';
import path from 'node:path';

const VALIDOS = ['DESARROLLO', 'RENOVACION_DOMINIO', 'HOSTING', 'MANTENIMIENTO', 'SERVICIO_PERIODICO', 'AMPLIACION', 'OTRO'];
const args = process.argv.slice(2);
const entrada = args[0];
if (!entrada) { console.error('Falta el archivo de pagos JSON.'); process.exit(2); }

const aplicar = args.includes('--aplicar');
const iMap = args.indexOf('--map');
const mapa = new Map();
if (iMap !== -1 && args[iMap + 1]) {
  for (const par of String(args[iMap + 1]).split(',')) {
    const [id, concepto] = par.split(':');
    if (id && concepto) mapa.set(id.trim(), concepto.trim());
  }
}
const iSal = args.indexOf('--salida');
const salida = iSal !== -1 && args[iSal + 1] ? args[iSal + 1] : path.join(path.dirname(entrada), 'pagos-migrados.json');
const iAut = args.indexOf('--autorizado-por');
const autorizado = iAut !== -1 && args[iAut + 1] ? args[iAut + 1] : '';

const bruto = JSON.parse(fs.readFileSync(entrada, 'utf8').replace(/^\uFEFF/, ''));
const pagos = Array.isArray(bruto) ? bruto : (bruto.pagos || bruto.items || []);

const sinConcepto = pagos.filter((p) => !p.concepto);
const yaClasificados = pagos.length - sinConcepto.length;

console.log(`\n═══ SIMULACIÓN CARD-SPARK-002 (pagos) ═══`);
console.log(`  total: ${pagos.length} · ya clasificados: ${yaClasificados} · sin concepto (ambiguos): ${sinConcepto.length}`);
for (const p of sinConcepto.slice(0, 50)) {
  const id = p.id || p._id || '(sin id)';
  const cli = p.clienteNombre || p.clienteId || '—';
  console.log(`    ? ${id} · ${cli} · ${p.monto || '—'} COP ${p.fechaPago || ''}`);
}
if (sinConcepto.length > 50) console.log(`    … y ${sinConcepto.length - 50} más`);

for (const [id, concepto] of mapa) {
  if (!VALIDOS.includes(concepto)) { console.error(`Concepto inválido para ${id}: ${concepto}`); process.exit(1); }
}

if (!aplicar) {
  console.log('\nSimulación. No se escribió nada. Para aplicar: --aplicar --map "id:CONCEPTO" --autorizado-por "…"');
  process.exit(0);
}

if (!autorizado) { console.error('--aplicar exige --autorizado-por "Nombre".'); process.exit(1); }

const nuevo = pagos.map((p) => {
  const id = p.id || p._id;
  if (!p.concepto && mapa.has(id)) return { ...p, concepto: mapa.get(id), clasificadoPor: autorizado, clasificadoEn: new Date().toISOString() };
  return p;
});
const aplicados = nuevo.filter((p) => p.concepto && !pagos.find((q) => (q.id || q._id) === (p.id || p._id))?.concepto).length;
fs.writeFileSync(salida, JSON.stringify(Array.isArray(bruto) ? nuevo : { ...bruto, pagos: nuevo }, null, 2), 'utf8');
console.log(`\nAplicado: ${aplicados} pagos clasificados. Salida: ${salida} (entrada intacta).`);
