/* KZ-CRM-016 · genera crm/firestore.rules.emulador a partir de crm/firestore.rules.

   Motivo: mantener a mano dos copias de las mismas reglas ya provocó que una
   tuviera un `leadId` indefinido (que rompía el alta de roles) mientras la otra
   estaba bien. Aquí la copia del emulador se DERIVA del archivo de producción
   cambiando exactamente un bloque: el alta de la propia ficha de rol, que sólo
   existe para poder arrancar el emulador sin sembrar roles a mano.

   Uso:
     node crm/generar-reglas-emulador.cjs           # escribe el archivo
     node crm/generar-reglas-emulador.cjs --check   # sólo verifica sincronía (exit 3 si difiere) */

const fs = require("node:fs");
const path = require("node:path");

const ORIGEN = path.join(__dirname, "firestore.rules");
const DESTINO = path.join(__dirname, "firestore.rules.emulador");

const BLOQUE_PRODUCCION = `    match /crm_usuarios/{uid} {
      allow read: if autenticado() && (request.auth.uid == uid || esAdmin());
      allow write: if false;
    }`;

const BLOQUE_EMULADOR = `    /* ÚNICA diferencia con producción: en el emulador cada usuario puede crear su
       propia ficha al entrar, para no sembrar roles a mano. En producción el alta
       de roles es privilegiada y este bloque NO se despliega. */
    match /crm_usuarios/{uid} {
      allow read: if autenticado() && (request.auth.uid == uid || esAdmin());
      allow create: if autenticado() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['rol','activo','creado_en','nombre'])
        && request.resource.data.rol in ['admin', 'comercial', 'ventas', 'lectura']
        && request.resource.data.activo == true;
      /* H09 (auditoría KZ-CRM-018): el emulador NO debe permitir más que producción.
         Antes esta regla dejaba actualizar fichas de rol siendo admin; producción
         prohíbe toda escritura. Se alinea para que el emulador no dé falsa confianza. */
      allow update: if false;
      allow delete: if false;
    }`;

const CABECERA = `rules_version = '2';

/* ARCHIVO GENERADO — no editar a mano.
   Se obtiene con: node crm/generar-reglas-emulador.cjs
   Fuente: crm/firestore.rules (modo privado). Única diferencia: el alta de rol
   propio del emulador. Así las pruebas del emulador significan algo sobre
   producción, y no pueden divergir por descuido. */
`;

function normalizar(s) { return s.replace(/\r\n/g, "\n"); }

function construir() {
  const origen = normalizar(fs.readFileSync(ORIGEN, "utf8"));
  if (!origen.includes(BLOQUE_PRODUCCION)) {
    throw new Error("No se encontró el bloque de crm_usuarios de producción: revisa crm/firestore.rules");
  }
  const cuerpo = origen
    .replace(/\r\n/g, "\n")
    .replace(/^rules_version = '2';\s*/, "")
    .replace(BLOQUE_PRODUCCION, BLOQUE_EMULADOR);
  return CABECERA + cuerpo.replace(/^\s*\n/, "");
}

const generado = construir();
const check = process.argv.includes("--check");

if (check) {
  if (!fs.existsSync(DESTINO)) { console.error("FALLA: no existe " + DESTINO); process.exit(3); }
  const actual = normalizar(fs.readFileSync(DESTINO, "utf8"));
  if (actual.trim() !== generado.trim()) {
    console.error("FALLA: crm/firestore.rules.emulador está desincronizado de crm/firestore.rules");
    console.error("       ejecuta: node crm/generar-reglas-emulador.cjs");
    process.exit(3);
  }
  console.log("OK: las reglas del emulador coinciden con las de producción salvo el alta de rol.");
  process.exit(0);
}

fs.writeFileSync(DESTINO, generado, "utf8");
console.log("Escrito " + path.relative(process.cwd(), DESTINO) + " (" + generado.length + " bytes)");
console.log("Única diferencia con producción: el bloque de alta de rol propio del emulador.");
