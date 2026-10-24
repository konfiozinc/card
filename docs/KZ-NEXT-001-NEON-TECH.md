# KZ-NEXT-001 · Neon Tech — alternativa visual premium

**Estado: GO LOCAL — candidato terminado y certificado, NO publicado.**
**Rama:** `kz-next-001/neon-tech` · **Base:** `main` en `e8491f2` · **Producción: intacta.**

Este documento describe la propuesta Neon Tech: qué es, cómo se previsualiza, qué se midió contra
la web vigente, qué se decidió **no** hacer y cómo se publicaría si el propietario lo autoriza.

---

## 1. Qué es Neon Tech

No es un sitio nuevo desde cero: es una **capa de identidad** que repinta el sitio existente sin tocar
su contenido. La decisión de diseño importante es esa — el contenido comercial, los precios, el SEO,
los formularios y el Asesor Konfi se conservan tal cual; solo cambia la identidad visual.

```
assets/css/kz-neon.css      ← NUEVA: primitivas, tokens y acabado neón
assets/css/styles.css       ← consume los tokens (páginas comerciales)
premium-assets/styles.css   ← declara sus nombres como alias de --kz-* (portada)
```

Las páginas cargan la capa con una línea:

```html
<link rel="stylesheet" href="assets/css/kz-neon.css">
```

### Paleta y contraste declarados

La hoja documenta cada valor y su contraste medido (WCAG 2.1, sRGB):

| Combinación | Contraste |
|---|---:|
| Blanco sobre base `#050B14` | 19,7:1 |
| `#D4DEED` sobre base | 14,5:1 |
| Acento `#00E5FF` sobre base | 12,8:1 |
| Texto oscuro sobre botón cian | 12,8:1 |
| `#A78BFA` (texto violeta) sobre superficie | 6,2:1 |
| `#8B5CF6` (violeta de degradado) | 4,0:1 → **solo decorativo** |

**Regla de uso declarada:** el violeta `#8B5CF6` se emplea en degradados, bordes y resplandores;
**nunca como color de texto pequeño**. Para texto violeta se usa `#A78BFA`. Es la clase de decisión
que evita que un rediseño bonito sea ilegible.

## 2. Qué incluye

| Requisito de la misión | Estado |
|---|---|
| Identidad visual moderna | ✅ capa de tokens + acabado neón |
| Portada de alto impacto | ✅ `index.html` con resplandores y paneles de servicio |
| Mini Web Básica y Pro con precios oficiales | ✅ $49.900 y $99.900 intactos en todas las páginas |
| Servicios, beneficios y ejemplos | ✅ páginas de servicio y portafolio existentes, repintadas |
| Portafolio visual organizado | ✅ `portafolio.html` + 14 fichas |
| Asesor Konfi | ✅ sin cambios: mismo Worker, mismo chat |
| Formularios `/leads` | ✅ sin cambios: verificado que apuntan al Worker |
| Navegación intuitiva | ✅ misma estructura, con salto al contenido |
| Experiencia móvil | ✅ 0 desbordes de 320 a 1920 px |
| Animaciones ligeras y accesibles | ✅ respeta `prefers-reduced-motion` |
| SEO técnico y metadatos | ✅ `theme-color` unificado a `#050B14`; resto intacto |
| Rendimiento y accesibilidad | ✅ medidos (§4) |

### Testimonios: no se han inventado

La misión pedía testimonios **auténticos, únicamente cuando existan fuentes verificables**. Se revisó el
repositorio completo: **no existe ningún testimonio de cliente con fuente comprobable**. Lo que aparece
son menciones a «espacio para testimonios» como *característica del producto* y un caso de éxito con
«+90 reseñas en Google» en la página de códigos QR, que es un dato del cliente, no una cita citable.

**Decisión: no se ha creado ninguna sección de testimonios.** Inventar citas de clientes habría sido
publicar afirmaciones falsas con nombre y apellido. Si el propietario aporta testimonios reales con
autorización de uso, se añaden encima de esta capa sin tocar nada más.

## 3. Cómo se construyó (y qué se descartó de la rama original)

