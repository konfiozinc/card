/* ── herramientas/registrar-app-web.js ──────────────────────────────
   Registra (o reutiliza) la app web "panel" y obtiene la config pública
   del SDK de Firebase usando la cuenta de servicio.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const REPO = path.resolve(__dirname, '..');
const sa = JSON.parse(fs.readFileSync(path.join(REPO, 'serviceAccount.json'), 'utf8'));
const projectId = sa.project_id;

async function main() {
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const listUrl = `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`;
  let apps = [];
  const listRes = await fetch(listUrl, { headers });
  if (listRes.ok) apps = (await listRes.json()).apps || [];
  else console.error('listado webApps:', listRes.status, await listRes.text());

  let app = apps.find(a => a.displayName === 'panel') || apps[0];
  if (!app) {
    const createRes = await fetch(listUrl, { method: 'POST', headers, body: JSON.stringify({ displayName: 'panel' }) });
    if (!createRes.ok) { console.error('crear app:', createRes.status, await createRes.text()); process.exit(1); }
    app = await createRes.json();
  }

  console.log('app encontrada/creada:');
  console.log('  displayName:', app.displayName);
  console.log('  appId     :', app.appId);

  /* El endpoint de config está en v1beta1 y devuelve la config completa */
  for (const ver of ['v1beta1', 'v1']) {
    const cfgRes = await fetch(`https://firebase.googleapis.com/${ver}/projects/${projectId}/webApps/${app.appId}/config`, { headers });
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      const out = {
        projectId: cfg.projectId || projectId,
        apiKey: cfg.apiKey,
        authDomain: cfg.authDomain,
        storageBucket: cfg.storageBucket,
        messagingSenderId: cfg.messagingSenderId,
        appId: cfg.appId
      };
      console.log('\nCONFIG_PUBLICA=' + JSON.stringify(out));
      fs.writeFileSync(path.join(REPO, 'herramientas', 'config-publica.json'), JSON.stringify(out, null, 2));
      console.log('guardada en herramientas/config-publica.json');
      return;
    }
    console.error(`  config ${ver}:`, cfgRes.status);
  }
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
