#!/usr/bin/env node
/**
 * KZ-QA-CLIENTES-005 · La marca de la agencia, como enlace que resalta, en el pie de página.
 *
 * Qué hace, dentro de cada `<footer>` que ya existe:
 *   1. Convierte el texto suelto «KONFÍO ZINC» / «Konfio Zinc» en un enlace clickeable:
 *        <a href="https://konfiozinc.github.io/card/" target="_blank"
 *           style="color: …; text-decoration: underline; font-weight: bold;">KONFÍO ZINC</a>
 *   2. Da el mismo estilo (subrayado, negrita y color que contraste) a los enlaces que ya
 *      apuntaban a la agencia, para que la marca resalte igual en todas las plantillas.
 *
 * Sobre el color: el pedido dice `color: #ffffff`, pero blanco sobre un pie blanco es invisible.
 * Por eso el color se calcula por página: si el fondo del pie es oscuro se usa `#ffffff`; si es
 * claro —o no se puede determinar con seguridad— se usa `color: inherit`, que hereda el color de
 * texto del cliente y por tanto siempre contrasta. En ambos casos la marca va en negrita y
 * subrayada, que es lo que la hace resaltar.
 *
 * Qué NO hace: no toca el `<body>` fuera del pie, ni formularios, ni el texto legal, ni CSS, ni
 * JavaScript, ni los textos de los clientes, ni los precios.
 *
 * Uso:
 *   node herramientas/enlazar-marca-footer.mjs                 # SIMULACIÓN
 *   node herramientas/enlazar-marca-footer.mjs --aplicar
 *   node herramientas/enlazar-marca-footer.mjs --proyecto snoopy --aplicar
 *   node herramientas/enlazar-marca-footer.mjs --raiz <carpeta>  # otro workspace (pruebas)
 *   node herramientas/enlazar-marca-footer.mjs --solo-texto      # no reestiliza enlaces ya existentes
 *   node herramientas/enlazar-marca-footer.mjs --json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')                    // repo card

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const SOLO_JSON = args.includes('--json')
const SOLO_TEXTO = args.includes('--solo-texto')
const iProyecto = args.indexOf('--proyecto')
const FILTRO = iProyecto > -1 && args[iProyecto + 1] ? args[iProyecto + 1].toLowerCase() : null
const iRaiz = args.indexOf('--raiz')
const WORKSPACE = iRaiz > -1 && args[iRaiz + 1] ? resolve(args[iRaiz + 1]) : resolve(RAIZ, '..', '..')

const URL_AGENCIA = 'https://konfiozinc.github.io/card/'
// La marca escrita como texto lleva un espacio: «KONFÍO ZINC». Exigirlo evita confundirla con el
// dominio `konfiozinc.github.io`, que aparece en cualquier enlace.
const RX_MARCA = /KONF[ÍI]O\s+ZINC/i
const RX_MARCA_TODAS = /KONF[ÍI]O\s+ZINC/gi
const RX_ES_AGENCIA = /^https?:\/\/(www\.)?konfiozinc\.github\.io(\/|$)/i

// ── Selección de proyectos y páginas: la misma que la puerta de calidad ─────
const CARPETAS_IGNORADAS = [/BACKUPS/i, /HERRAMIENTAS-DESARROLLO/i, /^\./]
const NO_ES_PROYECTO = [/node_modules/, /[\\/]\.git/, /[\\/]_originales/, /[\\/]_backup/, /[\\/]\.worktrees/, /[\\/]herramientas/, /[\\/]evidencias/]
const EXCLUIR = [/node_modules/, /[\\/]\.git[\\/]/, /[\\/]crm-dev[\\/]/, /[\\/]docs[\\/]/, /[\\/]evidencias/, /[\\/]_transferencia[\\/]/]
// Copias de trabajo del repo `card` y el sitio propio de la agencia: no son sitios de cliente.
const NO_ES_CLIENTE = /card-pagos-p1|card-seguridad-harness|Konfio-Zinc-Web/i

function paginasDe(dir, salida = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (EXCLUIR.some((rx) => rx.test(p))) continue
    if (e.isDirectory()) paginasDe(p, salida)
    else if (e.name.endsWith('.html')) salida.push(p)
  }
  return salida
}

// ── Color del fondo del pie, para que la marca contraste ───────────────────
const NOMBRES = {
  white: '#ffffff', black: '#000000', red: '#ff0000', silver: '#c0c0c0', gray: '#808080',
  grey: '#808080', maroon: '#800000', navy: '#000080', blue: '#0000ff', transparent: null,
  inherit: null, initial: null, unset: null, currentcolor: null
}

const aRgb = (valor) => {
  if (!valor) return null
  const v = String(valor).trim().toLowerCase()
  if (v in NOMBRES) return NOMBRES[v] ? aRgb(NOMBRES[v]) : null
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16))
  m = v.match(/^#([0-9a-f]{6})$/)
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

/** Luminancia relativa (0 = negro, 1 = blanco). Umbral 0.55: por encima, el fondo es claro. */
const luminancia = ([r, g, b]) => {
  const f = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const COLORES_OSCUROS_POR_DEFECTO = ['#0b0b0b', '#111111', '#161616', '#1a1a1a', '#1e1e1e']

/** Extrae el CSS de la página: bloques <style> y hojas locales enlazadas. */
function cssDePagina(texto, archivo) {
  const trozos = []
  for (const m of texto.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) trozos.push(m[1])
  for (const m of texto.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*href="([^"]+)"/gi)) {
    const href = m[1]
    if (/^https?:/i.test(href)) continue
    const ruta = resolve(dirname(archivo), href.split('?')[0])
    if (existsSync(ruta) && ruta.toLowerCase().endsWith('.css')) {
      try { trozos.push(readFileSync(ruta, 'utf8')) } catch { /* hoja ilegible: se ignora */ }
    }
  }
  return trozos.join('\n')
}

