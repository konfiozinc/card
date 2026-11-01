# KZ-CRM-018 · Reanudación: certificación de R01, R02, R03, R04 y R05

**Fecha:** 1-nov-2026 · **Rama:** `audit/kz-crm-018` · **NO publicado · NO desplegado · NO fusionado**

## 0. Identificadores verificados al empezar

| Dato | Valor comprobado |
|---|---|
| Repositorio | `konfiozinc/card`, clon `6-LANDING-PAGES/Konfio-Zinc-Web` |
| Rama de trabajo | `audit/kz-crm-018` |
| Commit local de partida | `355f32c` (coincide con el reportado) |
| Commit remoto auditado | `0ebb6bd` = `origin/audit/kz-crm-018` (coincide) |
| `main` / `origin/main` | `8fb058b` (coincide) |
| Árbol de trabajo al empezar | limpio, sin cambios pendientes |

Nada se ha publicado ni fusionado. `origin/audit/kz-crm-018` sigue en `0ebb6bd`.

## 1. R01 — La reversión no elimina información comercial nueva

### 1.1 El defecto que había (comprobado, no supuesto)

`crm-dev/migrar-uuid.cjs` comparaba el prospecto migrado contra el respaldo usando una
**lista corta de 7 campos**:

```
nombre · telefono · industria · estado · asignado_a · retencion_hasta · servicio_interes
```

Todo lo que quedara fuera de esa lista era invisible para la guarda, y la reversión
**borraba el prospecto con ese cambio dentro**. La prueba nueva lo demostró antes de
tocar el código:

| Escenario | Antes del arreglo | Después |
|---|---|---|
| A · nota nueva + campo `estado` modificado | ✅ se negaba | ✅ se niega |
| B · entrada añadida al **historial** | ❌ **la borraba** (código 0) | ✅ se niega |
| C · campo comercial nuevo **`valor_estimado`** | ❌ **la borraba** (código 0) | ✅ se niega |
| D · migración sin cambios posteriores | ✅ revertía | ✅ revierte |

En B y C la salida fue **código 0 (éxito)** y el documento desapareció: pérdida silenciosa.

### 1.2 Corrección

- La comparación es ahora del **documento completo**, no de una lista. Se detectan campos
  **modificados, añadidos y eliminados**.
- Los timestamps se normalizan a milisegundos para que el formato de la API no produzca
  falsos positivos.
- Se guarda y compara también el **contenido de las notas** (antes sólo su existencia):
  una nota editada después de migrar también bloquea la reversión.
- Se comprueba que el **marcador de deduplicación** siga apuntando a ese mismo prospecto;
  si se reutilizó para otro, no se borra (destruiría el marcador de un tercero).
- **Falla cerrado**: si un prospecto del mapa no está en el respaldo, o el respaldo no
  guardó el documento completo, la reversión se niega en vez de borrar.

### 1.3 Resultado reproducible

`crm-dev/pruebas-reversion-segura.cjs` → **39/39 PASS**

Comprueba en cada escenario que, tras la negativa: código de salida 3, **ningún documento
creado, borrado ni modificado** (instantánea completa antes/después de `crm_leads`,
`notas`, `crm_quotes`, `crm_sales` y `crm_dedup`), la nota nueva presente, el cambio
comercial intacto, la cotización y la venta apuntando al UUID, el marcador intacto, los
documentos heredados intactos y el mapa conservado. También que una **segunda tentativa**
se niega igual: no es un fallo transitorio.

Ejecución: ver §6. Duración ~6 s.

## 2. Inyección de fallos

Arnés nuevo: `crm-dev/lib/proxy-fallos.cjs`. Proxy transparente delante del emulador que
devuelve 503/500, rompe la segunda página, **parte la lista real en dos páginas
fabricadas**, o **aplica la escritura y pierde la respuesta** (para cortar el proceso
justo en la ventana peligrosa y medir lo que queda escrito).

`crm-dev/pruebas-fallos.cjs` → **54/54 PASS**

