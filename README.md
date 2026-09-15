# KONFÍO ZINC — Sitio web de agencia de marketing digital

Sitio web **multipágina**, responsive y optimizado para SEO de **KONFÍO ZINC**, agencia de
marketing digital en Colombia. Reemplaza la antigua landing de una sola página por una
arquitectura completa de agencia: home, servicios, portafolio con casos de estudio, blog,
nosotros y contacto.

- **URL en producción:** https://konfiozinc.github.io/card/
- **Repositorio:** https://github.com/konfiozinc/card
- **Rama de despliegue:** `main` (GitHub Pages, carpeta raíz `/`)
- **Responsable:** Darwin Montalvo — Fundador y Director de Estrategia Digital · `confiotv@gmail.com` · WhatsApp +57 320 641 1340

> ⚠️ **Respaldo del sitio anterior:** el `index.html` de la landing one-page original quedó
> guardado como **`index-old.html`**. Nada del contenido previo se eliminó: todo se migró a las
> páginas nuevas.

---

## 1. Descripción del proyecto

| Aspecto | Detalle |
|---|---|
| Tecnología | HTML5 + CSS3 + JavaScript vanilla (sin frameworks ni build step) |
| Identidad visual | Negro `#000000`, dorado `#F0B429`, naranja `#F97316`, cian `#00E5FF` |
| Tipografías | Orbitron (títulos) · Inter (textos), cargadas con `display=swap` |
| Iconografía | Font Awesome 6.5.1 (CDN) |
| Componentes compartidos | Header fijo, menú móvil, footer, WhatsApp flotante, “volver arriba”, agente IA flotante, modal, FAQ acordeón, animaciones on-scroll, contadores |
| SEO | Títulos y meta descripciones únicos, canonical, Open Graph, Twitter Cards, datos estructurados (Schema.org), `sitemap.xml`, `robots.txt` |
| Analytics | Placeholder de GA4 y de Search Console en el `<head>` de cada página + eventos de tracking en CTAs |
| Rendimiento | CSS crítico inline, `<script defer>`, miniaturas con `loading="lazy"`, video de YouTube con carga diferida (se inyecta el iframe solo al hacer clic) |

El sitio **no requiere compilación**: se sube tal cual a GitHub Pages.

---

## 2. Estructura de archivos

```
card/
├── index.html                     · Home de la agencia (hero, métricas, servicios, proceso, testimonios, portafolio, FAQ, CTA)
├── index-old.html                 · Respaldo de la landing one-page anterior
├── nosotros.html                  · Historia, fundador (Darwin Montalvo), misión/visión/valores, equipo, números
├── servicios.html                 · Overview de los 6 servicios + proceso + paquetes + FAQ general
├── portafolio.html                · Portafolio con filtros por categoría y casos de estudio en modal
├── blog.html                      · Entrada al blog desde la raíz
├── contacto.html                  · Formulario, datos de contacto, mapa, horarios y FAQ rápida
├── gracias.html                   · Confirmación de envío del formulario (noindex)
├── 404.html                       · Página de error personalizada (noindex)
├── sitemap.xml                    · Sitemap con todas las URLs indexables
├── robots.txt                     · Instrucciones para crawlers + referencia al sitemap
├── README.md                      · Este documento
├── ESPECIFICACION_SITIO.md        · Especificación de componentes y SEO (documento interno de trabajo)
│
├── herramientas/
│   └── verificar-sitio.js         · Verificador de integridad del sitio (enlaces, SEO, JSON-LD, sitemap)
│
├── servicios/                     · Una página por servicio (misma estructura: problema, proceso, beneficios, casos, FAQ, relacionados)
│   ├── seo.html
│   ├── redes-sociales.html
│   ├── publicidad-digital.html
│   ├── desarrollo-web.html
│   ├── branding.html
│   └── email-marketing.html
│
├── portafolio/                    · Casos de éxito por categoría
│   ├── tarjetas-digitales.html
│   ├── landing-pages.html
│   ├── catalogos-digitales.html
│   ├── menus-digitales.html
│   ├── asistentes-ia.html
│   └── codigos-qr.html
│
├── blog/                          · Blog y artículos
│   ├── index.html                 · Índice del blog
│   ├── menu-digital-interactivo.html
│   ├── tendencias-marketing-digital-2026.html
│   └── guia-codigos-qr-negocio.html
│
└── assets/
    ├── css/
    │   └── styles.css             · CSS global compartido por todas las páginas
    ├── js/
    │   └── main.js                · JS global compartido (módulos numerados y comentados)
    └── img/
        ├── logos/logo.jpeg        · Logotipo de la marca
        ├── equipo/darwin-montalvo.jpeg · Foto del fundador        └── portafolio/            · Carpeta para las imágenes propias del portafolio
```