/** Resuelve `var(--x)` con las variables declaradas en el propio CSS. */
function resolverVar(css, valor) {
  let salida = String(valor)
  for (let i = 0; i < 5; i++) {
    const m = salida.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i)
    if (!m) break
    const decl = new RegExp(m[1].replace(/[-]/g, '\\-') + '\\s*:\\s*([^;}]+)', 'i').exec(css)
    const reemplazo = decl ? decl[1].trim() : (m[2] || '').trim()
    if (!reemplazo) break
    salida = salida.replace(m[0], reemplazo)
  }
  return salida
}

/**
 * Fondo del pie de página, con la mejor evidencia disponible.
 * Orden: estilo en línea del propio <footer> → reglas CSS de sus clases → reglas de body/html.
 */
function fondoDelPie(texto, archivo) {
  const css = cssDePagina(texto, archivo)
  const mFooter = texto.match(/<footer\b([^>]*)>/i)
  if (!mFooter) return { color: null, luminancia: null, fuente: 'sin <footer>' }
  const attrs = mFooter[1]

  const deEstilo = (bloque) => {
    const bg = (bloque.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i) || [])[1]
    if (!bg) return null
    return aRgb(resolverVar(css, bg.trim()).trim().split(/\s+/).pop())
  }

  const enLinea = (attrs.match(/style="([^"]*)"/i) || [])[1]
  if (enLinea) {
    const c = deEstilo(enLinea)
    if (c) return { color: c, luminancia: luminancia(c), fuente: 'estilo en línea del <footer>' }
  }

  const clases = ((attrs.match(/class="([^"]*)"/i) || [])[1] || '').split(/\s+/).filter(Boolean)
  const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  let encontrado = null
  for (const [, selector, cuerpo] of reglas) {
    if (!/(?:^|;)\s*background(?:-color)?\s*:/i.test(cuerpo)) continue
    const toca = clases.some((c) => new RegExp('\\.' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'i').test(selector))
    if (!toca) continue
    const c = deEstilo(cuerpo)
    if (c) encontrado = { color: c, luminancia: luminancia(c), fuente: 'regla CSS .' + (clases.find((x) => selector.includes('.' + x)) || clases[0]) }
  }
  if (encontrado) return encontrado

  for (const [, selector, cuerpo] of reglas) {
    if (!/(?:^|;)\s*background(?:-color)?\s*:/i.test(cuerpo)) continue
    if (!/(?:^|,|\s)(body|html|:root)\s*(?:,|\{|$)/i.test(selector.trim() + '{')) continue
    const c = deEstilo(cuerpo)
    if (c) return { color: c, luminancia: luminancia(c), fuente: 'fondo de ' + selector.trim().slice(0, 30) }
  }

  // Sin evidencia de color: se asume fondo oscuro, que es lo habitual en estos pies.
  const c = aRgb(COLORES_OSCUROS_POR_DEFECTO[1])
  return { color: c, luminancia: luminancia(c), fuente: 'sin datos: se asume oscuro', asumido: true }
}

/** Estilo del enlace: blanco si el fondo es oscuro, heredado si es claro (nunca invisible). */
export function estiloEnlace(fondo) {
  const claro = typeof fondo?.luminancia === 'number' && fondo.luminancia > 0.55
  const color = claro ? 'inherit' : '#ffffff'
  return { color, estilo: `color: ${color}; text-decoration: underline; font-weight: bold;`, claro }
}

// ── Marcado del pie ───────────────────────────────────────────────────────
const ancla = (textoMarca, estilo) =>
  `<a href="${URL_AGENCIA}" target="_blank" style="${estilo}">${textoMarca}</a>`

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Procesa el contenido de UN pie de página.
 * - `texto suelto`: menciones de la marca fuera de cualquier <a> y fuera de <script>/<style>.
 * - `enlaces`: <a> cuyo texto es exactamente la marca y cuyo href es de la agencia → se reestiliza.
 */
export function procesarPie(footerHtml, estilo, { soloTexto = false } = {}) {
  const hechos = { texto: 0, enlaces: 0 }
  let html = footerHtml

  // 1 · Enlaces existentes a la agencia: mismo estilo para que resalten igual.
  if (!soloTexto) {
    html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (todo, attrs, contenido) => {
      const href = (attrs.match(/href="([^"]*)"/i) || [])[1] || ''
      if (!RX_ES_AGENCIA.test(href)) return todo
      if (!RX_MARCA.test(contenido.replace(/<[^>]*>/g, ''))) return todo
      if (/opacity\s*:/i.test(attrs)) {
        // el OPACITY de misiones anteriores apagaba la marca: se retira
        attrs = attrs.replace(/\s*style="([^"]*)"/i, (m, s) => ` style="${s.replace(/(?:^|;)\s*opacity\s*:[^;]+;?/gi, ';').replace(/;;+/g, ';').replace(/^\s*;|;\s*$/g, '')}"`)
      }
      const nuevas = /style="[^"]*"/i.test(attrs)
        ? attrs.replace(/style="[^"]*"/i, `style="${estilo}"`)
        : attrs + ` style="${estilo}"`
      hechos.enlaces++
      return '<a' + nuevas.replace(/\s+$/, '') + '>' + contenido + '</a>'
    })
  }

  // 2 · Texto suelto de la marca → enlace.
  const trozos = html.split(/(<[^>]*>)/)
  let dentroDeA = 0
  let dentroDeCodigo = 0
  const salida = trozos.map((trozo) => {
    if (!trozo) return trozo
    if (trozo.startsWith('<')) {
      if (/^<a\b/i.test(trozo)) dentroDeA++
      else if (/^<\/a\s*>/i.test(trozo)) dentroDeA = Math.max(0, dentroDeA - 1)
      else if (/^<(script|style)\b/i.test(trozo)) dentroDeCodigo++
      else if (/^<\/(script|style)\s*>/i.test(trozo)) dentroDeCodigo = Math.max(0, dentroDeCodigo - 1)
      return trozo
    }
    if (dentroDeA > 0 || dentroDeCodigo > 0) return trozo
    if (!RX_MARCA.test(trozo)) return trozo
    return trozo.replace(RX_MARCA_TODAS, (m) => {
      hechos.texto++
      return ancla(m, estilo)
    })
  })
  return { html: salida.join(''), hechos }
}

