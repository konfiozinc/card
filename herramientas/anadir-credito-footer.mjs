#!/usr/bin/env node
/**
 * KZ-QA-CLIENTES-003 · Crédito discreto en el pie de página de los proyectos de clientes.
 *
 * Qué hace: en cada `<footer>` que YA EXISTE añade, al final de su contenido, un crédito discreto:
 *
 *    · Diseñado por <a href="https://konfiozinc.github.io/card/" target="_blank"
 *                      style="color: inherit; text-decoration: underline; opacity: 0.8;">KONFÍO ZINC</a>
 *    · <a href="ENLACE_PRIVACIDAD" style="color: inherit; text-decoration: underline; opacity: 0.8;">Políticas de Privacidad</a>
 *
 * Qué NO hace:
 *   · no crea pies de página nuevos (las páginas sin `<footer>` no se tocan);
 *   · no toca formularios ni el texto legal del cuerpo (Habeas Data, consentimientos);
 *   · no modifica CSS, ni JavaScript, ni textos de los clientes;
 *   · no publica nada: escribe en disco y nada más.
 *
 * `color: inherit` es obligatorio: así el crédito toma el color del pie del cliente y no aparece el
 * cian de la agencia.
 *
 * Uso:
 *   node herramientas/anadir-credito-footer.mjs                      # SIMULACIÓN (no escribe)
 *   node herramientas/anadir-credito-footer.mjs --aplicar            # escribe
 *   node herramientas/anadir-credito-footer.mjs --proyecto "Nandy" --aplicar
 *   node herramientas/anadir-credito-footer.mjs --sin-duplicar       # no repite marca ni enlace si ya están
 *   node herramientas/anadir-credito-footer.mjs --incluir-admin      # incluye páginas de panel/admin
 *   node herramientas/anadir-credito-footer.mjs --raiz <carpeta>     # otro workspace (pruebas)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')                    // repo card

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const SOLO_JSON = args.includes('--json')
const SIN_DUPLICAR = args.includes('--sin-duplicar')
const INCLUIR_ADMIN = args.includes('--incluir-admin')
const iProyecto = args.indexOf('--proyecto')
const FILTRO = iProyecto > -1 && args[iProyecto + 1] ? args[iProyecto + 1].toLowerCase() : null
const iRaiz = args.indexOf('--raiz')
const WORKSPACE = iRaiz > -1 && args[iRaiz + 1] ? resolve(args[iRaiz + 1]) : resolve(RAIZ, '..', '..')

const MARCA = 'KONFÍO ZINC'
const URL_AGENCIA = 'https://konfiozinc.github.io/card/'
const URL_PRIVACIDAD_AGENCIA = 'https://konfiozinc.github.io/card/privacidad.html'
const ESTILO_ENLACE = 'color: inherit; text-decoration: underline; opacity: 0.8;'
// Nombres posibles del archivo local de privacidad, en orden de preferencia.
const ARCHIVOS_PRIVACIDAD = ['privacidad.html', 'politica-privacidad.html', 'politica-de-privacidad.html', 'privacy.html', 'privacidad/index.html']

// ── Selección de proyectos y páginas: la misma que la puerta de calidad ─────
const CARPETAS_IGNORADAS = [/BACKUPS/i, /HERRAMIENTAS-DESARROLLO/i, /^\./]
const NO_ES_PROYECTO = [/node_modules/, /[\\/]\.git/, /[\\/]_originales/, /[\\/]_backup/, /[\\/]\.worktrees/, /[\\/]herramientas/, /[\\/]evidencias/]
const EXCLUIR = [/node_modules/, /[\\/]\.git[\\/]/, /[\\/]crm-dev[\\/]/, /[\\/]docs[\\/]/, /[\\/]evidencias/, /[\\/]_transferencia[\\/]/]

function paginasDe(dir, salida = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (EXCLUIR.some((rx) => rx.test(p))) continue
    if (e.isDirectory()) paginasDe(p, salida)
    else if (e.name.endsWith('.html')) salida.push(p)
  }
  return salida
}

/** Ruta relativa (con /) desde la página hasta un archivo de la raíz del proyecto. */
function rutaDesde(dirPagina, dirProyecto, destino) {
  return relative(dirPagina, join(dirProyecto, destino)).replace(/\\/g, '/')
}

/** Enlace de privacidad que corresponde a este proyecto: su archivo local si existe, si no el de la agencia. */
export function enlacePrivacidad(dirProyecto, dirPagina) {
  for (const nombre of ARCHIVOS_PRIVACIDAD) {
    if (existsSync(join(dirProyecto, nombre))) {
      const rel = rutaDesde(dirPagina, dirProyecto, nombre)
      return { href: rel, origen: 'local', archivo: nombre }
    }
  }
  return { href: URL_PRIVACIDAD_AGENCIA, origen: 'agencia', archivo: null }
}

