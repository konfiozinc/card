#!/usr/bin/env node
/**
 * KZ-QA-CLIENTES-002 · Saneamiento de metadatos en los proyectos de clientes.
 *
 * Qué hace: recorre las páginas de los proyectos de clientes y ARREGLA SOLO EL <head>:
 *   · <title> limpio (sin el formato viejo «— Panel …», sin repetir la marca)
 *   · <meta name="description"> de 160 caracteres como máximo
 *   · Open Graph completo (og:title, og:description, og:image absoluta, og:type)
 *   · favicon SVG declarado y existente
 *
 * Qué NO hace: no toca <body>, ni CSS, ni JavaScript, ni textos, ni precios.
 * Tampoco publica nada: escribe en disco y nada más.
 *
 * Criterio de oro: **si una etiqueta ya está bien, no se toca**. Y el nombre del negocio sale
 * siempre del nombre de la carpeta del proyecto, no del texto de la página: así el resultado es
 * el mismo si se ejecuta una o diez veces (idempotente) y no se cuela un eslogan como título.
 *
 * Uso:
 *   node herramientas/sanear-metadatos-clientes.mjs                 # SIMULACIÓN (no escribe)
 *   node herramientas/sanear-metadatos-clientes.mjs --aplicar       # escribe los cambios
 *   node herramientas/sanear-metadatos-clientes.mjs --proyecto Nandy --aplicar
 *   node herramientas/sanear-metadatos-clientes.mjs --json          # resumen para máquina
 *   node herramientas/sanear-metadatos-clientes.mjs --raiz <carpeta> --aplicar  # otro workspace (pruebas)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')                 // repo card

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const SOLO_JSON = args.includes('--json')
const iProyecto = args.indexOf('--proyecto')
const FILTRO = iProyecto > -1 && args[iProyecto + 1] ? args[iProyecto + 1].toLowerCase() : null
// `--raiz` permite apuntar a otro workspace. Existe para poder probar el saneador contra una
// carpeta temporal sin tocar los proyectos reales (ver evidencias/KZ-QA-CLIENTES-002).
const iRaiz = args.indexOf('--raiz')
const WORKSPACE = iRaiz > -1 && args[iRaiz + 1] ? resolve(args[iRaiz + 1]) : resolve(RAIZ, '..', '..')

// Imagen de vista previa de la agencia: existe y es una URL absoluta de verdad.
const OG_IMAGEN = 'https://konfiozinc.github.io/card/assets/img/og/og-tarjetas-digitales.png'
const MARCA = 'KONFÍO ZINC'
const FAVICON_ORIGEN = resolve(RAIZ, 'assets', 'img', 'marca', 'favicon.svg')

const CARPETAS = [
  '1-TARJETAS-START', '2-TARJETAS-PRO', '3-TARJETAS-ELITE', '4-TARJETAS-PREMIUM',
  '5-MODELOS-TARJETAS', '6-LANDING-PAGES', '7-CATALOGOS', '8-MENUS-DIGITALES', '18-KONFIO-ZINC-STUDIO'
]
const IGNORAR = /(BACKUPS|HERRAMIENTAS-DESARROLLO|node_modules|\.git|_respaldos|_pendientes|_originales|capturas)/i

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const recortar = (t, n) => (t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…')

/** Nombre del negocio desde la carpeta: «Deicy Buitrago», «Nandy Nails», «CENTURY 21 Radial». */
function nombreDeCarpeta(carpeta) {
  return carpeta
    .replace(/_+/g, ' ')
    .replace(/(\S)-(?=\S)/g, '$1 ')   // «Nandy-Nails» → «Nandy Nails»; « - » se respeta
    .replace(/\s+/g, ' ')
    .trim()
}

