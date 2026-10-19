# Validación visual de las imágenes optimizadas (KONFÍO ZINC · web pública)

Registro de la inspección **visual humana** de las imágenes recomprimidas del sitio, separado de las
métricas automáticas. El sitio y Card Spark no se tocan: esto solo documenta el veredicto.

## Método

- Comparaciones **lado a lado a resolución completa** (2400×1600 cada archivo, original a la
  izquierda y optimizada a la derecha), generadas con ffmpeg en `C:\KZ-COMPARATIVA\tandas\`
  (carpeta privada, fuera del repositorio y del artefacto de GitHub Pages).
- Revisión realizada por el **propietario con un revisor visual externo (ChatGPT)**, adjuntando los
  archivos de comparación. Harness no dispone de visión en su sesión (servicio `HTTP 502` y plugin
  desregistrado), por lo que **no firma esta inspección**: la registra.
- Evidencia automática complementaria (no sustitutiva): **SSIM medio 0,995** en 28 imágenes, todas
  por encima de 0,97; pixel-diff exacto de `eltiti.jpg` al **0,34 %** global (peor zona 0,63 %).

## Tanda 1 — cuatro imágenes prioritarias: APROBADAS

| Archivo | Veredicto visual | SSIM (complementario) | Observaciones |
|---|---|---|---|
| `eltiti.jpg` | **APROBADA** | 0,995 (medido) | Sin artefactos en el texto del menú |
| `abogados-dta.jpg` | **APROBADA** | 0,995 (medido) | Texto sobre fotografía legible |
| `deicy-buitrago.jpg` | **APROBADA** | 0,995 (medido) | Sin pérdida de detalle en el rostro |
| `cirujana_dentista.jpg` | **APROBADA** | 0,995 (medido) | Sin pérdida de detalle en el rostro |

**No se restaura ninguna imagen.** Ninguna imagen fue modificada después de este dictamen.

## Estado del conjunto

| Estado | Cantidad |
|---|---|
| Aprobadas visualmente | **4** |
| Pendientes de revisión visual (tandas 2 y 3) | **24** |
| Rechazadas | 0 |
| Sin comparación original | 0 (las 28 tienen par) |

Comparaciones pendientes en `C:\KZ-COMPARATIVA\tandas\05-…` a `28-…`, para adjuntar de cuatro en
cuatro al mismo revisor.

## Reglas que se mantienen

- No se reemplaza una imagen sin veredicto que lo justifique y sin una versión comprobablemente mejor.
- Las imágenes aprobadas no se vuelven a recomprimir.
- Si una imagen se rechaza: se recupera el original desde `66ad6cf^`, se repite la optimización con
  parámetros más conservadores (calidad 4 o 3, mismo ancho máximo), mismo nombre y ruta, y se vuelve
  a comparar.
