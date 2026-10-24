/* Construye una copia aislada NUEVA desde el HEAD actual del repositorio de Card,
   aplicando el mismo recetario de aislamiento que se usó antes: SDK locales,
   emuladores de Firebase y endpoints apagados. Nada de esto se versiona. */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web';
const VIEJA = 'C:/Users/usuario29/AppData/Local/Temp/kz-card-staging-p1';
const DESTINO = 'C:/Users/usuario29/AppData/Local/Temp/kz-card-staging-b68108b';
const SITIO = join(DESTINO, 'sitio');
const EXCLUIR = ['node_modules', '.git', 'docs', 'herramientas', 'functions', 'premium', '.wrangler', '_transferencia'];

if (existsSync(DESTINO)) rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(SITIO, { recursive: true });

/* 1. Copia del sitio tal como está en HEAD */
cpSync(REPO, SITIO, {
  recursive: true,
  filter: (origen) => {
    const rel = origen.slice(REPO.length + 1).replace(/\\/g, '/');
    if (!rel) return true;
    return !EXCLUIR.some((e) => rel === e || rel.startsWith(e + '/'));
  },
});
console.log('  copia del sitio hecha desde el árbol de trabajo (HEAD limpio)');

/* 2. Piezas de aislamiento que no están en el repositorio */
cpSync(join(VIEJA, 'sitio', 'vendor'), join(SITIO, 'vendor'), { recursive: true });
cpSync(join(VIEJA, 'sitio', 'assets', 'js', 'aislamiento.js'), join(SITIO, 'assets', 'js', 'aislamiento.js'));
console.log('  SDK de Firebase vendorizados y cortafuegos de aislamiento copiados');

/* 3. Parches de aislamiento sobre los archivos del HEAD actual */
const parche = (rel, pares) => {
  const ruta = join(SITIO, rel);
  let t = readFileSync(ruta, 'utf8');
  for (const [antes, despues] of pares) {
    if (!t.includes(antes)) { console.log(`  AVISO: no encontrado en ${rel}: ${antes.slice(0, 60)}`); continue; }
    t = t.split(antes).join(despues);
  }
  writeFileSync(ruta, t, 'utf8');
};

const DEMO = [
  ["apiKey: 'AIzaSyDbwAk9APwP2SeaEfWxeQG_bdL9eatciEA'", "apiKey: 'demo-api-key-ficticia'"],
  ["authDomain: 'konfio-zinc.firebaseapp.com'", "authDomain: 'demo-card-seguridad.firebaseapp.com'"],
  ["projectId: 'konfio-zinc'", "projectId: 'demo-card-seguridad'"],
  ["storageBucket: 'konfio-zinc.firebasestorage.app'", "storageBucket: 'demo-card-seguridad.appspot.com'"],
  ["messagingSenderId: '1096915735255'", "messagingSenderId: '000000000000'"],
  ["appId: '1:1096915735255:web:00e3d896c266293cced692'", "appId: '1:000000000000:web:demo0000000000000000'"],
];

parche('assets/js/admin/core.js', [
  ["import { getAuth } from 'firebase/auth';", "import { getAuth, connectAuthEmulator } from 'firebase/auth';"],
  ["import { getFirestore } from 'firebase/firestore';", "import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';"],
  ['  db = getFirestore(app);',
   "  db = getFirestore(app);\n  /* [AISLAMIENTO] emuladores locales */\n  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch (e) {}\n  try { connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch (e) {}"],
]);

parche('assets/js/config.js', [...DEMO, ["workerUrl: 'https://calm-heart-6828.konfiozinc.workers.dev'", "workerUrl: 'http://127.0.0.1:9999/kz-agente-deshabilitado'"]].map(([a, b]) => [a, b]));
parche('assets/js/firebase-config.js', DEMO);

parche('assets/js/main.js', [
  ["var BACKEND_URL = 'https://calm-heart-6828.konfiozinc.workers.dev';", "var BACKEND_URL = 'http://127.0.0.1:9999/kz-agente-deshabilitado'; /* [AISLAMIENTO] */"],
]);

