# Informe LOTE G — Comprobación de solo lectura en producción

**Fecha:** sesión actual · **Alcance:** verificar el estado real de producción para decidir GO/NO-GO de un despliegue por etapas.
**Carácter:** todo lo siguiente se obtuvo con lecturas. No se creó ni modificó nada en producción: sin buckets, sin índices, sin funciones, sin cuentas, sin exportaciones, sin migraciones, sin push/merge/deploy, sin invocar tareas programadas, sin leer registros de clientes, sin compras.

---

## 1. Proyecto real y componentes publicados

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Proyecto Firebase | **`konfio-zinc`** (nº 1096915735255) | `.firebaserc` y `assets/js/config.js: projectId: 'konfio-zinc'` |
| Proyectos visibles a la sesión | 4: `ali-binary-options`, `el-titi-menu`, `konfio-zinc`, `mi-scanner-trading` | `firebase projects:list` |
| Cuenta autenticada en la CLI | 1 cuenta (`***@gmail.com`, enmascarada) | `firebase login:list` |
| Base de datos | `projects/konfio-zinc/databases/(default)` · STANDARD · FIRESTORE_NATIVE | `firebase firestore:databases:list` |
| Hosting Firebase | Sitio `konfio-zinc` **existe pero está vacío**: `https://konfio-zinc.web.app` → **HTTP 404** | `firebase hosting:sites:list` + petición HTTP |
| App Web registrada | 1: `panel` = `1:1096915735255:web:00e3d896c266293cced692` | `firebase apps:list` |
| **Canal realmente publicado** | **GitHub Pages**: `https://konfiozinc.github.io/card/` → **HTTP 200** (index 44,8 KB) | petición HTTP |

**Conclusión:** el sitio público **no lo sirve Firebase Hosting**, lo sirve GitHub Pages desde el repositorio `card`. Desplegar Hosting no cambiaría lo que ve el usuario.

## 2. Mecanismo de respaldo utilizable

| Comprobación | Resultado |
|---|---|
| `.secrets/` (credencial que usa `herramientas/respaldar-firestore.js`) | **NO existe** en el candidato ni en el clon de producción |
| JSON de cuenta de servicio en el repositorio | **Ninguno** |
| Función de respaldo en el código | **No existe** (ni en `ac44115` ni en `76d74e8`: el código no menciona backup/export/respaldo) |
| Bucket GCS / IAM / ciclo de vida | **No verificable** (gcloud no está instalado) y **no creado** |
| Ensayo de respaldo/restauración | Solo se probó **contra el emulador** (2 colecciones, 14 documentos, hashes idénticos tras restaurar) |

**Conclusión: hoy NO hay respaldo de producción.** Ni automático ni manual. Es el bloqueante más grave.

## 3. Estado del índice de historial de cliente

Índices compuestos en producción: **4, todos en `clientes`**

- `estado` + `fechaVencimiento`
- `estado` + `servicio` + `fechaVencimiento`
- `servicio` + `categoria` + `estado`
- `servicio` + `estado`

**`historial_estados (clienteId ASC, fecha DESC)` NO está desplegado.** La consulta `historialDe()` del candidato fallaría con `FAILED_PRECONDITION` hasta crearlo.

## 4. Cloud Functions y tareas programadas desplegadas

`firebase functions:list` → **«No functions found in project konfio-zinc.»**

Desplegadas: **ninguna**. No existen los 16 callables, ni `ejecutarVencimientos`, ni `processDueDates`.
**Hoy no corre ninguna tarea programada en producción.**

Esto explica que el CRM actual funcione con escrituras locales desde el navegador (`escrituras-local.js`): nunca hubo backend. También implica que **el bug de `FieldValue` que corregí nunca llegó a producción** — porque nunca se ejecutó una sola función.

## 5. Permisos de despliegue disponibles

| Comprobado | Resultado |
|---|---|
| Lecturas que sí funcionan | `functions:list`, `firestore:indexes`, `hosting:sites:list`, `projects:list`, `apps:list` → requiere al menos rol de Viewer |
| Escritura/despliegue | **NO verificado** |
| Motivo | gcloud no está instalado (no se puede leer la política IAM) y probar un deploy está prohibido por este encargo |