export function parecePaginaAdmin(archivo, dirProyecto) {
  const rel = relative(dirProyecto, archivo).replace(/\\/g, '/')
  return /^(admin|panel|crm)\//i.test(rel) || /^(admin|panel)\.html$/i.test(rel)
}

const TEXTO_MARCA = `Diseñado por <a href="${URL_AGENCIA}" target="_blank" style="color: inherit; text-decoration: underline; opacity: 0.8;">${MARCA}</a>`
const textoPrivacidad = (href) => `<a href="${href}" style="color: inherit; text-decoration: underline; opacity: 0.8;">Políticas de Privacidad</a>`

// Etiquetas de cierre de elementos de bloque: si el pie termina en una de ellas, el crédito va en su
// propia línea y no hace falta el punto separador.
const CIERRE_DE_BLOQUE = /<\/(div|p|ul|ol|li|section|nav|address|dl|dt|dd|table|figure|figcaption|blockquote|h[1-6]|form|article|aside|header|main|details|summary)>$/i

/**
 * Añade el crédito al HTML de UN pie de página.
 * Devuelve { html, estado, partes } donde estado es:
 *   'añadido' | 'ya-estaba' (ya lo puso esta herramienta) | 'ya-tenia-todo' | 'sin-cierre'
 */
export function insertarCredito(footerHtml, { hrefPrivacidad, sinDuplicar = false }) {
  const yaMarca = new RegExp('KONF[ÍI]O\\s*ZINC', 'i').test(footerHtml)
  if (yaMarca && /Diseñado por/i.test(footerHtml)) {
    return { html: footerHtml, estado: 'ya-estaba', partes: [] }
  }

  const yaPrivacidad = /href="[^"]*(privacidad|privacy)[^"]*"/i.test(footerHtml)
  const partes = []
  const omitidas = []
  if (yaMarca && sinDuplicar) omitidas.push('marca')
  else partes.push(TEXTO_MARCA)
  if (yaPrivacidad && sinDuplicar) omitidas.push('privacidad')
  else partes.push(textoPrivacidad(hrefPrivacidad))
  if (!partes.length) return { html: footerHtml, estado: 'ya-tenia-todo', partes, omitidas }

  const iCierre = footerHtml.toLowerCase().lastIndexOf('</footer>')
  if (iCierre < 0) return { html: footerHtml, estado: 'sin-cierre', partes: omitidas }

  const antes = footerHtml.slice(0, iCierre)
  const despues = footerHtml.slice(iCierre)
  const ws = (antes.match(/\s*$/) || [''])[0]          // sangría y saltos antes de </footer>
  const contenido = antes.slice(0, antes.length - ws.length)

  /* Cómo separar: si el pie termina en una etiqueta de bloque (o en un salto de línea), el crédito
     empieza su propia línea con "· "; si termina en texto o en un elemento en línea, se continúa con
     " · " para que no quede un punto huérfano al principio de una línea. */
  const lineaPropia = ws.includes('\n') || CIERRE_DE_BLOQUE.test(contenido) || contenido === ''
  const prefijo = lineaPropia ? '· ' : ' · '
  const texto = prefijo + partes.join(' · ')

  let html
  if (ws.includes('\n')) {
    const sangria = (ws.match(/(?:^|\n)([ \t]*)$/) || ['', ''])[1]
    html = contenido + '\n' + sangria + texto + '\n' + sangria + despues
  } else {
    html = contenido + texto + despues
  }
  return { html, estado: 'añadido', partes, omitidas, prefijo: prefijo.trim() }
}

/**
 * Aplica el crédito a todo el texto de una página. Solo actúa sobre `<footer>` existentes.
 * Devuelve { texto, cambios: [{ estado, partes }], sinFooter }
 */
export function aplicarCreditoEnPagina(texto, { hrefPrivacidad, sinDuplicar = false }) {
  const footers = [...texto.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi)]
  if (!footers.length) return { texto, cambios: [], sinFooter: true }
  let salida = texto
  const cambios = []
  // De atrás hacia adelante para que los índices de los pies anteriores sigan siendo válidos.
  for (let i = footers.length - 1; i >= 0; i--) {
    const original = footers[i][0]
    const r = insertarCredito(original, { hrefPrivacidad, sinDuplicar })
    cambios.unshift({ estado: r.estado, partes: r.partes, omitidas: r.omitidas })
    if (r.estado !== 'añadido') continue
    const desde = footers[i].index
    salida = salida.slice(0, desde) + r.html + salida.slice(desde + original.length)
  }
  return { texto: salida, cambios, sinFooter: false }
}

