#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * aplicar-correcciones.js · KONFÍO ZINC
 *
 * Correcciones puntuales sobre el sitio ya publicado. NO reestructura nada:
 *   1. Precios de Tarjetas Digitales : Star $49.900 · Pro $99.900 · Elite $149.900
 *   2. Paquetes todo en uno          : KZ Inicio $59.900 · KZ Negocio $179.900 ·
 *                                      KZ Profesional $279.900 · KZ Premium $479.900
 *   3. Botones de redes sociales con los colores oficiales (Facebook, Instagram,
 *      TikTok) en el footer de todas las páginas.
 *
 * Los precios nuevos coinciden con los documentos internos de la agencia
 * (AGENTE_IA_WHATSAPP.md, PLAN_CRECIMIENTO_AGENCIA.md), que YA usaban
 * $49.900 / $99.900 / $149.900: la web estaba desincronizada.
 *
 * SEGURIDAD DEL REEMPLAZO
 * `$120.000` es ambiguo: además de la tarjeta Pro, es el precio del servicio de
 * Catálogos Digitales, de su plan BÁSICO y del KIT DE QR. Antes de reemplazar,
 * esas ocurrencias se sustituyen por un token y se restauran al final, así que
 * nunca se alteran. El script reporta el contexto de CADA cambio de precio y
 * advierte si un valor de tarjeta no se pudo actualizar.
 *
 * Uso:
 *   node herramientas/aplicar-correcciones.js --dry-run
 *   node herramientas/aplicar-correcciones.js
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

/* ── 1. Precios a actualizar ───────────────────────────────────────── */
const PRECIOS = [
  /* Paquetes todo en uno (se reemplazan primero para no chocar con otros) */
  ['$69.900', '$59.900', 'KZ Inicio'],
  ['$199.900', '$179.900', 'KZ Negocio'],
  ['$299.900', '$279.900', 'KZ Profesional'],
  ['$499.900', '$479.900', 'KZ Premium'],
  /* Tarjetas digitales */
  ['$70.000', '$49.900', 'Tarjeta Star'],
  ['$120.000', '$99.900', 'Tarjeta Pro'],
  ['$170.000', '$149.900', 'Tarjeta Elite']
];

/* ── 2. Protecciones: ocurrencias de $120.000 que NO son de tarjetas ── */
const T = {
  CAT_A: '\u0001CATA\u0001',
  CAT_B: '\u0001CATB\u0001',
  CAT_C: '\u0001CATC\u0001',
  CAT_D: '\u0001CATD\u0001',
  QR_A: '\u0001QRA\u0001'
};

const PROTECCIONES = [
  /* Cadenas de texto exactas (catálogo digital) */
  { desc: 'catálogo · «desde $120.000»', tipo: 'texto', buscar: 'desde $120.000', token: T.CAT_A },
  { desc: 'catálogo · «parte de $120.000»', tipo: 'texto', buscar: 'parte de <strong>$120.000</strong>', token: T.CAT_B },
  { desc: 'catálogo · «arranca desde $120.000»', tipo: 'texto', buscar: 'arranca desde $120.000', token: T.CAT_C },
  /* Precio que sigue al nombre de un plan (identifica al servicio sin ambigüedad) */
  { desc: 'catálogo · plan BÁSICO', tipo: 'regex',
    buscar: /(<h3 class="plan-name">[^<]*B[ÁA]SICO[^<]*<\/h3>\s*<div class="plan-price">)\$120\.000/gi,
    reemplazo: '$1' + T.CAT_D },
  { desc: 'QR · plan KIT DE QR', tipo: 'regex',
    buscar: /(<h3 class="plan-name">[^<]*(?:KIT DE QR|Kit de QR)[^<]*<\/h3>\s*<div class="plan-price">)\$120\.000/gi,
    reemplazo: '$1' + T.QR_A }
];

/* ── 3. Bloque HTML de redes sociales ──────────────────────────────── */
const SOCIAL_HTML = `    <!-- ══ REDES SOCIALES (colores oficiales de cada red) ══ -->
    <div class="social-links">
      <a href="https://www.facebook.com/profile.php?id=61589654555930" target="_blank" rel="noopener noreferrer" class="social-btn fb" aria-label="Facebook de KONFÍO ZINC">
        <i class="fab fa-facebook-f" aria-hidden="true"></i>
      </a>
      <a href="https://www.instagram.com/konfiozinc" target="_blank" rel="noopener noreferrer" class="social-btn ig" aria-label="Instagram de KONFÍO ZINC">
        <i class="fab fa-instagram" aria-hidden="true"></i>
      </a>
      <a href="https://www.tiktok.com/@konfiozinc" target="_blank" rel="noopener noreferrer" class="social-btn tk" aria-label="TikTok de KONFÍO ZINC">
        <i class="fab fa-tiktok" aria-hidden="true"></i>
      </a>
    </div>
`;

/* ── Utilidades ────────────────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'KIT_COMERCIAL') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');

function contexto(texto, pos, largo) {
  const ini = Math.max(0, pos - 70);
  const fin = Math.min(texto.length, pos + largo + 60);
  return texto.slice(ini, fin).replace(/\s+/g, ' ').trim();
}

/* ── Archivos del sitio (se excluyen documentos, herramientas y funciones) ── */
const archivos = walk(REPO).filter((f) => {
  const r = rel(f);
  if (!f.endsWith('.html')) return false;
  if (r === 'index-old.html') return false;
  if (r.startsWith('herramientas/') || r.startsWith('functions/')) return false;
  return true;
});