/** Título de página desde el archivo: privacidad.html → «Política de privacidad». */
function tituloDeArchivo(archivo) {
  const base = basename(archivo, '.html').toLowerCase()
  const mapa = {
    privacidad: 'Política de privacidad',
    privacy: 'Política de privacidad',
    terminos: 'Términos y condiciones',
    'terminos-y-condiciones': 'Términos y condiciones',
    404: 'Página no encontrada',
    contacto: 'Contacto',
    admin: 'Panel de administración',
    galeria: 'Galería',
    servicios: 'Servicios',
    portafolio: 'Portafolio'
  }
  if (base === 'index') return null
  if (base in mapa) return mapa[base]
  const limpio = base.replace(/[-_]+/g, ' ').trim()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** ¿Está bien este <title>? Devuelve el motivo por el que NO sirve, o null si sirve. */
function defectoDelTitulo(cabecera) {
  const titulos = [...cabecera.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1].trim())
  if (!titulos.length) return 'sin <title>'
  if (titulos.length > 1) return titulos.length + ' etiquetas <title>'
  if (!titulos[0]) return '<title> vacío'
  if ((titulos[0].match(/KONF[ÍI]O\s*ZINC/gi) || []).length > 1) return 'el título repite la marca'
  if (/—\s*Panel\s+KONF/i.test(titulos[0])) return 'formato viejo «— Panel …»'
  return null
}

// ── Selección de proyectos y páginas: EXACTAMENTE la misma que el verificador ──
// Si las dos listas no coinciden, el saneador toca archivos que la puerta ni mira (informes dentro
// de `evidencias/`, por ejemplo) y el resultado deja de ser comparable. Estas constantes están
// copiadas de `verificar-calidad-html.js` a propósito.
const NO_ES_PROYECTO = [/node_modules/, /[\\/]\.git/, /[\\/]_originales/, /[\\/]_backup/, /[\\/]\.worktrees/, /[\\/]herramientas/, /[\\/]evidencias/]
const CARPETAS_IGNORADAS = [/BACKUPS/i, /HERRAMIENTAS-DESARROLLO/i, /^\./]
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

function proyectos() {
  const salida = []
  if (!existsSync(WORKSPACE)) return salida
  for (const carpeta of readdirSync(WORKSPACE, { withFileTypes: true })) {
    if (!carpeta.isDirectory() || !/^\d+-/.test(carpeta.name)) continue
    if (CARPETAS_IGNORADAS.some((rx) => rx.test(carpeta.name))) continue
    const base = join(WORKSPACE, carpeta.name)
    for (const proyecto of readdirSync(base, { withFileTypes: true })) {
      if (!proyecto.isDirectory()) continue
      const dir = join(base, proyecto.name)
      if (resolve(dir) === resolve(RAIZ)) continue          // el sitio card se audita aparte
      if (NO_ES_PROYECTO.some((rx) => rx.test(dir))) continue
      if (!existsSync(join(dir, 'index.html'))) continue
      const htmls = paginasDe(dir)
      if (!htmls.length) continue
      const nombre = carpeta.name + '/' + proyecto.name
      if (FILTRO && !nombre.toLowerCase().includes(FILTRO)) continue
      salida.push({ proyecto: nombre, dir, htmls })
    }
  }
  return salida.sort((a, b) => a.proyecto.localeCompare(b.proyecto))
}

/** Profundidad de la página respecto de la raíz del proyecto (0 = está en la raíz). */
function profundidadDe(archivo, dirProyecto) {
  const rel = relative(dirProyecto, dirname(archivo))
  if (!rel || rel === '.') return 0
  return rel.split(/[\\/]/).filter(Boolean).length
}

/** Ruta relativa correcta desde la página hasta un archivo que vive en la raíz del proyecto. */
function rutaDesdeRaiz(archivo, dirProyecto, destino) {
  return relative(dirname(archivo), join(dirProyecto, destino)).replace(/\\/g, '/')
}

