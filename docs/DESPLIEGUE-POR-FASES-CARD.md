# Despliegue de CARD por etapas seguras (LOTE H)

> Documento operativo. Todas las comprobaciones de este lote se hicieron en la copia aislada y
> contra emuladores con datos ficticios. **No se ha desplegado nada, no se ha hecho push ni merge,
> no se ha leído un solo registro de clientes reales.**

---

## 0. Qué aporta este lote

| Pieza | Archivo | Para qué |
|---|---|---|
| Interruptor a prueba de fallos | `functions/src/motor.js` | El motor de vencimientos no corre si no se abren **dos** condiciones |
| Consulta del interruptor | `estadoMotor` (callable) | Comprobar tras desplegar que quedó cerrado, sin efectos |
| Reglas | `firestore.rules` | El interruptor **no** se puede abrir desde el navegador |
| Despliegue selectivo | `herramientas/desplegar-funciones.ps1` | Desplegar Callables **sin** el motor; el motor exige autorización explícita |
| Respaldo verificable | `herramientas/verificar-respaldo-firestore.js` | Un respaldo sin manifiesto válido no cuenta como respaldo |
| Permisos | `herramientas/verificar-permisos.js` | IAM, APIs habilitadas y buckets reales, solo lectura |
| Pruebas | `herramientas/test/pruebas-motor-p1.js` | 49 comprobaciones del interruptor y del respaldo |
| Interruptor documentado | `functions/.env.example` | La variable, sin valor por omisión |

---

## 1. Lo reversible y lo que modifica datos

| Operación | ¿Modifica datos? | ¿Necesita respaldo? | Cómo se vuelve atrás |
|---|---|---|---|
| Crear el índice `historial_estados` | No (solo estructura) | No | Borrar el índice |
| Desplegar reglas de Firestore | No | **Sí, por prudencia** | Volver a desplegar las reglas anteriores |
| Desplegar Callables administrativas | No | No | Volver a desplegar la versión anterior |
| Publicar el sitio (GitHub Pages) | No | No | `git revert` del commit publicado |
| Cerrar el interruptor del motor | No | No | Volver a abrirlo (dos condiciones) |
| **Abrir el interruptor del motor** | **Sí: suspende servicios y envía avisos** | **Sí, obligatorio** | Cerrarlo; los avisos ya enviados no se recuperan |
| **Ejecutar la migración de usuarios** | **Sí: reescribe identificadores** | **Sí, obligatorio** | Restaurar la colección `usuarios` desde el respaldo |
| `recalcularEstados` (panel) | **Sí: reescribe estados de clientes** | **Sí** | Restaurar; no deja historial |
| `seedInicial` (panel) | **Sí: crea planes y configuración** | Sí | Borrar lo creado a mano |
| Escrituras normales del CRM | Sí | Ya cubiertas por el respaldo diario | Respaldo |

Regla práctica: **todo lo que se despliega es reversible; todo lo que se abre o se ejecuta sobre
datos, no.** Las etapas de abajo están ordenadas para que, si algo falla, el sistema quede en un
estado conocido y sin efectos hacia los clientes.

---

## 2. El interruptor del motor

El motor procesa vencimientos, **envía notificaciones y suspende servicios**. Para que corra tienen
que cumplirse **las dos** condiciones:

1. La variable de entorno `KZ_MOTOR_VENCIMIENTOS` vale exactamente `HABILITADO`
   (se define en `functions/.env.konfio-zinc`, que **no se versiona**; sin el archivo, no existe).
2. El documento `configuracion/motorVencimientos` existe con `habilitado: true` (booleano estricto).

| Variable | Documento | Resultado |
|---|---|---|
| ausente | cualquiera | **CERRADO** |
| cualquier otro valor (`si`, `true`, `1`) | cualquiera | **CERRADO** |
| `HABILITADO` | inexistente | **CERRADO** |
| `HABILITADO` | `habilitado: false` o `"true"` (texto) | **CERRADO** |
| `HABILITADO` | `habilitado: true` | **ABIERTO** |
| — | error al leer la configuración | **CERRADO** |

Cualquier duda cierra. Ninguna condición se activa por omisión: para abrir hacen falta dos actos
deliberados y distintos (cambiar el archivo de entorno y **volver a desplegar** + escribir el
documento con el Admin SDK), y **el documento no se puede escribir desde el navegador** — las reglas
lo impiden incluso para un SUPERADMIN.

### Comprobarlo
Desde el panel, con un SUPERADMIN, la Callable `estadoMotor` devuelve `habilitado` y el motivo.
No lee el padrón, no escribe y no envía nada. Es lo primero que hay que mirar tras cualquier
despliegue.

### Abrirlo (última etapa, solo con autorización)
1. Respaldo verificado (§5).
2. `functions/.env.konfio-zinc` con `KZ_MOTOR_VENCIMIENTOS=HABILITADO` y desplegar el motor
   (`herramientas/desplegar-funciones.ps1 -Etapa motor -Ejecutar -AutorizadoPor "…"`).
3. Crear `configuracion/motorVencimientos` con `habilitado: true` desde la consola de Firebase
   (Firestore → colección `configuracion` → documento `motorVencimientos`).
