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
---

## Remediación consolidada B1–B4 (auditoría independiente)

- **B1 · fallo cerrado:** orrarSiNoCambio() ya no borra sin updateTime válido;
  updateTimeDe() Lanza ante error HTTP y solo devuelve `"ausente"` ante 404 real.
- **B2 · marcador:** su updateTime se **lee antes** de cualquier destrucción y se usa
  como precondición del borrado.
- **B3 · referencias:** los repuntes de cotización y venta usan patchSiNoCambio() con
  precondición y updateMask.
- **B4 · testigos residuales:** nuevo modo `--revertir --limpiar-testigos`; retira solo
  los testigos cuya operación concluyó y se verificó, conserva los que protegen trabajo
  pendiente e informa con código 3. El mensaje de recuperación ya **no** remite a
  `suprimir-datos.cjs`.
- **Pruebas:** `pruebas-concurrencia.cjs` **70 · 0** (sección 6: simulación sin
  escrituras, GET de updateTime 500, GET del marcador 500, interrupción con dos testigos,
  reanudación sin pérdida y limpieza idempotente).
- **Regresión:** 20 suites con aislamiento, **0 fallos**.
- **Siguiente:** verificación focalizada de Codex sobre B1–B4.

---

## Continuación controlada · T04, T05, T07, T08, diagnóstico y regresión final

| Dato | Valor |
|---|---|
| Rama | `audit/kz-crm-018` |
| Commit de partida | `48de4ce6826d199659f3e6b2c2818f9903ccd09b` |
| Commit de esta entrega | `PENDIENTE_DE_SHA` |
| Árbol de trabajo | limpio |
| Producción / `main` | intactos: no se desplegó ni se fusionó nada |

### 1 · Pruebas que faltaban (Tarea 1)

Las cuatro se añadieron a `crm-dev/pruebas-concurrencia.cjs` (final de la sección 7) y cada una
comprueba las seis cosas exigidas: resultado del proceso, estado de **todos** los documentos
afectados, conservación de lo que otro escribió a la vez, estado del mapa, estado de los testigos
y recuperación con idempotencia. **No se modificó ninguna aserción existente**: T01, T02, T03, T06,
T09 y T10 siguen intactas y siguen en verde.

| Prueba | Cómo se provoca | Resultado medido |
|---|---|---|
| **T04** · cotización modificada durante el repunte | Escritura **real** en el almacén (fuera de banda, vía proxy) que sube el `updateTime` de la cotización justo antes de reenviar el commit del repunte | La reversión **aborta (código 2)** con «precondición rechazada (HTTP 400)»; el `estado:"aceptada"` concurrente se conserva; la cotización sigue apuntando al UUID; prospecto, nota y heredado intactos; testigo puesto; mapa `iniciada`. Al reanudar: repunte aplicado **y el cambio concurrente sobrevive** (18 aserciones) |
| **T05** · venta modificada durante el repunte | Ídem sobre `crm_sales`, con un cambio de negocio (`monto` 99.900 → 120.000) | Aborta (código 2) con precondición rechazada; el importe concurrente se conserva; la cotización hermana sí quedó repuntada; al reanudar el importe **sigue siendo 120.000** (16 aserciones) |
| **T07** · una entrada terminada y otra pendiente | Interrupción real de la reversión en el borrado del prospecto de la **segunda** entrada, con la primera ya `hecha` | Antes: la entrada terminada hacía abortar la reanudación (`INCOMPLETO`, código 3). Ahora: reanuda (código 0), la pendiente termina, la terminada **no se vuelve a procesar** y **no queda ningún testigo huérfano** (15 aserciones) |
| **T08** · respuesta perdida tras aplicar una escritura | El commit se aplica en el almacén y la conexión se corta después (`cortar-despues`): el cliente recibe error de red, no un cuelgue | Aborta (código 2) con «sin respuesta del almacén». Se comprueba que **la escritura sí se había aplicado** (el prospecto ya no está) y que **nada más se dio por hecho**: marcador pendiente, testigo puesto, mapa `iniciada`. Al reanudar reconoce lo aplicado y cierra (14 aserciones, incluidas T08.2 sin nada más que escribir) |

Concurrencia completa: **PASS 160 · FALLA 0**.

### 2 · Dos defectos reales del procedimiento, destapados por T07 y T08

Ninguno de los dos se conocía. Ambos están corregidos en `crm-dev/migrar-uuid.cjs`:

1. **Una entrada `hecha` bloqueaba la reanudación de la pendiente.** El guardia
   «INCOMPLETO» se disparaba con cualquier entrada sin prospecto ni notas, que es exactamente
   la forma de una entrada ya terminada. Además, `ponerTestigos()` volvía a poner testigo a
   **todas** las entradas, incluidas las terminadas, y como el bucle las salta, ese testigo
   quedaba huérfano. Ahora las entradas `hecha` se excluyen del testigo y del bucle, y sólo se
   comprueba que el mapa no mienta (si el prospecto migrado siguiera vivo, se aborta).