// ── Ejecución por consola ─────────────────────────────────────────────────
const ES_CLI = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (ES_CLI) {
  const resumen = []

  for (const carpeta of readdirSync(WORKSPACE, { withFileTypes: true })) {
    if (!carpeta.isDirectory() || !/^\d+-/.test(carpeta.name)) continue
    if (CARPETAS_IGNORADAS.some((rx) => rx.test(carpeta.name))) continue
    const base = join(WORKSPACE, carpeta.name)
    for (const proyecto of readdirSync(base, { withFileTypes: true })) {
      if (!proyecto.isDirectory()) continue
      const dir = join(base, proyecto.name)
      if (resolve(dir) === resolve(RAIZ)) continue
      if (NO_ES_PROYECTO.some((rx) => rx.test(dir))) continue
      if (!existsSync(join(dir, 'index.html'))) continue
      const nombre = carpeta.name + '/' + proyecto.name
      if (FILTRO && !nombre.toLowerCase().includes(FILTRO)) continue

      const detalle = []
      const paginas = paginasDe(dir)
      let modificados = 0

      for (const archivo of paginas) {
        const rel = relative(dir, archivo).replace(/\\/g, '/')
        if (!INCLUIR_ADMIN && parecePaginaAdmin(archivo, dir)) {
          detalle.push({ archivo: rel, estado: 'omitido (página de panel)' })
          continue
        }
        const texto = readFileSync(archivo, 'utf8')
        const { href, origen, archivo: archivoPriv } = enlacePrivacidad(dir, dirname(archivo))
        const r = aplicarCreditoEnPagina(texto, { hrefPrivacidad: href, sinDuplicar: SIN_DUPLICAR })
        if (r.sinFooter) {
          detalle.push({ archivo: rel, estado: 'omitido (no tiene <footer>)' })
          continue
        }
        const añadido = r.cambios.some((c) => c.estado === 'añadido')
        const yaEstaba = r.cambios.every((c) => c.estado === 'ya-estaba')
        const sinPartes = r.cambios.every((c) => c.estado === 'ya-tenia-todo')
        if (!añadido) {
          detalle.push({ archivo: rel, estado: yaEstaba ? 'ya tenía el crédito' : sinPartes ? 'ya tenía marca y privacidad' : 'sin cambios' })
          continue
        }
        modificados += 1
        detalle.push({
          archivo: rel,
          estado: 'añadido',
          partes: r.cambios.find((c) => c.estado === 'añadido').partes.length,
          privacidad: origen + (archivoPriv ? ' (' + archivoPriv + ')' : ''),
          href
        })
        if (APLICAR) writeFileSync(archivo, r.texto, 'utf8')
      }

      // Se guarda el proyecto siempre, para que el recuento de páginas sin pie y de panel sea exacto.
      resumen.push({ proyecto: nombre, paginas: paginas.length, modificados, detalle })
    }
  }

  if (SOLO_JSON) {
    console.log(JSON.stringify({ aplicado: APLICAR, sinDuplicar: SIN_DUPLICAR, incluirAdmin: INCLUIR_ADMIN, proyectos: resumen }, null, 2))
  } else {
    console.log('')
    console.log('  ' + (APLICAR ? 'APLICANDO CRÉDITO EN EL PIE' : 'SIMULACIÓN (no se escribe nada; añade --aplicar)'))
    if (SIN_DUPLICAR) console.log('  modo --sin-duplicar: no repite la marca ni el enlace que ya estén en el pie')
    console.log('  ' + '═'.repeat(66))
    for (const r of resumen) {
      const conCambio = r.detalle.filter((d) => d.estado === 'añadido')
      if (!conCambio.length) continue
      console.log('')
      console.log('  ' + r.proyecto + '   (páginas: ' + r.paginas + ' · a modificar: ' + r.modificados + ')')
      for (const d of conCambio) {
        console.log('     · ' + d.archivo + '  →  ' + d.partes + ' parte(s), privacidad ' + d.privacidad + ' → ' + d.href)
      }
    }
    const totalPaginas = resumen.reduce((t, r) => t + r.modificados, 0)
    const sinFooter = resumen.reduce((t, r) => t + r.detalle.filter((d) => /no tiene <footer>/.test(d.estado)).length, 0)
    const admin = resumen.reduce((t, r) => t + r.detalle.filter((d) => /página de panel/.test(d.estado)).length, 0)
    const yaTenia = resumen.reduce((t, r) => t + r.detalle.filter((d) => /ya tenía/.test(d.estado)).length, 0)
    console.log('')
    console.log('  ' + '─'.repeat(66))
    console.log('  proyectos con cambios  : ' + resumen.filter((r) => r.modificados).length)
    console.log('  páginas a modificar    : ' + totalPaginas)
    console.log('  páginas sin <footer>   : ' + sinFooter + ' (no se tocan: no se crean pies nuevos)')
    console.log('  páginas de panel       : ' + admin + (INCLUIR_ADMIN ? ' (incluidas por --incluir-admin)' : ' (omitidas)'))
    console.log('  páginas que ya cumplían: ' + yaTenia)
    console.log('')
  }
}