Existía ya una rama `harness/neon-tech` con una propuesta previa. **No se fusionó**: estaba basada en un
`main` anterior a KZ-OPS-001 y traía consigo la reversión de trabajo ya publicado. Se recuperó de ella
**solo la capa visual** y se aplicó sobre el `main` actual.

Descartes deliberados, con su motivo:

| Se descartó | Por qué |
|---|---|
| `premium-assets/app.js` de esa rama | Sustituía el envío del formulario por `fetch('/api/leads')`, **un endpoint que no existe en esta arquitectura**, y eliminaba las protecciones de KZ-SEC-002 (cooldown, URL del Worker, cuerpo validado). Habría roto la captación. Se conservó el archivo actual y solo se repintaron sus colores del canvas. |
| `contacto.html` de esa rama | Revertía el arreglo de privacidad de KZ-QA-001: eliminaba el aviso `<noscript>` y volvía al formulario anterior. Se aplicó solo el `theme-color` y la hoja de identidad. |
| Comentario `/ ELITE` en `servicios.html` | Reintroducía en el código fuente un plan retirado. No se aplicó. |
| `admin/`, `assets/js/admin/`, `firestore.rules`, `herramientas/test/`, `docs/` de esa rama | Todo el trabajo de KZ-OPS-001/002, que habría quedado revertido. |

Las 38 páginas restantes sí se tomaron completas: su diferencia con `main` era de 2 a 9 líneas
(`theme-color`, la hoja nueva y renombres de clase).

## 4. Comparación medida con la web vigente

Medido con `herramientas/comparar-vigente-neon.js`: levanta cada versión en su propio servidor y mide el
DOM y el rendimiento real de **115 métricas** en 5 páginas, a 1440 y 375 px.

| Resultado | Métricas |
|---|---:|
| Iguales | **90** |
| Gana la web vigente | 17 |
| Gana Neon Tech | 3 |
| No concluyentes (contraste) | 5 |

**Las 17 victorias de la versión vigente son una sola causa:** Neon Tech carga una hoja más. Eso se
traduce en **+1 petición, +25 reglas CSS y +1 nodo DOM** (el propio `<link>`), en todas las páginas.
El tiempo de carga es ruido: en dos páginas gana Neon (964→728 ms, 1488→1425 ms) y en tres gana la
vigente (665→669, 715→776, 1580→2057 ms).

**Bloqueantes de Neon Tech: 0.**

| Comprobación | Resultado |
|---|---|
| Desbordes horizontales a 375 px | **0** en las 5 páginas |
| Precios retirados anunciados | **0** |
| Pérdida de un precio oficial | **0** |
| Páginas con campos sin etiqueta | **0** |
| Imágenes sin `alt` / botones sin nombre | 0 / 0 (igual que la vigente) |
| `h1` por página | 1 (igual) |
| Landmarks | 5 (igual) |

### Accesibilidad y responsive — verificador propio de la propuesta

`herramientas/verificar-neon.js` mide sobre el render real, no sobre el CSS: **0 fallos, 0 avisos**.

- Sin desborde horizontal de **320 a 2560 px**, y al **200 % de zoom** (1440→720, 1920→960).
- **Contraste WCAG AA medido en píxeles reales** sobre 26 muestras de texto fotografiadas.
- **Foco visible** en las 12 paradas de tabulación de `index.html` y `precios.html`.
- **Movimiento reducido**: 0 animaciones y 0 bloques ocultos con `prefers-reduced-motion`.
- Hoja de estilos aplicada (273 reglas en `index.html`, 606 en `precios.html`, 0 vacías).

## 5. Regresión: nada de lo certificado se rompe

Ejecutado sobre esta rama:

| Suite | Resultado |
|---|---|
| Puerta de calidad de la web pública (`pruebas-qa-001-web-publica.js`) | **186/186** |
| Verificador de precios (`verificar-precios.js`) | **OK** |
| Verificador Neon (`verificar-neon.js`) | **0 fallos, 0 avisos** |

La puerta de calidad confirma, entre otras cosas, que **los dos formularios siguen apuntando al Worker
`/leads`**, que no hay persistencia de datos personales, que no hay endpoints ficticios y que no se
anuncia ningún plan retirado.

