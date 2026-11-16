/* KZ-FORENSIC-FIX-002 · Test de la ficha HEREDADA (usuarios/{correo}).
 *
 * BUG QUE CUBRE
 * `esOperador()`/`esAdmin()`/`esSuperadmin()` leían `.data` sin comprobar que la
 * ficha existiera. Si el usuario sólo tenía la ficha heredada por correo (y no
 * la del uid), el motor lanzaba `evaluation error` y denegaba TODA la operación,
 * también en colecciones que no tenían nada que ver. Se veía así:
 *     evaluation error at L144:24 for 'create' @ L144
 *
 * Qué comprueba:
 *   1. Ficha SOLO por correo (ADMIN)  -> LEE clientes y contactos      (PERMITIDO)
 *   2. Ficha SOLO por correo (ADMIN)  -> LEE crm_prospectos (esAdmin)  (PERMITIDO)
 *   3. Ficha SOLO por uid (OPERADOR)  -> LEE clientes                  (PERMITIDO)
 *   4. Ficha SOLO por uid (OPERADOR)  -> LEE crm_prospectos            (DENEGADO)
 *   5. Usuario autenticado SIN ficha  -> LEE clientes                  (DENEGADO)
 *   6. Anónimo                        -> LEE clientes                  (DENEGADO)
 * Y en ningún caso la respuesta debe contener `evaluation error`.
 *
 * Uso: node pruebas/probar-ficha-heredada.mjs [proyecto]   (requiere el emulador)
 */
const P = process.argv[2] || 'demo-kz-crm-prospectos';
const AUTH = 'http://127.0.0.1:9099';
const BASE = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const CLAVE = 'PruebaDemo123!';

/* `activo` DEBE viajar como booleano: la regla compara `== true`, y una cadena
   "true" no satisface esa comparación (esto hizo fallar la primera versión de
   este test, no las reglas). */
const campos = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) =>
  [k, v === true || v === false ? { booleanValue: v } : { stringValue: String(v) }])) });

let fallos = 0;
const comprobar = (etiqueta, esperadoPermitir, status, cuerpo) => {
  const permitido = status >= 200 && status < 300;
  const errorMotor = /evaluation error/i.test(cuerpo || '');
  const ok = permitido === esperadoPermitir && !errorMotor;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'XX  '} ${etiqueta} -> HTTP ${status} ` +
    `(${permitido ? 'PERMITIDO' : 'DENEGADO'}; esperado ${esperadoPermitir ? 'PERMITIDO' : 'DENEGADO'})` +
    (errorMotor ? '  [EVALUATION ERROR]' : ''));
};

/** Crea el usuario en Auth y devuelve su token, sin escribir ninguna ficha. */
async function usuario(email) {
  const alta = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: CLAVE, returnSecureToken: true }),
  });
  let d = await alta.json();
  if (!d.localId) {
    d = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE, returnSecureToken: true }),
    })).json();
  }
  return { uid: d.localId, idToken: d.idToken, email };
}

/** Escribe una ficha con privilegios de dueño del emulador. */
async function ficha(clave, datos) {
  const r = await fetch(`${BASE}/usuarios/${clave}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(campos(datos)),
  });
  if (!r.ok) throw new Error(`no se pudo sembrar la ficha ${clave}: HTTP ${r.status}`);
}

async function leer(coleccion, token) {
  const h = token ? { Authorization: 'Bearer ' + token } : {};
  const r = await fetch(`${BASE}/${coleccion}?pageSize=1`, { headers: h });
  return { status: r.status, cuerpo: await r.text() };
}

/* ── siembra ─────────────────────────────────────────────────────────── */
const heredado = await usuario('heredado.admin@demo.test');
const porUid = await usuario('operador.uid@demo.test');
const sinFicha = await usuario('sin.ficha@demo.test');

/* El caso del bug: ficha SOLO en usuarios/{correo}, nada en usuarios/{uid}. */
await ficha(encodeURIComponent(heredado.email), { rol: 'ADMIN', activo: true });
/* El caso normal: ficha SOLO en usuarios/{uid}. */
await ficha(porUid.uid, { rol: 'OPERADOR', activo: true });

console.log(`ficha heredada por correo: ${heredado.email} (uid sin ficha)`);
console.log(`ficha por uid:             ${porUid.email}`);
console.log(`usuario sin ficha:         ${sinFicha.email}\n`);

/* ── casos ───────────────────────────────────────────────────────────── */
let r;
r = await leer('clientes', heredado.idToken);
comprobar('1. ficha SOLO por correo (ADMIN) lee clientes', true, r.status, r.cuerpo);

r = await leer('contactos', heredado.idToken);
comprobar('2. ficha SOLO por correo (ADMIN) lee contactos', true, r.status, r.cuerpo);

r = await leer('crm_prospectos', heredado.idToken);
comprobar('3. ficha SOLO por correo (ADMIN) lee crm_prospectos [esAdmin]', true, r.status, r.cuerpo);

r = await leer('clientes', porUid.idToken);
comprobar('4. ficha por uid (OPERADOR) lee clientes', true, r.status, r.cuerpo);

r = await leer('crm_prospectos', porUid.idToken);
comprobar('5. ficha por uid (OPERADOR) NO lee crm_prospectos', false, r.status, r.cuerpo);

r = await leer('clientes', sinFicha.idToken);
comprobar('6. autenticado SIN ficha NO lee clientes', false, r.status, r.cuerpo);

r = await leer('clientes', null);
comprobar('7. anónimo NO lee clientes', false, r.status, r.cuerpo);

console.log(`\nRESUMEN: ${fallos === 0 ? 'PASS — 7/7 (la ficha heredada ya no bloquea)' : 'FAIL — ' + fallos + ' desviaciones'}`);
process.exit(fallos === 0 ? 0 : 1);
