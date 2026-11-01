# KZ-CRM-018 · Bitácora de continuidad

> **Índice de continuidad, no fuente de verdad.** No sustituye Git ni los resultados de las
> pruebas: si algo difiere, mandan `git log` y los registros de las baterías.
> Última actualización: sesión de certificación de concurrencia.

## 1. Rama y commit

| Dato | Valor |
|---|---|
| Rama | `audit/kz-crm-018` |
| Commit de partida de esta sesión | `512ce66993160e52751fc85c1dfecca487dfa6ee` |
| `main` | `8fb058b6d4b0f7dff27128d8df76113b850b4bc5` (intacto) |
| Producción | sin tocar: no se ha desplegado nada |

## 2. Estado del árbol

Limpio tras el commit de concurrencia. Lo pendiente de commitear en la sesión anterior a
esta bitácora: `crm-dev/pruebas-concurrencia.cjs` (nuevo).

## 3. Herramientas y rutas (sin credenciales)

- **Java para el emulador**: `C:\Program Files\Android\Android Studio\jbr\bin` (OpenJDK 21).
  Se añade a `PATH` en cada invocación; **no hay Java en el sistema** y no se instaló nada.
- **firebase CLI**: `C:\Users\usuario29\AppData\Roaming\npm\firebase.ps1` (v15.x).
- **Chromium para pruebas de navegador**: variable `RCL_CHROMIUM` →
  `C:\Users\usuario29\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe`
  (el build 1248 que espera `@playwright/test` no está descargado; se usa el 1243 que sí está).
- **Repositorio del CRM**: `6-LANDING-PAGES\Konfio-Zinc-Web` (remoto SSH `konfiozinc/card`).
- **Ejecutor de batería con aislamiento**: `%TEMP%\kz-bateria2.cjs` (limpia colecciones
  entre suites; vive fuera del repo a propósito).

Comando tipo:

```powershell
$env:PATH = "C:\Program Files\Android\Android Studio\jbr\bin;$env:PATH"
cd 6-LANDING-PAGES\Konfio-Zinc-Web
firebase emulators:exec --only auth,firestore --project demo-crm-016 `
  --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-concurrencia.cjs"
```

## 4. Reglas: publicadas frente a candidatas

| | Fichero | Líneas |
|---|---|---|
| **Publicadas de verdad** en `kzfio-crm` | `crm-dev/firestore.rules.publicado` (volcado por API, solo lectura) | 222 |
| Histórica del repo (NO es lo publicado) | `crm-dev/firestore.rules.prev` | 351 |
| **Candidatas** | `crm-dev/firestore.rules` | 419 |
| Derivada del emulador | `crm-dev/firestore.rules.emulador` (generada; `--check` en verde) | — |

Los dos releases (`cloud.firestore` y `cloud.firestore/default`) apuntan **al mismo ruleset**
de 222 líneas, sha256 `45769374da17ad9b…`. Compatibilidad medida del panel nuevo contra ese
contrato real: **7 de 10 operaciones**; no funcionan alta, notas y selector de asesores
(`crm-dev/pruebas-compatibilidad-panel.cjs`).

## 5. Pruebas

### Ejecutadas en esta sesión (verdes)

| Batería | Resultado |
|---|---|
| `pruebas-concurrencia.cjs` | **38 · 0** |
| Regresión de 20 suites con aislamiento | **20 en verde, 0 fallos** |

Detalle de la regresión: pruebas 32, a03 23, notas 42, equipo 54, admin-actual 16,
formularios 48, privado 59, panel-real 12, migración 30, r06 53, r08 (incluye
`verificar-operacion` 12), concurrencia 38, reversion-segura 39, fallos 54, r02 26,
r03 34, supresion-r04 43, transición-r07 28, aislamiento 15, retención sin fallos.

### Fuera de la batería estándar

`pruebas-seguridad.cjs` usa el juego de reglas de **captación** (`emulador-captacion.json`)
y se ejecuta aparte: 39/39.

### Pendientes

- Auditoría independiente de Codex sobre el commit exacto a publicar.

## 6. Problemas abiertos

1. **El panel nuevo y las reglas candidatas deben desplegarse juntos**: no hay orden que
   deje todo operativo (panel nuevo + reglas viejas rompe alta/notas; reglas nuevas + panel
   viejo rompe el alta). Ventana corta y documentada.
2. **PITR desactivado** y retención de versiones de 1 h en producción: el respaldo previo al
   despliegue es la única red.
3. Producción está **vacía** (0 prospectos, 0 notas, 0 cotizaciones, 0 ventas, 1 ficha
   admin): **no hay migración que ejecutar**.

## 7. Decisiones de seguridad ya tomadas

- Borrado directo de prospecto **denegado a todos** los roles; sólo el procedimiento
  privilegiado `crm-dev/suprimir-datos.cjs`.
- Supresión con **testigo** `crm_supresion/{leadId}`: bloquea notas, cambios de estado,
  cotizaciones y ventas mientras dura; se libera **sólo** al verificar éxito.
- Borrados con **precondición `updateTime`**: lo que cambió tras la lectura no se borra.
- Reversión que **se niega** ante cualquier dato posterior a la migración (documento
  completo, notas, marcador, referencias).
- Ventana de transición **abierta por defecto**, cerrada sólo por el procedimiento
  privilegiado con `crm_config/transicion {acepta_heredados:false}`.
- Captación pública **cerrada**; `firestore.rules.captacion` adaptada pero **no desplegada**.

## 8. Última operación y siguiente tarea

- **Última**: regresión de 20 suites con aislamiento, toda en verde.
- **Siguiente**: commitear concurrencia + esta bitácora, subir la rama, entregar SHA y pedir
  a Codex la revisión de supresión y reversión.

## 9. Restricciones vigentes

Sin publicar · sin desplegar reglas · sin tocar `main` · sin migrar ni borrar datos reales ·
sin Blaze · sin captación pública · sin usuarios reales · sin tocar otros proyectos Firebase.

**Dictamen: NO-GO** hasta que la auditoría independiente sobre el commit exacto sea favorable.

---

## Actualización — cierre de la ventana lectura→testigo

- **Commit:** `a9be69cbc63e608c46e20b8e78f126d1560fb2e5` (rama `audit/kz-crm-018`; `main` en `8fb058b`).
- **Corregido:** en `revertir()` el testigo se coloca **antes** del inventario; las
  lecturas que autorizan el borrado se hacen bajo bloqueo. Simulación sigue sin escribir.
- **Defecto destapado:** la verificación de la migración contaba `lead_id = "suprimido"`
  como huérfano; ya no.
- **Prueba nueva:** C05 en `pruebas-concurrencia.cjs` (modificación concurrente durante la
  adquisición del testigo). Concurrencia: **49 · 0**.
- **Regresión:** 20 suites con aislamiento, **0 fallos**.
- **Pendiente:** auditoría independiente focalizada sobre este commit.