4. `estadoMotor` debe decir `habilitado: true`.
5. **Primer disparo controlado**: llamar `ejecutarVencimientos` a mano (mismo código que el
   programador) y leer el resumen. Solo después se deja que corra solo a las 08:00.

### Cerrarlo (en cualquier momento, sin desplegar)
Poner `habilitado: false` (consola o Admin SDK). El siguiente disparo ya no hace nada.

---

## 3. Etapas

Cada etapa indica: qué hace, con qué comando, cómo se verifica y cómo se revierte.
**Ninguna se ejecuta sin la anterior verificada.**

### E0 · Respaldo verificado — BLOQUEANTE
Ver §5. Sin un respaldo íntegro y verificado no se sigue. Nada más de este plan puede recuperar
datos de clientes.

### E1 · Índice `historial_estados`
```bash
firebase deploy --only firestore:indexes --project konfio-zinc
```
- Verificación: `firebase firestore:indexes --project konfio-zinc` lo muestra `READY`.
- Reversión: quitarlo de `firestore.indexes.json` y volver a desplegar.
- Si falla: el frontend nuevo sigue funcionando salvo la vista de historial (ver §4). No bloquea E2.

### E2 · Callables administrativas (SIN el motor)
```powershell
pwsh herramientas/desplegar-funciones.ps1                 # muestra el plan, no despliega
pwsh herramientas/desplegar-funciones.ps1 -Etapa admin -Ejecutar
```
El script comprueba que la lista de funciones coincide con los `exports` reales, que el motor **no**
va incluido, y avisa del estado del interruptor. Falla si algo no cuadra.
- Verificación: `firebase functions:list --project konfio-zinc` (17 funciones, **sin**
  `processDueDates`) y `estadoMotor` → `habilitado: false`.
- Reversión: volver a desplegar la versión anterior.
- Si falla: no se publica el frontend (el frontend nuevo necesita estas Callables).

### E3 · Publicar el frontend (GitHub Pages)
Ver §6. Es el paso que ve el usuario.

### E4 · Reglas de Firestore
```bash
firebase deploy --only firestore:rules --project konfio-zinc
```
**Después** de E3, nunca antes: el panel publicado hoy gestiona usuarios escribiendo
`usuarios/*` desde el navegador, y las reglas nuevas prohíben esas escrituras (a propósito). Si las
reglas se desplegaran primero, la gestión de usuarios del panel actual dejaría de funcionar en
silencio.
- Verificación: repetir la regresión de reglas contra el sitio publicado.
- Reversión: volver a desplegar `firestore.rules` anterior.
- Si falla: **se detiene el plan** — no se migra y no se abre el motor.

### E5 · Migración de usuarios
```bash
node herramientas/migrar-usuarios-email-a-uid.js            # dry-run: solo informa
node herramientas/migrar-usuarios-email-a-uid.js --aplicar  # solo con autorización
```
- Requiere credencial de servicio y **autorización escrita**: toca fichas reales.
- Reversión: restaurar la colección `usuarios` desde el respaldo de E0.
- Alcance desconocido hoy: no se leyó el padrón (prohibido en este encargo).

### E6 · Motor programado
Solo con E0 verificada, E4 en verde y autorización explícita: `-Etapa motor` + abrir el interruptor
(§2). Última etapa, nunca antes.

---

## 4. Compatibilidad: qué pasa si falta una pieza

| Pieza ausente | Síntoma | ¿Bloquea? |
|---|---|---|
| Respaldo verificado | No hay vuelta atrás si algo se daña | **Sí, bloquea todo** |
| Índice `historial_estados` | La vista de historial del cliente falla (`FAILED_PRECONDITION`); el resto del panel funciona | No |
| Callables (E2) | «No se pudo crear el usuario», «No se pudo enviar la notificación»: el panel nuevo gestiona usuarios y avisos por Callable | Sí, antes de E3 |
| Reglas nuevas antes que el frontend | El panel **actual** deja de poder crear/editar usuarios (escribe `usuarios/*` desde el navegador) | Sí, por orden |
| Migración de usuarios | Las fichas con el correo como identificador no son reconocidas por el gate de rol de las Callables («Tu usuario no tiene ficha en el panel») | No bloquea, pero deja gente fuera |
| Interruptor del motor cerrado | Nada corre: ni avisos, ni suspensiones automáticas | No; es el estado buscado en la primera publicación |
| Frontend publicado sin Callables | Usuarios y avisos no funcionan; pagos y clientes siguen escribiendo directo | Sí, no hacerlo |

Orden que se deduce de la tabla: **respaldo → índice → Callables → frontend → reglas → migración →
motor.**

---

## 5. Respaldo real de Firestore

### Camino A · respaldo local verificable (disponible hoy)
La credencial de servicio ya existe fuera del repositorio
(`14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json`); **no hace falta instalar nada**.

