# KZ-CRM-019B · Ajustes visuales para celulares

**Fecha:** 2 de noviembre de 2026
**Proyecto:** `6-LANDING-PAGES/Konfio-Zinc-Web` (repo `konfiozinc/card`)
**Rama:** `fix/kz-crm-019b-mobile`, creada desde `main` = `c7ee88e` (lo publicado)
**Estado:** ⏸️ **PUNTO DE PARADA** — ajustes preparados y probados; **nada desplegado**, esperando autorización.

---

## 1. Resumen

Tres detalles que se vieron feos en el celular, corregidos sin tocar el diseño profesional ya publicado y **sin tocar la lógica**:

| # | Antes | Ahora |
|---|---|---|
| 1 | Cartera como tabla ancha con desplazamiento horizontal | **Tarjetas** en celular: nombre, WhatsApp, industria, asesor y estado, con botón «Abrir ficha». En computador sigue la tabla |
| 2 | `damoa1510@gmail.com · admin` cortado con puntos suspensivos | **Chip compacto** con iniciales y rol; al pulsarlo se ve el **correo completo** |
| 3 | Encabezado de **155 px** (casi una cuarta parte de un celular normal) | **107 px** con el logotipo intacto y la navegación completa |

---

## 2. Medidas reales, antes y después

Las dos columnas se midieron con el mismo guion, los mismos datos de prueba y los mismos tamaños.

### Encabezado (alto total de la barra)

| Ancho | Antes | Después | Mejora |
|---|---|---|---|
| 320 px | 155 px | **107 px** | −31 % |
| 360 px | 155 px | **107 px** | −31 % |
| 375 px | 155 px | **107 px** | −31 % |
| 430 px | 155 px | **111 px** | −28 % |
| 768 px (tableta) | 127 px | **107 px** | −16 % |
| 1440 px (escritorio) | 71 px | 71 px | sin cambios |

La distribución nueva es de **dos filas**: identidad y cuenta arriba, navegación debajo. En 320 px los cuatro botones miden 63 + 72 + 51 + 64 = **250 px**: caben sin apretarse y sin desplazamiento lateral.

### Cartera

| Ancho | Antes | Después |
|---|---|---|
| 320 / 360 / 375 / 430 | tabla (6 casillas desplazables) | **6 tarjetas** |
| 768 / 1440 | tabla | tabla (sin cambios) |

Además, la primera tarjeta empieza más arriba (se compactaron los filtros y el aviso de bienvenida se retira solo):

| Ancho | Antes | Después |
|---|---|---|
| 320 px | 482 px | **408 px** |
| 360 / 375 px | 430 px | **358 px** |
| 430 px | 434 px | **381 px** |

### Cuenta

- **Antes:** el correo se cortaba (`…`) en los cuatro tamaños de celular.
- **Ahora:** chip de 101 × 44 px (320–375) y 112 × 44 px (430 y más) con las iniciales y el rol; al pulsarlo se abre el correo completo (`damoa1510@gmail.com`), que cabe sin desbordar. Se cierra con Escape o tocando fuera.

### Encuadre al abrir la ficha

Al tocar un prospecto, la vista se lleva a su ficha. Antes aterrizaba **125 px por debajo** de la barra (se colaba un trozo del formulario anterior); ahora queda a **~34 px** del borde de la barra, limpia (medido: ficha en 141–146 px con la barra terminando en 107–111 px).

---

## 3. Cómo se hizo sin romper nada

- **Una sola fuente de datos.** Las tarjetas **no** consultan nada nuevo: se construyen leyendo la tabla que ya pinta `crm.js`, celda a celda, y se rehacen solas cuando el panel repinta la cartera (alta, cambio de estado, asignación, recarga). Si un prospecto cambia, la tarjeta cambia con él.
- **Mismo recorrido para abrir.** Pulsar «Abrir ficha» dispara el **mismo manejador** que la fila de la tabla: mismos permisos, misma auditoría, misma ficha. No hay un camino paralelo.
- **El rol manda el panel, no la vista.** Qué columnas aparecen (por ejemplo «Asignado a», que sólo ve administración) se decide leyendo el **encabezado de la tabla**, no con posiciones fijas.
- **Sin tocar los permisos.** La navegación oculta con una clase CSS; el atributo `hidden` de cada bloque sigue siendo propiedad exclusiva de `crm.js`.
- **`crm.js` y `alta-prospecto.js`: 0 diferencias** con lo publicado. Las reglas de Firestore, los datos y la cuenta de administración no se han tocado.

---

## 4. Verificación

### Regresión funcional

| Prueba | Resultado |
|---|---|
| `crm-dev/bateria-regresion.cjs` · 20 suites contra el emulador | **794 PASS · 0 FALLA · 20/20 en verde · exit 0** |
| Igual que la certificación previa | **794 PASS · 0 FALLA** — cero regresión |

### Presentación

