/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · pruebas/auditar-cotizaciones.cjs
   Auditoría de SOLO LECTURA de la colección `cotizaciones` de producción,
   para saber si el parche KZ-FORENSIC-001 (reglas nuevas) bloquearía alguna
   cotización existente antes de desplegarlo.

   Responde a la pregunta exacta: ¿algún documento incumpliría de ahora en
   adelante `subtotal == sumaItems()` (CR-03) o el resto de `importesCoherentes()`?

   Uso (firebase-admin YA está en el repo, en functions/node_modules):
     $env:NODE_PATH = "<repo>\functions\node_modules"
     $env:KZ_SA_KEY = "<ruta>\serviceAccount.json"
     node pruebas/auditar-cotizaciones.cjs

   La clave NO se copia al repositorio NI se escribe aquí su ruta: se pasa por
   `KZ_SA_KEY` (o como argumento) y se lee de una carpeta excluida de Git, por
   ejemplo 14-HERRAMIENTAS-DESARROLLO\.secrets\. El script no escribe nada. */

const fs = require('node:fs');
const path = require('node:path');

const RUTA_CLAVE = process.argv[2] || process.env.KZ_SA_KEY || '';

const PROYECTO_ESPERADO = 'konfio-zinc';

function abortar(msg) { console.error('✘ ' + msg); process.exit(2); }

if (!RUTA_CLAVE) {
  abortar('falta la ruta de la clave de servicio.\n  Indícala con $env:KZ_SA_KEY = "<ruta>\\serviceAccount.json" o como argumento.\n  Vive fuera del repositorio (por ejemplo 14-HERRAMIENTAS-DESARROLLO\\.secrets\\).');
}
if (!fs.existsSync(RUTA_CLAVE)) {
  abortar('no existe la clave de servicio en ' + RUTA_CLAVE + '\n  Descárgala de Firebase Console → Configuración → Cuentas de servicio.');
}

let sa;
try { sa = JSON.parse(fs.readFileSync(RUTA_CLAVE, 'utf8')); }
catch (e) { abortar('la clave no es un JSON válido (' + e.message + ')'); }

if (sa.project_id !== PROYECTO_ESPERADO) {
  abortar(`la clave es del proyecto "${sa.project_id}", no de "${PROYECTO_ESPERADO}". No se lee nada.`);
}
if (!sa.private_key || !sa.client_email) abortar('la clave no tiene private_key/client_email: no es una cuenta de servicio.');

let initializeApp, cert, getFirestore;
try {
  ({ initializeApp, cert } = require('firebase-admin/app'));
  ({ getFirestore } = require('firebase-admin/firestore'));
} catch (e) {
  abortar('no se pudo cargar firebase-admin (' + e.message + ').\n  Ejecuta con: $env:NODE_PATH = "<repo>\\functions\\node_modules"');
}

initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

/* Réplica EXACTA de las reglas nuevas. */
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function revisar(datos) {
  const r = { cr03: null, previo: null, itemsMalos: null };
  const items = datos.items;

  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    r.itemsMalos = !Array.isArray(items) ? 'items no es lista'
      : items.length === 0 ? 'items vacío' : 'items > 30 (' + items.length + ')';
    return r;
  }

  // sumaItems(): se suma `subtotal` de cada ítem, y un ítem sin número cuenta 0.
  let suma = 0;
  let sinSubtotal = 0;
  for (const it of items) {
    if (it && num(it.subtotal)) suma += it.subtotal;
    else sinSubtotal++;
  }

  const { subtotal, descuento, total } = datos;
  if (sinSubtotal > 0) {
    r.cr03 = `${sinSubtotal} ítem(s) sin 'subtotal' numérico`;
  } else if (!num(subtotal) || subtotal !== suma) {
    r.cr03 = `subtotal=${subtotal} ≠ suma de ítems=${suma}`;
  }

  // Lo que YA denegaba la regla anterior (no es regresión del parche).
  if (!num(subtotal) || !num(descuento) || !num(total)) r.previo = 'importes no numéricos';
  else if (descuento < 0 || descuento > subtotal) r.previo = `descuento ${descuento} fuera de rango`;
  else if (total !== subtotal - descuento) r.previo = `total=${total} ≠ subtotal−descuento=${subtotal - descuento}`;

  return r;
}