/**
 * Parte el documento en trozos de marcado y trozos de código (`<script>` / `<style>`).
 *
 * Hace falta porque dentro de un `<script>` la cadena `'<img src="' + urlImagen(p) + '" onerror="…">'`
 * es JavaScript, no una etiqueta. La primera versión de este saneador la trató como etiqueta y
 * borró la foto de los productos de Colsabor y de El Titi: la puerta de calidad no lo veía porque
 * el HTML seguía siendo válido, pero el menú se quedaba sin fotos.
 */
function trozosDeMarcado(texto) {
  const trozos = []
  const rx = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
  let pos = 0
  let m
  while ((m = rx.exec(texto)) !== null) {
    if (m.index > pos) trozos.push({ marcado: true, texto: texto.slice(pos, m.index) })
    trozos.push({ marcado: false, texto: m[0] })
    pos = m.index + m[0].length
  }
  if (pos < texto.length) trozos.push({ marcado: true, texto: texto.slice(pos) })
  return trozos
}

/** Aplica una transformación SOLO a las zonas de marcado, dejando el código intacto. */
function soloEnMarcado(texto, transformar) {
  return trozosDeMarcado(texto)
    .map((t) => (t.marcado ? transformar(t.texto) : t.texto))
    .join('')
}

/**
 * Segunda pasada sobre el texto completo: arregla lo que el <head> no resuelve.
 *   · meta description demasiado larga  → se reemplaza el contenido
 *   · rutas relativas rotas (iconos e imágenes de páginas en subcarpetas) → prefijo correcto
 *   · iconos que apuntan a archivos que no existen → se quitan
 *   · <img> sin ningún alt → alt="" (decorativa; no cambia nada visual)
 * Nunca toca el interior de `<script>` ni de `<style>`.
 * Devuelve el texto nuevo y la lista de lo que hizo.
 */
