# Publicación controlada de CARD en Spark · secuencia y reversión

> ⚠️ **HISTÓRICO.** Escrito para una ventana de publicación que **ya ocurrió**: producción sirve
> hoy `card/main` en `8a80234` (no `ac44115`) con las reglas de CARD-SPARK-002 publicadas, y la rama
> `spark/card-sin-functions` ya no es el vehículo de publicación. El procedimiento vigente, con
> respaldo de reglas y reversión, está en `docs/KZ-OPS-001-CONSOLIDACION.md` §7 y en
> `docs/CARD-SPARK-002-FINANCIERO.md` §5. Se conserva como registro histórico del orden
> «frontend primero, reglas después», que sigue siendo válido.

Estado previo (al momento de escribirse): producción servía `main@ac44115` (panel antiguo, con Cloud
Functions en el código) y las reglas **anteriores**. La rama `spark/card-sin-functions` traía el panel
nuevo y las reglas nuevas. No se despliega nada aquí: esto es el procedimiento para la ventana.

## 1. Orden obligatorio: primero el frontend, después las reglas

| Paso | Qué se publica | Por qué en ese orden |
|---|---|---|
| 1 | **Frontend** (`git push` avance rápido a `main`) | El panel nuevo escribe desde el navegador con las reglas **actuales** (más permisivas): funciona. Los avisos preparados por OPERADOR y su marca de enviado sí requieren las reglas nuevas, así que en esta ventana esas dos acciones las hace un ADMIN |
| 2 | **Reglas** (`firebase deploy --only firestore:rules`) | Con el panel nuevo ya publicado, las reglas nuevas encajan: roles, campos por tramo, importes inmutables y avisos PREPARADA |

Al revés **no**: desplegar las reglas antes deja al panel antiguo sin gestión de usuarios (escribe
`usuarios/*` desde el navegador) y sin poder crear avisos (nacían `ENVIADA`). Sería una caída
silenciosa de funciones, no un error visible.

**Durante la transición** (minutos entre el paso 1 y 2) el panel nuevo funciona con reglas viejas
salvo dos acciones, que fallan con mensaje claro en pantalla: preparar aviso como OPERADOR y marcar
un aviso como enviado. Solución en la ventana: hacerlas con un ADMIN, o desplegar las reglas
inmediatamente después.

## 2. Verificaciones antes de tocar nada

```powershell
pwsh herramientas/publicar-paginas.ps1     # ensayo: árbol limpio, avance rápido, precios.html intacto
node herramientas/verificar-artefacto-paginas.js   # 176 publicables, 0 fallos, lo interno fuera
node herramientas/verificar-precios.js             # verde
node herramientas/admin-spark.js --diagnostico     # (en el ASUS, con credencial) quién tiene qué rol
```

Suites de la adaptación (emuladores, datos ficticios): `pruebas-spark-reglas-p1.js` (53) y
`pruebas-spark-panel-p1.js` (18).

## 3. Publicación

```powershell
pwsh herramientas/publicar-paginas.ps1 -ConfirmarPruebas -Publicar   # frontend (paso 1)
firebase deploy --only firestore:rules --project konfio-zinc          # reglas (paso 2)
```

Tras el paso 1, el script comprueba: sitio 200, rutas internas 404 (`docs/`, `herramientas/`,
`functions/`, reglas e índices), y que `precios.html` sigue igual.

## 4. Reversión

| Situación | Cómo se vuelve atrás |
|---|---|
| El frontend falla | `git revert <commit>` y volver a publicar (historia intacta; nunca `--force`) |
| Las reglas nuevas rompen algo | Desplegar el `firestore.rules` del commit anterior: `git show ac44115:firestore.rules > firestore.rules` y `firebase deploy --only firestore:rules` |
| Ambas cosas | Revertir el frontend **y** volver a las reglas anteriores, en ese orden inverso |

Antes de la ventana debe existir un **respaldo fresco verificado** (kit privado
`C:\KONFIO-RESPALDOS\_kit`), que es el punto de recuperación de datos.

## 5. Lo que la ventana NO hace

- No despliega Cloud Functions ni el motor (`processDueDates` sigue sin existir en el proyecto).
- No migra usuarios: las fichas heredadas siguen operando y se vinculan cuando el dueño lo decida.
- No envía notificaciones ni suspende clientes: todo eso es manual y queda en auditoría.
- No crea buckets, cuentas ni recursos de pago.
