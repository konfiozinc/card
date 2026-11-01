# KZ-CRM-017 · Auditoría de seguridad

**Fecha:** 2-nov-2026 · **Auditor independiente:** Codex (revisión de código y capturas)
**Veredicto del auditor:** *«NO PUBLICAR todavía»* — 2 hallazgos ALTOS, 0 CRÍTICOS.
**Estado tras correcciones:** los 2 ALTOS y los 4 MEDIOS corregidos; queda 1 MEDIO y 3 BAJOS
documentados y aceptados.

---

## 1. Hallazgos y resolución

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| SEG-01 | **ALTO** | Una cotización admitía **varias ventas**, con importes arbitrarios, otra moneda y desde cotización rechazada | ✅ **corregido** |
| SEG-02 | **ALTO** | «Anonimizar» conservaba el **historial completo** (donde viven nombres y direcciones) y permitía volver a meter datos | ✅ **corregido** |
| SEG-03 | MEDIO | Salir ocultaba el panel pero dejaba los datos en memoria y en el DOM | ✅ **corregido** |
| SEG-04 | MEDIO | El rol `comercial` **no podía entrar**: `pintarStats` pedía `crm_sales`, que no puede leer | ✅ **corregido** |
| SEG-05 | MEDIO | Cualquier miembro podía reemplazar el historial entero; el tipo no se validaba | ✅ **corregido** (parcialmente) |
| SEG-07 | MEDIO | El CSV no neutralizaba fórmulas (`=`, `+`, `-`, `@`) | ✅ **corregido** |
| SEG-09 | MEDIO | Venta y estado «ganado» eran dos escrituras independientes | ✅ **corregido** |
| SEG-06 | MEDIO | La auditoría es un registro independiente: un cliente modificado puede omitirla | ⚠️ **aceptado y documentado** |
| SEG-08 | MEDIO | `ventas` no puede exportar por interfaz, pero sí leer todo y montar su propio archivo | ⚠️ **aceptado y documentado** |
| SEG-10 | BAJO | Fechas de cotización/venta: ahora la venta exige `fechaValida()`; la cotización sólo `is timestamp` | ⚠️ parcial |
| SEG-11 | BAJO | Mensaje específico de «cuenta deshabilitada» | ✅ corregido (mensaje unificado) |
| PUB-01 | INFO | `crm-dev` excluido de Jekyll, pero el repo es público: la exclusión no impide leerlo en GitHub | ⚠️ aceptado |
| VIS-01 | BAJO | El botón «Entrar» quedaba pegado al campo de contraseña | ✅ **corregido** |

## 2. Cómo se corrigió SEG-01 (integridad de ventas)

El problema era real: `ventas` podía reutilizar un `quote_id`, inventar el importe, poner otra
moneda o vender desde una cotización **rechazada**.

Solución en cuatro amarres, sin depender de comprobaciones previas del cliente:

```javascript
// el id del documento de venta ES el id de la cotización
match /crm_sales/{ventaId} {
  allow create: if tieneRol(['admin','ventas'])
    && ventaId == request.resource.data.quote_id          // ← una venta por cotización
    && request.resource.data.moneda == 'COP'              // ← sin moneda extranjera
    && get(.../crm_quotes/$(quote_id)).data.estado in ['enviada','aceptada']  // ← no rechazada
    && (plan == 'medida' ? true : monto == get(quote).data.monto)             // ← importe amarrado
    && exists(.../crm_leads/$(lead_id));                  // ← el prospecto sigue existiendo
}
```

La unicidad la impone el **almacén**, no una consulta previa: es la misma técnica que se usó
para el teléfono. No hay carrera posible.

## 3. Cómo se corrigió SEG-02 (supresión de datos)

Antes: «anonimizar» ponía el nombre en `[eliminado]` pero **dejaba el historial intacto**, y
ahí es donde de verdad hay datos personales (notas con nombres, direcciones, horarios).

Ahora:

- se borra el **historial completo** y el `servicio_interes`;
- la regla exige que el historial sólo pueda vaciarse en esa operación, y que la haga `admin`;
- una vez marcado `anonimizado`, **nadie** puede volver a meterle datos: sólo admin puede
  tocarlo y el nombre queda fijo en `[eliminado]`;
- el **teléfono se conserva** porque es el identificador del documento.

Por eso el botón ya no dice «Anonimizar» sino **«Suprimir datos personales»** y el panel
explica que es **supresión parcial**, no anonimización completa. Llamarlo anonimización era
una imprecisión que el auditor detectó con razón.

## 4. Hallazgos aceptados y por qué

**SEG-06 — la auditoría no es evidencia completa.** Escribir en Firestore y escribir la
auditoría son dos operaciones distintas. Un cliente modificado podría omitir la segunda.
Cerrarlo de verdad exige escritura atómica en servidor (Cloud Functions → Blaze, prohibido) o
que la auditoría la escriba el propio servidor. `crm_audit` sigue siendo **inmutable y no
falsificable** (autor y rol se comparan contra la ficha real), pero es un registro de lo que
el cliente declaró, no una prueba criptográfica. Se documenta así en el panel y aquí.

**SEG-08 — `ventas` puede extraer la cartera.** Puede leer todos los prospectos por regla (lo
necesita para vender). La restricción del CSV es sólo de interfaz. Si en el futuro se
incorpora el rol `ventas` a alguien, debe saberse que puede volcar los datos. Hoy no existe
ningún usuario con ese rol.

**PUB-01 — el repositorio es público.** La exclusión de Jekyll impide *servir* `crm-dev`, pero
GitHub permite leer cualquier archivo versionado. No hay secretos en él (ni contraseñas, ni
claves privadas, ni tokens), pero el correo del administrador y los scripts sí serían
legibles. **Por eso `crm-dev` no se sube a `main`.** Si en el futuro alguien lo commitea a una
rama pública, ese material quedaría expuesto.

## 5. Lo que el auditor verificó como correcto

- Proyecto y base correctos; **no** confunde `default` con `(default)`.
- Sin escalada de roles desde el navegador: las reglas consultan la ficha y prohíben toda
  escritura de roles, incluso para `admin`.
- Separación de funciones correcta (cotizar / vender / borrar / auditar).
- Autoría amarrada al UID real en cotizaciones y ventas.
- Importes de cotización amarrados a la lista de precios (49.900 / 99.900 / nulo).
- **Sin XSS**: todas las interpolaciones con datos del usuario pasan por `esc()` —
  revisó las cinco (`tabla`, `historial`, `cotizaciones`, `stats`, `auditoría`).
- Captación pública cerrada: la regla exige rol activo para crear prospectos.
- Sin credenciales privilegiadas en los cuatro archivos publicables.

## 6. Riesgo residual declarado

1. La auditoría no es prueba criptográfica de lo ocurrido (SEG-06).
2. Quien tenga rol `ventas` puede volcar la cartera por SDK (SEG-08).
3. El CSV deja datos personales en el disco del operador, fuera del control del CRM.
4. Sin revisión de seguridad independiente adicional sobre el código corregido: las
   correcciones se validaron con las baterías automáticas, no con un segundo informe externo.
5. Los datos están alojados en `nam5` (EE. UU.).
