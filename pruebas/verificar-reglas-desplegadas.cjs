/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · pruebas/verificar-reglas-desplegadas.cjs
   Comprueba, en SOLO LECTURA, que el ruleset ACTIVO de producción es
   exactamente el firestore.rules del repositorio.

   Sirve para cerrar el despliegue con un hecho y no con un mensaje de consola:
   `firebase deploy` imprimió «Deploy complete!» y a la vez salió con código 2
   (su update check no puede escribir en la carpeta de configuración), así que
   el único veredicto válido es leer lo que Firebase tiene publicado.

   Uso:
     $env:NODE_PATH = "<repo>\functions\node_modules"
     $env:KZ_SA_KEY = "<ruta>\serviceAccount.json"
     node pruebas/verificar-reglas-desplegadas.cjs
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('node:fs');
const path = require('node:path');

const RUTA_CLAVE = process.argv[2] || process.env.KZ_SA_KEY || '';
const PROYECTO = 'konfio-zinc';
const RELEASE = 'cloud.firestore';
const REGLAS_LOCALES = path.resolve(__dirname, '..', 'firestore.rules');

function abortar(msg) { console.error('✘ ' + msg); process.exit(2); }

if (!RUTA_CLAVE) abortar('falta la clave de servicio: usa $env:KZ_SA_KEY = "<ruta>\\serviceAccount.json".');
if (!fs.existsSync(RUTA_CLAVE)) abortar('no existe la clave en ' + RUTA_CLAVE);
if (!fs.existsSync(REGLAS_LOCALES)) abortar('no existe ' + REGLAS_LOCALES);

let initializeApp, cert;
try {
  ({ initializeApp, cert } = require('firebase-admin/app'));
} catch (e) {
  abortar('no se pudo cargar firebase-admin (' + e.message + ').\n  Ejecuta con: $env:NODE_PATH = "<repo>\\functions\\node_modules"');
}

const sa = JSON.parse(fs.readFileSync(RUTA_CLAVE, 'utf8'));
if (sa.project_id !== PROYECTO) abortar(`la clave es del proyecto "${sa.project_id}", no de "${PROYECTO}".`);

const app = initializeApp({ credential: cert(sa), projectId: sa.project_id }, 'verificacion-' + Date.now());
const credencial = app.options.credential;

/* Normaliza para comparar contenido, no formato: BOM fuera y saltos de línea
   unificados. Cualquier diferencia de TEXTO sigue siendo una diferencia. */
const normal = (t) => t.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd();

(async () => {
  const { access_token: token } = await credencial.getAccessToken();
  const cab = { Authorization: 'Bearer ' + token };

  const rRelease = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}/releases/${RELEASE}`, { headers: cab });
  if (!rRelease.ok) abortar('no se pudo leer el release: HTTP ' + rRelease.status + ' ' + (await rRelease.text()).slice(0, 200));
  const release = await rRelease.json();

  const rSet = await fetch('https://firebaserules.googleapis.com/v1/' + release.rulesetName, { headers: cab });
  if (!rSet.ok) abortar('no se pudo leer el ruleset: HTTP ' + rSet.status);
  const ruleset = await rSet.json();

  const publicado = (ruleset.source && ruleset.source.files || []).map((f) => f.content).join('\n');
  const local = fs.readFileSync(REGLAS_LOCALES, 'utf8');

  console.log('Release activo      : ' + release.name);
  console.log('Ruleset publicado   : ' + release.rulesetName);
  console.log('Creado              : ' + (ruleset.createdAt || ruleset.createTime || '(sin fecha)'));
  console.log('Archivos publicados : ' + ((ruleset.source && ruleset.source.files || []).map((f) => f.name).join(', ') || '(ninguno)'));
  console.log('Longitud publicada  : ' + publicado.length + ' caracteres');
  console.log('Longitud local      : ' + local.length + ' caracteres');

  if (normal(publicado) === normal(local)) {
    console.log('\n✅ IDÉNTICOS: el ruleset en producción es exactamente el firestore.rules del repositorio.');
    process.exit(0);
  }

  /* Si no coinciden, decir QUÉ cambia, con la primera diferencia concreta. */
  const a = normal(publicado).split('\n');
  const b = normal(local).split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.log('\n⛔ DISTINTOS en la línea ' + (i + 1) + ':');
  console.log('   publicado : ' + (a[i] === undefined ? '(fin del archivo)' : a[i].slice(0, 120)));
  console.log('   local     : ' + (b[i] === undefined ? '(fin del archivo)' : b[i].slice(0, 120)));
  process.exit(1);
})().catch((e) => {
  console.error('✘ ERROR durante la verificación: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
