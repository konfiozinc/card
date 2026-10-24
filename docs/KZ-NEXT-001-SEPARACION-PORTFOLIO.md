# KZ-NEXT-001 · Separación funcional: clientes comerciales vs. referencias de portafolio

**Estado: PROPUESTA PREPARADA — no ejecutada. Requiere autorización expresa del propietario.**
**Datos reales modificados: ninguno.**

Este documento prepara la separación entre los registros que representan una **relación comercial
facturable** y los que son **referencias de portafolio**. No la aplica: crear campos, mover documentos
o reclasificar clientes exige autorización caso por caso.

---

## 1. El problema, en una frase

La colección `clientes` mezcla hoy dos cosas distintas: los clientes que pagan y las fichas de los
proyectos del portafolio, importadas automáticamente desde GitHub. Esa mezcla es la raíz de la
ambigüedad que surgió en KZ-OPS-001 («29 clientes sin servicio») y de que Vencimientos y el Dashboard
tengan que mostrar avisos para registros que nunca fueron contratos.

## 2. Lo que ya está verificado (KZ-OPS-002, solo lectura)

| Grupo | Cantidad | Categoría de revisión | Lectura |
|---|---:|---|---|
| Clientes reales con servicio | 2 | — | `ACTIVO`, con precio, fechas, método de pago, sin `origenImportacion` |
| Registros sin servicio, sin indicios contractuales | 26 | **D** | `origenImportacion = "github_auto"`, `PENDIENTE_CONFIGURACION`, `proyectoId`, `urlServicio`, **sin precio ni fechas** |
| Registros sin servicio, con indicios en texto libre | 3 | **B** | requieren confirmación humana antes de cualquier acción |

**Ningún registro se ha modificado.** El expediente completo, con identificadores, está en
`14-HERRAMIENTAS-DESARROLLO/.secrets/kz-ops-002-conciliacion/` (local, fuera de Git).

### El criterio que distingue a los dos grupos

No es una impresión: son señales convergentes, y **ninguna de ellas es un juicio sobre la persona**.

| Señal | Cliente real (2) | Registro de portafolio (26) |
|---|---|---|
| `origenImportacion` | ausente | `"github_auto"` |
| `estadoCliente` | `ACTIVO` | `PENDIENTE_CONFIGURACION` |
| `precio` | presente | **ausente** |
| `fechaActivacion` / `fechaVencimiento` | presentes | **ausentes** |
| `metodoPagoPreferido` | presente | ausente |
| `proyectoId` / `urlServicio` | puede faltar | **siempre presentes** |

## 3. Propuesta: dos campos, una decisión

Se proponen dos alternativas, **excluyentes**, para que el propietario elija una. Ninguna se ha
aplicado.

### Opción A — Campo discriminante en la misma colección *(recomendada)*

Añadir a `clientes` un campo `tipoRegistro` con dos valores:

| Valor | Significado | Efecto |
|---|---|---|
| `CLIENTE` | relación comercial. Es el valor por defecto de los registros existentes y futuros. | Aparece en Clientes, Vencimientos, Dashboard y cobros. |
| `PORTAFOLIO` | referencia de proyecto publicado. No es una relación comercial. | Se excluye de Vencimientos y de los KPIs de cobro; se muestra en una vista de portafolio. |

**Ventajas:** no mueve documentos ni rompe referencias; `pagos.servicioId`, `historial_estados` y
`auditoria` siguen apuntando donde apuntan; es reversible (borrar el campo devuelve el estado actual);
no requiere migración de datos, solo una escritura por registro.

**Coste:** una pasada de 26 escrituras (más las 3 que se confirmen) y un ajuste de las consultas del
panel para filtrar por el campo.

**Qué habría que tocar si se autoriza:**

1. `firestore.rules`: permitir `tipoRegistro` en `clientes` como campo comercial de ADMIN, con lista
   cerrada de valores.
2. `assets/js/admin/escrituras-local.js`: incluirlo en los campos permitidos de `actualizarCliente`.
3. `admin/dashboard.js` y `admin/vencimientos.js`: excluir `PORTAFOLIO` de los KPIs de cobro y de las
   obligaciones.
4. `admin/clientes.js`: filtro por tipo y una vista de portafolio.
5. Una herramienta local, **simulada por defecto**, que aplique el cambio registro por registro con
   lista explícita y `--aplicar --autorizado-por`, igual que las demás herramientas privilegiadas.

### Opción B — Colección separada

Mover los 26 documentos a `portafolio` (colección nueva) y dejarlos fuera de `clientes`.

**Ventajas:** separación limpia; `clientes` queda semánticamente puro.

**Desventajas:** mover documentos **rompe** cualquier referencia existente por `clienteId`
(historial, auditoría, pagos), obliga a reescribir enlaces y es difícil de revertir. Para 26 registros
que hoy no tienen ninguna referencia saliente, la ganancia no compensa el riesgo.

## 4. Lo que NO se hará sin autorización

- **No** se crea ningún servicio para los 26. Su ausencia de servicio es correcta: nunca contrataron.
- **No** se marcan como `PORTAFOLIO` automáticamente. Es una clasificación con efecto operativo y la
  decide una persona.
- **No** se tocan los 3 casos de categoría B: primero hay que confirmar si hubo contratación real.
- **No** se elimina ningún registro. Si alguna vez se retiran del panel, será por baja lógica
  (`eliminado: true`), nunca borrado físico, para conservar la trazabilidad.

## 5. Cómo se prepara, si se autoriza

El trabajo ya está listo para ejecutarse en una sola sesión:

1. **Simulación.** La herramienta recorre los registros, aplica el criterio del §2 y muestra qué
   cambiaría, sin escribir nada.
2. **Revisión.** El propietario ve la lista (`id`, señales, cambio propuesto) usando el expediente
   privado.
3. **Aplicación.** Con `--aplicar --autorizado-por "nombre"` y una lista cerrada de identificadores.
   Cualquier registro fuera de la lista se rechaza.
4. **Verificación.** Recuento antes/después, y comprobación de que ninguna referencia quedó rota.
5. **Reversión.** Borrar `tipoRegistro` de los mismos identificadores devuelve el estado anterior.

Nada de esto se ha construido todavía: **construir la herramienta solo tiene sentido si la opción se
aprueba.** Lo que sí existe ya es el clasificador de solo lectura
(`14-HERRAMIENTAS-DESARROLLO/conciliar-clientes.cjs`), que produce el criterio del §2 sin escribir.

## 6. Efecto sobre lo que ya funciona

| Componente | Efecto con la Opción A |
|---|---|
| Card Spark (clientes, pagos, servicios) | Filtra por `tipoRegistro`; el resto igual. |
| Vencimientos | Deja de mostrar los 26 como «clientes sin servicios registrados». |
| Dashboard | Los KPIs de cobro dejan de contar portafolio. |
| Captación `/leads` | Sin cambios. |
| Asesor Konfi | Sin cambios. |
| Reglas de Firestore | Un campo comercial más; **ninguna regla se relaja**. |
| Web premium | Sin cambios. |

## 7. Recomendación

**Opción A**, y en este orden:

1. Resolver primero los **3 casos B** (confirmar si hubo contratación). Son los únicos donde el error
   tiene consecuencias comerciales.
2. Después, marcar los 26 como `PORTAFOLIO` con la herramienta simulada y lista explícita.
3. Dejar para más adelante cualquier cambio en la importación de GitHub para que no vuelva a meter
   proyectos en la cartera facturable.
