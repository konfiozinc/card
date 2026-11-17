'use strict';
/**
 * KZ-MINI-001 · Verificador del CONTRATO DE PLANTILLAS.
 *
 * El mismo contrato de plantillas está declarado en tres sitios, y hasta ahora
 * nadie comprobaba que dijeran lo mismo:
 *
 *   1. `mini-demo/plantillas.js`         → la fuente con los datos (estilos, colores, muestras).
 *   2. `18-KONFIO-ZINC-STUDIO/server/adaptador-kz-mini-001.mjs` → la lista que el servidor acepta.
 *   3. `18-KONFIO-ZINC-STUDIO/web/app.js`                        → el registro que pinta el panel.
 *
 * Si una plantilla se añade o se renombra en un sitio y no en los otros, el
 * visitante puede pedir algo que el servidor rechaza, o el panel puede mostrar
 * una plantilla que no existe. Esta prueba lo detecta antes de publicar nada.
 *
 * Solo lee. No modifica archivos y no necesita navegador.
 *
 * Uso:  node herramientas/verificar-contrato-plantillas.js
 * Salida: 0 si el contrato es coherente, 1 si algo no cuadra.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '..');
const WORKSPACE = path.resolve(RAIZ, '..', '..');
const FUENTE = path.join(RAIZ, 'mini-demo', 'plantillas.js');
const ADAPTADOR = path.join(WORKSPACE, '18-KONFIO-ZINC-STUDIO', 'server', 'adaptador-kz-mini-001.mjs');
const PANEL = path.join(WORKSPACE, '18-KONFIO-ZINC-STUDIO', 'web', 'app.js');

// Claves que cada plantilla DEBE traer para que el exportador pueda pintarla.
const CLAVES = ['id', 'nombre', 'lema', 'paraQuien', 'estilo', 'colores', 'muestra', 'servicios'];
const CLAVES_ESTILO = ['titulo', 'cuerpo', 'radio', 'sombra', 'hero', 'mayusculas', 'separador', 'boton'];

const fallos = [];
const avisos = [];
const ok = (m) => console.log('  OK   ' + m);
const fallo = (m) => { fallos.push(m); console.log('  FALLA ' + m); };

function leerTexto(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

/** Claves de PRIMER nivel de un objeto JS: solo cuenta a profundidad 0. */
function clavesDeObjeto(cuerpo) {
  const claves = [];
  let nivel = 0;
  let i = 0;
  while (i < cuerpo.length) {
    const c = cuerpo[i];
    if (c === '{' || c === '[' || c === '(') { nivel++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { nivel--; i++; continue; }
    if (nivel === 0 && /[a-záéíóúñ]/i.test(c)) {
      const m = /^([a-záéíóúñ][\w$-]*)\s*:/i.exec(cuerpo.slice(i));
      if (m) { claves.push(m[1]); i += m[0].length; continue; }
    }
    i++;
  }
  return [...new Set(claves)];
}

/** Extrae las claves del objeto `PLANTILLAS = { clave: … }` de un fuente JS. */
function clavesDeclaradas(texto, etiqueta) {
  if (!texto) return null;
  const i = texto.indexOf('PLANTILLAS');
  if (i === -1) return null;
  // Lista del adaptador: PLANTILLAS = ["elegancia", …]
  const lista = /PLANTILLAS\s*=\s*\[([^\]]*)\]/.exec(texto);
  if (lista) {
    const claves = [...lista[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    if (claves.length) return { claves, forma: 'lista' };
  }
  // Objeto del panel o de la fuente: PLANTILLAS = { clave: {
  const obj = /PLANTILLAS\s*=\s*\{/.exec(texto);
  if (obj) {
    let nivel = 0;
    const desde = obj.index + obj[0].length - 1;
    let fin = desde;
    for (let j = desde; j < texto.length; j++) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}') { nivel--; if (nivel === 0) { fin = j; break; } }
    }
    const claves = clavesDeObjeto(texto.slice(desde + 1, fin));
    if (claves.length) return { claves, forma: 'objeto' };
  }
  return null;
}

async function main() {
  console.log('KZ-MINI-001 · contrato de plantillas\n');

  /* 1 · La fuente de datos */
  if (!fs.existsSync(FUENTE)) { console.error('No existe ' + FUENTE); process.exit(1); }
  const mod = await import(pathToFileURL(FUENTE).href);
  const plantillas = mod.PLANTILLAS || {};
  const clavesFuente = Object.keys(plantillas);

  if (clavesFuente.length !== 3) fallo(`la fuente declara ${clavesFuente.length} plantillas, se esperan 3`);
  else ok(`fuente: 3 plantillas (${clavesFuente.join(', ')})`);

  for (const [clave, p] of Object.entries(plantillas)) {
    for (const k of CLAVES) if (!(k in p)) fallo(`${clave}: falta «${k}»`);
    for (const k of CLAVES_ESTILO) if (!p.estilo || !(k in p.estilo)) fallo(`${clave}: falta estilo.${k}`);
    if (p.id !== clave) fallo(`${clave}: id «${p.id}» no coincide con su clave`);
    const c = p.colores || {};
    for (const k of ['primario', 'secundario']) {
      if (!/^#[0-9a-f]{6}$/i.test(String(c[k] || ''))) fallo(`${clave}: color ${k} no es hexadecimal de 6`);
    }
    if (!Array.isArray(p.muestra) || p.muestra.length < 3) fallo(`${clave}: «muestra» necesita al menos 3 elementos`);
    if (!Array.isArray(p.servicios) || !p.servicios.length) fallo(`${clave}: «servicios» está vacío`);
    else for (const s of p.servicios) if (!s.nombre) fallo(`${clave}: un servicio no tiene nombre`);
  }
  if (!fallos.length) ok('las 3 plantillas traen todas las claves, colores válidos y contenido de muestra');

  /* 2 · La lista que acepta el servidor */
  const clavesAdaptador = clavesDeclaradas(leerTexto(ADAPTADOR), 'adaptador');
  if (!clavesAdaptador) fallo('no se pudo leer la lista PLANTILLAS del adaptador del servidor');
  else {
    const iguales = clavesAdaptador.claves.length === clavesFuente.length
      && clavesAdaptador.claves.every((k) => clavesFuente.includes(k));
    if (!iguales) fallo(`adaptador acepta [${clavesAdaptador.claves}] y la fuente declara [${clavesFuente}]`);
    else ok(`adaptador del servidor: acepta exactamente las mismas (${clavesAdaptador.forma})`);
  }

  /* 3 · El registro que pinta el panel */
  const clavesPanel = clavesDeclaradas(leerTexto(PANEL), 'panel');
  if (!clavesPanel) fallo('no se pudo leer el registro PLANTILLAS del panel del STUDIO');
  else {
    const iguales = clavesPanel.claves.length === clavesFuente.length
      && clavesPanel.claves.every((k) => clavesFuente.includes(k));
    if (!iguales) fallo(`panel declara [${clavesPanel.claves}] y la fuente declara [${clavesFuente}]`);
    else ok(`panel del STUDIO: registra exactamente las mismas (${clavesPanel.forma})`);
  }

  /* 4 · Paletas del editor */
  const paletas = mod.PALETAS || [];
  if (!Array.isArray(paletas) || paletas.length < 2) fallo('el editor necesita al menos 2 paletas sugeridas');
  else {
    const malas = paletas.filter((x) => !/^#[0-9a-f]{6}$/i.test(String(x.primario || '')) || !/^#[0-9a-f]{6}$/i.test(String(x.secundario || '')));
    if (malas.length) fallo(`${malas.length} paleta(s) con color no hexadecimal`);
    else ok(`${paletas.length} paletas sugeridas, todas con colores válidos`);
  }

  /* 5 · La imagen de muestra no debe salir a la red */
  const fuenteTexto = leerTexto(FUENTE) || '';
  // `xmlns="http://www.w3.org/2000/svg"` es un espacio de nombres XML, no una
  // petición de red: no cuenta como URL externa.
  const externas = [...fuenteTexto.matchAll(/https?:\/\/[^\s"')]+/g)]
    .map((m) => m[0])
    .filter((u) => !/^https?:\/\/www\.w3\.org\//i.test(u));
  if (externas.length) fallo(`la fuente de plantillas contiene ${externas.length} URL(s) externas: ${externas.slice(0, 3).join(', ')}`);
  else ok('la fuente no contiene URLs externas (las muestras se generan como SVG local)');
  if (typeof mod.imagenDeMuestra !== 'function') fallo('falta la función imagenDeMuestra()');
  else {
    const d = mod.imagenDeMuestra('Prueba', 'subtítulo', '#123456', '#abcdef', 0, { ancho: 400, alto: 300 });
    if (!/^data:image\/svg\+xml/.test(d)) fallo('imagenDeMuestra no devuelve un data: URI de SVG');
    else ok('imagenDeMuestra devuelve un SVG local (sin red)');
  }

  /* Cierre */
  console.log('');
  if (avisos.length) avisos.forEach((a) => console.log('  AVISO ' + a));
  if (fallos.length) {
    console.log(`\nCONTRATO INCOHERENTE: ${fallos.length} problema(s).`);
    process.exitCode = 1;
  } else {
    console.log('CONTRATO COHERENTE: las tres fuentes dicen lo mismo.');
    process.exitCode = 0;
  }
}

main().catch((e) => { console.error('Error inesperado: ' + e.message); process.exitCode = 1; });
