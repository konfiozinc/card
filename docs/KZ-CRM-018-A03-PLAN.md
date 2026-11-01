# KZ-CRM-018 · A03 — Plan de migración a identificadores UUID

**Fecha:** 2-nov-2026 · **Rama:** `feature/kz-crm-018` @ `6b7bf29`
**Estado: PREPARACIÓN COMPLETADA. IMPLEMENTACIÓN NO INICIADA.**
**Dictamen vigente: NO-GO para publicar.**

---

## 1. Reconocimiento (verificado en esta sesión)

Árbol limpio. Corrección de A02 preservada (commit `6b7bf29`, 25/25 certificada).

### Lo más importante: el cambio está muy acotado

Al mapear todas las referencias al teléfono como identificador, el resultado es mejor de lo
esperado:

| Dónde | Referencias al teléfono como id | ¿Cambia con UUID? |
|---|---|---|
| **Reglas** | **una sola**, `firestore.rules:100`: `leadId == request.resource.data.telefono` | **Sí: se elimina** |
| Reglas (notas, cotizaciones, ventas) | `exists(.../crm_leads/$(leadId))`, `get(...).data.lead_id` | **No**: ya usan el id genérico |
| Panel | `leadActual.id` en las 12 operaciones | **No**: ya usan el id del documento |
| Panel, alta | `alta-prospecto.js`: `doc(db, "crm_leads", telefono)` | **Sí: genera UUID** |
| Supresión | `suprimir-datos.cjs`: recibe `--id` | **No**: ya es genérico |

Es decir: **el modelo ya es casi agnóstico al identificador**. El trabajo real está en
(1) quitar la regla que obliga a que el id sea el teléfono, (2) generar UUID en el alta,
(3) añadir la deduplicación, y (4) migrar los documentos existentes.

## 2. Esquema propuesto

```text
crm_leads/{uuid}                 ← UUID v4 generado en el alta
  telefono        : atributo de contacto (ya no identifica nada)
  nombre, industria, servicio_interes, estado, consentimiento,
  consentimiento_version, retencion_hasta, creado_en, creado_por,
  asignado_a, asignado_en, asignado_por, origen, anonimizado
  historial       : legado, inmutable (sigue congelado)

crm_leads/{uuid}/notas/{notaId}  ← sin cambios: ya cuelga del id del prospecto

crm_quotes/{id}   lead_id → uuid (sin cambios en el código: ya referencia el id)
crm_sales/{id}    lead_id → uuid

crm_dedup/{telefono}             ← NUEVA: deduplicación separada
  lead_id   : uuid
  creado_en : timestamp
  creado_por: uid
```

## 3. Deduplicación: diseño y **límite real de Spark**

**Atómica:** el alta crea `crm_leads/{uuid}` y `crm_dedup/{telefono}` en la **misma
transacción**. Las reglas exigen, mediante `getAfter()`, que el marcador apunte a un
prospecto del mismo creador con ese teléfono. Dos altas simultáneas del mismo número:
sólo una transacción puede crear el marcador; la otra choca con `already-exists`.

**No relaja reglas:** el marcador no es un documento que el atacante pueda “reservar” sin
crear a la vez un prospecto válido, y sólo un procedimiento privilegiado lo elimina.

**Condición que la misión exige comprobar, y que hay que decir sin adornos:**

> «No permitir que un usuario reserve teléfonos ajenos.»

Con Spark y sin verificación por SMS **esto no se puede garantizar del todo**: un operador
autenticado puede dar de alta el teléfono de otra persona y quedarse con el marcador. Lo que
sí se garantiza es que (a) no puede hacerlo un anónimo, (b) queda el rastro de quién lo
reservó, (c) el administrador puede reasignar o suprimir, y (d) el marcador nunca se puede
crear sin un prospecto válido asociado.

Cerrarlo de verdad requiere **verificación del número (OTP)** —servicio externo, con coste—
o un componente privilegiado. **Eso queda fuera del alcance Spark y necesitará tu
autorización aparte.** No voy a fingir que la regla lo resuelve.

**Privacidad:** `crm_dedup` sólo se lee por administración. Un operador que intenta dar de
alta un número ya existente recibe el rechazo del almacén; eso le revela que existe, pero es
personal interno y es inherente a cualquier deduplicación. A un visitante no le revela nada
porque la captación sigue cerrada.

## 4. Migración

