# Expediente de decisión · Transformación premium de la web de KONFÍO ZINC

Evaluación medida del sitio público y plan de ejecución para una sola misión autónoma.
Fecha: 2026-10-19. Rama de trabajo `harness/web-premium` (optimizaciones en `harness/premium-dev`).
Producción de referencia: `konfiozinc/card` → `main @ a27c7fa`. Si produción no se ha tocado.

---

## 1. Estado actual medido

| Métrica | Valor | Cómo se obtuvo |
|---|---|---|
| Páginas HTML | **30** | `auditar-sitio-publico.js` |
| HTML total | **1.054 KB** (20–66 KB/página) | idem |
| CSS en línea (index) | 0,3 KB | conteo del propio archivo |
| **JS en línea (index)** | **7,6 KB** | idem |
| Imágenes que carga el sitio | **2,07 MB** (antes 5,45 MB) | optimización `66ad6cf`, 28 imágenes |
| Imágenes sin `alt` | 0 | auditoría |
| `description` / `canonical` / JSON-LD | 30/30 · 30/30 · 30/30 | auditoría |
| `h1` por página | 1 en todas | auditoría |
| Enlaces internos rotos | **0** | auditoría |
| Formularios con datos en la URL | 0 | batería |
| Sitemap | **37 URLs** | `sitemap.xml` |
| Terceros | **Google Fonts en 23 páginas · Font Awesome CDN en 12 · GTM en 11** | conteo sobre `*.html` |
| Batería de calidad (14 comprobaciones) | **14/14** | `probar-web-publica.js` |
| Teclado / texto al 200 % / 375 px | pasa | batería |
| Candidato de Codex (`transfer/web-premium-0f27055`) | **no existe todavía** | `git ls-remote` |

**No medido** (y no se inventa): LCP, INP, CLS y TTFB reales. Requieren Lighthouse/WebPageTest contra el sitio publicado o un servidor local con throttling; no se ejecutaron en esta evaluación.

## 2. Brechas premium priorizadas

### Críticas (bloquean la percepción premium o la estabilidad)

1. **CSS/JS en línea en cada página.** 30 documentos de 20–66 KB con el mismo CSS y JS repetido: sin caché compartida, cada visita descarga todo y cada cambio invalida todas las páginas. Es la deuda de arquitectura número uno.
2. **Dependencias externas frágiles en tres frentes**: Google Fonts (23 páginas), Font Awesome por CDN (12) y GTM (11). Si el CDN falla, se pierde tipografía e iconos; y las fuentes de Google bloquean el render.
3. **Sin métricas de Core Web Vitals.** No hay evidencia de LCP/INP/CLS, así que no se puede afirmar que la web sea rápida, solo que es más ligera.
4. **Portafolio sin narrativa comercial.** Existe el listado y las fichas, pero no hay patrón de "problema → solución → resultado" ni prueba social; el recorrido no empuja a la conversión.

### Importantes (impiden la sensación de agencia premium)

5. **Jerarquía tipográfica plana** entre home y páginas internas: los títulos no escalan con la importancia del contenido.
6. **Microinteracciones escasas**: sin transiciones consistentes, sin estados de carga perceptibles, sin feedback al enviar formularios.
7. **CTA repetitivo y poco diferenciado** (mismo botón para todo): no hay CTA primario vs secundario por intención.
8. **Blog presentado como listado**, no como activo comercial (sin autor, sin fecha visible consistente, sin artículos relacionados).
9. **Sin páginas de caso de estudio**: las fichas de portafolio muestran la captura, no el resultado.

### Opcionales (valor alto, no urgentes)

10. Modo oscuro coherente con la identidad.
11. Búsqueda interna y filtros de portafolio.
12. Versión en inglés del home y de servicios.

## 3. Transformación recomendada

**Dirección visual:** KONFÍO ZINC es una agencia tecnológica con identidad dorada (`#F0B429`) sobre grafito. La web debe sentirse *sofisticada y medida*, no oscura ni recargada:

- Tipografía: una familia display de peso alto para titulares y una de texto legible; escalas fluidas `clamp()` (ya definidas en `premium/premium.css`).
- Fondos claros con acentos dorados; el grafito reservado a footer y bloques de énfasis.
- Espaciado generoso, retícula de 12 columnas, tarjetas con relación fija para evitar saltos (CLS).
- Movimiento: transiciones de 200–250 ms, aparición por intersección, **todo desactivado con `prefers-reduced-motion`**.

**Arquitectura:** extraer el CSS y el JS comunes a **dos archivos versionados** (`assets/css/site.css`, `assets/js/site.js`) con hash en la URL, servidos con caché larga; localizar las fuentes e iconos (o quedarse con un solo proveedor con `font-display: swap` y respaldo del sistema); conservar HTML nativo y GitHub Pages.

**Conversión:** propuesta de valor en la primera pantalla con CTA primario único (WhatsApp) y secundario (ver servicios); un formulario por intención con confirmación explícita; portafolio reordenado por servicio con una métrica de resultado por caso.