/* El formulario premium también apunta al Worker de producción: se apaga en staging. */
parche('premium-assets/app.js', [
  ["const LEADS_URL = 'https://calm-heart-6828.konfiozinc.workers.dev/leads';", "const LEADS_URL = 'http://127.0.0.1:9999/kz-leads-deshabilitado'; /* [AISLAMIENTO] */"],
]);

/* 4. push.js apagado (el original sigue versionado en el repositorio) */
writeFileSync(
  join(SITIO, 'assets/js/push.js'),
  `/* push.js · STAGING AISLADO — NO ES EL ARCHIVO DE PRODUCCIÓN.
   En staging no se registra service worker, no se pide permiso, no se obtienen
   tokens FCM y no se escribe en Firestore. Se conserva el nombre porque muchas
   páginas lo cargan con <script src="assets/js/push.js" defer>. */
(function () {
  'use strict';
  if (typeof window !== 'undefined') window.KZ_PUSH_DESHABILITADO = true;
})();
`,
  'utf8'
);

/* 5. Configuración de emuladores: hosting sobre sitio/, Auth 9099, Firestore 8080 */
writeFileSync(
  join(DESTINO, 'firebase-emulador-funciones.json'),
  JSON.stringify(
    {
      firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
      hosting: { public: 'sitio', ignore: ['firebase.json', '**/.*', '**/node_modules/**'] },
      emulators: {
        auth: { host: '127.0.0.1', port: 9099 },
        firestore: { host: '127.0.0.1', port: 8080 },
        hosting: { host: '127.0.0.1', port: 5000 },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    },
    null,
    2
  ),
  'utf8'
);
writeFileSync(join(DESTINO, '.firebaserc'), JSON.stringify({ projects: { default: 'demo-card-seguridad' } }, null, 2), 'utf8');

cpSync(join(REPO, 'firestore.rules'), join(DESTINO, 'firestore.rules'));
cpSync(join(REPO, 'firestore.indexes.json'), join(DESTINO, 'firestore.indexes.json'));

/* 6. Comprobaciones: nada de producción en la copia */
const core = readFileSync(join(SITIO, 'assets/js/admin/core.js'), 'utf8');
const cfg = readFileSync(join(SITIO, 'assets/js/config.js'), 'utf8');
const fcfg = readFileSync(join(SITIO, 'assets/js/firebase-config.js'), 'utf8');
const main = readFileSync(join(SITIO, 'assets/js/main.js'), 'utf8');
const fugas = [];
if (!core.includes('connectFirestoreEmulator')) fugas.push('core.js sin emulador');
if (cfg.includes('konfio-zinc')) fugas.push('config.js apunta a producción');
if (fcfg.includes('konfio-zinc')) fugas.push('firebase-config.js apunta a producción');
if (main.includes('calm-heart-6828')) fugas.push('main.js con el Worker de producción');
console.log('  fugas a producción: ' + (fugas.length ? fugas.join(', ') : 'ninguna'));
console.log('  planes en la copia: ' + (cfg.match(/codigo: '([^']+)'/g) || []).join(' · '));

/* 7. Páginas del panel y del sitio: SDK vendorizado, sin CDNs, con cortafuegos */
import { readdirSync, statSync } from 'node:fs';
function paginas(dir, salida = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!['vendor', 'assets'].includes(e)) paginas(p, salida); }
    else if (e.endsWith('.html')) salida.push(p);
  }
  return salida;
}
let tocadas = 0;
for (const archivo of paginas(SITIO)) {
  let h = readFileSync(archivo, 'utf8');
  const original = h;
  const prefijo = archivo.slice(SITIO.length).replace(/\\/g, '/').split('/').length > 2 ? '../' : '';

  h = h.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/(firebase-[a-z]+\.js)/g, `${prefijo}vendor/firebase-esm/10.12.2/$1`);
  h = h.replace(/\s*<link[^>]*(?:fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare)[^>]*>/g, '\n  <!-- [AISLAMIENTO] recurso externo retirado en staging -->');
  if (!h.includes('aislamiento.js') && /<body[^>]*>/i.test(h)) {
    h = h.replace(/<body([^>]*)>/i, `<body$1>\n  <script src="${prefijo}assets/js/aislamiento.js"></script>`);
  }
  if (h !== original) { writeFileSync(archivo, h, 'utf8'); tocadas++; }
}
console.log(`  páginas ajustadas para el aislamiento: ${tocadas}`);