| # | Fallo inyectado | Resultado exigido y comprobado |
|---|---|---|
| 1 | HTTP 503 al inventariar | código ≠ 0 · **no** dice «nada que migrar» · **no** informa de 0 prospectos · no escribe mapa, respaldo ni marcadores |
| 2 | Fallo de paginación (2ª página 503) | código ≠ 0 · detecta «No se pudo listar … HTTP 503» · no migra a medias |
| 2 bis | Paginación **completa** (2 páginas) | recorre todas: ve 4 de 4 y migra los 4 (R08) |
| 3 | Error de lectura de notas | código ≠ 0 · no da por bueno un prospecto cuyas notas no pudo leer |
| 4 | Error en el commit | código ≠ 0 · la entrada queda **pendiente**, no «hecho» · reanudar completa sin duplicar |
| 5 | Error en el patch de referencias | código ≠ 0 · la entrada **no** se marca terminada · reanudar repunta y termina |
| 6 | **Interrupción durante la migración** | proceso muerto, mapa presente, **los dos UUID elegidos se conservan** y se reutilizan · **ningún duplicado** |
| 7 | **Interrupción durante la reversión** | mapa conservado con `reversion: "iniciada"` · reanudar completa (REVERSIÓN COMPLETA) · heredados intactos · número liberado |
| 8 | Reversión con el inventario ilegible | código ≠ 0 · **no revierte a ciegas** · no borra nada |

**No se declara atomicidad global.** La migración escribe prospecto a prospecto y la
reversión documento a documento. Lo demostrado es que **cada corte deja un estado del que
se sale sin perder datos y sin duplicarlos**, y que los errores nunca se interpretan como
«colección vacía».

## 3. R03 — Idempotencia y reanudación

`crm-dev/pruebas-r03.cjs` → **34/34 PASS**

| Propiedad exigida | Resultado |
|---|---|
| Repetir la migración no duplica prospectos | ✅ 3 pasadas: mismos UUID, mismo número de prospectos, mismas notas |
| Una entrada pendiente conserva su UUID | ✅ reconocida como `pendientes: 1` y **reutiliza el mismo UUID** |
| Un registro UUID nativo no vuelve a migrarse | ✅ «Ya con UUID (se omiten): 1», documento intacto, sin segundo marcador |
| Un repunte incompleto no queda marcado como terminado | ✅ la entrada queda `pendiente` y la cotización sigue sin repuntar |
| Los errores no se interpretan como colecciones vacías | ✅ código ≠ 0, sin «nada que migrar», sin escribir nada |
| La reanudación completa las operaciones pendientes | ✅ todas pasan a `hecho`, referencias correctas, integridad referencial limpia |

### Defecto corregido en R03

El mapa de migración se escribía **después** del commit. Una interrupción entre la
escritura en Firestore y el guardado del mapa hacía que la reanudación **generara otro
UUID** para el mismo teléfono y dejara **un prospecto duplicado**. Ahora la **intención se
persiste primero**; el commit se repite sobre el mismo documento y es idempotente.

El escenario 6 de `pruebas-fallos.cjs` es discriminante por sí mismo: se corta el proceso
cuando el almacén **ya aplicó** la segunda escritura y la respuesta no llegó, y se verifica
que en ese instante el mapa ya tenía **las dos** intenciones y que tras reanudar siguen
siendo **2 UUID, no 3**.

## 4. R02 — Concurrencia del alta con `writeBatch`

`crm-dev/pruebas-r02.cjs` → **26/26 PASS** (con las reglas de producción en el emulador)

`lote.set()` del SDK se envía como escritura `update` **sin precondición de existencia**:
crea si no existe y actualiza si existe. La prueba usa exactamente eso (`:commit` del
almacén), así que mide el mismo camino que ejecuta el panel.

| Comprobación | Resultado |
|---|---|
| 8 altas simultáneas del mismo número | **1 prospera**; las otras 7 se rechazan de forma determinista: **403** (reglas no permiten sobrescribir el marcador) o **409/aborted** (conflicto de escritura) · ningún 5xx |
| Un único prospecto con ese número | ✅ y es el del lote ganador |
| Los prospectos de los lotes perdedores | ✅ no llegaron a crearse |
| Marcadores huérfanos | ✅ ninguno; cada marcador apunta a un prospecto con ese mismo teléfono |
| El marcador correcto permanece intacto | ✅ byte a byte tras intentar sobrescribirlo |
| Atomicidad del lote | ✅ prospecto sin marcador → 403 y el prospecto no nace; marcador ya existente → 403 y el prospecto de ese lote tampoco |
| Acceso indebido | ✅ otro comercial no lee el marcador ni el prospecto; quien dio el alta tampoco lo lee (nace sin asignar); anónimo rechazado |

**No hizo falta cambiar la implementación**: la garantía es doble e independiente
(reglas + conflicto de escritura). Sí se corrigió un defecto de información: el conflicto
`aborted` se reportaba al operador como **error de red**; ahora es el motivo `conflicto`
con un mensaje que no invita a reintentar a ciegas.

## 5. R04 y R05 — Supresión administrativa