| Paso | Acción |
|---|---|
| 1 | **Inventario actualizado** de solo lectura: cuántos prospectos, con/sin `historial`, notas por prospecto, cotizaciones y ventas y a qué `lead_id` apuntan |
| 2 | **Respaldo verificable**: exportar cada documento a JSON local con hash, y guardar el mapa `telefono → uuid` |
| 3 | **Migración idempotente**: por cada `crm_leads/{telefono}` antiguo, crear `crm_leads/{uuid_nuevo}` con los mismos campos + `telefono`, **copiar las notas** a la nueva ruta, repuntar `crm_quotes.lead_id` y `crm_sales.lead_id`, y crear `crm_dedup/{telefono}`. Reejecutable: si el mapa ya tiene correspondencia, no duplica |
| 4 | **Verificación referencial**: contra de prospectos == contra de notas == contra de cotizaciones/ventas repuntadas; ninguna referencia huérfana |
| 5 | **No borrar los documentos antiguos** hasta que la verificación pase y se autorice |
| 6 | **Reversión**: los documentos antiguos siguen ahí; revertir = repuntar `lead_id` a los ids antiguos y borrar los nuevos, usando el mapa guardado |

Con el inventario de producción actual (**0 prospectos**, verificado en KZ-CRM-016) la
migración sería un no-op, pero **hay que re-verificarlo en el momento**, no asumirlo.

## 5. Plan de transición para A04

| Etapa | Qué se despliega | Verificación |
|---|---|---|
| 0 | Nada. Estado actual: panel en `main` funciona con las reglas **antiguas** | — |
| 1 | **Panel nuevo** (compatible con ambos modelos: lee por id, escribe sin `historial`) | Sigue funcionando con las reglas viejas |
| 2 | **Reglas nuevas** (UUID + notas inmutables) | Admin entra y opera; asesor asignado crea nota; tercero 403 |
| 3 | **Migración** de documentos (si los hubiera) | Integridad referencial |

**¿Hace falta ventana de mantenimiento?** Con este orden, **no**: la etapa 1 es compatible
hacia atrás. La ventana sólo sería necesaria si se invirtiera el orden. **Esto es lo que
rompía A04**: el plan anterior desplegaba reglas antes que el panel.

Revertir **nunca** debe repuntar al ruleset que permitía reescribir el historial.

## 6. Matriz de pruebas exigida

| Caso | Cómo se demuestra |
|---|---|
| Concurrencia de registros | N altas simultáneas del mismo teléfono → **una sola** prospera |
| Reutilización legítima | Suprimir y volver a dar de alta el mismo número → registro nuevo, **sin notas heredadas** |
| Ausencia de notas heredadas | Tras suprimir y recrear, la subcolección está vacía |
| Aislamiento de asesores | A no lee ni escribe el prospecto de B (403) |
| Integridad referencial | Toda cotización/venta apunta a un `lead_id` existente |
| Supresión completa | Prospecto + notas eliminados; verificación posterior 404/0 |
| Migración y reversión | Ejecutar, verificar, revertir, verificar de nuevo |
| Compatibilidad con registros antiguos | Prospectos sin `historial` y sin `asignado_a` siguen operativos |
| Regresión | Las 181 comprobaciones actuales siguen verdes |

## 7. Riesgos

1. **Reserva de teléfonos ajenos por personal interno**: no cerrable en Spark sin OTP (§3).
2. **La migración toca relaciones**: un error en el repunte de `lead_id` rompería ventas.
   Mitigación: respaldo, mapa guardado, verificación y no borrar los originales.
3. **El panel debe ser compatible en ambos sentidos** durante la transición (§5).
4. La supresión deberá aprender a borrar también el marcador de deduplicación.

## 8. Dictamen

> **NO-GO.** A03 está **diseñado y acotado**, no implementado. A02 sigue cerrado y
> certificado. A04 tiene ya un plan de tres etapas sin ventana de mantenimiento, pero
> **depende de A03**.

## 9. Por qué no se ha implementado en esta sesión

La implementación completa exige: reglas nuevas con `getAfter()` y dedupe, generación de UUID
en el alta, adaptación del panel, script de migración idempotente con respaldo y reversión,
actualización del procedimiento de supresión, y nueve baterías de prueba nuevas. Es un bloque
de trabajo con su propia sesión, y dejarlo a medio camino dejaría el repositorio en un estado
que ni se despliega ni se audita con sentido.

El reconocimiento de §1 es la buena noticia: **el cambio es más pequeño de lo previsto**,
porque el modelo ya es casi agnóstico al identificador. Sólo hay que quitar una condición de
las reglas, generar UUID en el alta y añadir la deduplicación.