### Rutas relativas (importante al crear páginas nuevas)

| Ubicación del archivo | `<html>` | Assets | Enlace a la raíz |
|---|---|---|---|
| Raíz (`index.html`) | `data-base="." data-root="."` | `assets/css/styles.css` | `index.html` |
| Subcarpeta (`servicios/`, `blog/`, `portafolio/`) | `data-base=".." data-root=".."` | `../assets/css/styles.css` | `../index.html` |

---

## 3. Cómo agregar un nuevo caso de portafolio

### 3.1 En la página con filtros (`portafolio.html`)

Copia este bloque dentro de `<div class="portfolio-grid">` y ajusta los datos. El filtrado y el
modal son automáticos (los gestiona `assets/js/main.js`):

```html
<button class="case reveal" data-category="tarjetas menus" data-open-modal
  data-title="Nombre del cliente — Servicio"
  data-url="https://konfiozinc.github.io/nombre-del-proyecto/"
  data-img="https://image.thum.io/get/width/900/crop/1200/https://konfiozinc.github.io/nombre-del-proyecto/"
  data-sector="Sector · Ciudad"
  data-metrics="+120% ventas|+40% contactos"
  data-challenge="Cuál era el problema del cliente antes del proyecto."
  data-solution="Qué hicimos exactamente para resolverlo."
  data-result="Qué se logró, con cifras."
  data-testimonial="Frase textual del cliente.">
  <img src="https://image.thum.io/get/width/600/crop/900/https://konfiozinc.github.io/nombre-del-proyecto/"
       alt="Descripción del proyecto para accesibilidad" loading="lazy" width="600" height="900">
  <div class="case-overlay">
    <span class="case-metric">+120% ventas</span>
    <span class="case-name">Nombre del cliente · Sector</span>
  </div>
</button>
```

**Reglas:**
1. `data-category` acepta una o varias categorías separadas por espacio. Valores válidos:
   `tarjetas`, `landing`, `catalogos`, `menus`, `asistentes`, `qr`.
2. `data-metrics` separa cada métrica con `|` (se muestran como chips en el modal).
3. Todos los atributos `data-*` de texto deben usar comillas dobles exteriores y **no** incluir
   comillas dobles dentro del valor (usa comillas simples si necesitas entrecomillar).
4. El `alt` es obligatorio y descriptivo.
5. Si usas una imagen propia en lugar de la miniatura automática, guárdala en
   `assets/img/portafolio/` y referencia esa ruta (desde la raíz) o `../assets/img/portafolio/`
   (desde una subcarpeta).

### 3.2 En la página de categoría (`portafolio/<categoria>.html`)

Usa una ficha de caso de estudio completa:

```html
<article class="case-study reveal">
  <div class="case-study-img">
    <img src="https://image.thum.io/get/width/900/crop/700/https://konfiozinc.github.io/proyecto/"
         alt="Descripción del proyecto" loading="lazy" width="900" height="700">
  </div>
  <div class="case-study-body">
    <h3>Nombre del cliente — Servicio</h3>
    <p class="case-study-sector">Sector · Ciudad</p>
    <div class="case-metrics">
      <span class="chip"><i class="fas fa-arrow-trend-up"></i> +120% ventas</span>
      <span class="chip chip-cyan"><i class="fas fa-clock"></i> Entrega en 48 h</span>
    </div>
    <p><strong>Desafío:</strong> …</p>
    <p><strong>Solución:</strong> …</p>
    <p><strong>Resultado:</strong> …</p>
    <blockquote>"Testimonio del cliente."</blockquote>
  </div>
</article>
```

### 3.3 Checklist al publicar un caso nuevo

- [ ] Añadir la URL del proyecto a `sitemap.xml` **solo** si es una página propia del sitio.
- [ ] Añadir el proyecto a la lista `PROJECTS` en `assets/js/main.js` (botón “Ver todos los proyectos”).
- [ ] Enlazar el caso desde la página de servicio relacionada (`servicios/*.html`) y desde `index.html` si es destacado.
- [ ] Verificar que el enlace en vivo responda 200 antes de publicarlo.

---

## 4. Cómo agregar un artículo al blog

1. **Duplica** una plantilla existente para mantener la estructura:
   `blog/menu-digital-interactivo.html` → `blog/mi-nuevo-articulo.html`.
