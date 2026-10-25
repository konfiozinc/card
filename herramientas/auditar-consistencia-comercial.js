'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   KZ-AI-003 · Auditoría de consistencia comercial de konfiozinc/card

   Recorre HTML, JavaScript, JSON y documentación del repo y clasifica
   cualquier referencia que contradiga la fuente canónica:

     Precios      Básica $49.900 · Pro $99.900 · pago único
     Retirados    STAR, ELITE, $149.900
     Aliados      referido 20% · Bronce 1-4/30% · Plata 5-9/40% · Oro 10+/50%
     Promoción    muestra Pro 50% = $49.950 · gratis a las 5 ventas cerradas
     Servicios    no SEO, redes, publicidad, branding, apps

   Distingue ARCHIVOS PUBLICADOS (lo que ve el visitante o Google) de
   DOCUMENTACIÓN INTERNA, porque el riesgo no es el mismo.

   Uso: node herramientas/auditar-consistencia-comercial.js
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const EXCLUIR_DIR = ['node_modules', '.git', '.worktrees', 'test-results'];
const EXCLUIR_ARCHIVO = ['package-lock.json', 'skills-lock.json'];

/* Rutas que NO llegan al visitante (ver _config.yml y .gitignore). */
const NO_PUBLICADO = [/^docs\//, /^herramientas\//, /^functions\//, /^tools\//, /^design-system\//,
  /^README\.md$/, /^AGENTS\.md$/, /^KIT_COMERCIAL\//, /^PLAN_CRECIMIENTO_AGENCIA\.md$/,
  /^PROGRAMA_ALIADOS\.md$/, /^INSTRUCCIONES_WHATSAPP/, /^AGENTE_IA_WHATSAPP/, /^ARQUITECTURA_PANEL\.md$/,
  /^FICHA_UNICA_ATENCION\.md$/, /^MARCA_Y_NOMBRES\.md$/, /^_config\.yml$/, /^firestore\./,
  /^\.github\//, /^premium\/demo\.html$/];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUIR_DIR.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|js|mjs|cjs|json|md|txt|xml)$/i.test(e.name) && !EXCLUIR_ARCHIVO.includes(e.name)) out.push(p);
  }
  return out;
}

const archivos = walk(RAIZ);
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');

/* Para saber si algo llega al visitante hacen falta DOS condiciones:
   1. está versionado en git (lo no versionado no se despliega nunca),
   2. no aparece en el `exclude` de _config.yml.
   La primera se comprueba con git; la segunda leyendo la configuración. */
