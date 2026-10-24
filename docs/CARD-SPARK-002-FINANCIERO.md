# CARD-SPARK-002 — Modelo financiero, migración y despliegue

> Documento vigente. Describe el modelo financiero implementado en `5090b98`…`cf127b2`
> sobre `01ac63e`, **corregido y ampliado por KZ-OPS-001** (ver
> `docs/KZ-OPS-001-CONSOLIDACION.md`). Complementa a `docs/ARQUITECTURA-SPARK-CARD.md`
> (arquitectura Spark).
>
> **Avisos corregidos en KZ-OPS-001** — leer antes de tocar este módulo:
> 1. La base de la renovación es el vencimiento **del servicio**, no el del cliente
>    (§1). Antes se usaba `clientes.fechaVencimiento`, que es un agregado de todos los
>    servicios y hacía saltar la fecha a un valor calculado sobre otro servicio.
> 2. `descripcion` es **opcional de verdad**: la regla admite `null` y el panel omite la
>    clave. Antes, registrar un cobro sin descripción fallaba siempre.
> 3. Los pagos históricos sin concepto **sí se pueden clasificar** desde el panel, una
>    sola vez y con motivo (§4). Antes el bloqueo no tenía salida salvo anular.
> 4. Ya no existe ningún camino en el panel que extienda una vigencia sin pago: se retiró
>    el botón «Renovar 12 meses» de la ficha de cliente.

## 1. Modelo financiero por CONCEPTO

Cada pago lleva un `concepto`. La confirmación aplica **solo** el efecto del concepto:

| Concepto | Efecto al confirmar |
|---|---|
| `DESARROLLO` | Pago único. **No** toca vencimientos ni estados. |
| `RENOVACION_DOMINIO` | Extiende la vigencia **del servicio asociado** (`servicioId`) por su periodo (12 m). |
| `HOSTING` / `MANTENIMIENTO` / `SERVICIO_PERIODICO` | Extienden la vigencia del servicio asociado por su periodo. |
| `AMPLIACION` / `OTRO` | Pago único. No toca vencimientos. |

Reglas que se respetan (actualizadas por KZ-OPS-001):
- **Ningún pago nuevo se clasifica DESARROLLO por omisión**: `registrarPago` exige concepto.
- **Un cobro renovable exige servicio identificado ya al registrarse**: el formulario lo pide y
  `registrarPago` valida que el servicio exista **y pertenezca a ese cliente**.
- **Una renovación sin `servicioId` se bloquea** (`confirmarPago` lanza error claro) y **nunca**
  modifica la fecha genérica del cliente.
- Una renovación **solo** actualiza el servicio de `pago.servicioId`; no toca otros servicios.
- **La nueva fecha se calcula desde el vencimiento del servicio renovado.** Si el servicio aún no
  ha vencido, se le suman los meses de su periodo; si ya venció, se cuenta desde hoy.
- La fecha genérica `clientes.fechaVencimiento` pasa a ser la obligación **más lejana** entre los
  servicios del cliente. Los servicios hermanos se leen **antes** de la transacción: dentro de
  `runTransaction` el SDK web solo puede leer documentos por referencia.
- `confirmarPago` es transaccional e idempotente: confirmar dos veces es imposible.
- Reactivar un servicio **no** extiende su vigencia (para renovar hay que confirmar un pago renovable).

## 2. Clientes con múltiples servicios

- Colección `servicios` (1 cliente → N servicios), cada uno con `clienteId`, `servicio`,
  `categoria`, `precio`, `fechaInicio`, `fechaVencimiento`, `estado`, `activo`.
- `crearServicio`, `actualizarServicio`, `cambiarEstadoServicio` y `cargarServiciosDeCliente` en
  `assets/js/admin/escrituras-local.js`.
- **El ciclo de vida es POR SERVICIO.** `cambiarEstadoServicio(servicioId, …)` escribe el documento
  del servicio (y su `historial_estados`), no el del cliente. Antes la página Servicios pasaba el id
  del cliente y suspender un servicio suspendía todos.
- UI de alta en `admin/clientes.js` (ficha del cliente) y de **edición individual** en
  `admin/servicios.html`. Sin `prompt()`.
