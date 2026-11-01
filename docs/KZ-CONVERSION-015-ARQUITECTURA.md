# KZ-CONVERSION-015 · Arquitectura

**Rama:** `feature/kz-conversion-015` · **Alcance implementado:** fases 4-A, 4-B, 4-C y partes de 6 y 8.
**Sin backend nuevo, sin Firebase, sin Worker, sin pagos.**

## 1. Piezas añadidas

| Archivo | Papel |
|---|---|
| `soluciones.html` | Página del recorrido comercial: industria → demostración → alcance → cotización → solicitud → actividad |
| `assets/css/conversion-015.css` | Estilos de la página; consume tokens existentes (`--kz-cyan`, `--kz-muted`), sin declarar paleta propia |
| `assets/js/conversion-015.js` | Estado del recorrido, demostraciones, cotizador, validación, registro local y métricas |

No se modificó ninguna otra página, script ni configuración del sitio.

## 2. Modelo de datos (en el cliente)

```js
INDUSTRIAS = { restaurantes | belleza | profesionales | comercios | empresas }
  → { nombre, solucion, demo, porque }

DEMOS = { tarjeta, menu, miniweb }

PRECIOS = { basica: 49900, pro: 99900 }   // official; "medida" no tiene precio
```

Estado del recorrido (en memoria): `industria`, `demoVista`, `demoProbada`, `alcanceVisto`, `plan`, `solicitudPreparada`.

Almacenamiento local, con claves propias y sin datos de terceros:

| Clave | Contenido | Vida |
|---|---|---|
| `kz-leads-local-v1` | Últimos 50 registros: nombre, teléfono, industria, plan, `consentimiento: true`, fecha | Solo en el navegador del visitante |
| `kz-metricas-local-v1` | Contadores de demostración iniciada/completada, cotización y solicitud | Solo en el navegador del visitante |

**No hay envío a servidor.** El dato sale del navegador solo cuando la persona pulsa «Enviar» dentro de WhatsApp.

## 3. Flujo del recorrido

```
industria ──► recomendación (solución + por qué)
      │
      ├─► demo tarjeta  (descarga .vcf real, compartir con navigator.share/clipboard)
      ├─► demo menú     (carrito ficticio, total real, sin pasarela)
      └─► demo miniweb  (nombre, plantilla, colores → vista previa)
      │
alcance (checkbox) ──► cotizador (49.900 / 99.900 / a medida)
      │
solicitud (nombre + WhatsApp + consentimiento) ──► mensaje WhatsApp + registro local
      │
progreso «n de 5» (solo se marca con acciones reales)
```

Cada paso se marca **por acción verificable**, no por visitar la sección: `demoProbada` solo pasa a `true` al usar una demo; el consentimiento es obligatorio para preparar la solicitud.

## 4. Honestidad del contrato comercial

- El texto del estado final dice literalmente: *«Solicitud preparada… el pedido no queda confirmado hasta que tú lo envíes y nosotros respondamos»*.
- Las demostraciones llevan el sello **«Demostración · datos ficticios»** y el carrito de menú aclara que no hay pasarela ni envío a un negocio real.
- El plan «a medida» **no muestra cifra**: dice «requiere evaluación humana».
- No se aplican descuentos de distribuidor ni comisiones en el cotizador; se remite a la política de aliados.

## 5. Analítica

Eventos enviados a GA4 **solo si `gtag` está disponible** (la página no carga GA4 por sí misma; si se integra, hereda la etiqueta del sitio):

`kz_soluciones_vista`, `kz_industria_elegida`, `kz_demo_vista`, `kz_demo_iniciada`, `kz_demo_completada`, `kz_cotizacion_solicitada`, `kz_lead_registrado`, `kz_recorrido_paso`.

El contador visible en la página (§6) es **de la sesión del visitante**: no se presenta como estadística de negocio.

## 6. Puertas no abiertas (y por qué)

| Fase | Estado | Motivo |
|---|---|---|
| 3 · CRM digital | **No implementado** | Exige autenticación, autorización por rol, validación en servidor y revisión de privacidad. Requiere tocar Firebase → prohibido sin autorización específica |
| 5 · Configurador con exportación | Parcial: vista previa y personalización | La exportación/publicación necesita backend o generación de archivos con datos de clientes separados |
| 7 · Asesor Konfi ampliado | **No modificado** | Vive en un Cloudflare Worker externo; tocarlo exige autorización aparte |
| 8 · Ventas confirmadas y aliados | Parcial: eventos y métricas locales | «Venta confirmada» requiere fuente de verdad con autenticación; confundirla con «WhatsApp abierto» está prohibido por la misión |

## 7. Identidad

Se conserva la identidad **Neon Tech**: fondo `#050B14`, cian/violeta, sin dorados, tipografías del sitio. No se copió código, texto, imagen ni diseño de PANA.CLICK ni de Tapxter; las maquetas son propias y genéricas.
