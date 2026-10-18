#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · herramientas/verificar-permisos.js

   Comprueba, SOLO CON LECTURAS, tres cosas del proyecto real:
     1. Qué roles tiene la cuenta de servicio en el proyecto (IAM).
     2. Qué APIs hacen falta para desplegar y si están habilitadas.
     3. Qué buckets existen alrededor de los respaldos.

   No crea, no modifica y no borra nada. No escribe en Firestore y no lee
   un solo documento de clientes: IAM, servicios y buckets son metadatos.

   Nunca imprime la clave privada ni el token; los correos salen
   enmascarados.

   Uso:
     node herramientas/verificar-permisos.js
     node herramientas/verificar-permisos.js --service-account <ruta> --proyecto konfio-zinc
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARGS = process.argv.slice(2);
const argVal = (f) => { const i = ARGS.indexOf(f); return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : null; };
const PROYECTO = argVal('--proyecto') || 'konfio-zinc';
const CREDENCIAL = argVal('--service-account') || process.env.KZ_SERVICE_ACCOUNT ||
  'C:/Users/usuario29/Documents/KONFIO_ZINC/14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json';

const SALIDA = [];
function anotar(nombre, estado, detalle) {
  const e = estado === true ? 'APROBADO' : estado === false ? 'FALLIDO' : estado;
  SALIDA.push({ nombre, estado: e, detalle });
  const marca = e === 'APROBADO' ? 'PASA' : e === 'FALLIDO' ? '**FALLA**' : e === 'AVISO' ? 'AVISO' : 'NO VERIF';
  console.log(`  [${marca.padEnd(9)}] ${nombre.padEnd(46)} ${detalle || ''}`);
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function enmascarar(v) {
  if (typeof v !== 'string') return String(v);
  if (v.includes('@')) return v.replace(/^(.{0,3})[^@]*@/, '$1***@');
  return v.length <= 6 ? '***' : v.slice(0, 4) + '***';
}

async function tokenDe(sa) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id }));
  const cuerpo = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora, exp: ahora + 3600
  }));
  const firma = crypto.createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(sa.private_key);
  const jwt = `${cabecera}.${cuerpo}.${b64url(firma)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`no se pudo obtener token (HTTP ${r.status}): ${j.error || 'sin detalle'}`);
  return j.access_token;
}

async function get(url, token, metodo = 'GET') {
  const r = await fetch(url, { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: metodo === 'POST' ? '{}' : undefined });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { st: r.status, j };
}

/* Roles que hacen falta para cada operación del plan de publicación. */
const REQUISITOS = [
  { operacion: 'Desplegar reglas e índices', roles: ['roles/owner', 'roles/editor', 'roles/firebase.admin', 'roles/firebaserules.admin', 'roles/datastore.owner'] },
  { operacion: 'Desplegar Cloud Functions', roles: ['roles/owner', 'roles/editor', 'roles/firebase.admin', 'roles/cloudfunctions.admin'] },
  { operacion: 'Actuar como la cuenta de servicio de Functions', roles: ['roles/owner', 'roles/iam.serviceAccountUser', 'roles/editor'] },
  { operacion: 'Exportar Firestore (respaldo)', roles: ['roles/owner', 'roles/editor', 'roles/datastore.owner', 'roles/datastore.importExportAdmin'] },
  { operacion: 'Escribir el respaldo en el bucket', roles: ['roles/owner', 'roles/editor', 'roles/storage.admin', 'roles/storage.objectAdmin', 'roles/storage.objectCreator'] }
];

const APIS = [
  ['cloudfunctions.googleapis.com', 'Cloud Functions'],
  ['run.googleapis.com', 'Cloud Run (v2)'],
  ['cloudbuild.googleapis.com', 'Cloud Build'],
  ['artifactregistry.googleapis.com', 'Artifact Registry'],
  ['firebaserules.googleapis.com', 'Reglas de Firestore'],
  ['firebasehosting.googleapis.com', 'Firebase Hosting'],
  ['firestore.googleapis.com', 'Firestore'],
  ['identitytoolkit.googleapis.com', 'Authentication'],
  ['storage.googleapis.com', 'Cloud Storage (respaldos)'],
  ['cloudscheduler.googleapis.com', 'Cloud Scheduler (motor programado)']
];

(async () => {
  console.log('');
  console.log('═══ VERIFICACIÓN DE PERMISOS (SOLO LECTURA) ═══');
  console.log(`  proyecto: ${PROYECTO}`);
  console.log('');

  if (!fs.existsSync(CREDENCIAL)) {
    console.error(`  ✖ No existe la credencial:\n    ${CREDENCIAL}\n`);
    process.exit(2);
  }
  let sa;
  try { sa = JSON.parse(fs.readFileSync(CREDENCIAL, 'utf8')); } catch (e) { console.error('  ✖ La credencial no es un JSON válido.'); process.exit(2); }
  if (!sa.client_email || !sa.private_key) { console.error('  ✖ A la credencial le falta client_email o private_key.'); process.exit(2); }
  anotar('Credencial de servicio legible', true, `cuenta ${enmascarar(sa.client_email)}`);

  let token;
  try { token = await tokenDe(sa); anotar('Se puede obtener token de acceso', true, 'OAuth2 · jwt-bearer'); }
  catch (e) { anotar('Se puede obtener token de acceso', false, e.message); resumen(); process.exit(1); }

  /* ── 1. IAM del proyecto ─────────────────────────────────────────── */
  const iam = await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROYECTO}:getIamPolicy`, token, 'POST');
  let rolesDeLaCuenta = [];
  let totalBindings = 0;
  if (iam.st === 200 && iam.j && Array.isArray(iam.j.bindings)) {
    totalBindings = iam.j.bindings.length;
    for (const b of iam.j.bindings) {
      const miembros = Array.isArray(b.members) ? b.members : [];
      if (miembros.some((m) => m === `serviceAccount:${sa.client_email}`)) rolesDeLaCuenta.push(b.role);
    }
    anotar('Lectura de IAM del proyecto', true, `${totalBindings} bindings · la credencial tiene ${rolesDeLaCuenta.length} rol(es)`);
    if (rolesDeLaCuenta.length === 0) anotar('La credencial tiene roles en el proyecto', false, 'ninguno');
    else anotar('La credencial tiene roles en el proyecto', true, rolesDeLaCuenta.join(', '));
  } else {
    anotar('Lectura de IAM del proyecto', false, `HTTP ${iam.st} ${(iam.j && iam.j.error && iam.j.error.message) || ''}`.trim());
  }

  const tieneAlguno = (lista) => lista.some((r) => rolesDeLaCuenta.includes(r));
  /* Si no se pudo leer la política NO se puede concluir nada: se informa como
     «no verificable», nunca como «le falta el rol». Confundir las dos cosas
     convertiría esta herramienta en un falso negativo. */
  const iamLegible = iam.st === 200 && iam.j && Array.isArray(iam.j.bindings);
  for (const req of REQUISITOS) {
    if (!iamLegible) { anotar(req.operacion, 'NO VERIF', 'sin permiso para leer la política IAM'); continue; }
    anotar(req.operacion, tieneAlguno(req.roles) ? true : false,
      tieneAlguno(req.roles) ? 'cubierta' : 'ninguno de: ' + req.roles.join(' / '));
  }

  /* ── 2. APIs habilitadas ─────────────────────────────────────────── */
  const svc = await get(`https://serviceusage.googleapis.com/v1/projects/${PROYECTO}/services?filter=state:ENABLED&pageSize=200`, token);
  const habilitadas = new Set();
  if (svc.st === 200 && svc.j && Array.isArray(svc.j.services)) {
    for (const s of svc.j.services) habilitadas.add(String(s.config && s.config.name || '').replace('services/', ''));
    anotar('Lectura de APIs habilitadas', true, `${habilitadas.size} servicios activos`);
  } else {
    anotar('Lectura de APIs habilitadas', false, `HTTP ${svc.st}`);
  }
  for (const [api, etiqueta] of APIS) {
    if (!habilitadas.size) { anotar(`API · ${etiqueta}`, 'NO VERIF', api); continue; }
    anotar(`API · ${etiqueta}`, habilitadas.has(api) ? true : false, habilitadas.has(api) ? api : `falta ${api}`);
  }

  /* ── 3. Buckets (solo metadatos) ─────────────────────────────────── */
  const buckets = await get(`https://storage.googleapis.com/storage/v1/b?project=${PROYECTO}&maxResults=50&fields=items(name,location)`, token);
  if (buckets.st === 200) {
    /* Un 200 sin `items` significa «el proyecto no tiene buckets», no un fallo. */
    const items = buckets.j && Array.isArray(buckets.j.items) ? buckets.j.items : [];
    const nombres = items.map((b) => b.name);
    anotar('Buckets del proyecto', true, nombres.length ? nombres.join(', ') : 'ninguno');
    const deRespaldos = nombres.filter((n) => /backup|respaldo/i.test(n));
    anotar('Bucket de respaldos existente', deRespaldos.length > 0 ? true : false,
      deRespaldos.length ? deRespaldos.join(', ') : 'no hay ninguno con «backup/respaldo» en el nombre');
  } else {
    anotar('Buckets del proyecto', false, `HTTP ${buckets.st} ${(buckets.j && buckets.j.error && buckets.j.error.message) || ''}`.trim());
  }

  resumen();
  const fallos = SALIDA.filter((x) => x.estado === 'FALLIDO').length;
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error('\n  ✖ Error inesperado: ' + (e && e.message)); process.exit(1); });

function resumen() {
  const c = { APROBADO: 0, FALLIDO: 0, AVISO: 0, 'NO VERIF': 0 };
  for (const x of SALIDA) c[x.estado] = (c[x.estado] || 0) + 1;
  console.log('');
  console.log(`  RESULTADO: ${c.APROBADO} aprobadas · ${c.FALLIDO} fallidas · ${c['NO VERIF']} no verificables`);
  console.log('  (esta herramienta solo lee: no crea buckets, no toca IAM y no abre documentos de clientes)');
  console.log('');
}