2. Cambia en el `<head>`:
   - `<title>` (máx. 60 caracteres), `meta description` (máx. 155), `og:*` y `twitter:*`.
   - `<link rel="canonical" href="https://konfiozinc.github.io/card/blog/mi-nuevo-articulo.html">`.
   - El JSON-LD `BlogPosting`: `headline`, `description`, `image`, `datePublished`,
     `dateModified`, `author` (`Darwin Montalvo`) y `mainEntityOfPage`.
3. Actualiza el contenido: `<h1>`, `.article-meta` (autor, fecha, tiempo de lectura, categoría),
   `.article-toc` con enlaces a los anclas de los `<h2 id="...">`, y el cuerpo del artículo en `.prose`.
4. Escribe **al menos 900 palabras**, con `H2`/`H3` lógicos, listas y una `.article-cta` en medio.
5. Añade el artículo a la rejilla en **dos lugares**:
   - `blog/index.html` → enlace relativo: `href="mi-nuevo-articulo.html"`
   - `blog.html` (raíz) → enlace relativo: `href="blog/mi-nuevo-articulo.html"`
6. Añade la URL a `sitemap.xml` con su `<lastmod>` en formato `AAAA-MM-DD`.
7. Recomendado: enlaza desde el artículo a 2 páginas de servicio y 1 de portafolio (enlazado interno).

Plantilla base del encabezado del artículo:

```html
<article class="article">
  <img class="article-hero" src="…" alt="…" loading="lazy" width="1200" height="525">
  <div class="article-meta">
    <span><i class="fas fa-user"></i> Darwin Montalvo</span>
    <span><i class="fas fa-calendar"></i> 15 de septiembre de 2026</span>
    <span><i class="fas fa-clock"></i> 6 min de lectura</span>
    <span><i class="fas fa-tag"></i> Categoría</span>
  </div>
  <nav class="article-toc" aria-label="Contenido del artículo">
    <strong>En este artículo</strong>
    <a href="#seccion-1">1. Título de la sección</a>
  </nav>
  <div class="prose">
    <h2 id="seccion-1">Título de la sección</h2>
    <p>…</p>
  </div>
</article>
```

---

## 5. Cómo agregar un servicio nuevo

1. Crea `servicios/nombre-servicio.html` partiendo de `servicios/seo.html` (es la plantilla
   canónica: hero, el problema, cómo funciona, beneficios, casos, FAQ, relacionados, CTA).
2. Añade el `<a>` correspondiente en el submenú de **todas** las páginas (bloque
   `<div class="nav-sub">` del header) y una tarjeta en `servicios.html`.
3. Añade la URL a `sitemap.xml`.
4. Añade la palabra clave del servicio a la función de respaldo del agente IA (`getLocalResponse`
   en `assets/js/main.js`) si quieres que el asesor lo mencione.

---

## 6. Despliegue en GitHub Pages

El repositorio ya está conectado: GitHub Pages publica la rama `main` en la raíz del repo, por lo
que la URL es `https://konfiozinc.github.io/card/`.

### 6.1 Método manual (Git)

```powershell
$git = "C:\Program Files\Git\cmd\git.exe"
$repo = "C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc"

# 1. Ver qué cambió
& $git -C $repo status

# 2. Preparar, confirmar y publicar
& $git -C $repo add -A
& $git -C $repo commit -m "Sitio multipágina: home, servicios, portafolio, blog, contacto y SEO técnico"
& $git -C $repo push origin main
```

### 6.2 Verificar el despliegue

1. GitHub Actions → pestaña **Actions** del repo: el flujo `pages-build-deployment` debe terminar en verde (~1–3 min).
2. Abre https://konfiozinc.github.io/card/ y navega: Inicio → Servicios → cada servicio → Portafolio → Blog → Contacto.
3. Comprueba que carguen el CSS (`/card/assets/css/styles.css`) y el JS (`/card/assets/js/main.js`) sin errores 404 en la consola del navegador.
4. Verifica `https://konfiozinc.github.io/card/sitemap.xml` y `https://konfiozinc.github.io/card/robots.txt`.

> Si la rama principal fuera otra, cambia `main` por el nombre correcto. Para publicar en la raíz
> de `konfiozinc.github.io` habría que mover los archivos al repositorio `konfiozinc.github.io`
> y, en ese caso, actualizar todas las canónicas, las URL de Open Graph, `sitemap.xml` y `robots.txt`
> (basta reemplazar `https://konfiozinc.github.io/card/` por `https://konfiozinc.github.io/`).

---