(async () => {
  console.log('Auditoría de solo lectura · proyecto "' + sa.project_id + '"');
  console.log('Clave: ' + RUTA_CLAVE + ' (no se imprime su contenido)\n');

  const cot = await db.collection('cotizaciones').get();
  const total = cot.size;
  const porEstado = {};
  const rompeAhora = [];    // incumplen la regla NUEVA (CR-03 / items mal formados) → el parche los bloquea
  const yaRotos = [];       // incumplían también antes → bloqueados desde siempre, no es regresión
  let limpios = 0;

  cot.forEach((doc) => {
    const d = doc.data();
    porEstado[d.estado || '(sin estado)'] = (porEstado[d.estado || '(sin estado)'] || 0) + 1;
    const r = revisar(d);
    if (r.cr03 || r.itemsMalos) {
      rompeAhora.push({ id: doc.id, estado: d.estado || null, motivo: r.cr03 || r.itemsMalos, previo: r.previo || null });
      return;
    }
    if (r.previo) { yaRotos.push({ id: doc.id, estado: d.estado || null, motivo: r.previo }); return; }
    limpios++;
  });

  console.log('Cotizaciones leídas: ' + total);
  console.log('Por estado: ' + Object.entries(porEstado).map(([k, v]) => k + '=' + v).join(' · '));

  // Proyecciones públicas: solo importan si algún día se reenvía la cotización,
  // porque la regla nueva exige que la proyección sea copia fiel del registro.
  const pub = await db.collection('cotizaciones_publicas').get();
  const internas = new Map();
  cot.forEach((doc) => internas.set(doc.id, doc.data()));
  let proyDescuadradas = 0;
  const detalleProy = [];
  pub.forEach((p) => {
    const d = p.data();
    const q = internas.get(d.cotizacionId);
    if (!q) { proyDescuadradas++; detalleProy.push({ token: p.id.slice(0, 8) + '…', motivo: 'apunta a cotización inexistente' }); return; }
    if (d.total !== q.total || d.subtotal !== q.subtotal || d.descuento !== q.descuento || d.numero !== q.numero) {
      proyDescuadradas++;
      detalleProy.push({ token: p.id.slice(0, 8) + '…', motivo: 'importes o número distintos al registro interno' });
    }
  });
  console.log('Proyecciones públicas: ' + pub.size + ' · con descuadre frente al registro: ' + proyDescuadradas);

  /* Invariante que exige `proyeccionFiel()`: la proyección vive bajo el `token`
     del registro interno. Si no coincide, un REENVÍO de esa cotización quedaría
     denegado tras el despliegue (aunque hoy no se note). */
  const tokensProy = new Set();
  pub.forEach((p) => tokensProy.add(p.id));
  let tokenDescuadrado = 0;
  const detalleToken = [];
  cot.forEach((doc) => {
    const d = doc.data();
    if (!d.token && !tokensProy.has(doc.id)) return;            // nunca enviada: sin proyección, correcto
    if (!d.token) { tokenDescuadrado++; detalleToken.push({ id: doc.id, motivo: 'tiene proyección pero no guarda token' }); return; }
    if (!tokensProy.has(d.token)) { tokenDescuadrado++; detalleToken.push({ id: doc.id, motivo: 'su token no tiene proyección' }); return; }
    const proy = pub.docs.find((p) => p.id === d.token);
    if (proy && proy.data().cotizacionId !== doc.id) {
      tokenDescuadrado++;
      detalleToken.push({ id: doc.id, motivo: 'la proyección de su token apunta a otra cotización' });
    }
  });
  console.log('Tokens descuadrados con su proyección: ' + tokenDescuadrado);
  if (tokenDescuadrado) console.table(detalleToken);

  console.log('\n──────────────────────────────────────────────');
  console.log('Bloquearían con las reglas NUEVAS (CR-03): ' + rompeAhora.length);
  if (rompeAhora.length) console.table(rompeAhora);
  console.log('Ya bloqueadas por la regla ANTERIOR: ' + yaRotos.length);
  if (yaRotos.length) console.table(yaRotos);
  console.log('Cotizaciones sanas: ' + limpios + ' / ' + total);

  if (rompeAhora.length === 0) {
    console.log('\n✅ LUZ VERDE: ninguna cotización existente incumple las reglas nuevas.');
    console.log('   (Las ' + yaRotos.length + ' ya bloqueadas lo estaban antes del parche.)');
    process.exit(0);
  }
  console.log('\n⛔ NO DESPLEGAR TODAVÍA: ' + rompeAhora.length + ' cotización(es) quedarían bloqueadas.');
  console.log('   Hay que corregir esos importes (o ajustar la regla) antes del despliegue.');
  process.exit(1);
})().catch((e) => {
  console.error('✘ ERROR durante la auditoría: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
