# KZ-CRM-018 · Corrección de H03 — notas inmutables

**Fecha:** 2-nov-2026 · **Rama:** `feature/kz-crm-018` · **Commit:** `2f2a0ff`
**NO desplegado · NO publicado · `main` intacta**

---

## 1. La causa, en una línea

Las notas vivían en un **array** `historial` dentro del prospecto, y la regla sólo impedía
que **encogiera**. Un asesor con el prospecto asignado podía enviar otra lista **del mismo
tamaño** y sustituir toda la historia comercial.

## 2. La corrección

**Notas como documentos propios e inmutables:** `crm_leads/{leadId}/notas/{notaId}`

| Campo | Validación en la regla |
|---|---|
| `texto` | cadena de 3 a 500 caracteres |
| `autor` | **debe ser el uid autenticado** → no se puede falsificar |
| `fecha` | dentro de la ventana de ±5 min del servidor → no se puede falsificar |
| `tipo` | `nota` \| `correccion` \| `evento` |
| `referencia_a` | opcional, para correcciones |

```javascript
allow read: if esAdmin() || (tieneRol(equipo()) && asignadoA(leadData()) == request.auth.uid);
allow create: if puedoEscribir() && … && request.resource.data.autor == request.auth.uid
             && fechaValida(request.resource.data.fecha);
allow update, delete: if false;      // inmutables, INCLUSO para el administrador
```

**El array heredado se congela:** `historial` sale de las claves editables y se exige que su
valor no cambie (`request.resource.data.historial == resource.data.historial`). Única
excepción legítima: el admin lo vacía al suprimir datos personales.

**Corregir no sobrescribe:** se añade otra nota de tipo `correccion` que referencia la
anterior. El panel ya no escribe ni una vez en `historial` (0 escrituras, comprobado).

## 3. Evidencia de que H03 está cerrado

`crm-dev/pruebas-notas.cjs` — **34/34**, con **operaciones directas contra Firestore**, no a
través del panel:

| Requisito de la misión | Resultado |
|---|---|
| Comercial asignado puede crear una nota | ✅ 200 |
| Comercial no asignado recibe permiso denegado | ✅ 403 |
| Sólo lectura no puede crear notas | ✅ 403 |
| Anónimo no puede crear notas | ✅ rechazado |
| **Nadie puede modificar notas anteriores** | ✅ 403 (asesor **y admin**) |
| **Nadie puede borrar notas** | ✅ 403 (asesor **y admin**) |
| **Nadie puede falsificar el autor** | ✅ firmar como otro → 403 |
| **Nadie puede falsificar la fecha** | ✅ pasado y futuro → 403 |
| Revocar acceso impide nuevas notas | ✅ 403 tras `activo:false` |
| El administrador consulta el historial | ✅ 200 |
| Prospectos heredados conservan su información | ✅ las 2 entradas antiguas siguen ahí |
| Cotizaciones y ventas sin regresión | ✅ 53/53 equipo |
| Historial heredado no se puede reescribir | ✅ sustituir, ampliar o vaciar → 403 |

## 4. Pruebas completas

| Batería | Resultado |
|---|---|
| `pruebas-notas.cjs` (H03) | **34/34** |
| `pruebas-equipo.cjs` (roles, accesos cruzados) | **53/53** |
| `pruebas-admin-actual.cjs` (el admin conserva todo) | **13/13** |
| `pruebas-formularios.cjs` (4 tamaños) | **48/48** |
| **Total** | **148 · 0 fallos** |

## 5. Plan de migración

**Estado real de producción:** `crm_leads` tiene **0 documentos** (se comprobó al cerrar
KZ-CRM-016). Por tanto la migración es, hoy, **un no-op**: no hay historiales que migrar.

Procedimiento para cuando existan registros, **nunca sin autorización específica**:

1. **Inventario (solo lectura).** Listar los prospectos cuyo `historial` no esté vacío e
   informar cuántas entradas tiene cada uno. Nada se modifica.
2. **Respaldo.** Copiar a un fichero local el documento completo de cada prospecto afectado
   (incluido su `historial`), con fecha y hash.
3. **Migración aditiva.** Por cada entrada del historial, crear una nota en la subcolección
   con `tipo: "evento"`, `texto` = la entrada y autor `migracion` — esto lo hace un
   **procedimiento privilegiado** (Admin REST), que no pasa por las reglas, porque las reglas
   exigen `autor == uid` y aquí no hay un autor real. **El `historial` original NO se borra.**
4. **Verificación.** Comprobar que cada prospecto tiene tantas notas nuevas como entradas
   tenía su historial, y que el historial sigue intacto.
5. **Sólo entonces**, y con autorización aparte, considerar vaciar el historial mediante la
   supresión de admin. Mientras tanto se muestra en el panel como `[historial anterior]`.

**Reversión:** la migración sólo **añade** notas. Revertir = borrar esas notas, que por regla
no se pueden borrar desde el cliente: exige el mismo procedimiento privilegiado. Por eso el
paso 2 (respaldo) es obligatorio antes de tocar nada.

## 6. Riesgos restantes

1. **Las notas no se pueden borrar nunca desde el cliente, ni por el admin.** Es el precio
   de la inmutabilidad. Si hubiera que eliminar una nota por una orden de supresión de datos,
   hará falta un procedimiento privilegiado con registro. **Conflicto real entre inmutabilidad
   y derecho de supresión**, y hay que decidirlo, no ignorarlo.
2. **La auditoría (`crm_audit`) sigue siendo un registro del cliente**: inmutable y no
   falsificable, pero un cliente modificado podría omitir el registro.
3. **La cartera se corta en 200 documentos** sin paginación ni aviso.
4. **La interfaz no reacciona en vivo** a una revocación: el usuario desactivado conserva lo
   ya cargado hasta recargar (el servidor sí le deniega todo).
5. **No se ha revisado el código corregido por un auditor independiente todavía** — está
   solicitado a Codex y su informe se incorporará cuando llegue.

## 7. Dictamen

> **GO para publicar KZ-CRM-018**, con una condición y una salvedad.
>
> **H03 está corregido y demostrado**: un asesor no puede alterar notas anteriores mediante
> operaciones directas contra Firestore —probado con 34 comprobaciones, incluido el intento
> del propio administrador—, el historial heredado está congelado y el administrador conserva
> todo su acceso (13/13).
>
> **Condición:** desplegar en el orden correcto — primero las reglas, después el panel, y
> verificar que un asesor asignado puede crear una nota y que un tercero recibe 403.
>
> **Salvedad:** quedan los riesgos del §6, y el informe de Codex sobre esta corrección está
> pendiente. No lo presento como «revisado» antes de tenerlo.

## 8. Reversión del despliegue

```bash
git switch main && git revert <commit de publicación> && git push origin main
```
Las reglas se revierten repuntando el release al ruleset anterior (siguen todos guardados).
**Advertencia:** volver al ruleset previo **reabre H03** (el historial vuelve a ser un array
editable). No revertir sin saber esto.
