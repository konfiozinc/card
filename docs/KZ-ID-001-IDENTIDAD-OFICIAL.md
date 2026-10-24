# KZ-ID-001 · Identidad corporativa oficial y Open Graph

> Estado: **candidato local terminado. No publicado** (rama `feature/kz-web-003`,
> `main` sigue en `b36c233`).
> Verificación: metadatos 0 pendientes · logotipo 30/30 · identidad 23/23 ·
> paleta 0 · panel 8/8 · QA web 186/186 · KZ-WEB-003 51/51 · precios OK.

## 1. Los dos archivos entregados

| Archivo | Dimensiones | Relación | Fondo | Colores |
|---|---|---|---|---|
| `logo.jpeg` | **1600 × 678** | 2,36 (panorámico) | sólido `#010715`, sin transparencia | cian `#00E0F8`, blanco |
| `Logotipo neón futurista KONFÍO ZINC.png` | **1362 × 1155** | 1,18 (casi cuadrado) | sólido `#030F21`, sin transparencia | cian `#00F8F8`, blanco |

Ninguno de los dos tiene canal alfa: los dos traen fondo oscuro sólido.

Se analizaron píxel a píxel con un navegador headless (dimensiones, transparencia
real, colores dominantes, perfil por columnas y mapa de luminancia), porque el agente
no puede ver imágenes. Ese análisis permitió **leer la composición** de ambos:

- **`logo.jpeg`**: dos bloques nítidos separados por un hueco de 16 px — la **marca**
  (la «K» con sus brazos, x 147..511) y el **logotipo textual** (x 528..1479).
- **PNG**: un solo bloque continuo (x 176..1176) con **marco decorativo** alrededor
  del conjunto.

## 2. Logotipo seleccionado y por qué

**Se elige `logo.jpeg` como logotipo oficial.**

1. **Contiene la marca completa**: monograma + nombre. El PNG es un emblema
   enmarcado, no un lockup utilizable en cabecera.
2. **Proporción 2,36**: encaja en una cabecera, un pie y una tarjeta social. El PNG,
   casi cuadrado, ocupa una franja vertical que la cabecera no tiene.
3. **El marco del PNG compite** con los bordes y el glow que ya tiene la cabecera del
   sitio, y a 32 px —tamaño de favicon— el marco y el texto se vuelven ilegibles.
4. **Ya es cian**: `#00E0F8` frente al `#00E5FF` de Neon Tech (diferencia de 1,4 %).
   No hizo falta recolorear nada.

El PNG neón queda evaluado y conservado como emblema secundario; no se usa en
cabecera ni en iconos por los motivos anteriores. **No se rediseñó la marca**: se
usa el archivo del propietario tal cual.

## 3. Activos generados desde el original

Ninguno se redibuja: se **recorta el archivo original** y se le separa el fondo.

| Activo | Tamaño | Uso |
|---|---|---|
| `assets/img/marca/logo-oficial.png` | 1332 × 574, transparente | cabecera de escritorio, cabecera móvil |
| `assets/img/marca/marca-oficial.png` | 1024 × 1024, transparente | pie de página |
| `assets/img/logos/favicon-32.png` / `favicon-64.png` | 32 / 64 | favicon |
| `assets/img/icons/apple-touch-icon.png` | 180 | iOS |
| `assets/img/icons/icon-192.png` / `icon-512.png` | 192 / 512 | PWA |
| `assets/img/icons/icon-maskable-192.png` / `-512.png` | 192 / 512 | PWA maskable (zona segura) |
| `assets/img/og/og-1200x630.png` | **1200 × 630** | vista previa social |

**Cómo se separó el fondo.** El original tiene fondo sólido; pegarlo tal cual dejaría
un rectángulo visible sobre `#050B14`. Se calculó alfa por luminancia y se
**desmultiplicó el color** (`color_real = (color − fondo·(1−a)) / a`), de modo que no
queden halos oscuros al poner el logotipo sobre otro fondo.

Verificación medida, no supuesta:

- `logo-oficial.png`: **70,3 % transparente**, contenido dentro de márgenes
  (izq 67 · der 69 · sup 17 · inf 39), **0,0 % de riesgo de halo oscuro**.
- `marca-oficial.png`: **70,7 % transparente**, 0,0 % de halo.
- El mapa de luminancia del resultado se lee como **«KONFÍO ZINC»** con la K a la
  izquierda: el recorte no cortó nada.

## 4. Integración en la web

El sitio usaba un **monograma dibujado a mano** (`<path d="M8 7h10v13L32 7h8L25 23…">`)
en 38 páginas. Sustituido en **56 páginas**:

- **Cabecera de portada** (`.brand__logo`): 6 sustituciones.
- **Cabecera comercial** (`.nav-logo-img`): 36 sustituciones.
- **Pie** (`.footer-logo`): 36 sustituciones — este quedaba vivo con `<img
  src=".../kz-monograma.svg">`, que la primera pasada no cubría porque buscaba `<svg>`.
  Se detectó al comprobar referencias residuales, no al azar.
- **0 monogramas dibujados restantes** en todo el HTML.