`crm-dev/pruebas-supresion-r04.cjs` → **43/43 PASS**

### R04 · Lo que estaba incompleto

`suprimir-datos.cjs` borraba prospecto, notas y marcador, pero **las cotizaciones y las
ventas seguían apuntando al prospecto suprimido**: el dato seguía enlazado a la persona.

Ahora se **desasocian** (`lead_id` → `"suprimido"`): se conserva el importe —registro
comercial que no identifica a nadie— y se corta el enlace personal. La verificación final
exige **cero referencias vivas**.

### R04 · Fallos parciales (defecto encontrado al probarlos)

Si fallaba la desasociación o el borrado de una nota, el procedimiento **seguía adelante y
borraba el prospecto**, dejando notas o referencias colgando e **irreparables**: al
reintentar respondía «no existe ese prospecto». Ahora **aborta antes de destruir** nada y
puede repetirse (la desasociación es idempotente). Si el marcador no se borra también
aborta, porque el número seguiría reservado para siempre.

Comprobado con fallos inyectados: desasociación (500 en PATCH), borrado de nota (500 en
DELETE) y borrado de marcador (500 en DELETE). En los tres: código 3, **prospecto
conservado**, y la repetición completa la supresión.

### R05 · Rutas antiguas retiradas del panel

| Ruta retirada | Por qué estaba mal |
|---|---|
| `#btn-anonimizar` «Suprimir datos personales» | escribía `historial: []`, que las reglas **ya no permiten** (historial inmutable) → fallaba con `permission-denied`; y no tocaba notas ni marcador |
| `#btn-borrar-lead` «Borrar prospecto» | `deleteDoc` y nada más: dejaba notas, marcador y referencias apuntando a un documento inexistente; y **avisaba de que «el número queda libre»** cuando el marcador seguía reservándolo (el número no se podía volver a registrar) |

El bloque de privacidad queda **solo informativo** y remite al procedimiento privilegiado.
`pruebas-formularios.cjs` sigue en **48/48** con el panel modificado, y `pruebas.cjs`
comprueba ahora que los botones **no existen**.

## 6. Cómo reproducir

```powershell
# El emulador necesita Java. En este equipo se usó el JDK que ya trae Android Studio
# (OpenJDK 21.0.10), sin instalar nada:
$env:PATH = "C:\Program Files\Android\Android Studio\jbr\bin;$env:PATH"

cd 6-LANDING-PAGES\Konfio-Zinc-Web
firebase emulators:exec --only auth,firestore --project demo-crm-016 `
  --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-reversion-segura.cjs"