## 4. Alcance consolidado del lote de implementación (una sola misión)

| # | Trabajo | Criterio de aceptación |
|---|---|---|
| 1 | Extraer CSS/JS compartidos de las 30 páginas a 2 archivos con caché | HTML de cada página = plantilla + 2 `<link>`/`<script>`; `0` bloques `<style>` de más de 4 KB; batería 14/14 |
| 2 | Localizar o consolidar fuentes e iconos | 0 peticiones a Google Fonts y a cdnjs en el sitio publicado; iconos con sprite local |
| 3 | Aplicar el sistema de la biblioteca `premium/` (nav, botones, tarjetas, footer) | Una sola definición de cada componente; sin duplicar estilos en línea |
| 4 | Rejilla de portafolio con relación fija e imagen optimizada | Sin cambios de tamaño en carga; CLS objetivo < 0,1 |
| 5 | Jerarquía tipográfica y espaciado con `clamp()` | Escalas documentadas; sin saltos entre 320 y 1440 px |
| 6 | CTA primario/secundario y formulario con confirmación | Un CTA primario por pantalla; formulario nunca por GET; mensaje de éxito solo tras respuesta real |
| 7 | Medir Core Web Vitals con Lighthouse local | LCP, CLS e INP medidos y registrados (no estimados) |
| 8 | Página de caso de estudio con plantilla reutilizable | 1 caso publicado con estructura problema → solución → resultado |
| 9 | Preservar rutas y Card Spark | `0` rutas históricas eliminadas; `git diff` vacío en `admin/`, `panel.html`, `admin.html`, reglas, índices, `firebase.json`, `precios.html` |

**Fuera de alcance:** rediseño de identidad de marca, contenido comercial nuevo sin evidencia, e-commerce, backend.

## 5. Criterios de aceptación globales (GO/NO-GO de la implementación)

- Batería de calidad: **14/14** (más los casos nuevos de 320 y 768 px).
- `verificar-artefacto-paginas.js`: **0 fallos**; interno (`docs/`, `herramientas/`, `functions/`, reglas) en 404.
- `verificar-precios.js`: verde, sin nomenclatura retirada.
- 0 enlaces rotos, 0 peticiones externas obligatorias, 0 errores de JS.
- Core Web Vitals **medidos**: LCP < 2,5 s, CLS < 0,1, INP < 200 ms en local con throttling.
- Rutas históricas intactas y Card Spark sin un solo cambio.

## 6. Riesgos de integración

1. **Colisión con el candidato de Codex**: si llega `transfer/web-premium-0f27055`, su arquitectura de CSS/estilos manda. Mitigación: este plan escribe en `harness/premium-dev` (rama aparte), con el sistema en `premium/` como referencia; la fusión se hace sobre `a27c7fa` y solo se toma lo que no contradiga su diseño.
2. **Extracción de CSS/JS**: ya falló una vez por meter JSON-LD y bloques de GTM dentro del JS compartido. Mitigación: excluir explícitamente `<script type="application/ld+json">` y los bloques de analítica, y verificar con captura de pantalla antes/después.
3. **Fuentes locales**: localizar tipografías añade peso; hay que decidir entre subconjunto local o un solo proveedor con `font-display: swap`.
4. **Medición de CWV**: Lighthouse desde el ASUS mide el sitio publicado, no la rama; los valores de la rama solo son comparables entre sí.
5. **Precios**: cualquier texto comercial nuevo exige validación del propietario (Básica $49.900 / Pro $99.900; retirados Star/Pro/Elite y $149.900).

## 7. Coordinación con Codex

`transfer/web-premium-0f27055` **no existe** en `konfiozinc/kz-workspace` (verificado con `ls-remote` en este lote). No se inventó su contenido ni se reconstruyó una copia especulativa.

**Regla de reutilización:** cuando llegue, se compara su diseño con el sistema de `premium/` y **se conserva el suyo**; de este plan se aprovechan las piezas que no dependan de diseño: la extracción de CSS/JS (con su arquitectura), la localización de fuentes, la medición de CWV, las plantillas de caso de estudio y las pruebas.

## 8. GO / NO-GO

# ✅ GO para iniciar la transformación

**Con dos condiciones:**

1. **Una sola misión de implementación**, con el alcance de la sección 4 completo —no por tandas— y con los criterios de la sección 5 como puerta de salida.
2. **Sin publicar**: el trabajo queda en rama local con su evidencia; la publicación exige autorización expresa y, si ya llegó el candidato de Codex, previa comparación.

Si el candidato de Codex aparece **antes** de empezar, el orden cambia: primero se integra su diseño, y este plan se aplica encima como capa de calidad (rendimiento, SEO, accesibilidad, conversión), no como rediseño paralelo.

**Card Spark y producción intactos en este expediente:** `git diff` vacío en `admin/`, `panel.html`, `admin.html`, `firestore.rules`, `firestore.indexes.json`, `firebase.json` y `precios.html`; `origin/main` en `a27c7fa`.