2. **Una entrada con la destrucción ya aplicada no se podía cerrar.** Si la respuesta se perdía
   tras el borrado del prospecto, la reanudación abortaba para siempre con el mapa y el testigo
   vivos, y el marcador del teléfono quedaba apuntando a un UUID inexistente. Ahora se admite
   esa situación **sólo si el mapa demuestra que esta reversión la empezó** (`reversion` se
   escribe antes de la primera escritura); si el prospecto desapareció sin que esta reversión lo
   tocara, se aborta como antes. Para que ese juicio sea honesto, las notas se leen **siempre**,
   también cuando el prospecto ya no existe, y la existencia del documento heredado se verifica
   **de forma incondicional** al cerrar cada entrada.

### 3 · Diagnóstico del fallo intermitente de la sección 5 (Tarea 2)

**No era una carrera y no dependía del orden de ejecución. Era estado residual en disco:**
`crm-dev/migracion-uuid.json` sobrevive a la corrida que lo creó, y `limpiar()` —la limpieza de
la propia suite— vaciaba las colecciones **pero no borraba ese archivo**. Cualquier corrida
anterior cortada a mitad (o terminada a propósito con el mapa vivo, como T02 y T06) dejaba una
entrada fantasma, y la corrida siguiente empezaba con ella dentro. La batería con aislamiento no
lo mostraba porque su propio `limpiar()` sí borraba el archivo: el fallo aparecía al ejecutar la
suite suelta, que es como se ejecutó cuando se detectó.

Experimentos controlados, **una variable por corrida** (`%TEMP%\kz-inv-seccion5.cjs`). En
`docs/evidencias/kz-crm-018/` están **las dos fases separadas**: `inv-seccion5-tabla-ANTES.log`
y `inv-seccion5-A1..A3.log` son la fase anterior a las correcciones; `inv-seccion5-*-final.log`
es la fase final sobre este commit.

| Experimento | Qué fija | Código anterior | Código final |
|---|---|---|---|
| **A1–A3** · estado limpio, 3 corridas | descarta carrera y orden | 3/3 en verde (90 · 0) | 3/3 en verde (160 · 0) |
| **B** · mapa residual con el **mismo** teléfono ya migrado | la migración se salta el prospecto | `ERROR: tiempo de espera agotado esperando «testigo-en-vuelo»`; `FALLA 5 · el prospecto migrado existe con UUID (0)`; **código 2** | **PASS 160 · 0**, código 0 |
| **C** · mapa residual con **otro** teléfono, sin reversión iniciada | entrada fantasma en la reversión | 13 fallas, **código 3**, incluida `5 · la reanudación completa la reversión (INCOMPLETO: 3209500015)` | **PASS 160 · 0**, código 0 |
| **D** · ídem con `reversion: "iniciada"` | mismo mecanismo | 13 fallas, código 3 | **PASS 160 · 0**, código 0 |
| **E** · dos corridas seguidas en el **mismo** emulador | estado residual del servidor y auto-contagio | corrida 1: 12 fallas (los defectos T07/T08); corrida 2: falla la sección 5 **por el mapa que dejó la corrida 1** | **las dos corridas en verde** |

La fila E es la que cierra el caso: la suite se contagiaba a sí misma porque sus propias pruebas
abortadas dejaban el mapa. Se corrigió en los dos extremos: el procedimiento ya no abandona el
mapa cuando puede cerrarlo (§2) y la suite borra su propio estado de disco al empezar (§5).

### 4 · Regresión de 20 suites con aislamiento (Tarea 3)

Ejecutada sobre este código con un ejecutor que vacía colecciones **y** archivos de estado antes
de cada suite, guarda la **salida completa** de cada una en
`docs/evidencias/kz-crm-018/regresion/` y registra su **código de salida** (no sólo la línea de
resumen). Resumen global en `docs/evidencias/kz-crm-018/regresion/resumen.json` y
`regresion-20-suites.log`.

| Suite | Código | PASS | Suite | Código | PASS |
|---|---|---|---|---|---|
| `pruebas` | 0 | 32 | `pruebas-paginacion-r08` | 0 | 26 ¹ |
| `pruebas-a03` | 0 | 23 | `pruebas-concurrencia` | 0 | **160** |
| `pruebas-notas` | 0 | 42 | `pruebas-reversion-segura` | 0 | 39 |
| `pruebas-equipo` | 0 | 54 | `pruebas-fallos` | 0 | 54 |
| `pruebas-admin-actual` | 0 | 16 | `pruebas-r02` | 0 | 26 |
| `pruebas-formularios` | 0 | 48 | `pruebas-r03` | 0 | 34 |
| `pruebas-privado` | 0 | 59 | `pruebas-supresion-r04` | 0 | 43 |
| `pruebas-panel-real` | 0 | 12 | `pruebas-transicion-r07` | 0 | 28 |
| `pruebas-migracion` | 0 | 30 | `verificar-aislamiento` | 0 | 15 |
| `pruebas-reglas-r06` | 0 | 53 | `retencion-vencida` | 0 | informe ² |