```

Cambiando el último fichero por `pruebas-fallos.cjs`, `pruebas-r02.cjs`, `pruebas-r03.cjs`
o `pruebas-supresion-r04.cjs`. Para las pruebas con navegador (formularios, panel) hace
falta además `RCL_CHROMIUM` apuntando a un Chromium ya instalado.

**Las baterías antiguas no se pueden encadenar sin vaciar la base entre ellas**: varias
cuentan documentos de forma absoluta («`crm_sales` tiene exactamente 1») y sólo son válidas
sobre una base recién creada. Encadenadas producen fallos que parecen regresiones y no lo
son. Con aislamiento entre suites, la batería completa (18 suites) da **14 en verde y 4 con
fallos preexistentes**.

## 7. Batería completa del CRM (con aislamiento entre suites)

| Suite | Resultado |
|---|---|
| `pruebas-reversion-segura.cjs` | **39 · 0** |
| `pruebas-fallos.cjs` | **54 · 0** |
| `pruebas-r02.cjs` | **26 · 0** |
| `pruebas-r03.cjs` | **34 · 0** |
| `pruebas-supresion-r04.cjs` | **43 · 0** |
| `pruebas-migracion.cjs` | 30 · 0 |
| `pruebas-a03.cjs` | 23 · 0 |
| `pruebas-notas.cjs` | 42 · 0 |
| `pruebas-equipo.cjs` | 54 · 0 |
| `pruebas-formularios.cjs` | 48 · 0 |
| `pruebas-admin-actual.cjs` | 13 · 0 |
| `verificar-aislamiento.cjs` | 15 · 0 (antes no llegaba a ejecutarse) |
| `retencion-vencida.cjs`, `generar-reglas-emulador.cjs` | sin fallos |
| `pruebas-seguridad.cjs` | 33 · **3** — preexistente |
| `pruebas-privado.cjs` | **2 + TypeError** — preexistente |
| `pruebas-panel-real.cjs` | 11 · **1** — preexistente |
| `verificar-operacion.cjs` | 5 · **1** — preexistente |

**Total en verde de lo nuevo y corregido: 196 comprobaciones.** Las 4 suites con fallos se
comprobaron **contra `355f32c`** (árbol de trabajo aparte, sin estos cambios) y fallan
exactamente igual: no son regresiones de este trabajo.

## 8. Pruebas que todavía fallan (y por qué)

1. **`pruebas-seguridad.cjs` (3)** — siguen afirmando el modelo **antiguo**, con
   `id = teléfono` y alta anónima. Con el modelo UUID el alta anónima en las reglas de
   producción es 403, así que «alta válida anónima» y las dos comprobaciones de concurrencia
   dan 0 éxitos. No es un defecto del producto: es una batería que no se actualizó al pasar
   a UUID.
2. **`pruebas-privado.cjs` (2 + `TypeError`)** — mismo origen: `crearLead("3201110001", …)`
   espera 200 del alta con `id = teléfono`, que ahora se rechaza; el `TypeError` es el
   efecto en cascada de esa primera comprobación.
3. **`verificar-operacion.cjs` (1)** — «la cuenta existe»: busca la cuenta administrativa
   real, que no existe en un emulador recién creado.
4. **`pruebas-panel-real.cjs` (1)** — espera el texto «Correo o contraseña incorrectos.»;
   el emulador responde con otro mensaje de Auth.

## 9. Hallazgo abierto que afecta al dictamen

**El formulario público sigue en el modelo antiguo.** `crm-dev/firestore.rules.captacion`
conserva:

```
allow create: if leadId == request.resource.data.telefono
```

Es decir: el punto de entrada público (`formulario.html` → `registrarProspecto`) **todavía
crea `crm_leads/{telefono}`** y **no escribe el marcador `crm_dedup`**. Consecuencia: un
prospecto captado por el formulario no queda protegido por el mecanismo de deduplicación
del modelo nuevo, y las dos reglas del proyecto (**producción** y **captación/emulador**)
ya no están de acuerdo sobre cómo se identifica un prospecto.

No se ha tocado: cambiarlo modifica el alta pública y exige desplegar reglas, que esta
misión prohíbe. Queda declarado como pendiente para R02/R03.

## 10. Recomendaciones pendientes (no ejecutadas)

1. **`firestore.rules`: `allow delete: if esAdmin()` sobre `crm_leads` sigue vigente.** El
   panel ya no lo usa, pero la capacidad existe: desde una consola con sesión admin se
   podría borrar un prospecto y dejar notas, marcador y referencias colgando — el mismo
   defecto que R05 acaba de retirar de la interfaz. Retirarlo exige **desplegar reglas**
   (prohibido aquí) y actualizar las baterías que hoy prueban el borrado del navegador.
2. **Migrar el formulario público** al modelo UUID + marcador (§9).
3. **Actualizar `pruebas-seguridad.cjs` y `pruebas-privado.cjs`** al modelo UUID.
4. **Desasociación con base legal:** la supresión conserva importes y los marca como
   `"suprimido"`. Conviene que Darwin confirme que ese criterio (conservar el importe,
   cortar el enlace personal) es el que quiere frente a borrar también el registro.

## 11. Dictamen

> **R01: CERRADO** con prueba decisiva ejecutada y aprobada (39/39). Se demostró que la
> guarda anterior **borraba en silencio** cambios comerciales fuera de una lista de 7
> campos, y que ahora se niega con código 3 sin modificar un solo documento.
>
> **R02: CERRADO** (26/26): de 8 altas simultáneas sólo una prospera, sin marcadores
> huérfanos, sin sobrescritura y sin accesos indebidos.
>
> **R03: CERRADO** (34/34 + escenarios 4-8 de fallos): idempotencia, reanudación y
> conservación del UUID demostradas, incluida la interrupción en la ventana peligrosa.
>
> **R04/R05: CERRADOS** en su alcance declarado (43/43): supresión completa con
> desasociación de referencias, aborto antes de destruir ante fallos parciales, y rutas
> antiguas del panel retiradas.
>
> **Pero el dictamen general sigue siendo NO-GO**, por tres razones que no son de este
> bloque: (1) el formulario público continúa en el modelo `id = teléfono` sin marcador, de
> modo que el modelo de identificadores está **a medias**; (2) la capacidad de borrado
> administrativo sigue viva en las reglas aunque ya no esté en la interfaz; (3) quedan
> R06/R07/R08 y 4 suites de pruebas antiguas sin actualizar al modelo UUID.
>
> Nada se ha publicado, desplegado ni fusionado. `main` sigue en `8fb058b`.