function segundaPasada(texto, archivo, dirProyecto, descLarga) {
  const hechos = []
  let out = texto

  // · descripción larga
  if (descLarga) {
    const antes = out
    out = soloEnMarcado(out, (trozo) =>
      trozo.replace(/(<meta[^>]+name="description"[^>]+content=")([^"]*)(")/i, (m, a, _v, c) => a + escapara(descLarga) + c)
    )
    if (out !== antes) hechos.push('description acortada a ' + descLarga.length + ' caracteres')
  }

  const prof = profundidadDe(archivo, dirProyecto)
  const existeAqui = (ruta) => {
    if (/^(https?:|data:|#|mailto:|tel:)/i.test(ruta)) return true
    return existsSync(resolve(dirname(archivo), ruta.split('?')[0].split('#')[0]))
  }
  const existeEnRaiz = (ruta) => {
    const limpia = ruta.split('?')[0].split('#')[0]
    if (existsSync(join(dirProyecto, limpia))) return true
    /* El propio saneador copia `favicon.svg` a la raíz del proyecto al terminar la página. Si no se
       contara como existente, esta pasada borraría el enlace que el <head> acaba de declarar y el
       proyecto se quedaría sin icono hasta una segunda ejecución. */
    return /^favicon\.svg$/i.test(limpia) && existsSync(FAVICON_ORIGEN)
  }

  // · iconos: corregir la ruta o quitarlos si no existen en ningún sitio
  out = soloEnMarcado(out, (trozo) =>
    trozo.replace(/<link\b[^>]*rel="[^"]*icon[^"]*"[^>]*>/gi, (tag) => {
      const href = (tag.match(/href="([^"]+)"/i) || [])[1]
      if (!href || existeAqui(href)) return tag
      if (existeEnRaiz(href)) {
        const nuevo = (prof ? '../'.repeat(prof) : '') + href.replace(/^\.\//, '')
        hechos.push('icono corregido: ' + href + ' → ' + nuevo)
        return tag.replace(/href="[^"]+"/i, 'href="' + nuevo + '"')
      }
      hechos.push('icono quitado (no existe): ' + href)
      return ''
    })
  )

  // · imágenes con src relativo roto: si el archivo está en la raíz del proyecto, se corrige
  out = soloEnMarcado(out, (trozo) =>
    trozo.replace(/<img\b([^>]*)>/gi, (tag, attrs) => {
      const src = (attrs.match(/(?<![:\w-])src\s*=\s*"([^"]*)"/) || [])[1]
      if (src && !existeAqui(src)) {
        if (existeEnRaiz(src)) {
          const nuevo = (prof ? '../'.repeat(prof) : '') + src.replace(/^\.\//, '')
          hechos.push('imagen corregida: ' + src + ' → ' + nuevo)
          tag = tag.replace(/(?<![:\w-])src\s*=\s*"[^"]*"/, 'src="' + nuevo + '"')
        } else if (/onerror\s*=/i.test(attrs)) {
          /* El archivo no existe en NINGUNA parte del proyecto y la propia etiqueta ya se oculta a sí
             misma cuando falla (`onerror`): nunca se ha visto en pantalla. Se quita la referencia
             rota en vez de dejar una imagen que no carga. No cambia nada visible. */
          hechos.push('imagen quitada (archivo inexistente y ya oculta): ' + src)
          return ''
        }
      }
      // · alt
      if (!/\balt\s*=/i.test(attrs)) {
        hechos.push('alt añadido (decorativa)')
        tag = tag.replace(/<img\b/i, '<img alt=""')
      }
      return tag
    })
  )

  return { texto: out, hechos }
}

function escapara(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plan de cambios de una página. No escribe nada. */
function planearPagina(archivo, dirProyecto) {
  const texto = readFileSync(archivo, 'utf8')
  const fin = texto.search(/<\/head>/i)
  if (fin < 0) return { archivo, omitido: 'no tiene </head>' }
  const cabecera = texto.slice(0, fin)

  const negocio = nombreDeCarpeta(basename(dirProyecto))
  const tituloPagina = tituloDeArchivo(archivo)
  const esIndex = tituloPagina === null

  const cambios = []
  const agregar = []

  // ── 1 · <title> (solo si está mal) ──────────────────────────────────────
  const defecto = defectoDelTitulo(cabecera)
  if (defecto) {
    const nuevo = esIndex
      ? recortar(negocio, 60)
      : recortar(tituloPagina + ' · ' + negocio, 70)
    cambios.push({ que: 'title', motivo: defecto, despues: nuevo })
  }

  // ── 2 · meta description (solo si falta o se pasa de 160) ───────────────
  const descActual = (cabecera.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [])[1]
  const descNueva = esIndex
    ? recortar('Tarjeta digital de ' + negocio + ': contacto, servicios y ubicación en un solo enlace. Creada por ' + MARCA + '.', 160)
    : recortar(tituloPagina + ' de ' + negocio + '. Tarjeta digital creada por ' + MARCA + '.', 160)
  const descHayQuePoner = !descActual || !descActual.trim()
  /* Si existe pero se pasa de 160, se RECORTA el texto del cliente por palabra completa: sus
     palabras se conservan y solo se corta el final. Sustituirla por una descripción genérica
     borraría texto del cliente (lista de platos, ciudad, especialidad…) y eso no es saneamiento. */
  const descLarga = descActual && descActual.trim() && descActual.length > 160 ? recortar(descActual.trim(), 160) : null
  if (descHayQuePoner || descLarga) {
    const resultado = descHayQuePoner ? descNueva : descLarga
    cambios.push({ que: 'meta description', motivo: descActual ? descActual.length + ' caracteres' : 'no hay', despues: resultado.length + ' car.' })
    if (descHayQuePoner) agregar.push(`<meta name="description" content="${escapar(descNueva)}">`)
  }
  const descFinal = descHayQuePoner ? descNueva : descLarga || descActual

  // ── 3 · Open Graph (solo lo que falte o esté mal) ───────────────────────
  const og = {}
  for (const m of cabecera.matchAll(/<meta[^>]+property="(og:[^"]+)"[^>]+content="([^"]*)"/gi)) og[m[1]] = m[2]

  const ogTitulo = recortar(esIndex ? negocio : tituloPagina + ' · ' + negocio, 70)
  const faltan = []
  if (!og['og:title']) faltan.push('og:title')
  if (!og['og:description']) faltan.push('og:description')
  if (!og['og:image']) faltan.push('og:image')
  if (!og['og:type']) faltan.push('og:type')
  if (og['og:image'] && !/^https?:\/\//i.test(og['og:image'])) faltan.push('og:image no absoluta')

  if (!og['og:title']) agregar.push(`<meta property="og:title" content="${escapar(ogTitulo)}">`)
  if (!og['og:description']) agregar.push(`<meta property="og:description" content="${escapar(descFinal)}">`)
  if (!og['og:image'] || !/^https?:\/\//i.test(og['og:image'])) {
    agregar.push(`<meta property="og:image" content="${OG_IMAGEN}">`)
    agregar.push(`<meta property="og:image:width" content="1200">`)
    agregar.push(`<meta property="og:image:height" content="630">`)
  }
  if (!og['og:type']) agregar.push(`<meta property="og:type" content="website">`)
  if (!og['og:site_name']) agregar.push(`<meta property="og:site_name" content="${escapar(MARCA)}">`)
  if (!og['og:locale']) agregar.push(`<meta property="og:locale" content="es_CO">`)
  if (faltan.length) cambios.push({ que: 'Open Graph', motivo: faltan.join(', '), despues: 'completado' })

  // ── 4 · favicon SVG (el archivo se crea en la raíz del proyecto) ────────
  const iconos = [...cabecera.matchAll(/<link[^>]+rel="[^"]*icon[^"]*"[^>]*href="([^"]+)"/gi)].map((m) => m[1])
  const iconosReales = iconos.filter((h) => !/^data:/i.test(h))
  const haySvgValido = iconosReales.some((h) => {
    if (!/\.svg($|\?)/i.test(h)) return false
    return /^https?:/i.test(h) || existsSync(resolve(dirname(archivo), h.split('?')[0]))
  })
  if (!haySvgValido) {
    const rutaRelativa = relative(dirname(archivo), join(dirProyecto, 'favicon.svg')).replace(/\\/g, '/')
    agregar.push(`<link rel="icon" type="image/svg+xml" href="${rutaRelativa}">`)
    cambios.push({ que: 'favicon SVG', motivo: iconosReales.length ? 'el declarado no sirve' : 'no hay', despues: rutaRelativa })
  }

  if (!cambios.length) return { archivo, cambios: [], hayCambios: false }
  return { archivo, cambios, agregar, hayCambios: true, texto, fin, negocio, descLarga, dirProyecto }
}

/** Escribe los cambios en el texto: arregla el <title>, quita duplicados e inserta lo nuevo. */
function aplicarCambios(pagina) {
  let cabecera = pagina.texto.slice(0, pagina.fin)
  const resto = pagina.texto.slice(pagina.fin)
  const cTitle = pagina.cambios.find((c) => c.que === 'title')
  if (cTitle) {
    const nuevo = `<title>${escapar(cTitle.despues)}</title>`
    const titulos = [...cabecera.matchAll(/<title>[\s\S]*?<\/title>/gi)]
    if (titulos.length) {
      cabecera = cabecera.replace(titulos[0][0], nuevo)
      for (const extra of titulos.slice(1)) cabecera = cabecera.replace(extra[0], '')
    } else {
      cabecera = /<meta\s+charset/i.test(cabecera)
        ? cabecera.replace(/(<meta\s+charset[^>]*>)/i, '$1\n    ' + nuevo)
        : cabecera + '\n    ' + nuevo
    }
  }
  if (pagina.agregar?.length) {
    cabecera = cabecera.replace(/\s*$/, '') + '\n    ' + pagina.agregar.join('\n    ') + '\n'
  }
  return cabecera + resto
}

/** Texto final de la página: cabecera arreglada + segunda pasada (rutas, iconos, alt). */
function textoFinal(plan) {
  const conCabecera = aplicarCambios(plan)
  return segundaPasada(conCabecera, plan.archivo, plan.dirProyecto, plan.descLarga)
}

// ── Ejecución ──────────────────────────────────────────────────────────────
const resumen = []

for (const p of proyectos()) {
  const detalle = []
  let paginasConCambios = 0
  let modificados = 0

  for (const archivo of p.htmls) {
    const plan = planearPagina(archivo, p.dir)
    if (plan.omitido) { detalle.push({ archivo: relative(p.dir, archivo), omitido: plan.omitido }); continue }
    // La segunda pasada (rutas rotas, iconos, alt) se ejecuta SIEMPRE, aunque la cabecera ya esté
    // bien: son problemas independientes del <head>. Si no, una página «con la cabecera perfecta»
    // se quedaba con las imágenes rotas.
    if (!plan.hayCambios) {
      Object.assign(plan, { cambios: [], agregar: [], hayCambios: false, texto: readFileSync(archivo, 'utf8'), fin: readFileSync(archivo, 'utf8').search(/<\/head>/i), dirProyecto: p.dir, descLarga: null })
      if (plan.fin < 0) { detalle.push({ archivo: relative(p.dir, archivo), omitido: 'no tiene </head>' }); continue }
    }
    const { texto, hechos } = textoFinal(plan)
    if (!plan.cambios.length && !hechos.length) continue
    if (hechos.length) plan.cambios.push({ que: 'otras correcciones', motivo: hechos.join(' · '), despues: hechos.length + ' ajuste(s)' })
    paginasConCambios += 1
    detalle.push({ archivo: relative(p.dir, archivo), cambios: plan.cambios })
    if (APLICAR) { writeFileSync(archivo, texto, 'utf8'); modificados += 1 }
  }

  let faviconCreado = false
  const declaraFavicon = detalle.some((d) => d.cambios?.some((c) => c.que.startsWith('favicon')))
  if (declaraFavicon && !existsSync(join(p.dir, 'favicon.svg'))) {
    if (APLICAR) {
      mkdirSync(p.dir, { recursive: true })
      copyFileSync(FAVICON_ORIGEN, join(p.dir, 'favicon.svg'))
    }
    faviconCreado = true
  }

  if (paginasConCambios || faviconCreado) {
    resumen.push({ proyecto: p.proyecto, paginas: p.htmls.length, paginasConCambios, modificados, faviconCreado, detalle })
  }
}

// ── Informe ────────────────────────────────────────────────────────────────
if (SOLO_JSON) {
  console.log(JSON.stringify({ aplicado: APLICAR, proyectos: resumen }, null, 2))
} else {
  console.log('')
  console.log('  ' + (APLICAR ? 'APLICANDO CAMBIOS' : 'SIMULACIÓN (no se escribe nada; añade --aplicar)'))
  console.log('  ' + '═'.repeat(66))
  for (const r of resumen) {
    console.log('')
    console.log('  ' + r.proyecto)
    console.log('     páginas: ' + r.paginas + ' · a corregir: ' + r.paginasConCambios + (r.faviconCreado ? ' · favicon.svg nuevo' : ''))
    for (const d of r.detalle) {
      if (d.omitido) { console.log('       ! ' + d.archivo + ' → ' + d.omitido); continue }
      console.log('       · ' + d.archivo + '  →  ' + d.cambios.map((c) => c.que).join(', '))
    }
  }
  console.log('')
  console.log('  ' + '─'.repeat(66))
  console.log('  proyectos con cambios : ' + resumen.length)
  console.log('  páginas a corregir    : ' + resumen.reduce((t, r) => t + r.paginasConCambios, 0))
  console.log('  favicons a crear      : ' + resumen.filter((r) => r.faviconCreado).length)
  console.log('')
}
