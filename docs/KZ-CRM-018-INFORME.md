# KZ-CRM-018 · Equipo comercial con asignaciones — informe

**Fecha:** 2-nov-2026 · **Rama:** `feature/kz-crm-018` · **NO desplegado · NO publicado**

---

## 1. Modelo implementado

| Rol | Ve | Puede | Verificado |
|---|---|---|---|
| `admin` | toda la cartera | todo + asignar/reasignar | ✅ |
| `comercial` | **sólo lo asignado** | seguimiento y cotizaciones | ✅ |
| `ventas` | **sólo lo asignado** | seguimiento y confirmar ventas | ✅ |
| `lectura` | **sólo lo asignado** | **nada** (ninguna escritura) | ✅ |

Sólo `admin` asigna y reasigna. La restricción vive en **las reglas**, no en la interfaz.

## 2. Lo que se construyó

**Reglas** (`crm-dev/firestore.rules`): funciones `esAdmin()`, `asignadoA()`, `esMio()`,
`leadEsMio()`; lectura de prospectos por asignación; `update` con dos caminos (admin todo;
comercial/ventas sólo seguimiento y **sin** poder tocar la asignación); cotizaciones y ventas
filtradas por el prospecto asignado; `crm_usuarios` legible por admin para poder asignar.

**Panel** (`crm/`): columna «Asignado a», filtro «sólo sin asignar», bandeja personal
(«Tu bandeja · N prospectos asignados» / «Cartera completa · N · M sin asignar»), bloque de
asignación con selector de asesores y registro en historial y auditoría
(`prospecto_asignado` / `prospecto_reasignado`), y el rol `lectura` sin ningún control de
escritura.

**Consultas** (tarea 5): Firestore **rechaza** una consulta que no pueda demostrar que todos
sus resultados cumplen la regla. Por eso el panel filtra por `asignado_a` para los roles no
admin — es obligatorio, no cosmético. Se evita además `orderBy('creado_en')` en ese caso
para **no depender de un índice compuesto nuevo**: se ordena en el cliente. Probado: una
consulta sin filtro hecha por un comercial devuelve **403**.

## 3. Auditoría independiente (Codex) y correcciones

| ID | Sev | Hallazgo | Estado |
|---|---|---|---|
| H01 | ALTO | Comercial/ventas podían **autoasignarse** al crear (`asignado_a == uid`) | ✅ **corregido**: sólo admin rellena asignación en el alta |
| H02 | ALTO | El rol `lectura` **podía escribir auditoría** (porque `equipo()` lo incluía) | ✅ **corregido**: auditoría restringida a admin/comercial/ventas |
| H03 | ALTO | El historial podía sustituirse por otra lista del mismo tamaño | ⛔ **NO corregido — pendiente declarado** |
| H04 | MEDIO | El alta del panel se bloqueaba para comercial/ventas (consulta previa no autorizada) | ✅ corregido: la consulta previa es sólo de admin; la unicidad la impone el almacén |
| H05 | MEDIO | `ventas` pedía toda `crm_sales`, que las reglas rechazan; el panel lo disimulaba | ✅ corregido: el total agregado es sólo de admin |
| H06 | MEDIO | Operación y auditoría no son atómicas | ⚠️ aceptado (requiere servidor) |
| H07 | MEDIO | Errores de escritura sin manejar en estado/nota | ⚠️ parcial |
| H08 | MEDIO | La cartera se limita a 200 documentos sin avisar | ⚠️ aceptado, documentado |
| H09 | BAJO | El emulador permitía más que producción (update de roles) | ✅ corregido |

### H03: por qué no está corregido, y qué haría falta

Lo intenté y la formulación «el historial sólo crece exactamente una entrada» rompió
actualizaciones legítimas en pruebas; no la dejé puesta a medias. **Cerrarlo de verdad no es
un ajuste de regla**: hay que dejar de guardar las notas en un array editable y pasar a
**un documento inmutable por nota** (`crm_leads/{id}/notas/{notaId}`), con autor y fecha
verificables. Es un cambio de modelo de datos con migración, no un parche.

**Consecuencia práctica:** hoy un asesor con el prospecto asignado podría reemplazar las notas
por otras de igual longitud. No puede leer prospectos ajenos ni falsificar autoría, pero sí
podría degradar el historial de un prospecto suyo. **Por eso este bloque no se considera
cerrado.**

## 4. Pruebas

| Batería | Alcance | Resultado |
|---|---|---|
| `crm-dev/pruebas-equipo.cjs` | accesos cruzados, escalamiento, revocación, H01/H02 | **53/53** |
| `crm-dev/pruebas-admin-actual.cjs` | el admin actual conserva acceso a todo | **13/13** |
| `crm-dev/pruebas-formularios.cjs` | 4 tamaños, incluidos los controles nuevos | **48/48** |
| `crm-dev/generar-reglas-emulador.cjs --check` | sincronía reglas emulador/producción | **OK** |
| **Total** | | **114 · 0 fallos** |

