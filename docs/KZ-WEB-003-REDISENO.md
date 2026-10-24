# KZ-WEB-003 · Perfeccionamiento corporativo, identidad y conversión

> Estado: **candidato local terminado, listo para revisión y aprobación de producción.**
> Rama `feature/kz-web-003` sobre `main` @ `b36c233`. **No publicado.**
> Verificación: **51/51**. Regresión: identidad 23/23 · paleta 0 bloqueantes · panel 8/8 ·
> QA web 186/186 · integración 11/11 · precios OK.

## A · Open Graph, metadatos y vista previa de WhatsApp

El problema real: la portada anunciaba `og:image` como **SVG**
(`premium-assets/og-cover.svg`). WhatsApp y Telegram no rasterizan SVG de forma fiable, así
que la miniatura podía no aparecer. Y faltaban ancho, alto, texto alternativo y Twitter Card.

- **Imagen nueva PNG 1200×630** (`assets/img/og/og-1200x630.png`) generada desde SVG con
  Orbitron realmente cargada, composición Neon Tech. Verificada por cabecera IHDR: 1200×630.
- Portada: `og:image` → PNG, más `og:image:width`, `og:image:height`, `og:image:alt` y
  `twitter:card` + `twitter:image`. `precios.html` dejaba de usar un JPEG.
- **56 páginas** revisadas: todas declaran ancho, alto, alt, Twitter Card y canonical.
- **Favicon ≠ Open Graph.** Se tratan por separado: el favicon pasa a SVG de marca + PNG 32 +
  apple-touch 180 en las 56 páginas, sustituyendo el `logo.jpeg` de 1024×1024 con fondo
  fotográfico que se venía usando como icono.

**Lo que no prometo:** WhatsApp guarda las miniaturas en caché. Si alguien compartió el enlace
antes, seguirá viendo la anterior hasta que su caché expire. Eso no lo controla el sitio.

## B · Logotipo

El original es `assets/img/logos/logo.jpeg`, un **raster de 1024×1024** sobre azul muy oscuro.
Lo analicé píxel a píxel en un navegador headless para conocer su composición (mapa de
luminancia): es el logotipo tipográfico con una "K" geométrica y bandas de texto, no una foto.

**No rediseñé el símbolo.** La geometría que se formalizó es el path que el sitio ya usa en sus
38 páginas y en el favicon (`M8 7h10v13L32 7h8L25 23l16 18H28L18 29v12H8z`), y la composición
es la que ya está en la cabecera: monograma + «KONFÍO ZINC» con ZINC en acento. El wordmark se
compone en Orbitron, la tipografía corporativa vigente.

Generado desde una **sola fuente maestra** (`herramientas/generar-marca-kz.js`):

| Recurso | Archivo |
|---|---|
| Lockup horizontal | `assets/img/marca/kz-logo.svg` + `.png` (1068×256, transparente) |
| Lockup para fondos claros | `kz-logo-inverso.svg` + `.png` |
| Lockup vertical | `kz-logo-vertical.svg` |
| Monograma | `kz-monograma.svg` (cian) + `kz-monograma-violeta.svg` + `.png` (512) |
| Favicon | `favicon.svg`, `favicon-32.png`, `favicon-64.png` |
| Instalación | `apple-touch-icon.png` (180), `icon-192`, `icon-512`, `icon-maskable-192/512` |

Paleta: cian `#00E5FF`, violeta `#8B5CF6`, fondo `#050B14`, blanco `#FFFFFF`. **Sin `#F0B429`
en ningún activo.** El rosa `#F060E0` se probó y se descartó: habría creado una segunda paleta.
Ningún SVG depende de servicios externos (el `xmlns` no es una carga). El lockup verifica
aire simétrico de 32 px a cada lado: no está descentrado ni recortado.

**Límite honesto:** no puedo ver imágenes. La correspondencia con el original se verificó por
geometría (mismo path) y por análisis de píxeles, no por comparación visual.

## C · Carrusel de proyectos

El marquee infinito se sustituyó por navegación explícita. Un movimiento continuo no se puede
detener sin ratón y no se puede pausar con el teclado; para quien tiene sensibilidad al
movimiento es un problema real.