**Conclusión: la capacidad de desplegar no está confirmada.** La cuenta es personal (`@gmail.com`) y ve 4 proyectos, lo que sugiere propietario/editor, pero **eso es una suposición, no un dato**. Debe confirmarlo el dueño en la consola (Firebase → Configuración → Usuarios y permisos).

**Secretos:** no se mostraron ni copiaron claves, tokens ni credenciales.

## 6. Situación de los usuarios históricos — ⛔ BLOQUEADO

Averiguar cuántos usuarios históricos hay, en qué estado y si tienen `uid` migrado exige **leer la colección `usuarios` o las cuentas de Auth**, es decir, datos personales de clientes.

Como el encargo prohíbe acceder a registros de clientes, **esta línea queda bloqueada y no se ejecuta**. No se leyó ni se exportó nada.

Lo único que sí puedo afirmar sin leer registros:
- El script `herramientas/migrar-usuarios-email-a-uid.js` existe, es **dry-run por defecto**, exige `--aplicar`, se niega a tocar fichas sin cuenta de Auth, nunca sobrescribe un `uid` existente y deja `migradoDe`/`migradoEn`.
- Se ensayó contra el emulador: 5 casos, incluido el de doble pasada idempotente.
- **El tamaño real del padrón es desconocido.**

Para desbloquear hace falta una de estas dos cosas, y la decide el dueño: (a) que una persona con autorización consulte el dato y lo comunique, o (b) autorización explícita y por escrito para contar registros (solo conteo, sin exportar).

## 7. Rama y commit que sirven el sitio publicado

Comparación de huellas SHA-256 del contenido servido contra los blobs del repositorio:

| Archivo | Publicado | `ac44115` (origin/main) | `ab3d5b9` (main local) | `76d74e8` (candidato) |
|---|---|---|---|---|
| `index.html` | 52981f18 | **52981f18** | 52981f18 | 52981f18 |
| `admin/index.html` | 59579fea | **59579fea** | 59579fea | 59579fea |
| `admin/notificaciones.js` | 9e0a8ef2 | **9e0a8ef2** | 9e0a8ef2 | 03c93d32 |
| `assets/js/admin/datos.js` | 9bd0cd24 | **9bd0cd24** | 9bd0cd24 | 368f2296 |
| `firestore.rules` | dd13fc3f | **dd13fc3f** | dd13fc3f | f4dcf877 |
| `precios.html` | 385296b8 | **385296b8** | 385296b8 | 385296b8 |

- El sitio publicado **coincide byte a byte con `main` = `ac44115`**, la punta de `origin/main`.
- Ramas en el remoto: **solo `refs/heads/main`** (`ac44115`). Ninguna rama de trabajo está publicada.
- La API de GitHub Pages responde **HTTP 404** (no se puede leer la configuración del sitio por API); la rama se determinó por contenido, que es prueba más fuerte.
- `precios.html` publicado coincide con el commit: la modificación local detectada en el clon de producción **no está publicada** (confirma que debe viajar junto con la migración de precios).

**Conclusión: los arreglos del candidato no están en producción** (LOTE A–F, CARD-011/017-019, P1–P3). Lo publicado es el código anterior a esta integración.

## 8. Pasos que podrían cambiar estado, enviar comunicaciones o afectar servicios

