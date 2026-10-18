# Lista de lanzamiento de Card — una sola página

Separación estricta entre **lo comprobable en local** (ya hecho) y **lo que
exige producción** (pendiente). Nada de esta lista se ha ejecutado contra el
proyecto real.

---

## A. Ya verificado en local (no hay que repetirlo)

| # | Comprobación | Evidencia |
|---|---|---|
| A1 | Reglas financieras de pagos | 47/47 (inmutabilidad, transiciones, auditoría) |
| A2 | Operaciones del CRM en navegador | LOTE C 29/29 · LOTE B 10/10 |
| A3 | Callables (usuarios, pagos, avisos) | 21/21 contra el emulador de Functions |
| A4 | Motor de vencimientos | 20/20 (fechas, avisos, idempotencia, reintentos, límite, recuperación) |
| A5 | **Motor ejecutado dentro del runtime de Functions** | `ejecutarVencimientos` con SUPERADMIN → `{revisados:16, avisos:0, fallidos:0, suspendidos:2, porVencer:1, vencidos:1}`; ADMIN 403 · OPERADOR 403 · anónimo 401 |
| A6 | Migración correo→UID | simulación, aplicación, idempotencia, duplicados y fichas sin Auth |
| A7 | Respaldo y restauración | 14 documentos, hashes idénticos tras restaurar |
| A8 | Aislamiento del staging | 0 peticiones externas en todas las suites |

## B. Lista de lanzamiento (orden obligatorio)

### B1. Antes de tocar nada (producción, requiere autorización)
1. **Export de respaldo**: crear bucket + IAM (ver C1) y ejecutar
   `gcloud firestore export gs://<bucket>/card-<fecha>`.
2. **Guardar las reglas actuales** desde la consola (Firestore → Reglas) en un
   archivo fechado. Sin eso no hay vuelta atrás real.
3. **Guardar la lista de índices** actual.
4. **Si los pasos 1–3 fallan, NO continuar.**

### B2. Índices (primero, porque tardan en construirse)
```
firebase deploy --only firestore:indexes
```
*Criterio*: `historial_estados` con `clienteId ASC, fecha DESC` en estado
**READY**. Verificar con `node herramientas/verificar-indice-historial.js`
contra el proyecto (código 0 = índice listo).

### B3. Reglas
```
firebase deploy --only firestore:rules
```
*Criterio de aceptación* (solo lectura + una escritura controlada):
- ADMIN confirma un pago PENDIENTE → funciona.
- OPERADOR intenta cambiar el `monto` de un pago → `PERMISSION_DENIED`.
- ADMIN intenta escribir en `usuarios` → `PERMISSION_DENIED`.
- **Si esto falla, detener: no se despliegan funciones ni se migra nada.**

### B4. Functions
```
firebase deploy --only functions
```
*Criterio*: 16 callables + `processDueDates` visibles en la consola.

### B5. **Validación del disparador programado** (el punto delicado)
El emulador **no** ejecuta el programador: publica en el topic
`firebase-schedule-processDueDates` (200 con `messageIds`), la suscripción
existe y el log del emulador queda vacío. Por eso el disparo se valida **después
del despliegue**, en este orden:

- **B5.1 (inmediata, sin esperar):** llamar `ejecutarVencimientos` como
  SUPERADMIN. Ejecuta el mismo código en el runtime real. Devolverá un resumen
  con `revisados/avisados/fallidos/suspendidos/porVencer/vencidos`.
  *Aceptación*: responde 200, los contadores son coherentes y aparecen avisos
  con `intentos` en `notificaciones`. Esto valida **motor + permisos**, no el
  programador.
- **B5.2 (disparo real):** publicar un mensaje al topic:
  ```
  gcloud pubsub topics publish firebase-schedule-processDueDates --message='{}'
  ```
  *Aceptación*: en `firebase functions:log` aparece una ejecución de
  `processDueDates` en los 2 minutos siguientes.
- **B5.3 (natural):** revisar a la mañana siguiente la ejecución de las 08:00
  (America/Bogota) en los logs.

*Si B5.2 y B5.3 no ocurren y B5.1 sí, el problema es el programador
(Cloud Scheduler / permiso), no el código.* Supervisión: dejar a una persona
mirando `firebase functions:log` durante B5.1–B5.3.

### B6. Hosting
```
firebase deploy --only hosting
```
*Criterio*: panel carga, los tres roles entran, y Planes muestra «Nuevo plan» a
ADMIN y «Cargar catálogo inicial» solo a SUPERADMIN.

### B7. Migración de usuarios (última, y con red de seguridad)
```
node herramientas/migrar-usuarios-email-a-uid.js              # simulación
node herramientas/migrar-usuarios-email-a-uid.js --aplicar    # tras revisar
```
*Criterio*: la simulación lista las fichas. **No aplicar** hasta decidir qué
hacer con las marcadas ✗ (sin cuenta de Authentication) y con los duplicados.

## C. Recursos GCP e IAM imprescindibles (NO creados)

| C1 | Recurso | Para qué |
|---|---|---|
| C1.1 | Bucket GCS (`konfio-zinc-backups`, región us-central1, uniform access) | destino del export |
| C1.2 | Rol *Cloud Datastore Import Export Admin* a la cuenta de servicio | exportar/importar |
| C1.3 | Rol *Storage Object Admin* sobre el bucket | escribir el export |
| C1.4 | Lifecycle de 7–30 días | no acumular exports |
| C1.5 | JSON de cuenta de servicio fuera del repo | ejecutar export y migración |
| C1.6 | Ventana de mantenimiento | la migración escribe datos |

## D. Pruebas de humo después de publicar

1. Login de los tres roles.
2. Confirmar un pago → vencimiento +12 meses.
3. Confirmar un pago **antiguo sin `servicioId`** (caso que rompía).
4. Registrar un pago como OPERADOR → no puede confirmarlo.
5. Detalle de cliente → historial de pagos y de estados.
6. Crear usuario desde el panel → desactivarlo → no puede entrar.
7. Enviar aviso manual → la tabla se actualiza sola.
8. `ejecutarVencimientos` + revisar `notificaciones.intentos`.

## E. Reversión

| Qué falla | Cómo se revierte |
|---|---|
| Reglas | Repegar el archivo guardado en B1.2 y redeploy |
| Functions | `firebase deploy --only functions` desde `main` |
| Hosting | idem desde `main`, o revertir en GitHub Pages |
| Índice nuevo | Se puede dejar; no molesta |
| **Migración** | **No automática**: restaurar el export de B1.1, y el rastro `migradoDe` permite deshacer a mano |

## F. Riesgos que impedirían continuar

1. **No hay bucket ni export** → la migración queda sin red de seguridad.
2. **B5.2/B5.3 no ejecutan** → el ciclo de vencimientos no corre solo; mitigación
   inmediata: llamar `ejecutarVencimientos` a mano cada día hasta corregirlo.
3. **Fichas sin cuenta de Authentication** en producción → esos usuarios no
   existirán nunca como usuarios reales del panel.
4. **Push real (FCM)**: sin tokens reales no se ha podido comprobar el envío; los
   avisos en producción dependerán de que los suscriptores tengan token activo.
5. **Nadie ha probado el panel en un móvil real** (375×667 está validado por
   emulación).
