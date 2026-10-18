# Plan de publicación de Card (CRM) — secuencia, aceptación y reversión

Documento de preparación. **Nada de esto se ha ejecutado**: no se ha desplegado
nada, no se ha hecho push y no se ha tocado producción.

---

## 0. Qué se publica

| Artefacto | Origen | Riesgo |
|---|---|---|
| `firestore.rules` | rama `harness/card-pagos-p1` | **Alto** — cambia quién puede escribir pagos y usuarios |
| `firestore.indexes.json` | idem | Bajo — añade un índice compuesto |
| `functions/` (16 callables + 1 programada) | idem | **Alto** — nunca se han ejecutado en producción |
| Sitio (`admin/`, `assets/js/admin/*`) | idem | Medio — cambia el panel real |

---

## 1. Orden de publicación (importa)

**Paso 1 — Índices** (antes que las funciones y antes que las reglas):

```
firebase deploy --only firestore:indexes
```

Motivo: `historialDe()` consulta `historial_estados` con `where(clienteId)` +
`orderBy(fecha)` y **necesita** el índice compuesto. El emulador no lo exige, así
que este paso es la primera validación real de ese índice.

*Condición de aceptación*: `firebase firestore:indexes` debe listar
`historial_estados` con `clienteId ASC, fecha DESC` en estado **READY** (los
índices tardan minutos en construirse; esperar antes del paso 2).

**Paso 2 — Reglas**:

```
firebase deploy --only firestore:rules
```

*Condición de aceptación*: desde una sesión real de ADMIN, confirmar un pago
PENDIENTE (debe funcionar) y desde OPERADOR intentar cambiar el `monto` de un
pago (debe devolver `PERMISSION_DENIED`).

**Paso 3 — Funciones**:

```
firebase deploy --only functions
```

*Condición de aceptación*: las 17 funciones aparecen en la consola y una llamada
`crearUsuario` desde el panel con SUPERADMIN crea la cuenta y su ficha.

**Paso 4 — Sitio** (Hosting/GitHub Pages según el canal que uses):

```
firebase deploy --only hosting
```

*Condición de aceptación*: el panel carga, los tres roles entran, y la página de
Planes muestra «Nuevo plan» a ADMIN y «Cargar catálogo inicial» solo a
SUPERADMIN.

**Paso 5 — Migración de usuarios** (no es un despliegue; es datos):

```
node herramientas/migrar-usuarios-email-a-uid.js              # simulación
node herramientas/migrar-usuarios-email-a-uid.js --aplicar    # escritura
```

*Condiciones*: requiere credenciales de servicio y ventana de mantenimiento
corta. Ejecutar SIEMPRE primero la simulación y **leer la lista**. Las fichas
marcadas con ✗ (sin cuenta de Authentication) no se migran: hay que decidir con
el propietario si se crean esas cuentas o se descartan.

---

## 2. Respaldo previo (obligatorio)

1. **Reglas actuales**: `firebase firestore:rules` no basta; guarda el archivo
   tal como está hoy en producción:
   `firebase deploy --only firestore:rules --dry-run` no existe → copia el
   `firestore.rules` publicado desde la consola (Firestore → Reglas) a un archivo
   fechado antes de tocar nada.
2. **Índices**: exporta la lista actual (`gcloud firestore indexes composite list`
   o consola) para poder comparar.
3. **Datos**: exportación de Firestore a un bucket propio
   (`gcloud firestore export gs://<bucket>/card-<fecha>`) **antes** de la
   migración. Requiere que el bucket y los permisos existan; hoy no existen (ver
   bloqueos).
4. **Código**: la rama está en local; el punto de retorno es `main` (`ab3d5b9`).

---

## 3. Reversión

| Qué falla | Cómo se revierte |
|---|---|
| Reglas | Volver a pegar el `firestore.rules` guardado en el paso de respaldo y redeploy |
| Funciones | `firebase deploy --only functions` desde `main` (deja el código anterior) |
| Sitio | `firebase deploy --only hosting` desde `main`, o revertir en GitHub Pages |
| Índice nuevo | `firebase firestore:indexes` con el archivo anterior; el índice sobrante se borra desde la consola (no rompe nada dejarlo) |
| Migración de usuarios | **No es reversible automáticamente.** Por eso: (a) ejecutar simulación primero, (b) exportar Firestore antes, y (c) el script deja `migradoDe`/`migradoEn` en cada ficha nueva para poder localizar y deshacer a mano |

**Regla de oro**: si el paso 2 (reglas) falla en aceptación, **no ejecutar** ni el
paso 3 ni el 5: las reglas nuevas son las que protegen las funciones y la
migración.

---

## 4. Comprobaciones de humo después de publicar

1. Login de los tres roles.
2. Confirmar un pago y verificar que el vencimiento salta 12 meses.
3. Confirmar un pago **antiguo sin `servicioId`** (el caso que rompía).
4. Crear un usuario desde el panel; desactivarlo; comprobar que no puede entrar.
5. Registrar un pago como OPERADOR y comprobar que **no** puede confirmarlo.
6. Abrir el detalle de un cliente y ver su historial de pagos.
7. Enviar un aviso manual y ver que la tabla se actualiza sola.
8. Forzar `processDueDates` (ver bloqueo 4) y comprobar que no duplica avisos.

---

## 5. Estado de los índices

`firestore.indexes.json` declara 5 índices: cuatro preexistentes sobre `clientes`
y uno nuevo:

```json
{ "collectionGroup": "historial_estados", "queryScope": "COLLECTION",
  "fields": [ { "fieldPath": "clienteId", "order": "ASCENDING" },
              { "fieldPath": "fecha", "order": "DESCENDING" } ] }
```

El resto de consultas del CRM ordenan por un solo campo y usan el índice
automático: no necesitan nada más.