| Prueba | Resultado |
|---|---|
| `pruebas-formularios.cjs` (375 / 768 / 1440 / 1920) | **48 PASS · 0 FALLA** |
| `capturas.cjs` (acceso, contraste, paleta) | **32 PASS · 0 FALLA** |
| `auditar-movil-019b.cjs` (**nuevo**: 320 / 360 / 375 / 430 / 768 / 1440) | **192 PASS · 0 FALLA** |
| `auditar-maqueta-019.cjs` (adaptada a las tarjetas) | **69 PASS · 0 FALLA** |
| `capturas-panel-019.cjs` (vistas previas) | **16 PASS · 0 FALLA** |

La auditoría nueva comprueba, en cada tamaño: una tarjeta por prospecto y **el mismo prospecto que la primera fila de la tabla**; que la tarjeta traiga nombre, teléfono, industria, estado y asesor; que el botón mida ≥44 px y **abra la ficha correcta**; que el chip muestre el correo completo y no se salga de la pantalla; que la ficha no quede tapada; que la búsqueda y el filtro por estado actúen sobre las dos vistas a la vez; y que los acentos lleguen íntegros al navegador.

### Revisión visual independiente

Se pidió una segunda mirada externa en dos rondas: **8/10** en la primera (con tres retoques) y **9/10** tras aplicarlos — *«está listo para enseñárselo al dueño; los tres retoques quedaron bien»*.

---

## 5. Un defecto propio, encontrado y corregido

La revisión externa avisó de textos con acentos dañados («BÃ¡sica», «PanaderÃ­a»). La comprobación descartó el panel: `crm/index.html` y `crm/crm-ui.js` están en UTF-8 limpio y el navegador recibe bien los acentos.

El fallo estaba **en mi herramienta de capturas**, que sembraba los datos de prueba con doble codificación: 28 secuencias en `capturas-panel-019b.cjs` y 40 en `capturas-panel-019.cjs` (de la misión anterior, de ahí que sus vistas previas también salieran mal). Corregido en ambos ficheros, con las capturas regeneradas —incluidas las del **antes**, tomadas de un worktree del commit anterior— y con una **aserción nueva** que vigila los acentos en cada ejecución.

---

## 6. Vistas previas

En `crm-dev/capturas/panel-019b/` (interno, no se publica):

| Carpeta | Contenido |
|---|---|
| `antes/` | panel anterior: `prospectos-{320,360,375,430,768-tableta,1440-escritorio}.png`, `ficha-*.png`, `resumen-*.png`, `medidas.json` |
| `despues/` | mismo guion sobre el panel corregido, más `auditoria-movil.json` |

Los tres pares que resumen la misión: `antes/prospectos-375.png` frente a `despues/prospectos-375.png`, `antes/prospectos-320.png` frente a `despues/prospectos-320.png`, y `despues/ficha-375.png` para el encuadre.

Los datos son **sintéticos** (todos los nombres llevan «Demo»); no son resultados comerciales.

---

## 7. Archivos y rama

| Archivo | Cambio |
|---|---|
| `crm/index.html` | Chip de cuenta, contenedor de tarjetas, placeholder del buscador y «Todos» en el filtro |
| `crm/crm.css` | Tarjetas, chip de cuenta, encabezado de dos filas, filtros compactos |
| `crm/crm-ui.js` | Construcción de las tarjetas, apertura de ficha desde tarjeta, chip, encuadre bajo la barra, retirada del aviso de bienvenida |
| `crm/crm.js` | **Sin cambios** |
| `crm/alta-prospecto.js` | **Sin cambios** |
| `crm-dev/capturas-panel-019b.cjs` | **Nuevo** (interno): capturas antes/después |
| `crm-dev/auditar-movil-019b.cjs` | **Nuevo** (interno): auditoría de los tres ajustes |

Evidencias: `docs/evidencias/kz-crm-019b/` (21 archivos).

Rama **`fix/kz-crm-019b-mobile`**, sin remoto, sin push, sin merge. `main` sigue en `c7ee88e` y el panel publicado no ha cambiado.

---

## 8. Riesgos y pendientes

1. **No probado en un celular físico.** Sí en 320, 360, 375, 430, 768 y 1440 con el motor real. La comprobación en un teléfono de verdad sigue pendiente y le corresponde a Darwin antes de publicar.
2. **El aviso «Sesión iniciada como …» ahora desaparece solo a los 2,5 s.** Es una decisión de presentación: informa una vez y no ocupa sitio. Los errores y las confirmaciones **no** se ocultan.
3. **En tableta (768) la barra también es de dos filas** (107 px): es táctil, y con una sola fila medía 127 px.
4. **«Exportar CSV» ocupa su propia fila** en el celular. Es el único control que aún no comparte fila; se dejó así para no apretar el filtro de estado.
5. **La tarjeta no muestra el servicio de interés**, que sí aparece en la ficha. Se omitió a propósito para no recargarla.
6. En móvil se oculta el contador «N de M prospectos» porque la banda de la cartera ya da esa cifra. Si la cartera se leyera **incompleta**, ese aviso no se recorta nunca: se muestra entero.

---

## 9. Para publicar (sólo con autorización nueva)

1. Revisar las capturas (o el panel en local) con Darwin.
2. Probar en un celular real.
3. Fast-forward de `main` a esta rama y verificar en GitHub Pages, como en KZ-CRM-019.

**Nada de esto se ha ejecutado.**