| Paso | Efecto real | Riesgo |
|---|---|---|
| **Desplegar Functions** | Activa `processDueDates`: `onSchedule` **todos los días 08:00 America/Bogota** → procesa vencimientos, **envía push y correo** y **suspende clientes** | **Alto y externo.** El primer disparo es irreversible hacia afuera |
| Validar el disparador B5 | Envía comunicaciones reales a clientes | Alto |
| Desplegar reglas de Firestore | Cambia qué escrituras acepta el sitio en vivo (clientes reales) | Alto si el sitio publicado no coincide con las reglas |
| Crear índice `historial_estados` | Aditivo, pero consume tiempo y bloquea la vista de historial mientras construye | Bajo |
| Desplegar Hosting | **No cambia lo que ve el usuario** (el canal es GitHub Pages) | Bajo pero inútil hoy |
| **Push a `main`** | **Es el verdadero go-live**: GitHub Pages publica el código nuevo en minutos | Alto e inmediato |
| Ejecutar `migrar-usuarios-email-a-uid.js --aplicar` | Escribe `uid` en fichas de usuarios reales | Alto |
| Invocar `ejecutarVencimientos` | Cambia estados de clientes (SUSPENDIDO, POR_VENCER) | Alto |
| `firestore:delete` / borrados | — | Prohibido |

## 9. Condiciones de lanzamiento

### Cumplidas
- ✅ Proyecto Firebase real identificado y accesible.
- ✅ Candidato verificado: 130 pruebas automáticas contra emuladores (reglas 47/47, callables 20/20, vencimientos 20/20, LOTE B 10/10, LOTE C 29/29), 0 peticiones externas.
- ✅ Motor de vencimientos probado **dentro del runtime de Functions** (SUPERADMIN 200; ADMIN/OPERADOR 403; anónimo 401).
- ✅ Historial git lineal: integrar el candidato sobre `origin/main` es **fast-forward**.
- ✅ Respaldo/restauración ensayados en emulador, con manifiesto SHA-256.

### Pendientes (bloqueantes)
- ❌ **No hay respaldo de producción** (bucket, IAM y ciclo de vida sin crear; sin credencial de servicio).
- ❌ **No hay ninguna Cloud Function desplegada**: el backend del candidato no existe en producción.
- ❌ **Falta el índice `historial_estados`**.
- ❌ **Permisos de despliegue sin confirmar**.
- ❌ **Padrón de usuarios históricos desconocido** (línea bloqueada por la regla de no leer datos de clientes).
- ❌ **Disparador programado sin validar** (nunca se ejecutó en un runtime real).
- ❌ **Canal de publicación sin decidir**: GitHub Pages (actual) vs Firebase Hosting (vacío).

---

## Recomendación

# ⛔ NO-GO para desplegar hoy

No por la calidad del código —el candidato está probado— sino porque **faltan las condiciones de reversibilidad**: sin respaldo no hay vuelta atrás si las reglas o la migración dañan datos, y desplegar Functions enciende un trabajo diario que envía mensajes y suspende clientes sin que el disparador se haya validado nunca.

### Orden mínimo para pasar a GO

1. **Respaldo primero.** Crear bucket `konfio-zinc-backups` (us-central1, acceso uniforme), dar *Cloud Datastore Import Export Admin* + *Storage Object Admin* a la cuenta de servicio, ciclo de vida 7–30 días, guardar el JSON **fuera del repositorio** (`*.json` de cuentas de servicio nunca dentro de `card`, que es público), y ejecutar **un export real** con su verificación de integridad.
2. **Confirmar el rol de despliegue** de la cuenta (`***@gmail.com`) en la consola.
3. **Crear el índice `historial_estados`** y esperar a que esté `READY`.
4. **Desplegar reglas** y revalidar la aceptación contra el sitio publicado real.
5. **Desplegar Functions** y validar el disparador B5 **con un destinatario de prueba controlado por el dueño**, no con clientes.
6. **Migrar usuarios** en dry-run, revisar el informe y solo entonces `--aplicar`.
7. **Publicar el sitio** — y decidir antes si el canal sigue siendo GitHub Pages (push a `main`) o se pasa a Firebase Hosting.

Regla de oro vigente: **si la aceptación de reglas falla, no se despliegan Functions y no se migra.**

### Decisiones que solo puede tomar el dueño
- Autorizar el bucket y la cuenta de servicio en GCP.
- Autorizar (o no) el conteo del padrón de usuarios, con el alcance exacto.
- Autorizar el primer envío real del motor de vencimientos y a qué destinatario.
- Decidir el canal de publicación definitivo.