- `activo` se deriva del `estado`: no se deja a criterio del formulario.

## 3. Reglas Firestore (resumen de lo nuevo)

- `pagos`: `concepto` con lista cerrada (7 valores); `descripcion` ≤ 300; `periodoFin`
  opcional en la confirmación (necesario para no renovables). Importe y campos base inmutables.
- `servicios`: OPERADOR solo `clienteNombre`; lo comercial (`precio`, `fechaVencimiento`,
  `estado`, `planId`, `categoria`) es ADMIN.
- Se conserva el blindaje KZ-SEC-002 (`contactos` cerrado a escritura directa, `tokens_notificacion` con rol).

## 4. Pagos históricos sin concepto

Hay **dos** vías y las dos son explícitas; ninguna adivina el concepto.

**A · Clasificación desde el panel (KZ-OPS-001, recomendada).** Un ADMIN usa el botón de etiqueta en
`admin/pagos.html`: escribe el código del concepto y un motivo. Se permite **una sola vez**
(la regla exige que el pago aún no tenga concepto), deja `clasificadoPor`, `clasificadoEn` y
`motivoClasificacion`, y **no** permite tocar el importe. Después el pago ya se puede confirmar.

**B · Migración por archivo.** Herramienta `herramientas/migrar-pagos-concepto.js`:

```
node herramientas/migrar-pagos-concepto.js <pagos.json>                     # simulación
node herramientas/migrar-pagos-concepto.js <pagos.json> --aplicar \
     --map "id:CONCEPTO,..." --autorizado-por "Nombre" --salida out.json    # aplicar
```

- **No adivina**: solo reporta los pagos sin `concepto` (ambiguos) y aplica un mapa explícito humano.
- El archivo de entrada **queda intacto** (respaldo/reversión trivial); la salida es otro archivo.
- Idempotente (salta los ya clasificados).

En ambos casos, **un pago renovable sin `servicioId` no se puede confirmar**. Como el servicio de un
pago no se reasigna (dinero inmutable), la salida correcta es **anularlo con motivo y registrarlo de
nuevo eligiendo el servicio**.

## 5. Despliegue y reversión

```bash
# Publicación (tras autorización)
cd 6-LANDING-PAGES/Konfio-Zinc-Web
git push origin main                                   # web + panel
firebase deploy --only firestore:rules,firestore:indexes   # reglas

# Reversión
git revert --no-edit <commit> && git push origin main
git show <prev>:firestore.rules > firestore.rules && firebase deploy --only firestore:rules
```

Los pagos/contactos ya registrados **no** se borran al revertir código. Sin migración de
producción hasta autorización expresa.

## 6. Evidencia de pruebas (emuladores, datos ficticios)

| Suite | Resultado |
|---|---|
| `pruebas-spark-panel-p1.js` (E2E panel) | **18/18** |
| `pruebas-financiero-card-spark-002.js` (E2E flujo financiero) | **6/6** |
| `pruebas-spark-reglas-p1.js` | **53/53** |
| `pruebas-seguridad-kz-sec-002.js` | **17/17** |
| `pruebas-captacion-kz-sec-002.js` | **7/7** |
| `pruebas-pagos-concepto-card-spark-002.js` | **5/5** |
| `pruebas-ops-001-servicios-contactos.js` (KZ-OPS-001) | **43/43** |
| `pruebas-ops-001-e2e.js` (KZ-OPS-001, recorrido completo) | **43/43** |
| **Total** | **192/192** |

El flujo financiero E2E confirma: **DESARROLLO confirmado sin renovar** (`2027-05-11 → 2027-05-11`)
y **RENOVACIÓN que cambia solo su servicio** (`2027-05-11 → 2028-05-10`), sin tocar el otro servicio.

El E2E de KZ-OPS-001 añade la prueba que faltaba: con **dos** servicios de vencimientos distintos,
renovar el primero lo lleva a *su* fecha + 12 meses (no a la del cliente), el segundo queda intacto y
la fecha genérica del cliente se recalcula a la obligación más lejana. También verifica que un
DESARROLLO confirmado no mueve ninguna fecha.
