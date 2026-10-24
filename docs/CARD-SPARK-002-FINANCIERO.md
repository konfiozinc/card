# CARD-SPARK-002 — Modelo financiero, migración y despliegue

> Documento vigente (cierre documental). Describe **exclusivamente** lo implementado
> y probado en los commits `5090b98`…`cf127b2` sobre `01ac63e`. Complementa a
> `docs/ARQUITECTURA-SPARK-CARD.md` (arquitectura Spark) y a `docs/PANEL.md` (manual).

## 1. Modelo financiero por CONCEPTO

Cada pago lleva un `concepto`. La confirmación aplica **solo** el efecto del concepto:

| Concepto | Efecto al confirmar |
|---|---|
| `DESARROLLO` | Pago único. **No** toca vencimientos ni estados. |
| `RENOVACION_DOMINIO` | Extiende la vigencia **del servicio asociado** (`servicioId`) por su periodo (12 m). |
| `HOSTING` / `MANTENIMIENTO` / `SERVICIO_PERIODICO` | Extienden la vigencia del servicio asociado por su periodo. |
| `AMPLIACION` / `OTRO` | Pago único. No toca vencimientos. |

Reglas que se respetan:
- **Ningún pago nuevo se clasifica DESARROLLO por omisión**: `registrarPago` exige concepto.
- **Una renovación sin `servicioId` se bloquea** (`confirmarPago` lanza error claro) y **nunca** modifica la fecha genérica del cliente.
- Una renovación **solo** actualiza el servicio de `pago.servicioId`; no toca otros servicios del mismo cliente.
- `confirmarPago` es transaccional e idempotente: confirmar dos veces es imposible.
- Reactivar un servicio **no** extiende su vigencia (para renovar hay que confirmar un pago renovable).

## 2. Clientes con múltiples servicios

- Colección `servicios` (1 cliente → N servicios), cada uno con `clienteId`, `servicio`,
  `categoria`, `precio`, `fechaInicio`, `fechaVencimiento`, `estado`.
- `crearServicio` (OPERADOR) y `cargarServiciosDeCliente` (lectura) en `assets/js/admin/escrituras-local.js`.
- UI en `admin/clientes.js` (detalle del cliente): listado de servicios + formulario de alta
  (servicio, precio, vencimiento opcional). Sin `prompt()`.

## 3. Reglas Firestore (resumen de lo nuevo)

- `pagos`: `concepto` con lista cerrada (7 valores); `descripcion` ≤ 300; `periodoFin`
  opcional en la confirmación (necesario para no renovables). Importe y campos base inmutables.
- `servicios`: OPERADOR solo `clienteNombre`; lo comercial (`precio`, `fechaVencimiento`,
  `estado`, `planId`, `categoria`) es ADMIN.
- Se conserva el blindaje KZ-SEC-002 (`contactos` cerrado a escritura directa, `tokens_notificacion` con rol).

## 4. Migración de históricos (pagos sin concepto)

Herramienta `herramientas/migrar-pagos-concepto.js`:

```
node herramientas/migrar-pagos-concepto.js <pagos.json>                     # simulación
node herramientas/migrar-pagos-concepto.js <pagos.json> --aplicar \
     --map "id:CONCEPTO,..." --autorizado-por "Nombre" --salida out.json    # aplicar
```

- **No adivina**: solo reporta los pagos sin `concepto` (ambiguos) y aplica un mapa explícito humano.
- El archivo de entrada **queda intacto** (respaldo/reversión trivial); la salida es otro archivo.
- Idempotente (salta los ya clasificados). Un pago histórico sin concepto **se bloquea**
  para confirmación hasta que se clasifique (`confirmarPago` lanza error).

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

El flujo financiero E2E confirma: **DESARROLLO confirmado sin renovar** (`2027-05-11 → 2027-05-11`)
y **RENOVACIÓN que cambia solo su servicio** (`2027-05-11 → 2028-05-10`), sin tocar el otro servicio.
