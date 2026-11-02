# KZ-CRM-019 · Rediseño profesional del panel administrativo

**Fecha:** 2 de noviembre de 2026
**Proyecto:** `6-LANDING-PAGES/Konfio-Zinc-Web` (repo `konfiozinc/card`)
**Rama de trabajo:** `feature/kz-crm-019` (creada desde `main` = `729e610`)
**Estado:** ⏸️ **PUNTO DE PARADA** — rediseño terminado y verificado; **nada publicado**, esperando aprobación de Darwin.

---

## 1. Qué se ha hecho, en una frase

El panel del CRM pasa de ser **una lista de tarjetas apiladas** (todo debajo de todo) a un **panel de administración con áreas, cartera y ficha en paralelo, indicadores, y una versión móvil pensada para trabajar con el pulgar**, sin tocar una sola línea de la lógica que ya funcionaba.

---

## 2. Diagnóstico: qué estaba mal (y por qué costaba trabajar)

Revisado el panel tal como estaba publicado (`main`, commit `729e610`):

| # | Problema real | Consecuencia para quien lo usa |
|---|---|---|
| 1 | **Todo en una sola columna**: alta → filtros → tabla → ficha → auditoría → equipo, siempre visibles y siempre apilados | Para pasar de la lista a un prospecto había que recorrer media página; en móvil, varias pantallas |
| 2 | **La ficha aparecía debajo de la tabla**, no al lado | Nunca se veían a la vez el listado y el prospecto abierto |
| 3 | **Ninguna señal de qué fila estaba abierta** | Se perdía el hilo: se editaba un prospecto sin saber cuál |
| 4 | **Sin navegación por áreas** | Auditoría y equipo se alcanzaban sólo bajando hasta el final del documento |
| 5 | **Indicadores como seis cajitas iguales**, sin orden ni jerarquía | Números sin lectura: no se distinguía cartera de embudo |
| 6 | **`crm.css` no cargaba la paleta oficial** (`kz-tokens.css`) | El panel usaba valores de respaldo: se veía correcto, pero **no compartía la paleta con el resto del sitio**. Además generaba 5 fallos en la prueba visual, uno de ellos un 404 en consola |
| 7 | **Móvil**: seis campos de alta antes de la tabla, y la barra superior ocupando una quinta parte de la pantalla | La cartera quedaba a más de una pantalla de distancia |
| 8 | **Todos los botones con el mismo degradado brillante** y «Confirmar venta» en rojo | Seis llamadas a la acción compitiendo; el rojo sugería una acción destructiva donde había un cierre comercial |

---

## 3. El rediseño

### Estructura general

```
┌──────────────────────────────────────────────────────────────────┐
│ KZ · KONFÍO ZINC   [Resumen][Prospectos][Equipo][Auditoría]  cuenta │
├──────────────────────────────────────────────────────────────────┤
│ (A) RESÚMEN: indicadores + embudo                                  │
├─────────────────────────────────┬────────────────────────────────┤
│ (B) CARTERA (columna ancha)     │ (C) FICHA (columna lateral)     │
│     caja de alta                │     nombre + estado             │
│     búsqueda y filtros          │     seguimiento → nota          │
│     tabla paginada              │     historial                   │
│                                 │     cotizaciones                │
│                                 │     venta                       │
│                                 │     cartera (asignación)        │
│                                 │     privacidad                  │
└─────────────────────────────────┴────────────────────────────────┘
```

- **Cuatro áreas** con navegación real y `aria-current`: **Resumen · Prospectos · Equipo · Auditoría** (las dos últimas sólo aparecen al administrador).
- **Maestro–detalle**: en escritorio se ve la cartera y el prospecto abierto **a la vez**; la ficha acompaña el desplazamiento.
- **La ficha está organizada por secciones** con títulos cortos: Seguimiento · Cotizaciones · Venta · Cartera · Privacidad. Es la respuesta a «dónde está cada cosa»: dejar constancia, cotizar y vender ya no viven mezclados.
- **Resumen** con la franja de indicadores y un **embudo** por estado, más la cifra de «sin asignar».

### Móvil (≤ 1100 px)