```bash
node herramientas/respaldar-firestore.js            # SOLO LECTURA · deja una carpeta con manifiesto
node herramientas/verificar-respaldo-firestore.js --dir herramientas/backups/<carpeta>
```
`verificar-respaldo-firestore.js` comprueba: manifiesto `COMPLETO`, existencia y tamaño de cada
documento, SHA-256 individual, cuadre del conteo por colección y huella de `resumen.json`.
**Un respaldo sin manifiesto válido no se usa.**

- Reversible/no reversible: el respaldo **no escribe** en Firestore (solo lee).
- Requisito: **autorización del dueño**, porque lee datos personales, y ventana de mantenimiento.
- La carpeta generada debe quedarse **fuera del repositorio** (el repositorio es público).
- Estado: ensayado contra el emulador (2 colecciones, 14 documentos, integridad y restauración
  correctas). **Nunca se ha ejecutado contra producción.**

### Camino B · export a Cloud Storage (recomendado a mediano plazo)
Requiere GCP y no está creado. Comandos previstos, **sin ejecutar**:

```bash
gcloud services enable firestore.googleapis.com storage.googleapis.com
gcloud storage buckets create gs://konfio-zinc-respaldos --project konfio-zinc \
    --location=us-central1 --uniform-bucket-level-access
gcloud projects add-iam-policy-binding konfio-zinc \
    --member="serviceAccount:fir-...@konfio-zinc.iam.gserviceaccount.com" \
    --role="roles/datastore.importExportAdmin"
gcloud projects add-iam-policy-binding konfio-zinc \
    --member="serviceAccount:fir-...@konfio-zinc.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"
gcloud storage buckets update gs://konfio-zinc-respaldos \
    --lifecycle-file=ciclo-vida.json          # borrar respaldos de más de 30 días
# respaldo
gcloud firestore export gs://konfio-zinc-respaldos/$(date +%Y%m%d-%H%M) --project konfio-zinc
# integridad: la operación debe terminar en SUCCESS y el prefijo debe tener su manifiesto
gcloud firestore operations list --project konfio-zinc
# restauración (proyecto de prueba o base nueva, nunca encima de producción sin autorización)
gcloud firestore import gs://konfio-zinc-respaldos/<prefijo> --project <proyecto>
```
Comprobaciones: (1) la operación de export en `SUCCESS`; (2) el prefijo contiene el
`*-overall_export_metadata`; (3) al restaurar en un proyecto espejo, contar documentos por colección
y comparar con el `resumen` del respaldo; (4) el bucket tiene la regla de ciclo de vida aplicada.

### Comprobaciones de IAM, APIs y buckets — ya ejecutables
```bash
node herramientas/verificar-permisos.js
```
Solo lee metadatos (IAM, servicios habilitados, nombres de buckets): no abre documentos de clientes.
Resultado real de hoy: la credencial **no puede leer la política IAM** (`getIamPolicy` → 403) ni la
lista de servicios (`serviceusage` → 403); **buckets del proyecto: ninguno**. Por eso IAM y APIs
quedan como comprobación pendiente para una persona con acceso a la consola.

---

## 6. Publicación del sitio (GitHub Pages)

El canal real es **GitHub Pages sobre `main`** (`https://konfiozinc.github.io/card/` → 200). Firebase
Hosting existe pero está vacío (404): desplegarlo no cambiaría nada para el usuario.

**Conservar la versión pública actual** (hoy `ac44115`):
```bash
git tag release/previo-ac44115 ac44115      # antes de publicar; el punto de retorno queda fijado
git log --oneline -1 main
```

Procedimiento, cuando se autorice:
1. Confirmar en local que `precios.html` viaja con la migración de precios pendiente (no publicar una
   versión intermedia con precios viejos).
2. Verificar `node herramientas/verificar-precios.js` sin errores.
3. Publicar: `git push origin <rama>:main` (push fast-forward; nunca `--force`).
4. Esperar ~1 minuto y comprobar: `https://konfiozinc.github.io/card/admin/index.html` → 200, y que la
   huella de los archivos publicados coincide con el commit.
5. Si algo se ve mal: `git revert <commit>` y volver a publicar (deja historia, no requiere force).

**Reversión de emergencia** (solo si el revert no basta): volver `main` al tag `release/previo-ac44115`.
Nunca se reescribe historia en `main` sin autorización explícita.

---

## 7. Verificación de solo lectura después de cada etapa

```bash
firebase functions:list --project konfio-zinc
firebase firestore:indexes --project konfio-zinc
firebase hosting:sites:list --project konfio-zinc
curl -o NUL -w "%{http_code}" https://konfiozinc.github.io/card/admin/index.html
git ls-remote --heads origin
```
Y en el panel: `estadoMotor` (SUPERADMIN) → `habilitado` y motivo.

---

## 8. Lo que este lote NO hizo

- No desplegó reglas, índices, funciones ni hosting. No hizo push ni merge.
- No creó buckets ni cambió IAM. No instaló nada.
- No abrió ni migró datos reales de clientes. No envió ninguna notificación.
- No tocó `main` ni `precios.html`.

Decisiones que quedan del dueño: autorizar el respaldo (lee datos personales), crear el bucket y los
roles en GCP, confirmar el rol de despliegue de la cuenta, decidir el canal definitivo, y autorizar
el primer disparo real del motor con un destinatario de prueba.