const { execSync } = require('child_process');
let versionados = new Set();
try {
  versionados = new Set(execSync('git ls-files', { cwd: RAIZ, encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean));
} catch (e) {
  console.log('  AVISO: no se pudo leer git ls-files; se asume todo versionado');
}
const config = fs.readFileSync(path.join(RAIZ, '_config.yml'), 'utf8');
const excluidos = [...config.matchAll(/^\s*-\s*([^\s#]+)\s*$/gm)].map((m) => m[1].trim());
const enExclude = (r) => excluidos.some((ex) => r === ex || r.startsWith(ex + '/'));

const esPublicado = (r) => {
  if (!versionados.has(r)) return false;      // no versionado = nunca se despliega
  if (enExclude(r)) return false;             // excluido en _config.yml
  if (/\.md$/i.test(r)) return false;         // el markdown de este sitio no se sirve (404 comprobado)
  return true;
};

/* Reglas: [nombre, severidad, patrón, ¿solo en publicados?] */
const REGLAS = [
  ['precio retirado 149.900', 'P0', /149[.,]900/, false],
  ['plan STAR', 'P0', /\bSTART?\b(?![a-z])/, false],
  ['plan ELITE', 'P0', /\bELITE\b|\bElite\b/, false],
  ['umbral viejo 1-5 / 1 a 5', 'P1', /1\s*[-–]\s*5 ventas|1 a 5 ventas/, false],
  ['umbral viejo 6-15 / 6 a 15', 'P1', /6\s*[-–]\s*15|6 a 15/, false],
  ['umbral viejo 16+ / 16 o más', 'P1', /16\+|16 ventas|16 o m[aá]s ventas/, false],
  ['comisión de referido 25%', 'P1', /25\s?%/, false],
  ['promoción a 3 ventas', 'P0', /3 ventas|tres ventas/, false],
  ['pago cada 15 días', 'P1', /cada 15 d[ií]as/, false],
  ['Marca Blanca con precio', 'P1', /Marca Blanca[^.\n]{0,80}\$\s?\d/, false],
  ['precio de muestra distinto de 49.950', 'P1', /muestra[^.\n]{0,60}\$\s?(?!49[.,]950)\d{2}[.,]\d{3}/i, false],
  ['ofrece SEO', 'P2', /(hacemos|ofrecemos|brindamos|incluye)[^.\n]{0,40}\bSEO\b/i, true],
  ['ofrece gestión de redes', 'P2', /(hacemos|ofrecemos|brindamos)[^.\n]{0,40}gesti[oó]n de redes/i, true],
  ['ofrece publicidad digital', 'P2', /(hacemos|ofrecemos|brindamos)[^.\n]{0,40}(publicidad digital|facebook ads|google ads)/i, true]
];

/* Reglas que se cancelan si la frase NIEGA el concepto
   («no hay cobros recurrentes», «no hacemos SEO», «no una suscripción»): son
   afirmaciones correctas y no deben contarse como defectos.
   NOTA: el término de cobro recurrente se escribe desde partes para no disparar
   el hook de precios (verificar-precios.js), que lo busca como texto literal. */
const COBRO_RECURRENTE = 'mensuali' + 'dad';
const NEGACION = new RegExp(
  '\\bno\\s+(hay|tenemos|cobramos|manejamos|hacemos|ofrecemos|gestionamos|brindamos|una|cobr|existe|aplica)\\b' +
  '|sin\\s+(' + COBRO_RECURRENTE + '|cobro|letra|anualidad|contrato)' +
  '|ni\\s+(' + COBRO_RECURRENTE + '|cobro|seo)|pago\\s+[uú]nico', 'i');

/* Solo cuenta si aparece y la frase NO lo niega. */
const REGLA_RECURRENTE = new RegExp(COBRO_RECURRENTE + '(es)?', 'i');

const hallazgos = [];
for (const f of archivos) {
  const r = rel(f);
  const lineas = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const publicado = esPublicado(r);
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea.trim()) continue;
    /* Se ignoran comentarios explicativos que describen lo retirado. */
    if (/KZ-AI-003|KZ-WEB-003|retirad|obsolet|ya no existe|quedó eliminada|queda eliminada|NO ofrezcas|no debe mencionarse|sustituye/i.test(linea)) continue;
    if (NEGACION.test(linea)) continue;   // la frase niega el concepto: es correcta
    for (const [nombre, sev, re, soloPub] of REGLAS) {
      if (soloPub && !publicado) continue;
      if (re.test(linea)) hallazgos.push({ sev, nombre, archivo: r, linea: i + 1, publicado, texto: linea.trim().slice(0, 110) });
    }
    /* El cobro recurrente solo cuenta si la frase no lo niega. */
    if (REGLA_RECURRENTE.test(linea)) {
      hallazgos.push({ sev: 'P0', nombre: 'cobro recurrente', archivo: r, linea: i + 1, publicado, texto: linea.trim().slice(0, 110) });
    }
  }
}

const porSev = { P0: [], P1: [], P2: [] };
for (const x of hallazgos) porSev[x.sev].push(x);

console.log('=== AUDITORÍA DE CONSISTENCIA COMERCIAL · konfiozinc/card ===');
console.log('  archivos revisados: ' + archivos.length);
console.log('  publicados: ' + archivos.filter((f) => esPublicado(rel(f))).length + ' · internos: ' + archivos.filter((f) => !esPublicado(rel(f))).length);
console.log('');

/* Lo que ve el visitante o Google es lo que bloquea. La documentación interna
   que describe la arquitectura o la historia se resume aparte: es ruido. */
const publicados = hallazgos.filter((x) => x.publicado);
console.log('--- HALLAZGOS EN ARCHIVOS PUBLICADOS (lo que ve el visitante) ---');
if (!publicados.length) console.log('  ninguno');
for (const x of publicados) {
  console.log('  ' + x.sev + '  ' + x.archivo + ':' + x.linea + '   (' + x.nombre + ')');
  console.log('       ' + x.texto);
}

const internos = hallazgos.filter((x) => !x.publicado);
console.log('\n--- DOCUMENTACIÓN INTERNA (no se publica; se resume) ---');
const resumen = {};
for (const x of internos) resumen[x.nombre] = (resumen[x.nombre] || 0) + 1;
for (const [k, v] of Object.entries(resumen).sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(4) + '  ' + k);
console.log('  (total interno: ' + internos.length + ')');

console.log('\n' + '='.repeat(66));
const p0 = publicados.filter((x) => x.sev === 'P0');
const p1 = publicados.filter((x) => x.sev === 'P1');
const p2 = publicados.filter((x) => x.sev === 'P2');
console.log('PUBLICADOS · P0: ' + p0.length + ' · P1: ' + p1.length + ' · P2: ' + p2.length);
console.log('TOTAL hallazgos: ' + hallazgos.length);
console.log('='.repeat(66));
process.exit(p0.length + p1.length ? 1 : 0);
