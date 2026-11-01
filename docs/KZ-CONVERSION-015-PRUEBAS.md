# KZ-CONVERSION-015 · Pruebas

**Ejecutado:** 2-nov-2026 · **Resultado global: 38/38 PASS**
**Navegador:** Chromium 1243 (Playwright) · **Servidor:** estático local en `:8110`
**Evidencia:** `C:\KZ-EVIDENCIA\kz-conversion\CONV-{375x812,768x1024,1440x900,1920x1080}.png` y script `C:\KZ-EVIDENCIA\test-conversion-015.cjs`

## 1. Responsive y accesibilidad básica (20/20)

| Viewport | Industrias/Demos | Desbordamiento | Táctil mínimo | Contenedor | Consola |
|---|---|---|---|---|---|
| 375×812 | 5 / 3 | 0 px | 44 px | 375 px | limpia |
| 768×1024 | 5 / 3 | 0 px | 44 px | 768 px | limpia |
| 1440×900 | 5 / 3 | 0 px | 44 px | **1200 px** | limpia |
| 1920×1080 | 5 / 3 | 0 px | 44 px | **1200 px** | limpia |

Sin errores de consola ni recursos 404 en ningún tamaño.

## 2. Recorrido comercial (18/18)

| Comprobación | Resultado |
|---|---|
| Elegir «Restaurantes» actualiza recomendación y salta a la demo de menú | PASS |
| El progreso cuenta solo acciones reales (2 de 5) | PASS |
| «Guardar contacto» descarga `contacto-demostracion.vcf` | PASS |
| Carrito de demostración: 2 × $18.900 = **$37.800**, «2 productos» | PASS |
| La vista previa refleja nombre y color (`#ff8800`) | PASS |
| Cotizador muestra el precio oficial Pro **$99.900** | PASS |
| «A medida» no inventa precio y exige evaluación humana | PASS |
| Valida nombre, teléfono y consentimiento (3 errores) | PASS |
| Sin consentimiento no prepara la solicitud | PASS |
| Rechaza WhatsApp inválido («entre 10 y 15 dígitos») | PASS |
| WhatsApp abre el número oficial `573206411340` | PASS |
| El mensaje incluye plan e industria | PASS |
| Avisa de que **no queda confirmado** | PASS |
| Registra el lead local con `consentimiento: true` | PASS |
| Progreso final 5 de 5 | PASS |
| No afirma «venta/pedido/compra confirmada» | PASS |
| Sin errores de consola durante el recorrido | PASS |

## 3. Pruebas de honestidad (integradas arriba)

- Búsqueda explícita de las cadenas «venta confirmada», «pedido confirmado» y «compra confirmada» en todo el texto renderizado: **0 apariciones**.
- Las demostraciones llevan sello visible «Demostración · datos ficticios».
- «A medida» no contiene ningún importe (`$` + dígitos) en su resumen: verificado por expresión regular.
- El estado final de la solicitud incluye literalmente «el pedido no queda confirmado».

## 4. Lo que **no** está probado (y por qué)

| Área | Motivo |
|---|---|
| CRM con autenticación y roles | No implementado |
| Exportación/publicación del configurador | No implementado |
| Asesor Konfi ampliado | Worker externo, no modificado |
| Ventas confirmadas y comisiones | Sin fuente de verdad autenticada |
| Revisión de Codex y Codex Sites | Herramientas no disponibles en este entorno; se solicita cuando lo estén |


## 6. Ronda 2 — tras integrar la navegación y aplicar la revisión de Codex

Ejecutada el 2-nov-2026 sobre la rama `feature/kz-conversion-015`. Dos baterías:

| Batería | Comprobaciones | Resultado |
|---|---|---|
| Funcional y visual original (4 tamaños + recorrido) | 38 | **38/38 PASS** |
| Navegación, alcance de planes y captación | 31 | **31/31 PASS** |

### Qué cubre la segunda batería

- **Navegación:** «Soluciones» aparece como ítem propio (`<li><a class="nav-link">`) en index, servicios, precios, portafolio, contacto, nosotros, blog, aliados, gracias y en la propia página; las cinco páginas comprobadas siguen respondiendo 200, renderizan y no generan 404 nuevos.
- **Alcance de planes:** la página reproduce el alcance oficial de `precios.html` (Básica: contacto/WhatsApp/redes, ubicación con mapa, código QR, dominio el primer año, entrega 24–48 h; Pro: catálogo **o** menú digital, galería, botón de pedido, soporte prioritario) y **ya no afirma** «diseño responsive» ni «secciones ampliadas». `precios.html` no se modificó.
- **Captación:** el estado visible dice «la agencia todavía no ha recibido nada»; el registro se guarda como `ambito: borrador_local` con consentimiento; no aparece «CRM operativo» ni «prospecto recibido».

### Hallazgos de la revisión de Codex y su estado

| # | Hallazgo | Estado |
|---|---|---|
| 1 | Cabecera superpuesta al título en móvil | **Corregido**: `.sol-page .site-header` deja de ser fija y la nav envuelve en móvil |
| 2 | Datos personales sin borrado | **Corregido**: consentimiento explica la retención y hay botón «Borrar los datos guardados» |
| 3 | `innerHTML` con contadores del almacenamiento | **Corregido**: enteros validados y pintados con `textContent` |
| 4 | El recorrido se auto-marcaba | **Corregido**: la página abre en «0 de 5»; solo marcan acciones reales |
| 5 | Enlace dentro del `<li>` de Servicios | **Corregido**: ahora es un ítem propio con clase `nav-link` |
| 6 | Pestañas con a11y incompleta | **Corregido**: `aria-controls`/`aria-labelledby`, `tabindex` y flechas ←/→ |
| 7 | Contadores desconectados | **Corregido**: conectados a acciones reales y descritos como «en tu navegador» |
| 8 | Sin plan elegido se declaraba «a medida» | **Corregido**: el servicio es obligatorio; si falta, no se prepara la solicitud |
| 9 | Enlace compartido sin destino | **Corregido**: los paneles tienen id y la página abre la demo del `#hash` |
| 10 | Contraste de la vista previa | **Corregido**: se detecta fondo claro y se cambia el texto |

Errores propios detectados y corregidos durante esta ronda (no llegaron a la entrega): `appendChild(fila)` con variable mal nombrada y `const tabs = $(".tab")` que rompían la inicialización; ambos verificados ahora sin `pageerror`.
## 5. Cómo repetir las pruebas

```bash
# servidor estático
cd Konfio-Zinc-Web && python -m http.server 8110
# en otra terminal
RCL_CHROMIUM=<ruta-chrome> node test-conversion-015.cjs
```

Las capturas de los cuatro tamaños quedan en la carpeta de evidencia y también se versionan en `docs/capturas/kz-conversion-015/`.
