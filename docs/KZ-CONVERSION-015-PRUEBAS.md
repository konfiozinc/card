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

## 5. Cómo repetir las pruebas

```bash
# servidor estático
cd Konfio-Zinc-Web && python -m http.server 8110
# en otra terminal
RCL_CHROMIUM=<ruta-chrome> node test-conversion-015.cjs
```

Las capturas de los cuatro tamaños quedan en la carpeta de evidencia y también se versionan en `docs/capturas/kz-conversion-015/`.
