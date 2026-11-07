#!/usr/bin/env node
/**
 * KZ-QA-CLIENTES-007 · «Toque pro» de SEO y metadatos en los proyectos de clientes.
 *
 * Solo toca el <head> del `index.html` de cada proyecto de cliente. Concretamente:
 *
 *   1. `<link rel="icon" type="image/png" href="…">` → declara el LOGO DEL CLIENTE como icono
 *      (si ya hay uno declarado con el mismo archivo, no se duplica).
 *   2. `og:url` → la URL publicada del sitio (`https://konfiozinc.github.io/<repo>/`).
 *   3. `og:image` → si apuntaba a la imagen de la AGENCIA, se cambia por una imagen del cliente
 *      (su propia og-image si existe; si no, su logo) y se corrigen `og:image:width/height` a las
 *      medidas reales de esa imagen.
 *   4. `<title>` y `<meta description>` → **no se reescriben si ya son válidos**: solo se rellenan
 *      si faltan o si incumplen el estándar (título vacío/duplicado, descripción de más de 160).
 *
 * Qué NO hace: no toca el cuerpo, ni el CSS, ni el JavaScript, ni los textos de las páginas.
 *
 * Necesita las medidas de las imágenes (para no mentir en og:image:width/height):
 *   node evidencias/KZ-QA-CLIENTES-007/medir-creativas.mjs   →  crea creativas-medidas.json
 *
 * Uso:
 *   node herramientas/mejorar-seo-clientes.mjs --medidas <ruta/creativas-medidas.json>            # simulación
 *   node herramientas/mejorar-seo-clientes.mjs --medidas <ruta/…> --aplicar
 *   node herramientas/mejorar-seo-clientes.mjs --medidas <ruta/…> --proyecto nandy --aplicar
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')                    // repo card

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const SOLO_JSON = args.includes('--json')
const iProyecto = args.indexOf('--proyecto')
const FILTRO = iProyecto > -1 && args[iProyecto + 1] ? args[iProyecto + 1].toLowerCase() : null
const iRaiz = args.indexOf('--raiz')
const WORKSPACE = iRaiz > -1 && args[iRaiz + 1] ? resolve(args[iRaiz + 1]) : resolve(RAIZ, '..', '..')
const iMedidas = args.indexOf('--medidas')
const MEDIDAS = iMedidas > -1 && args[iMedidas + 1] ? JSON.parse(readFileSync(resolve(args[iMedidas + 1]), 'utf8')) : {}

const ES_IMAGEN_AGENCIA = /konfiozinc\.github\.io\/card\/assets\/img\/og\//i
const MARCA = 'KONFÍO ZINC'

// ── Selección: la misma que la puerta de calidad, sin copias del repo card ──
const CARPETAS_IGNORADAS = [/BACKUPS/i, /HERRAMIENTAS-DESARROLLO/i, /^\./]
const NO_ES_PROYECTO = [/node_modules/, /[\\/]\.git/, /[\\/]_originales/, /[\\/]_backup/, /[\\/]\.worktrees/, /[\\/]herramientas/, /[\\/]evidencias/]
const NO_ES_CLIENTE = /card-pagos-p1|card-seguridad-harness|Konfio-Zinc-Web/i

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const recortar = (t, n) => (t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…')
const nombreDeCarpeta = (c) => c.replace(/_+/g, ' ').replace(/(\S)-(?=\S)/g, '$1 ').replace(/\s+/g, ' ').trim()

const unMeta = (cab, nombre, attr = 'name') => {
  for (const m of cab.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const clave = (tag.match(new RegExp(attr + '="([^"]*)"', 'i')) || [])[1]
    if (clave && clave.toLowerCase() === nombre.toLowerCase()) return tag
  }
  return null
}

/** Plan de cambios del <head> de una página. No escribe nada. */
function planear(archivo, dirProyecto, medidasProyecto) {
  const texto = readFileSync(archivo, 'utf8')
  const fin = texto.search(/<\/head>/i)
  if (fin < 0) return { archivo, omitido: 'no tiene </head>' }
  const cabecera = texto.slice(0, fin)
  const cambios = []
  const agregar = []
  let cab = cabecera

  // ── 1 · favicon con el logo del cliente ────────────────────────────────
  const logo = medidasProyecto?.logo || null
  if (logo) {
    /* Cuenta como «ya declarado» cualquier icono raster (PNG, WebP o JPEG), no solo PNG: si no, se
       añadía la misma línea dos veces en los proyectos que usan WebP. */
    const iconosRaster = [...cab.matchAll(/<link\b[^>]*rel="[^"]*icon[^"]*"[^>]*>/gi)]
      .map((m) => m[0])
      .filter((t) => /type="image\/(png|webp|jpe?g|gif)"/i.test(t))
    if (!iconosRaster.length) {
      /* El tipo MIME se declara según el archivo real: poner type="image/png" a un .webp o a un .jpeg
         sería mentirle al navegador y algunos no lo cargarían. */
      const tipo = /\.png$/i.test(logo.ruta) ? 'image/png' : /\.webp$/i.test(logo.ruta) ? 'image/webp' : 'image/jpeg'
      agregar.push(`<link rel="icon" type="${tipo}" href="${logo.ruta}">`)
      cambios.push({ que: 'favicon del cliente', motivo: 'no había icono raster', despues: logo.ruta + ' (' + tipo + ')' })
    }
  }

  // ── 2 · og:url ─────────────────────────────────────────────────────────
  const url = medidasProyecto?.urlBase || null
  if (url) {
    const actual = unMeta(cab, 'og:url', 'property')
    if (!actual) {
      agregar.push(`<meta property="og:url" content="${escapar(url)}">`)
      cambios.push({ que: 'og:url', motivo: 'no había', despues: url })
    } else if (!actual.includes(url)) {
      /* Ya declaraba otra URL. NO se sobrescribe: puede ser un dominio propio o una ruta distinta
         (ISA Arenas declara /isa-arenas/ y su repositorio se llama proyecto-dta). Se reporta para
         que se decida a mano en vez de romper una canonicalización existente. */
      cambios.push({ que: '(aviso) og:url', motivo: 'declara otra URL, no se toca', despues: (actual.match(/content="([^"]*)"/i) || [])[1] || '?' })
    }
  }

  // ── 3 · og:image (del cliente, nunca la de la agencia) ─────────────────
  const ogImagenTag = unMeta(cab, 'og:image', 'property')
  const ogImagen = ogImagenTag ? (ogImagenTag.match(/content="([^"]*)"/i) || [])[1] || '' : ''
  const creativa = medidasProyecto?.ogImagen || null      // imagen del cliente elegida
  if ((!ogImagen || ES_IMAGEN_AGENCIA.test(ogImagen)) && creativa) {
    const nueva = creativa.url
    if (ogImagenTag) cab = cab.replace(ogImagenTag, `<meta property="og:image" content="${escapar(nueva)}">`)
    else agregar.push(`<meta property="og:image" content="${escapar(nueva)}">`)
    cambios.push({ que: 'og:image', motivo: ogImagen ? 'era la imagen de la agencia' : 'no había', despues: nueva.replace('https://konfiozinc.github.io/', '…/') })
    // medidas reales de esa imagen
    for (const [prop, valor] of [['og:image:width', creativa.ancho], ['og:image:height', creativa.alto]]) {
      const tag = unMeta(cab, prop, 'property')
      if (!valor) continue
      if (tag) {
        if (!tag.includes('content="' + valor + '"')) cab = cab.replace(tag, `<meta property="${prop}" content="${valor}">`)
      } else agregar.push(`<meta property="${prop}" content="${valor}">`)
    }
  } else if (ogImagen && !ES_IMAGEN_AGENCIA.test(ogImagen) && medidasProyecto?.ogActual) {
    /* La imagen ya es del cliente: se declaran las medidas REALES de ESA imagen (ogActual), no las de
       otra candidata. Sin og:image:width/height algunos previsualizadores recortan o ignoran la imagen. */
    const dims = medidasProyecto.ogActual
    for (const [prop, valor] of [['og:image:width', dims.ancho], ['og:image:height', dims.alto]]) {
      if (!valor) continue
      const tag = unMeta(cab, prop, 'property')
      if (!tag) {
        agregar.push(`<meta property="${prop}" content="${valor}">`)
        cambios.push({ que: prop, motivo: 'no estaba declarada', despues: String(valor) })
      } else if (!tag.includes('content="' + valor + '"')) {
        cab = cab.replace(tag, `<meta property="${prop}" content="${valor}">`)
        cambios.push({ que: prop, motivo: 'no coincidía con la imagen', despues: String(valor) })
      }
    }
  }

  // ── 4 · title y description: solo si incumplen ─────────────────────────
  const titulos = [...cab.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1].trim())
  if (!titulos.length || !titulos[0]) {
    const nuevo = recortar(nombreDeCarpeta(dirProyecto.split(/[\\/]/).pop()), 60)
    if (titulos.length) cab = cab.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapar(nuevo)}</title>`)
    else agregar.unshift(`<title>${escapar(nuevo)}</title>`)
    cambios.push({ que: 'title', motivo: titulos.length ? 'vacío' : 'no había', despues: nuevo })
  } else if (titulos.length > 1) {
    for (const extra of titulos.slice(1)) cab = cab.replace(new RegExp('<title>[\\s\\S]*?</title>', 'i'), '')
    cambios.push({ que: 'title', motivo: titulos.length + ' etiquetas <title>', despues: 'una sola' })
  }

  const descTag = unMeta(cab, 'description')
  const desc = descTag ? (descTag.match(/content="([^"]*)"/i) || [])[1] || '' : ''
  const generica = /^Tarjeta digital de .*Creada por KONF[ÍI]O ZINC\.$/i.test(desc)
  if (!desc.trim()) {
    const nuevo = recortar('Tarjeta digital de ' + nombreDeCarpeta(dirProyecto.split(/[\\/]/).pop()) + ': contacto, servicios y ubicación en un solo enlace. Creada por ' + MARCA + '.', 160)
    agregar.push(`<meta name="description" content="${escapar(nuevo)}">`)
    cambios.push({ que: 'meta description', motivo: 'no había', despues: nuevo.length + ' car.' })
  } else if (desc.length > 160) {
    const nuevo = recortar(desc, 160)
    if (descTag) cab = cab.replace(descTag, `<meta name="description" content="${escapar(nuevo)}">`)
    cambios.push({ que: 'meta description', motivo: desc.length + ' caracteres', despues: nuevo.length + ' car.' })
    if (unMeta(cab, 'og:description', 'property') && medidasProyecto?.alinearOgDescripcion) {
      const og = unMeta(cab, 'og:description', 'property')
      cab = cab.replace(og, `<meta property="og:description" content="${escapar(nuevo)}">`)
      cambios.push({ que: 'og:description', motivo: 'seguía la descripción larga', despues: nuevo.length + ' car.' })
    }
  } else if (generica) {
    cambios.push({ que: '(aviso) meta description', motivo: 'genérica: el cliente no tenía texto propio', despues: 'se deja como está' })
  }

  // Los avisos («ya tiene una descripción genérica», «declara otra og:url») no son cambios: si solo
  // hay avisos, el archivo NO se reescribe.
  const reales = cambios.filter((c) => !String(c.que).startsWith('(aviso)'))
  if (!reales.length) return { archivo, cambios, hayCambios: false }
  let nuevaCabecera = cab
  if (agregar.length) nuevaCabecera = nuevaCabecera.replace(/\s*$/, '') + '\n    ' + agregar.join('\n    ') + '\n'
  return { archivo, cambios, hayCambios: true, texto: nuevaCabecera + texto.slice(fin) }
}

// ── Ejecución ──────────────────────────────────────────────────────────────
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

    const medidasProyecto = MEDIDAS[relative(WORKSPACE, dir).replace(/\\/g, '/')] || null
    const archivo = join(dir, 'index.html')
    const plan = planear(archivo, dir, medidasProyecto)
    if (plan.omitido) { resumen.push({ proyecto: nombre, omitido: plan.omitido }); continue }
    if (!plan.hayCambios) { resumen.push({ proyecto: nombre, cambios: [] }); continue }
    if (APLICAR) writeFileSync(archivo, plan.texto, 'utf8')
    resumen.push({ proyecto: nombre, cambios: plan.cambios, archivo: 'index.html' })
  }
}

if (SOLO_JSON) {
  console.log(JSON.stringify({ aplicado: APLICAR, proyectos: resumen }, null, 2))
} else {
  console.log('')
  console.log('  ' + (APLICAR ? 'APLICANDO «TOQUE PRO» DE SEO' : 'SIMULACIÓN (no se escribe nada; añade --aplicar)'))
  console.log('  ' + '═'.repeat(70))
  for (const r of resumen) {
    if (!r.cambios?.length) continue
    console.log('')
    console.log('  ' + r.proyecto)
    for (const c of r.cambios) console.log('     · ' + c.que + '  ←  ' + c.motivo + '  →  ' + c.despues)
  }
  const conCambios = resumen.filter((r) => r.cambios?.length)
  const cuantas = (que) => resumen.reduce((t, r) => t + (r.cambios || []).filter((c) => c.que === que).length, 0)
  console.log('')
  console.log('  ' + '─'.repeat(70))
  console.log('  proyectos con cambios      : ' + conCambios.length + ' de ' + resumen.length)
  console.log('  favicon del cliente        : ' + cuantas('favicon del cliente'))
  console.log('  og:url añadido/corregido   : ' + cuantas('og:url'))
  console.log('  og:image cambiada          : ' + cuantas('og:image'))
  console.log('  título corregido           : ' + cuantas('title'))
  console.log('  descripción corregida      : ' + cuantas('meta description'))
  console.log('')
}