/* ── Ejecución ─────────────────────────────────────────────────────── */
const detallePrecios = [];   // { archivo, servicio, viejo, nuevo, ctx }
const protegidosOk = [];     // { archivo, desc }
const socialAgregado = [];   // archivo
const avisos = [];
const contenidoFinal = new Map();

for (const file of archivos) {
  const r = rel(file);
  let raw = fs.readFileSync(file, 'utf8');
  const original = raw;

  /* a) Proteger las ocurrencias ambiguas */
  for (const p of PROTECCIONES) {
    let tocado = false;
    if (p.tipo === 'texto') {
      if (raw.includes(p.buscar)) {
        raw = raw.split(p.buscar).join(p.token);
        tocado = true;
      }
    } else {
      if (p.buscar.test(raw)) { raw = raw.replace(p.buscar, p.reemplazo); tocado = true; }
      p.buscar.lastIndex = 0; /* la regex es global: se reinicia el índice */
    }
    if (tocado) protegidosOk.push({ archivo: r, desc: p.desc });
  }

  /* b) Reemplazar precios, registrando el contexto de cada cambio */
  for (const [viejo, nuevo, servicio] of PRECIOS) {
    let idx = raw.indexOf(viejo);
    while (idx !== -1) {
      detallePrecios.push({ archivo: r, servicio, viejo, nuevo, ctx: contexto(raw, idx, viejo.length) });
      raw = raw.slice(0, idx) + nuevo + raw.slice(idx + viejo.length);
      idx = raw.indexOf(viejo, idx + nuevo.length);
    }
  }

  /* c) Restaurar lo protegido */
  for (const token of Object.values(T)) {
    if (raw.includes(token)) raw = raw.split(token).join('$120.000');
  }

  /* d) Botones de redes sociales al final de .footer-grid */
  if (!raw.includes('class="social-btn')) {
    const cierreFooterBottom = raw.indexOf('<div class="footer-bottom">');
    if (cierreFooterBottom !== -1) {
      const cierreGrid = raw.lastIndexOf('  </div>', cierreFooterBottom);
      if (cierreGrid !== -1) {
        raw = raw.slice(0, cierreGrid) + '\n' + SOCIAL_HTML + raw.slice(cierreGrid + '  </div>'.length);
        socialAgregado.push(r);
      }
    }
  } else {
    avisos.push(`${r} ya tenía botones sociales (no se duplican)`);
  }

  contenidoFinal.set(r, raw);
  if (raw !== original && !DRY) fs.writeFileSync(file, raw, 'utf8');
}

/* ── Reporte ───────────────────────────────────────────────────────── */
console.log(DRY ? '\n=== SIMULACIÓN (--dry-run · no se escribió nada) ===\n' : '\n=== CORRECCIONES APLICADAS ===\n');

console.log(`1) BOTONES DE REDES SOCIALES → agregados en ${socialAgregado.length} páginas`);
console.log(`2) OCURRENCIAS PROTEGIDAS (no modificadas): ${protegidosOk.length}`);
for (const p of protegidosOk) console.log(`     · ${p.archivo}: ${p.desc}`);

console.log(`\n3) CAMBIOS DE PRECIO: ${detallePrecios.length}`);
const porArchivo = {};
for (const c of detallePrecios) {
  porArchivo[c.archivo] = porArchivo[c.archivo] || [];
  porArchivo[c.archivo].push(c);
}
for (const a of Object.keys(porArchivo).sort()) {
  console.log(`\n  ── ${a} (${porArchivo[a].length})`);
  for (const c of porArchivo[a]) {
    console.log(`     ${c.servicio}: ${c.viejo} → ${c.nuevo}`);
    console.log(`        contexto: …${c.ctx}…`);
  }
}

/* ── Verificación final sobre el contenido resultante ──────────────── */
console.log('\n=== VERIFICACIÓN FINAL ===');
const ANTIGUOS = [['$70.000', 'Tarjeta Star'], ['$170.000', 'Tarjeta Elite'],
                  ['$69.900', 'KZ Inicio'], ['$199.900', 'KZ Negocio'],
                  ['$299.900', 'KZ Profesional'], ['$499.900', 'KZ Premium']];
let residuos = 0;
for (const [r, txt] of contenidoFinal) {
  for (const [p, etiqueta] of ANTIGUOS) {
    const n = txt.split(p).length - 1;
    if (n > 0) { console.log(`  ⚠️  ${r}: ${n}x ${p} (${etiqueta})`); residuos += n; }
  }
}
/* $120.000 debe sobrevivir solo en las ocurrencias del catálogo y del QR */
let restantes120 = 0;
for (const [r, txt] of contenidoFinal) restantes120 += txt.split('$120.000').length - 1;
console.log(`  $120.000 conservados (catálogo y Kit de QR): ${restantes120}`);

console.log(residuos === 0
  ? '\n  ✅ Ningún precio antiguo de tarjetas o paquetes quedó en el sitio.\n'
  : `\n  ❌ Quedan ${residuos} precios antiguos por revisar.\n`);

if (avisos.length) {
  console.log('Avisos:');
  for (const a of avisos) console.log('  · ' + a);
  console.log('');
}