- Una sola columna **con la cartera primero** y el alta después (`order` de CSS; el orden del documento no cambia para las pruebas).
- Al tocar una fila, la vista **se desplaza sola a la ficha**, con botón **«◀ Cartera»** para volver.
- Barra superior compacta, objetivos táctiles de 44 px y sin desbordamiento horizontal.

### Sistema visual

- Sigue la identidad **Neo Tech** de KONFÍO ZINC: fondo `#050B14`, superficies azul marino, acentos **cian `#00E5FF`** y violeta, degradado de marca.
- **Ahora sí carga `assets/css/kz-tokens.css`**: la paleta es la oficial, no una copia de respaldo.
- Tarjetas con elevación suave, etiquetas de estado con color propio (y también en el embudo), tabla legible con cabecera fija, historial como línea de tiempo.
- **Jerarquía de acciones**: el degradado queda para la acción principal de cada zona; el resto son botones sólidos y sobrios. «Confirmar venta» pasa a verde (cierra una operación, no destruye nada).

---

## 4. Garantías: qué NO se ha tocado

Esto es lo importante para no romper lo que funciona:

| Elemento | Estado |
|---|---|
| **`crm/crm.js`** (toda la lógica: sesión, permisos, validaciones, notas inmutables, cotizaciones, ventas, auditoría, CSV) | **0 diferencias** con `main` — verificado con `git diff main -- crm/crm.js` |
| **`crm/alta-prospecto.js`** | Sin cambios |
| **Todos los `id` que el panel y las pruebas usan** | Presentes los **42/42** (verificado de forma cruzada contra `crm.js` y contra las 20 suites) |
| **`hidden` de cada bloque según el rol** | Sigue siendo propiedad exclusiva de `crm.js`; la navegación usa una clase distinta (`.seccion-oculta`) para no pisarlo |
| **Firestore, reglas, datos reales, cuenta de administración** | No se han tocado |
| **Publicación** | Ninguna: ni push, ni merge, ni despliegue |

**Degradación segura:** si `crm-ui.js` no cargara, el panel vuelve al comportamiento anterior (una columna, todo apilado) y **sigue siendo plenamente operativo**.

---

## 5. Verificación

### Regresión funcional (la prueba que importa)

| Suite | Resultado |
|---|---|
| `crm-dev/bateria-regresion.cjs` · 20 suites contra el emulador | **794 PASS · 0 FALLA · 20/20 en verde · exit 0** |
| Comparable con la certificación de KZ-CRM-018A | **794 PASS · 0 FALLA** — *idéntico número: cero regresión* |

### Pruebas de presentación

| Prueba | Antes del rediseño | Después |
|---|---|---|
| `pruebas-formularios.cjs` (4 tamaños: 375 / 768 / 1440 / 1920) | 48 PASS · 0 FALLA | **48 PASS · 0 FALLA** |
| `capturas.cjs` (acceso, contraste, paleta, consola) | 27 PASS · **5 FALLA** | **32 PASS · 0 FALLA** ✅ *se corrigieron los 5 fallos previos* |
| `capturas-panel-019.cjs` (nuevo: panel autenticado, escritorio y móvil) | — | **16 PASS · 0 FALLA**, sin errores de consola |
| `auditar-maqueta-019.cjs` (nuevo: geometría, contraste, jerarquía, embudo) | — | **68 PASS · 0 FALLA** |

La auditoría de maqueta mide, entre otras cosas: desbordamiento horizontal (0 px en 1440 y 390), que la ficha esté **a la derecha** de la cartera en escritorio (990 ≥ 951, hueco de 39 px) y **debajo** en móvil, contraste AA de 11 textos (mínimo medido 4,66:1 en el botón principal, peor tono de su degradado), jerarquía tipográfica, objetivos táctiles ≥ 44 px en móvil y **proporcionalidad exacta del embudo** (desvío 0 px).

### Revisión visual independiente

Se pidió una segunda mirada a un agente externo con capacidad de ver imágenes (este modelo no la tiene). Su dictamen fue **7/10** —«parece un CRM profesional, lo mostraría como avance»— y señaló cinco problemas. Se corrigieron cuatro:

1. **Barras del embudo** que no comunicaban su valor → era un defecto real: `span` sin `display:block` (el ancho se ignoraba) y «sin asignar» se dibujaba al **300 %** del carril, recortado. Corregido y ahora verificado al píxel.
2. **Cabecera fija tapando el contenido** al desplazarse a la ficha → `scroll-padding-top` y `scroll-margin-top`.
3. **Cartera después del formulario en móvil** → la cartera pasa primero.
4. **Énfasis excesivo de botones y rojo en «Confirmar venta»** → jerarquía nueva y verde para el cierre.
5. *(No corregido, documentado abajo)* Avisos globales que arrastran contexto entre áreas.

También se aplicaron dos observaciones menores: más aire antes del historial y párrafos largos acotados a 78 caracteres.

---

## 6. Vistas previas

Capturas reales del panel funcionando contra el **emulador**, con una cartera **sintética** (todos los nombres llevan «Demo»; no son resultados comerciales):

`crm-dev/capturas/panel-019/`

| Escritorio (1440×900) | Móvil (390×844) |
|---|---|
| `escritorio-00-acceso.png` | `movil-00-acceso.png` |
| `escritorio-01-prospectos.png` (+ `01b` completa) | `movil-01-prospectos.png` |
| `escritorio-02-prospectos-ficha.png` (+ `02b` completa) | `movil-02-ficha.png` (+ `02b` completa) |
| `escritorio-03-resumen.png` | `movil-03-resumen.png` |
| `escritorio-04-equipo.png` | — |
| `escritorio-05-auditoria.png` | — |

Están en `crm-dev/` a propósito: **ese directorio no se publica**.

---

## 7. Archivos y rama

| Archivo | Cambio |
|---|---|
| `crm/index.html` | Rediseñado (299 líneas): barra con navegación, cuatro áreas, cartera y ficha en dos columnas. **Todos los `id` conservados** |
| `crm/crm.css` | Reescrito (586 líneas): sistema visual completo, escritorio y móvil |
| `crm/crm-ui.js` | **Nuevo** (180 líneas): áreas, embudo, fila activa, ficha móvil. Sin acceso a datos |
| `crm/crm.js` | **Sin cambios** |
| `crm-dev/capturas-panel-019.cjs` | **Nuevo** (interno): vistas previas autenticadas |
| `crm-dev/auditar-maqueta-019.cjs` | **Nuevo** (interno): auditoría de maqueta |

Evidencias de la corrida: `docs/evidencias/kz-crm-019/` (21 archivos, 58,7 KB).

Rama: **`feature/kz-crm-019`**, creada desde `main` (`729e610`). Sin remoto, sin push, sin merge.

---

## 8. Riesgos y pendientes (dichos sin adornos)

1. **No se ha probado en un móvil físico.** Sí en 375×812 y 390×844 con el motor real. El estándar de la agencia pide la comprobación física antes de publicar: queda para cuando Darwin apruebe.
2. **El orden visual en móvil (cartera antes del alta) no coincide con el orden del documento.** Es una decisión de usabilidad a costa de cierta incoherencia para lectores de pantalla; se puede revertir con una línea.
3. **El aviso global (`#estado-panel`) sigue siendo persistente** y su texto puede quedar de un área al cambiar a otra. No se tocó porque su contenido lo escribe `crm.js` y ocultarlo podría esconder un error real.
4. **Cotizaciones y ventas son secciones de la ficha, no listas globales.** No hay pantalla «todas las cotizaciones» ni «todas las ventas»: eso exigiría consultas nuevas y cambios en las reglas, fuera del alcance autorizado aquí.
5. **La auditoría no muestra fecha** (la tabla la pinta `crm.js` con Acción/Detalle/Rol). Mejorarlo implica tocar esa función.
6. **Fallos previos no corregidos** porque no son del panel: `verificar-destino-reglas.cjs` mantiene sus 2 falsos negativos conocidos.

---

## 9. Qué haría falta para publicar (sólo si se aprueba)

1. Revisar las capturas con Darwin y ajustar lo que pida.
2. Probar en un móvil real con la URL de GitHub Pages tras el despliegue.
3. Fast-forward de `main` a esta rama (como en KZ-CRM-018), **panel primero**.
4. Comprobar que `assets/css/kz-tokens.css` responde en producción (el panel ya lo referencia).

**Nada de esto se ha ejecutado.**