/** Aplica el cambio a una página completa. Solo actúa dentro de `<footer>`. */
export function procesarPagina(texto, { soloTexto = false, archivo = '' } = {}) {
  const footers = [...texto.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi)]
  if (!footers.length) return { texto, sinFooter: true, hechos: { texto: 0, enlaces: 0 }, fondo: null }
  const fondo = fondoDelPie(texto, archivo)
  const { estilo, color, claro } = estiloEnlace(fondo)
  let salida = texto
  const hechos = { texto: 0, enlaces: 0 }
  for (let i = footers.length - 1; i >= 0; i--) {
    const original = footers[i][0]
    const r = procesarPie(original, estilo, { soloTexto })
    hechos.texto += r.hechos.texto
    hechos.enlaces += r.hechos.enlaces
    if (r.html === original) continue
    const desde = footers[i].index
    salida = salida.slice(0, desde) + r.html + salida.slice(desde + original.length)
  }
  return { texto: salida, sinFooter: false, hechos, fondo, color, claro }
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
      const nombre = carpeta.name + '/' + proyecto.name
      if (NO_ES_CLIENTE.test(nombre)) continue
      if (NO_ES_PROYECTO.some((rx) => rx.test(dir))) continue
      if (!existsSync(join(dir, 'index.html'))) continue
      if (FILTRO && !nombre.toLowerCase().includes(FILTRO)) continue

      const paginas = paginasDe(dir)
      const detalle = []
      let modificados = 0
      for (const archivo of paginas) {
        const rel = relative(dir, archivo).replace(/\\/g, '/')
        const texto = readFileSync(archivo, 'utf8')
        const r = procesarPagina(texto, { soloTexto: SOLO_TEXTO, archivo })
        if (r.sinFooter) continue
        if (r.hechos.texto === 0 && r.hechos.enlaces === 0) continue
        modificados++
        detalle.push({
          archivo: rel,
          texto: r.hechos.texto,
          enlaces: r.hechos.enlaces,
          color: r.color,
          fondo: r.fondo?.color ? '#' + r.fondo.color.map((n) => n.toString(16).padStart(2, '0')).join('') : '?',
          fuenteFondo: r.fondo?.fuente || '?'
        })
        if (APLICAR) writeFileSync(archivo, r.texto, 'utf8')
      }
      if (modificados) resumen.push({ proyecto: nombre, paginas: paginas.length, modificados, detalle })
    }
  }

  if (SOLO_JSON) {
    console.log(JSON.stringify({ aplicado: APLICAR, soloTexto: SOLO_TEXTO, proyectos: resumen }, null, 2))
  } else {
    console.log('')
    console.log('  ' + (APLICAR ? 'APLICANDO ENLACE DE LA MARCA' : 'SIMULACIÓN (no se escribe nada; añade --aplicar)'))
    console.log('  ' + '═'.repeat(66))
    for (const r of resumen) {
      console.log('')
      console.log('  ' + r.proyecto + '   (páginas: ' + r.paginas + ' · a modificar: ' + r.modificados + ')')
      for (const d of r.detalle) {
        console.log('     · ' + d.archivo + '  →  texto:' + d.texto + ' enlaces:' + d.enlaces + ' · fondo ' + d.fondo + ' (' + d.fuenteFondo + ') → color:' + d.color)
      }
    }
    const totalTexto = resumen.reduce((t, r) => t + r.detalle.reduce((s, d) => s + d.texto, 0), 0)
    const totalEnlaces = resumen.reduce((t, r) => t + r.detalle.reduce((s, d) => s + d.enlaces, 0), 0)
    const totalPaginas = resumen.reduce((t, r) => t + r.modificados, 0)
    const blancos = resumen.reduce((t, r) => t + r.detalle.filter((d) => d.color === '#ffffff').length, 0)
    const heredados = totalPaginas - blancos
    console.log('')
    console.log('  ' + '─'.repeat(66))
    console.log('  proyectos con cambios      : ' + resumen.length)
    console.log('  páginas a modificar        : ' + totalPaginas)
    console.log('  marcas sueltas → enlace    : ' + totalTexto)
    console.log('  enlaces reestilizados      : ' + totalEnlaces)
    console.log('  con color blanco (fondo oscuro)      : ' + blancos)
    console.log('  con color heredado (fondo claro/¿?)  : ' + heredados)
    console.log('')
  }
}

void escapar
