# KZ-CONVERSION-015 · Aceptación

**Fecha:** 2-nov-2026 · **Rama:** `feature/kz-conversion-015` · **Estado:** lista para revisión, **NO publicada**

## 1. Qué se acepta como terminado

| Requisito de la orden | Estado | Evidencia |
|---|---|---|
| A. Selector de negocio (5 industrias) | **Terminado** | `soluciones.html` §1 + 4 pruebas |
| B. Tres demostraciones funcionales | **Terminado** | tarjeta (.vcf real), menú (carrito con total), mini web (vista previa en vivo) |
| C. Recorrido comercial de 5 pasos | **Terminado** | progreso 5/5 verificado con acciones reales |
| Cotizador con precios oficiales | **Terminado** | $49.900 / $99.900 exactos; «a medida» sin cifra |
| Captura de prospectos con consentimiento | **Terminado (cliente)** | validación + registro local + WhatsApp sin confirmación falsa |
| Métricas de intención | **Parcial** | 4 contadores de sesión y 8 eventos GA4 preparados; sin backend |
| Identidad Neo Tech | **Terminado** | tokens existentes, sin paleta paralela, sin dorados |
| No copiar PANA.CLICK / Tapxter | **Cumplido** | contenido, textos y maquetas propios |
| Precios sin tocar | **Cumplido** | `precios.html` y `servicios.html` intactos |
| Sin hardware/NFC | **Cumplido** | no existe ninguna referencia |

**Pruebas: 38/38 PASS** en 375, 768, 1440 y 1920 px.

## 2. Qué NO se acepta como terminado

- **CRM digital (fase 3):** no implementado. Requiere autenticación, autorización por rol, validación en servidor y revisión de privacidad. Necesita autorización para tocar Firebase y una revisión de seguridad previa a cualquier publicación.
- **Configurador con exportación/publicación (fase 5):** solo personalización y vista previa.
- **Asesor Konfi ampliado (fase 7):** sin cambios; vive en un Worker externo.
- **Seguimiento de aliados y ventas confirmadas (fase 8):** pendiente de una fuente de verdad autenticada.
- **Revisión de Codex y Codex Sites:** no disponibles en este entorno.

## 3. Riesgos abiertos

1. **Sin enlace en el menú del sitio.** La página existe pero no está enlazada desde la navegación: publicarla sin enlace la dejaría huérfana (y no indexable por enlaces internos).
2. **Datos de prospectos solo en el navegador.** Si el visitante borra el almacenamiento, se pierde el registro local; el dato real está en el chat de WhatsApp.
3. **Sin antispam.** El formulario no tiene captcha ni límite de frecuencia; con tráfico real conviene añadir uno (requiere backend).
4. **Precios «a medida».** Cualquier cifra mostrada sería inventada; hoy se evita por diseño.
5. **La documentación de alcance de los planes** se resume en un desplegable; conviene que el CTO confirme el texto exacto publicado en `precios.html` antes de usarlo en ventas.

## 4. Recomendación

**Recomiendo revisar y publicar la página como piloto**, con dos condiciones:

1. Añadir el enlace en la navegación y en la portada en el mismo despliegue (hoy no está).
2. No publicar ninguna promesa de CRM, configurador con exportación ni «venta confirmada» hasta que existan con autorización.

No se ha modificado `main`, no se ha desplegado nada y no se ha tocado Firebase, Worker, precios ni datos de clientes.

## 5. Reversión

Todo vive en la rama. Para descartar el trabajo: `git checkout main && git branch -D feature/kz-conversion-015`. Si ya estuviera fusionado: `git revert -m 1 <merge>`.

## 6. Commits

Ver `git log --oneline main..feature/kz-conversion-015` en el repositorio local `Konfio-Zinc-Web`.

## 7. Dictamen de preparación para publicación (ronda 2)

**Preparado para revisión final del CTO. No publicado.**

| Criterio | Estado |
|---|---|
| Navegación integrada sin regresiones | **Sí** — 10 páginas con el enlace y 5 páginas verificadas en 200 sin 404 |
| Precios y alcance respaldados por `precios.html` | **Sí** — 6 comprobaciones, `precios.html` intacto |
| Captación honesta y consentimiento explícito | **Sí** — «la agencia no ha recibido nada», borrador local, borrado disponible |
| Revisión independiente de Codex | **Hecha** — 10 hallazgos, todos corregidos |
| Pruebas | **69/69** (38 funcionales y visuales + 31 de navegación, alcance y captación) |
| Sin tocar `main`, Firebase, Worker ni precios | **Cumplido** |

**Condiciones antes de publicar:**
1. Decidir si el ítem «Soluciones» se queda en la nav (hoy está en las 10 páginas).
2. Confirmar el texto de alcance de los planes (ya alineado con `precios.html`).
3. Revisión visual de Codex Sites si la herramienta está disponible; no lo estaba en esta ronda.

**Riesgos que siguen abiertos:** sin antispam en el formulario, borrador local que se pierde al limpiar el navegador y CRM sin implementar (fase 3 pendiente de autorización y revisión de privacidad).