- **Flechas anterior/siguiente visibles**, con estado deshabilitado real en los extremos.
- **Swipe móvil nativo** vía `scroll-snap` — sin JavaScript intermediario.
- **Teclado**: ← → Inicio Fin cuando la pista tiene el foco, con los mismos límites que los botones.
- **Contador «n / 4 proyectos publicados»** y **un punto por proyecto** pulsable, más un
  `aria-live` que anuncia el cambio sin robar el foco.
- **Salida al portafolio completo** conservada.
- **Sin autoplay**, así que no hay control de pausa que haga falta: nada se mueve solo.

Los cuatro proyectos se comprobaron con petición real antes de presentarlos:

| Proyecto | HTTP | Título servido |
|---|---|---|
| Postres Snoopy | 200 | Postres Snoopy — Postres con amor |
| Red CaliNet | 200 | Red CaliNet — Calidad de ventas por internet |
| UneFibra | 200 | Internet Fibra Óptica en Medellín — UneFibra SAS |
| El Titi | 200 | EL TITI Comidas Rápidas |

No se añadió ninguna métrica ni resultado comercial.

## D · Programa de aliados

**Aquí había un error de fondo, no de estilo.** La página presentaba Bronce/Plata/Oro como
*comisión del referido* con 20/25/30 % y umbrales 1-5 / 6-15 / 16+. La referencia canónica
(`9-AGENTES-IA/BASE-CONOCIMIENTO-CANONICA.md`, líneas 61 y 71-72) dice otra cosa:

- **Comisión por referidos: 20 %** por venta cerrada. Sin niveles.
- **Programa de distribuidor**: compra a precio de distribuidor y vende al precio que quiera.
  Niveles por ventas/mes: **Bronce 1–4 (30 % dto), Plata 5–9 (40 % dto), Oro 10+ (50 % dto)**.

Es decir: la página estaba **mezclando comisión con descuento comercial** y con umbrales
distintos, exactamente lo que el encargo pide no hacer. Reescrita:

- Tres modalidades separadas: **Referidor** (20 % fijo), **Distribuidor/Partner**
  (30–50 % según volumen), **Marca Blanca** (condiciones por escrito).
- Sección nueva de **niveles del distribuidor** con los umbrales correctos.
- Sección nueva de **la comisión del referido** con una tabla que compara los dos conceptos
  y dice explícitamente que *no se acumulan*.
- **«Cómo empezar»** en tres pasos.
- **FAQ corregida**: umbrales, y se retiraron dos afirmaciones no verificadas — el pago «cada
  15 días por Nequi/Daviplata» y el precio de Marca Blanca. Ahora dicen que la forma de pago y
  el valor se confirman por escrito. No se inventó ninguna cifra.
- **Se eliminó «Acceso al panel de aliados»**: ese panel no existe. El panel que hay es el
  administrativo de KONFÍO ZINC, no un portal de aliados.
- 11 enlaces de WhatsApp conservados y verificados.

## E · Botón «Recibir avisos»

Dónde está: `assets/js/push.js`, cargado en 36 de 56 páginas — **y no en la portada**.

**Qué comprobé de verdad.** Hice una prueba representativa en navegador con Playwright. El
resultado honesto: en headless la API de notificaciones queda en `denied`, así que el alta no
se puede completar ahí. **No pude certificar la entrega de punta a punta.** Esa cadena depende
de dos cosas que no están en mi mano: un permiso concedido en un dispositivo real y que alguien
envíe una campaña desde la consola de Firebase → Messaging.

Ojo con una suposición que resultó falsa: el envío **no** requiere Cloud Functions. FCM desde
la consola funciona en el plan gratuito, así que el mecanismo no estaba roto por diseño. Las
reglas de Firestore sí permiten la suscripción anónima con validación.

**Qué corregí, entonces.** No borré un mecanismo que funciona; quité la promesa que no puedo
respaldar:

- «Te contactaremos cuando lancemos novedades» → **«Quedaste en la lista. Los avisos son
  ocasionales: se envían cuando hay algo que vale la pena contar. No son automáticos ni tienen
  una frecuencia fija»**, con enlace directo a WhatsApp.
- El mismo mensaje en la ruta de «ya suscrito».
- El navegador no compatible ahora ofrece **WhatsApp para consultar novedades** en lugar de
  dejar al usuario sin salida.
- `push.js` añadido a la portada, que era la página principal y no lo ofrecía.

