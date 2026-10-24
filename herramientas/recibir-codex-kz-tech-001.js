/* KZ-NEON-INT-001 · Recepcion y verificacion del Design System de Codex.

   Deja la integracion lista para ejecutarse en UN paso en cuanto la rama exista:
   descarga, verifica el SHA, inventaria lo entregado, busca secretos, detecta que
   archivos chocan con Neon Tech y propone el reparto (tomar / fusionar / descartar).

   NO ESCRIBE NADA. Solo lectura y diagnostico.

   Uso: node recibir-codex-kz-tech-001.js
*/
'use strict';
const { execSync } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const RAMA = 'codex/kz-tech-001';
const SHA_ESPERADO = '220c2417043ef2e6c43a6e0d46c04859cee82f16';
const BASE = 'main';

const git = (cmd) => {
  try { return execSync('git ' + cmd, { cwd: REPO, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 }).trim(); }
  catch (e) { return null; }
};
const existe = (ref) => git('rev-parse --verify --quiet ' + ref) !== null;

/* Patrones de secreto: si Codex entrego algo privado, no se integra. */
const SECRETOS = [
  ['clave de Gemini', /AIza[0-9A-Za-z_-]{30,}/],
  ['clave privada PEM', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['cuenta de servicio', /"type"\s*:\s*"service_account"/],
  ['Admin SDK', /firebase-adminsdk[-\w]*@/],
  ['token de GitHub', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['secreto OAuth', /"client_secret"\s*:\s*"[^"]{8,}"/]
];

console.log('\n=== RECEPCION DEL DESIGN SYSTEM DE CODEX · ' + RAMA + ' ===\n');

console.log('1 · Descarga de referencias');
git('fetch origin --prune');
console.log('   fetch hecho');

console.log('\n2 · ¿Existe la rama remota?');
if (!existe('refs/remotes/origin/' + RAMA)) {
  console.log('   NO. origin solo tiene: ' + (git('ls-remote --heads origin') || '').split('\n').map((l) => l.split('refs/heads/')[1]).filter(Boolean).join(', '));
  console.log('\n   La rama no esta publicada todavia. No hay nada autentico que integrar y no se');
  console.log('   sustituye por una reimplementacion: el Design System de Codex solo vale si es el suyo.');
  console.log('\n   Cuando Codex ejecute `git push -u origin ' + RAMA + '`, este mismo script');
  console.log('   verificara el SHA, inventariara los archivos y propondra el reparto.');
  console.log('\n   Nada que hacer por ahora. Ninguna escritura realizada.');
  process.exit(3);
}

/* ── Desde aqui, la rama existe ─────────────────────────────────────── */
const sha = git('rev-parse refs/remotes/origin/' + RAMA);
console.log('   SI · HEAD = ' + sha);
console.log('   esperado  = ' + SHA_ESPERADO + '  →  ' + (sha === SHA_ESPERADO ? 'COINCIDE' : 'NO COINCIDE'));

console.log('\n3 · Commits que trae respecto a ' + BASE);
console.log(git('log --oneline ' + BASE + '..origin/' + RAMA) || '   (ninguno: la rama no aporta commits sobre main)');

console.log('\n4 · Inventario de archivos entregados');
const añadidos = (git('diff --name-status ' + BASE + '...origin/' + RAMA) || '').split('\n').filter(Boolean);
const porEstado = { A: [], M: [], D: [] };
añadidos.forEach((l) => { const [e, ...f] = l.split('\t'); (porEstado[e] || []).push(f.join('\t')); });
console.log('   añadidos: ' + porEstado.A.length + ' · modificados: ' + porEstado.M.length + ' · eliminados: ' + porEstado.D.length);
const mostrar = (t, lista) => { if (lista.length) { console.log('   ' + t + ':'); lista.slice(0, 40).forEach((f) => console.log('     ' + f)); if (lista.length > 40) console.log('     … y ' + (lista.length - 40) + ' mas'); } };
mostrar('AÑADIDOS', porEstado.A);
mostrar('MODIFICADOS', porEstado.M);
if (porEstado.D.length) { console.log('   ELIMINADOS (ojo, puede revertir trabajo):'); porEstado.D.forEach((f) => console.log('     ' + f)); }

console.log('\n5 · Secretos en lo entregado');
let secretos = 0;
for (const f of [...porEstado.A, ...porEstado.M]) {
  const txt = git('show origin/' + RAMA + ':' + f);
  if (txt === null) continue;
  for (const [nombre, re] of SECRETOS) {
    if (re.test(txt)) { console.log('   [PELIGRO] ' + nombre + ' en ' + f); secretos++; }
  }
}
console.log('   ' + (secretos ? secretos + ' hallazgo(s): NO integrar hasta resolverlo' : 'ninguno'));

console.log('\n6 · Choque con Neon Tech (superficie de reconciliacion)');
const mios = (git('diff --name-only ' + BASE + '...HEAD') || '').split('\n').filter(Boolean);
const suyos = new Set([...porEstado.A, ...porEstado.M, ...porEstado.D]);
const ambos = mios.filter((f) => suyos.has(f));
if (!ambos.length) console.log('   ninguno: los conjuntos de archivos son disjuntos');
else { console.log('   ' + ambos.length + ' archivo(s) tocados por ambos lados:'); ambos.forEach((f) => console.log('     ' + f + '  ← hay que reconciliar a mano, no sobrescribir')); }

console.log('\n7 · Reparto propuesto');
const esMio = (f) => /^(assets\/css\/kz-neon\.css|premium-assets\/|assets\/css\/styles\.css|admin\/|assets\/js\/|firestore\.rules|firestore\.indexes\.json|_FORMULARIOS)/.test(f);
const esCodigoFuncional = (f) => /(^|\/)(worker\.js|app\.js|main\.js|escrituras-local\.js|datos\.js)$/.test(f);
porEstado.A.forEach((f) => {
  if (esCodigoFuncional(f)) console.log('   DESCARTAR/REVISAR  ' + f + '  (codigo funcional certificado: no se sobrescribe)');
  else if (/^design-system\//.test(f)) console.log('   TOMAR              ' + f + '  (laboratorio de Codex: sustituye al mio)');
  else if (/KZ-TECH/.test(f)) console.log('   TOMAR              ' + f + '  (documentacion de Codex)');
  else console.log('   EVALUAR            ' + f);
});
if (porEstado.M.length) console.log('   ' + porEstado.M.length + ' modificado(s): revisar uno a uno, ninguno por sobrescritura ciega');

console.log('\n=== FIN DEL DIAGNOSTICO · ninguna escritura realizada ===\n');
process.exit(0);
