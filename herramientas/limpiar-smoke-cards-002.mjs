/* Borra el contacto ficticio de la prueba de humo (por ID confirmado). */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
const rt = cfg.tokens && (cfg.tokens.refresh_token || cfg.tokens.refreshToken);
const form = new URLSearchParams({
  client_id: cfg.tokens.client_id || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: cfg.tokens.client_secret || 'j9iVZfS8kkCEFUPaAeJV0sAi',
  grant_type: 'refresh_token', refresh_token: rt
});
const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() }).then(r => r.json());
const IDS = ['5hWSzkzGRIG7fWCxhwGU'];
for (const id of IDS) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/konfio-zinc/databases/(default)/documents/contactos/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok.access_token } });
  console.log(`DELETE ${id}: ${r.status}`);
}