`manifest.json`: `theme_color` era **`#F0B429`** (dorado) y `background_color` `#000000`.
Ahora `#00E5FF` y `#050B14`, con los iconos Neon y un icono SVG. La descripción del manifest se
alineó con la definición corporativa correcta.

**Lo que queda pendiente y es tuyo:** si quieres que los avisos lleguen de verdad, hay que
mandar una campaña de prueba desde la consola de Firebase a un móvil real. Hasta entonces la
promesa publicada es la correcta: avisos ocasionales, no automáticos.

## F · Composición de capas

**El recurso original apareció.** Está en `17-KZ-MOTION-STUDIO/00-auditoria/demo-pr2/`
(`presencia.svg`, `productos.svg`, `conexion.svg`, revisión en
`REVISION-HARNESS-demo-5-capas.md`): una composición isométrica 2.5D de planos apilados.

Estaba en la paleta vieja (`#F0B429` sobre negro). Construí
`assets/img/marca/capas-kz.svg` manteniendo la **geometría isométrica y el apilado** de ese
recurso, recoloreado a Neon Tech y ordenado en las cuatro capas que pide el encargo:
**01 Diseño · 02 Contenido · 03 Interacción · 04 Tecnología**.

Sustituye al antiguo `hero__note`, que era solo texto:

- **Escritorio:** esquina superior derecha, `width: min(34vw, 400px)` — donde ya estaba la nota.
- **Móvil:** antes la nota se **ocultaba por completo** y el mensaje se perdía. Ahora se muestra
  en flujo, 320 px máximo, con el texto debajo.
- SVG vectorial con `width`/`height` declarados: sin petición extra de raster, sin salto de
  maquetación, y escala sin pérdida en cualquier pantalla.

## G · Coherencia corporativa

- La definición del sitio se corrigió en el `manifest.json`: es un **sitio web corporativo
  multipágina**, con portada orientada a conversión, servicios, portafolio, recursos, aliados,
  formularios de captación y Asesor Konfi. No un catálogo, no una única landing.
- **Un solo logotipo:** desapareció `logo.jpeg` de las 56 páginas (pie de página y JSON-LD).
  El pie usa el monograma vectorial; los datos estructurados apuntan a un PNG cuadrado de 512,
  que es lo que aceptan los buscadores. Las otras 8 referencias (imágenes sociales y de datos
  estructurados) apuntan ahora a la imagen de marca 1200×630.
- Sin dorado en ningún HTML, CSS ni activo nuevo.

## Verificación

`herramientas/verificar-kz-web-003.js` — navegador real, escritorio y móvil, **51/51**.

| Bloque | Comprobaciones |
|---|---|
| Metadatos y Open Graph | PNG 1200×630 real · 0 og:image en SVG · 0 og:image con el JPEG del logo · todas con ancho/alto/alt/twitter/canonical |
| Logotipo | 0 páginas con `logo.jpeg` · 14 recursos de marca presentes · 0 SVG con oro |
| Manifest y avisos | sin dorado · iconos existentes · sin promesa automática · salida por WhatsApp |
| Portada ×2 tamaños | carrusel · flechas · contador 1/4 · 4 puntos · focusable · scroll-snap · capas cargadas con alt · 0 desborde · 0 errores JS · flecha avanza · teclado avanza · Inicio vuelve · fin deshabilita |
| Aliados | 20 % · 30/40/50 · umbrales 1-4/5-9/10+ · sin umbrales viejos · sin panel inexistente · 11 WhatsApp · 0 desborde · 0 errores JS |
| Coherencia | 0 HTML con dorado |

**Regresión:** identidad 23/23 · paleta 0 bloqueantes · neon 0 fallos · panel 8/8 ·
QA web 186/186 · integración 11/11 · precios OK.

**Capturas:** 8 en `C:\KZ-EVIDENCIA\kz-web-003\kz-web-003\` (portada, aliados, servicios y
precios × 375 y 1440, con versión de página completa).

## Pendiente de decisión del propietario

1. **Revisar las capturas.** No puedo ver imágenes: la valoración estética es suya.
2. **El logotipo.** Confirmar que la reconstrucción vectorial representa fielmente la marca.
3. **Enviar una campaña de prueba** desde la consola de Firebase a un móvil real si quiere que
   los avisos lleguen a alguien.
4. **Marca Blanca**: si existen condiciones comerciales fijas, darlas para publicarlas; hoy la
   página dice expresamente que se acuerdan por escrito.