## 7. Configuración pendiente después del despliegue (placeholders)

| # | Qué | Dónde |
|---|---|---|
| 1 | **Google Analytics 4:** reemplazar `G-XXXXXXXXXX` por el ID real y descomentar el bloque | `<head>` de todas las páginas (bloque comentado marcado con ⚠️ PLACEHOLDER) |
| 2 | **Search Console:** pegar el código de verificación | `<meta name="google-site-verification" content="PENDIENTE-CODIGO-SEARCH-CONSOLE">` |
| 3 | **Formspree:** reemplazar `https://formspree.io/f/xxxxx` por el endpoint real del formulario | `contacto.html` → `<form id="contactForm" action="…">` |
| 4 | **Google Business Profile:** crear el perfil con el mismo NAP (nombre, dirección, teléfono) para SEO local | Externo a este repositorio |
| 5 | Enviar `sitemap.xml` en Search Console y solicitar indexación de las páginas principales | Search Console |

### Eventos de tracking ya implementados

`assets/js/main.js` envía estos eventos a GA4 si `gtag` está disponible (si GA4 no está configurado,
no pasa nada: la función `track()` no falla):

| Evento | Cuándo se dispara |
|---|---|
| `click_whatsapp` | Clic en cualquier enlace `wa.me` o en el botón flotante de WhatsApp |
| `form_submit` | Envío correcto del formulario (con el método usado: Formspree o simulado) |
| `form_error` | Error de validación o fallo de red en el formulario |
| `filter_portfolio` | Uso de los filtros del portafolio (incluye cuántos resultados quedaron) |
| `play_video` | Clic para reproducir el video promocional |
| `ia_open` / `ia_message` / `ia_whatsapp_cta` | Interacción con el agente IA flotante |

---

## 8. Mantenimiento y buenas prácticas

- **No cambies la identidad visual** (colores, tipografías, radios): está centralizada en los
  tokens `:root` de `assets/css/styles.css`.
- **Reutiliza las clases existentes** antes de escribir CSS nuevo. El catálogo completo está
  documentado en `ESPECIFICACION_SITIO.md` (sección 9).
- **Mantén un solo `<h1>` por página** y la jerarquía H1 → H2 → H3.
- **Toda imagen necesita `alt` descriptivo**; usa `loading="lazy"` salvo en el logo del header.
- **Cada página nueva** debe incluir: canonical, Open Graph, Twitter Cards, favicon,
  `apple-touch-icon`, bloque GA4/Search Console comentado, y cerrar con
  `<script src="[../]assets/js/main.js" defer></script>`.
- **Antes de publicar**, revisa la consola del navegador en móvil, tablet y escritorio.
- **Respaldo:** `index-old.html` guarda la versión anterior del home; no lo borres hasta validar
  el nuevo sitio en producción.

### Verificación rápida antes de publicar (recomendado)

Incluye un verificador de integridad en Node.js que revisa enlaces rotos, metadatos SEO,
canonical, JSON-LD, jerarquía de encabezados, imágenes sin `alt` y coherencia del sitemap:

```powershell
cd "C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc"
node herramientas\verificar-sitio.js
```

Sale con código `0` si todo está bien y con `1` si hay errores, así que sirve también para CI.
Si detecta un enlace roto, corrígelo antes de hacer `push`.

### Comprobación manual de un enlace concreto (PowerShell)

```powershell
$repo = "C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc"
$html = Get-ChildItem -Path $repo -Recurse -Filter *.html | Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'index-old.html' }
foreach ($f in $html) {
  $content = Get-Content $f.FullName -Raw
  $base = $f.DirectoryName
  foreach ($m in [regex]::Matches($content, '(href|src)="([^"]+)"')) {
    $target = $m.Groups[2].Value
    if ($target -match '^(https?:|mailto:|tel:|#|data:|javascript:)') { continue }
    $target = $target.Split('#')[0].Split('?')[0]
    if ($target -eq '') { continue }
    if (-not (Test-Path (Join-Path $base $target))) { "ROTO · $($f.Name) -> $target" }
  }
}
```

---

## 9. Contacto del responsable

**Darwin Montalvo** — Fundador y Director de Estrategia Digital · KONFÍO ZINC

- Email: [confiotv@gmail.com](mailto:confiotv@gmail.com)
- WhatsApp: [+57 320 641 1340](https://wa.me/573206411340)
- Facebook: https://www.facebook.com/profile.php?id=61589654555930
- Instagram: https://www.instagram.com/konfiozinc
- TikTok: https://www.tiktok.com/@konfiozinc