**20 suites · 20 con código 0 · 794 aserciones PASS · 0 FALLA.**
Fuera de la batería, con su juego de reglas de captación: `pruebas-seguridad` **39 · 0**, código 0.

¹ r08 incluye `verificar-operacion` (12). ² `retencion-vencida` emite un informe, no un contador.

### 5 · Dos defectos del arnés, no del producto

1. **`pruebas-concurrencia.cjs` · `limpiar()`**: ahora borra también `migracion-uuid.json` y
   `migracion-respaldo.json`. Eran estado de la suite que no se limpiaba (§3).
2. **`crm-dev/servir-panel.cjs`**: servía desde `crm-dev/` (`RAIZ = __dirname`) mientras el panel
   vive en `crm/`, así que respondía 404 a todo y `pruebas-panel-real.cjs` moría con
   `ERR_CONNECTION_REFUSED`. Raíz corregida a `../crm`. **Era un fallo previo**, reproducible sin
   ninguno de estos cambios; con él arreglado, panel real: **12 · 0**.

`crm-dev/lib/proxy-fallos.cjs` ganó dos modos que las pruebas nuevas necesitan y que no existían:
`inmutar` (escribe en el almacén y luego reenvía la petición, para abrir la ventana
lectura→escritura de forma estable) y `cortar-despues` (aplica la escritura y corta la conexión).
Ninguno altera el comportamiento de los modos anteriores.

### 6 · Fallos pendientes y riesgos residuales

No queda ningún fallo bloqueante conocido de las pruebas. Riesgos que siguen vigentes y **no** se
han tocado:

1. **Sin atomicidad global:** cada borrado/repunte es su propio commit. Una caída entre dos
   escrituras deja estado parcial que sólo se cierra reanudando con `--revertir --confirmar`
   (ya funciona, ver §2) o retirando testigos con `--limpiar-testigos` una vez verificado.
2. **El mapa es estado local en disco:** si se pierde (otra máquina, borrado manual), una entrada
   a medio revertir ya no se puede reanudar automáticamente. El testigo queda protegiendo y
   `--limpiar-testigos` lo retira sólo cuando el trabajo concluyó y se verificó.
3. **El mapa no se puede recuperar de un `--revertir` que nunca llegó a escribirlo:** si el proceso
   muere antes de la primera escritura, el mapa queda con `estado:"hecho"` y sin `reversion`; al
   reanudar, la entrada se valida de cero (correcto) y si el prospecto no existe, aborta por
   «INCOMPLETO». Es el comportamiento conservador que se decidió mantener.
4. **Los fallos inyectados son HTTP:** las precondiciones que se prueban son las reales del
   almacén, pero una partición de red o un TCP a medias son aproximaciones.
5. **`pruebas-panel-real` consulta el proyecto real** (sonda con credenciales incorrectas: no
   escribe nada) y exige el servidor del panel en `:8321` y red.
6. Sin cambios desde antes: **PITR desactivado** y retención de versiones de 1 h en producción;
   el panel nuevo y las reglas candidatas **deben desplegarse juntos**; producción sigue vacía.
7. **Nota de medición:** `pruebas-paginacion-r08` cuenta 26 aserciones hoy frente a las 53 que
   registró una sesión anterior. No hay ningún fallo en ninguna de las dos mediciones; el número
   depende de los datos que la propia suite siembra (350 prospectos). Se anota para que la
   diferencia no se lea como una regresión.

### 7 · Decisiones verificadas (no supuestas)

- La precondición del **repunte** (B3) rechaza de verdad una modificación concurrente: lo decide
  el almacén (HTTP 400), no el proxy (T04/T05).
- `updateMask: lead_id` conserva el cambio concurrente **también al reanudar** (T04/T05).
- Un 404 del endpoint nunca se toma como éxito y un `:commit` sin respuesta no se declara
  aplicado (T02, T08).
- Una reversión interrumpida se reanuda sin perder nada nuevo y sin duplicar (secciones 4, 5 y T08).
- La reversión **se niega** ante cualquier dato posterior a la migración, incluido un marcador
  repuntado (T01, T03).
- El testigo bloquea las cuatro vías de escritura y se libera sólo al verificar el éxito
  (secciones 1, 3, 4, T06).
- El fallo intermitente de la sección 5 era **estado residual en disco**, no una carrera (§3).

### 8 · Próximo paso

- **Última operación:** T04, T05, T07, T08 implementadas; dos defectos del procedimiento
  corregidos; fallo intermitente diagnosticado y eliminado; regresión de 20 suites en verde.
- **Siguiente:** auditoría independiente de Codex **sobre el commit `PENDIENTE_DE_SHA`**.
- **Dictamen:** las verificaciones de la misión están **completas**. El despliegue sigue en
  **NO-GO** porque la condición que queda ya no es una prueba pendiente, sino esa auditoría.

### 9 · Restricciones respetadas

Sin despliegue · sin merge · sin migrar ni borrar datos reales · sin tocar producción · sin Blaze ·
sin captación pública · sin usuarios nuevos · `main` intacto.