Cubierto: acceso cruzado entre asesores (lectura y escritura), consulta global rechazada,
asignación/reasignación sólo admin, **persistencia** de la reasignación (A deja de ver, B
empieza a ver), revocación (`activo: false`) que conserva el historial y es reversible,
escalamiento de rol bloqueado **incluso para admin**, separación cotización/venta, venta
única por cotización, y anónimo cerrado.

## 5. La condición que la misión puso para poder desplegar

> «No desplegar nuevas reglas hasta certificar que la cuenta administrativa actual conservará
> acceso a todos sus datos.»

**Cumplida y probada** con la ficha real reproducida exactamente (sólo `rol`, `activo`,
`creado_en`, sin `nombre`), incluido el caso peligroso: **prospectos heredados SIN campo
`asignado_a`**. El admin los lee, los lista, los actualiza, los asigna y los borra → **13/13**.

## 6. Usuarios

**No se creó ninguna cuenta real.** Toda la certificación se hizo con usuarios ficticios en el
emulador (`admin@equipo.test`, `comercialA@`, `comercialB@`, `ventas@`, `lectura@`). Los roles
se siembran con `Authorization: Bearer owner`, que representa el papel de la consola/Admin SDK:
en producción el alta de roles sigue sin existir desde el navegador.

## 7. Riesgos pendientes

1. **H03** (historial sustituible) — requiere modelo de notas inmutable. Es el único ALTO vivo.
2. **H06**: la auditoría no es prueba criptográfica; se puede omitir el registro aunque no
   falsificarlo.
3. **H08**: la cartera se corta en 200 documentos sin paginación ni aviso.
4. **H07**: varios caminos de escritura no actualizan la interfaz ante un error.
5. La interfaz no reacciona en vivo a una revocación: el usuario desactivado conserva los
   datos ya cargados en su pestaña hasta recargar (el servidor sí le deniega toda operación).

## 8. Reversión

```bash
git switch main                      # main sigue publicado y sin tocar
git branch -D feature/kz-crm-018     # la fase vive sólo en esta rama
```

No hay nada desplegado: **ni reglas, ni panel**. Revertir es descartar la rama.

## 9. Definición final del equipo (así está implementado)

- **Darwin, único administrador activo.** Sin cambios.
- **Indicadores por asesor: implementados.** Bloque «Cartera por asesor» en el panel
  (prospectos, ganados, perdidos, en curso y vendido por asesor, más una fila «sin asignar»).
  Se calcula sobre la cartera que el admin ya ve; no añade ninguna consulta global nueva.
- **Carteras separadas, asignación y reasignación sólo por admin: implementadas y probadas.**
- **Desactivación y revocación: soportadas por las reglas y probadas** (`activo: false` →
  403 inmediato, historial intacto, reversible). La baja se ejecuta por procedimiento
  privilegiado, no desde el navegador.
- **Sin límite de cuentas.** La estructura no impone máximo: la colección `crm_usuarios` es
  abierta y el modelo de asignación no depende del número de asesores. Prever 2-3 hoy no
  limita incorporar 10 mañana.
- **Invitaciones mediante Firebase Authentication: NO implementadas.** Su bloque de reglas
  (`crm_invitaciones`) **rompió la compilación** del archivo de reglas y tumbó las 53
  comprobaciones. Lo retiré íntegro —reglas, formulario del panel y script— antes que dejar
  en pie algo roto o a medias. La incorporación de asesores sigue siendo un procedimiento
  privilegiado con Admin SDK (crear cuenta, sembrar rol, enviar el correo de Firebase), que
  es justo lo que hicimos con el administrador en KZ-CRM-016.
- **No se creó ningún usuario ficticio en producción.** Toda la certificación corrió en el
  emulador con cuentas ficticias.

## 10. Dictamen
>
> El modelo de accesos está implementado y **certificado en 114 comprobaciones**, el
> administrador conserva su acceso y no se creó ninguna cuenta real. Pero queda **H03 (ALTO)
> sin corregir**: el historial de un prospecto puede ser sustituido por el asesor al que está
> asignado. No voy a declarar cerrada una fase con un ALTO abierto.
>
> **GO** para que Darwin revise el funcionamiento y decida: corregir H03 con el modelo de
> notas inmutables (recomendado, ~1 sesión de trabajo) antes de desplegar, o aceptar el riesgo
> de forma explícita y desplegar con el resto.
>
> Las cuentas comerciales reales siguen bloqueadas hasta que se confirmen correos y roles.
