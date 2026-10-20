/* ═══════════════════════════════════════════════════════════════════
   verificar-enlaces.js · KONFÍO ZINC — Card
   Recorre todas las páginas públicas, comprueba que cada href/src local
   apunta a un archivo que existe y valida los bloques JSON-LD.
   Uso: node herramientas/verificar-enlaces.js
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const EXCLUIDAS = ['node_modules', '.git', 'docs', 'herramientas', 'functions', 'premium', '.wrangler'];

function recorrer(dir, salida = []) {
  for (const entrada of readdirSync(dir)) {
    if (EXCLUIDAS.includes(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) recorrer(ruta, salida);
    else if (entrada.endsWith('.html')) salida.push(ruta);
  }
  return salida;
}

const paginas = recorrer(RAIZ);
let rotos = 0;
let jsonMalos = 0;
let referencias = 0;

for (const pagina of paginas) {
  const html = readFileSync(pagina, 'utf8');
  const relativa = pagina.slice(RAIZ.length + 1);

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const destino = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:|#|\/\/|\/)/.test(destino)) continue;
    const limpio = destino.split('#')[0].split('?')[0];
    if (!limpio) continue;
    referencias++;
    if (!existsSync(normalize(join(dirname(pagina), limpio)))) {
      rotos++;
      console.log(`  ENLACE ROTO en ${relativa}: ${destino}`);
    }
  }

  for (const bloque of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(bloque[1]);
    } catch (e) {
      jsonMalos++;
      console.log(`  JSON-LD inválido en ${relativa}: ${e.message.slice(0, 90)}`);
    }
  }
}

console.log(
  `  páginas revisadas: ${paginas.length} · referencias locales: ${referencias} · enlaces rotos: ${rotos} · JSON-LD inválidos: ${jsonMalos}`
);
process.exit(rotos + jsonMalos === 0 ? 0 : 1);
