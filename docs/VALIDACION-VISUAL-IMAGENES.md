# Validación visual de las imágenes optimizadas (KONFÍO ZINC · web pública)

Registro de la inspección **visual** de las 28 imágenes recomprimidas del sitio. No se toca el
sitio, ni las imágenes, ni Card Spark: esto solo documenta el veredicto.

## Quién hizo la inspección

La revisión la realizó el **propietario con ChatGPT como revisor visual externo**, subiendo los
archivos de comparación. **Harness no la ejecuta ni la firma**: esta sesión no dispone de visión
(servicio `HTTP 502` y plugin desregistrado), por lo que Harness **preparó las comparaciones y
registra el dictamen**, sin atribuirse la inspección.

## Método

- Comparaciones **lado a lado a resolución completa** (2400×1600 por archivo): original a la
  izquierda, optimizada a la derecha. Generadas con ffmpeg en `C:\KZ-COMPARATIVA\tandas\`
  (carpeta privada, fuera del repositorio y del artefacto de GitHub Pages).
- 28 comparaciones entregadas al revisor en tandas, priorizando textos y rostros.
- Optimización evaluada: commit **`66ad6cf`** (JPEG calidad 5, ancho máximo 1400 px, metadatos fuera).

## Resultado final: 28 APROBADAS

| # | Imagen | Veredicto |
|---|---|---|
| 01 | `eltiti.jpg` | APROBADA |
| 02 | `abogados-dta.jpg` | APROBADA |
| 03 | `deicy-buitrago.jpg` | APROBADA |
| 04 | `cirujana_dentista.jpg` | APROBADA |
| 05 | `adopta.jpg` | APROBADA |
| 06 | `calixto_acordeon_magico.jpg` | APROBADA |
| 07 | `century_21_radial.jpg` | APROBADA |
| 08 | `colsabor.jpg` | APROBADA |
| 09 | `decoradora_de_fiestas.jpg` | APROBADA |
| 10 | `diseno_grafico.jpg` | APROBADA |
| 11 | `konfio-sports.jpg` | APROBADA |
| 12 | `make-up.jpg` | APROBADA |
| 13 | `nandy-nails.jpg` | APROBADA |
| 14 | `nbc-company.jpg` | APROBADA |
| 15 | `nomina_centinela.jpg` | APROBADA |
| 16 | `np-style.jpg` | APROBADA |
| 17 | `nutricion_funcional.jpg` | APROBADA |
| 18 | `nutricionista.jpg` | APROBADA |
| 19 | `nutridrink.jpg` | APROBADA |
| 20 | `pangea.jpg` | APROBADA · ver nota |
| 21 | `postres.jpg` | APROBADA |
| 22 | `proyecto-dta.jpg` | APROBADA |
| 23 | `proyecto-dta-detalle.jpg` | APROBADA |
| 24 | `quiromasajes-gap.jpg` | APROBADA |
| 25 | `redcalinet.jpg` | APROBADA |
| 26 | `samem.jpg` | APROBADA |
| 27 | `tarjeta-pre.jpg` | APROBADA |
| 28 | `unefibra.jpg` | APROBADA · ver nota |

| Estado | Cantidad |
|---|---|
| APROBADAS | **28** |
| ACEPTABLES CON OBSERVACIONES por compresión | 0 |
| RECHAZADAS | **0** |
| PENDIENTES | **0** |
| Sin comparación original | 0 (las 28 tienen par) |

**No se restaura ni se recomprime ninguna imagen.** Las 28 siguen exactamente como las dejó `66ad6cf`.

## Nota sobre Pangea y UNEFibra

En `pangea.jpg` y `unefibra.jpg` se observan **condiciones visuales preexistentes** (propias de los
materiales de origen), no defectos de compresión. **Registradas como observaciones**, no como motivo
de rechazo ni de restauración: si alguna vez se corrigen, será por decisión de diseño con material
nuevo, no por esta optimización.

## Evidencia automática complementaria (no sustitutiva del juicio visual)

| Métrica | Valor |
|---|---|
| SSIM medio (28 imágenes) | **0,995** |
| SSIM mínimo | > 0,97 en todas |
| Pixel-diff exacto `eltiti.jpg` | **0,34 %** global · peor zona 0,63 % |
| Peso de las imágenes del sitio | **5,45 MB → 2,07 MB** (−62 %) |
| Imágenes del repositorio | 8,46 MB → 5,08 MB (−40 %) |

## Reglas que se mantienen

- Ninguna imagen se reemplaza ni se recomprime sin veredicto que lo justifique.
- Si en el futuro una imagen se rechaza: se recupera el original desde `66ad6cf^`, se repite la
  optimización con parámetros más conservadores (calidad 4 o 3, mismo ancho máximo), mismo nombre y
  ruta, y se vuelve a comparar.
- Las comparaciones quedan en `C:\KZ-COMPARATIVA\tandas\` (privadas) por si hace falta re-revisar.