**Nota sobre `verificar-tokens.js`:** esa herramienta exige que los valores CSS calculados sean
**idénticos** entre la hoja anterior y la nueva. Neon Tech cambia la paleta a propósito, así que su
premisa no aplica: informa 676+ diferencias que son exactamente el rediseño. Se ejecutó, se entiende su
resultado y **no se usa como criterio** — usarla para bloquear un cambio de identidad sería un error de
interpretación, no una garantía.

## 6. Previsualización aislada

```bash
cd 6-LANDING-PAGES/Konfio-Zinc-Web
git checkout kz-next-001/neon-tech

# 1) Servidor estático propio de la propuesta (sin dependencias nuevas)
node herramientas/capturar-neon.js --etiqueta neon --salida C:\KZ-EVIDENCIA\neon
#    levanta el sitio en http://127.0.0.1:5211/ y deja 30 capturas

# 2) Verificación de accesibilidad, responsive y contraste
node herramientas/verificar-neon.js

# 3) Comparación contra la versión vigente
node herramientas/comparar-vigente-neon.js --a <worktree-de-main> --b .
```

**Aislamiento:** la previsualización sirve archivos estáticos locales. Los formularios apuntan al Worker
de producción, pero **no se envía nada** en una captura ni en una verificación; y para un E2E de envío
existe `herramientas/preparar-staging.js`, que genera una copia con el endpoint apagado y verifica de
forma **bloqueante** que no quede ninguna referencia a producción.

## 7. Evidencias

En `C:\KZ-EVIDENCIA\neon\` (fuera del repositorio):

| Carpeta | Contenido |
|---|---|
| `neon\` | 30 capturas de Neon Tech |
| `main\` | 30 capturas de la versión vigente, en el mismo momento y tamaños |

Páginas: portada, precios, servicios, portafolio, contacto, nosotros y el robot del chat.
Anchos: **320, 375, 768, 1440 y 1920 px**, más la versión de página completa de cada una.

La comparación píxel a píxel (`herramientas/comparar-capturas.js`) confirma el cambio de dominante de
`#000000` a `#050B14` y el acento cian `#00E5FF` conservado.

## 8. Publicación futura (requiere autorización expresa)

**No está publicado y la web premium vigente no se ha tocado.** Cuando el propietario lo autorice:

1. Revisar visualmente las capturas de `C:\KZ-EVIDENCIA\neon\` y la previsualización en
   `http://127.0.0.1:5211/`.
2. `git checkout main && git merge --no-ff kz-next-001/neon-tech` (sin force-push).
3. `node herramientas/verificar-precios.js` y `node herramientas/test/pruebas-qa-001-web-publica.js`
   deben seguir en verde.
4. `git push origin main` → GitHub Pages publica.
5. Verificar en vivo: la puerta de calidad con `--base https://konfiozinc.github.io/card` y el humo
   `herramientas/test/humo-produccion-ops-001.js`.
6. **Reversión:** `git revert` del merge y push. Las reglas de Firestore y el Worker no cambian en
   ninguna fase, así que no hace falta revertir nada más.

**Riesgo de la publicación:** bajo. No cambia contenido, precios, formularios, reglas ni Worker; solo
CSS y el `theme-color`. El único efecto sobre el negocio sería que un visitante no reconozca la marca de
un día para otro.

## 9. Riesgos residuales

1. **La identidad es un cambio de percepción de marca.** El propietario debería verla antes de
   publicarla; por eso están las capturas en cinco anchos y la previsualización local.
2. **El contraste del violeta `#8B5CF6` (4,0:1) es insuficiente para texto pequeño.** Está documentado
   y restringido a decoración, pero un cambio futuro de la hoja podría romper esa regla: el verificador
   de contraste por píxeles la detectaría.
3. **Sin testimonios.** No hay fuentes verificables. Es una ausencia deliberada, no un olvido.
4. **El modo oscuro es la identidad**, no una opción: no hay variante clara. Añadirla sería otro trabajo.
5. **No se ha probado en dispositivo físico**, solo en Chromium con emulación de viewport y de zoom. Las
   pruebas de movimiento reducido y de foco sí son reales en el navegador.