Tamaños (por alto, para no deformar nunca):

| Contexto | Portada | Comercial |
|---|---|---|
| Escritorio | 48 px (111 px ancho) | 46 px (107 px ancho) |
| Móvil | 40 px (93 px ancho) | 38 px (88 px ancho) |
| ≤ 340 px | 34 px | 32 px |

Se subió el tamaño móvil a propósito: con el primer ajuste quedaba en **70 × 30 px**,
demasiado pequeño para leer el nombre. Verificado en navegador: relación renderizada
**2,32** = relación nativa **2,32** en las 8 páginas y los 2 tamaños → sin deformación,
y el archivo servido tiene 1332 px de ancho para una caja de 107 → nitidez holgada.

## 5. Metadatos sociales

Corregido en **todas las páginas públicas** (39). Auditoría campo por campo:

| Campo | Estado |
|---|---|
| `og:title` | completo (38 títulos distintos de 39 páginas: siguen siendo específicos) |
| `og:description` | completo |
| `og:image` | completo · HTTPS absoluta · 1200 × 630 verificado en el archivo |
| `og:image:width` / `height` | completo (1200 / 630) |
| `og:url` | completo |
| `og:type` | completo |
| `twitter:card` | completo |
| `twitter:image` | completo y **idéntica a `og:image`** (había 2 desajustes) |
| `canonical` | completo |
| favicon / apple-touch | completo |

- Se completaron **`recursos.html`** y **`politica-privacidad.html`**, que no tenían
  imagen social.
- Se alineó `twitter:image` en **`gracias.html`** y **`precios.html`**, que anunciaban
  una imagen distinta de la de Open Graph.
- **17 páginas no tienen Open Graph y es correcto**: todas son `noindex` (panel
  administrativo, `404.html`, `premium/demo.html`). No se comparten en redes y
  exigirles tarjeta social sería ruido, no calidad. El auditor las informa aparte.
- Los metadatos están en el **HTML servido**, no los crea JavaScript.

## 6. Publicación de las imágenes

- `_config.yml` no excluye `assets/`, así que `assets/img/` se publica. Comprobado en
  producción: `assets/img/og/og-home.png` → **HTTP 200, `image/png`**, y
  `assets/img/icons/icon-192.png` → **200**.
- `og-1200x630.png` devuelve **404 en producción porque esta rama no está publicada**.
  Es lo esperado: el archivo se publica con el resto del cambio.
- Ninguna ruta es local ni requiere autenticación: todas son `https://konfiozinc.github.io/card/...`.

**Limitación de caché, declarada:** WhatsApp, Facebook y Telegram guardan la miniatura.
Aunque el HTML ya esté corregido, un enlace compartido antes puede seguir mostrando la
imagen anterior hasta que su caché expire o se fuerce un re-rastreo. Eso no lo controla
el sitio. Los depuradores (Facebook Sharing Debugger, LinkedIn Post Inspector) permiten
forzar el re-rastreo; no los usé porque el cambio aún no está publicado.

## 7. Verificación ejecutada

| Prueba | Resultado |
|---|---|
| `verificar-metadatos-sociales.js` | **0** campos pendientes en páginas públicas · **0** problemas de valor |
| `verificar-logo-oficial.js` | **30/30** (cabecera y pie, escritorio y móvil) |
| `verificar-activos-logo.js` | transparencia, márgenes y halo de cada PNG |
| Identidad uniforme | 23/23 |
| Auditoría de paleta | 0 bloqueantes |
| `verificar-neon` | 0 fallos |
| Identidad del panel | 8/8 |
| Gate de QA web | 186/186 |
| KZ-WEB-003 (carrusel, aliados, capas) | 51/51 |
| Precios oficiales | OK |

**Capturas:** 8 en `C:\KZ-EVIDENCIA\kz-id-001\final\` (portada, servicios, aliados y
precios × 375 y 1440, con versión de página completa).

## 8. Herramientas nuevas

- `herramientas/analizar-logotipos.js` — dimensiones, transparencia, colores y mapa de
  luminancia de cualquier imagen entregada.
- `herramientas/analizar-colores-logotipo.js` — cromáticos y caja real del contenido.
- `herramientas/perfilar-logotipo.js` — separa marca de texto por perfil de columnas.
- `herramientas/generar-logo-oficial.js` — fuente única de los activos oficiales.
- `herramientas/verificar-activos-logo.js` — control de transparencia y halos.
- `herramientas/integrar-logo-oficial.js`, `pie-logo-oficial.js`,
  `estilos-logo-oficial.js` — sustitución e identidad.
- `herramientas/verificar-logo-oficial.js`, `verificar-metadatos-sociales.js`.

## 9. Pendiente de decisión del propietario

1. **Revisar las capturas.** No puedo ver imágenes: la comprobación estética y la
   confirmación de que el emblema PNG neón debe o no usarse en algún sitio es suya.
2. **Autorizar la publicación.** Sin esa autorización no se ha hecho push ni merge.
3. Tras publicar, si la miniatura social no se actualiza, forzar el re-rastreo en el
   depurador de la red correspondiente.
