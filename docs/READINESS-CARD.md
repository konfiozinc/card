# Card — informe de readiness para lanzamiento

Estado: **candidato local listo para revisión humana**. Nada publicado.
Proyecto de ensayo: `demo-card-seguridad` (emuladores en 127.0.0.1).

---

## 1. processDueDates — qué se resolvió y qué no

**Diagnóstico.** El emulador de Pub/Sub recibe el mensaje (responde 200 con
`messageIds`) y existe la suscripción `emulator-sub-firebase-schedule-processDueDates`,
pero el handler nunca se ejecuta. `pubsub-debug.log` queda vacío y no aparece ni
un `Beginning execution of "us-central1-processDueDates"` en el log de Functions.
El problema está en el **disparo del emulador**, no en el código: la función se
registra correctamente (`pubsub function initialized`).

**Lo que se hizo.** Se separó la lógica en `functions/src/vencimientos.js`
(`procesarVencimientos`), extrayendo el cuerpo **verbatim** de `processDueDates`
para no cambiar comportamiento. `index.js` queda con un envoltorio de tres líneas
que conserva programa `every day 08:00`, `America/Bogota` y `us-central1`.

**Probado de verdad (15/15)** con fechas controladas (`hoy = 2026-11-20`):

| Comprobación | Resultado |
|---|---|
| POR_VENCER dentro del umbral (≤15 d), ACTIVO fuera | ✓ |
| Vencido → PENDIENTE_PAGO | ✓ |
| Tras la gracia (5 d) → SUSPENDIDO | ✓ |
| Clientes inactivos se ignoran | ✓ |
| Un aviso por cada día 10/5/3/1 | ✓ (4 avisos, ni a 0 ni a 20 días) |
| Clave anti-duplicado `cliente_fecha_tipo` | ✓ |
| Aviso ENVIADA cuando hay tokens | ✓ |
| **Idempotencia**: segunda pasada no duplica ni reaplica estados | ✓ (4→4) |
| Sin tokens: aviso ERROR con motivo «Sin tokens activos» | ✓ |
| Envío que lanza: no rompe la ejecución | ✓ |

**Hallazgo (P3, no corregido):** si `pushACliente` lanza, el `catch` que protege
el anti-duplicado se traga el error y la notificación queda **atascada en
PENDIENTE** para siempre (sin reintento ni marca de error). Reproducido y
documentado en la prueba.

**No verificado:** el disparador por Pub/Sub. **No se declara probado.**

---

## 2. Respaldo, verificación y restauración

`herramientas/respaldo-emulador.js` trabaja **solo contra el emulador** (aborta si
no hay `FIRESTORE_EMULATOR_HOST`, para que nadie lo apunte a producción).

Ensayo completo ejecutado:

| Paso | Resultado |
|---|---|
| Respaldar | 2 colecciones · 14 documentos · manifiesto con SHA-256 por colección |
| Verificar integridad | ✓ los dos hashes coinciden |
| Restaurar (tras vaciar la base) | 10 + 4 documentos |
| Verificación posterior | **2/2 colecciones con hash idéntico**, 0 diferencias |

### Recursos reales necesarios antes de migrar producción (no creados)

| Recurso | Para qué | Notas |
|---|---|---|
| **Bucket de GCS** (p. ej. `konfio-zinc-backups`) | destino de `gcloud firestore export` | región cercana (us-central1), uniform access |
| **Rol IAM** *Cloud Datastore Import Export Admin* sobre la cuenta de servicio | permite exportar/importar | sin este rol el export falla |
| **Rol IAM** *Storage Object Admin* (o escritura en el bucket) | escribir el export | |
| **Lifecycle rule** (7–30 días) | no acumular exports | |
| **Cuenta de servicio** con JSON fuera del repo | ejecuta el export y la migración | nunca en git; usar variables de entorno |
| **Ventana de mantenimiento** corta | la migración escribe datos | avisar antes |

---

## 3. Migración correo → UID — ensayo y casos de revisión

Ensayo en emulador, nunca contra datos reales.

| Caso | Comportamiento | Acción humana |
|---|---|---|
| Ficha con correo + cuenta Auth existente | migra a `usuarios/{uid}`, conserva rol y estado, deja `migradoDe`/`migradoEn`, borra la vieja | ninguna |
| Ficha con correo **sin** cuenta Auth | **no migra**, la reporta con ✗ | decidir: crear la cuenta o descartar la ficha |
| **Duplicado**: ya existe `usuarios/{uid}` | **no sobrescribe**, informa «ya existían» y conserva la buena | revisar a mano si la ficha nueva perdió datos |
| Rol ausente o inválido | asigna **OPERADOR** (mínimo privilegio) y lo cuenta | confirmar que OPERADOR es correcto |
| Reejecución | «Nada que migrar» (idempotente) | ninguna |
| Sin `--aplicar` | simula siempre, no escribe | leer la salida antes de aplicar |

**Casos que exigen revisión humana antes de aplicar en producción:** las fichas
marcadas con ✗ (sin cuenta de Authentication) y los duplicados. El script los
lista por correo; no decide por su cuenta.

---

## 4. Dependencias

| Componente | Instalado | Declarado | Veredicto |
|---|---|---|---|
| firebase-functions | 6.6.0 | `^6.1.0` | **No actualizar antes del lanzamiento** |
| firebase-admin | 12.7.0 | `^12.6.0` | correcto |
| Firebase CLI | 15.29.0 | — | correcto |
| Node local | v24.20.0 | runtime `nodejs20` | el emulador usa node@24 del host; **el runtime declarado (20) es soportado en producción** |

El aviso del CLI («outdated firebase-functions») es informativo: 6.6.0 satisface
el rango declarado y las 17 funciones cargan y responden en el emulador. Una
actualización mayor traería *breaking changes* declarados por el propio CLI y
exigiría re-verificar las 17 funciones **sin ganar nada** para el lanzamiento.
**Decisión: no actualizar ahora.** Si se actualiza, hacerlo después del
lanzamiento en una rama aparte (`tools/functions-upgrade`) con `npm install`,
`node --check`, arranque del emulador y las suites de callables.

---

## 5. Índices

`firestore.indexes.json` es JSON válido y declara 5 índices; el único nuevo es:

```
historial_estados: clienteId ASC, fecha DESC
```

Verificación preparada en `herramientas/verificar-indice-historial.js`:
ejecuta **la misma consulta** que `historialDe()` y distingue tres resultados
(índice listo / falta el índice / otro error). Contra el emulador solo confirma
que la consulta está bien escrita —el emulador no exige índices—; **la prueba
real es contra el proyecto**, después de crearlo.

---

## 6. Integración

```
harness/card-pagos-p1 = candidate/card-integracion = 51ad326 + este lote
main (ab3d5b9)          es ancestro de la rama
origin/main (ac44115)   es ancestro de la rama
git merge-tree main HEAD → sin conflictos
precios.html            no se toca en toda la rama
```

La integración en `main` sería un fast-forward.

---

## 7. Aceptación humana (Chrome y móvil) — lista corta

Probar en `http://127.0.0.1:5000/admin/index.html` con
`superadmin@demo.test` / `admin@demo.test` / `operador@demo.test` (contraseña
`Ficticia#1`).

**Chrome (escritorio)**
1. Login de los tres roles; el menú muestra lo que corresponde a cada uno.
2. Clientes: crear uno, editarlo, suspenderlo y **reactivarlo** (la fecha no cambia).
3. Clientes: eliminarlo y **restaurarlo** (vuelve a la lista sin el filtro).
4. Planes: crear un plan nuevo; editarlo; desactivarlo; borrarlo.
5. Pagos: registrar un pago como OPERADOR y comprobar que **no** puede confirmarlo.
6. Pagos: confirmar con ADMIN y ver que el vencimiento salta 12 meses.
7. Detalle de cliente: ver su historial de pagos y de estados.
8. Configuración: cambiar un ajuste y guardarlo (solo SUPERADMIN).
9. Usuarios: crear uno, desactivarlo y comprobar que no puede entrar.
10. Contactos: marcar atendido, exportar CSV y abrirlo en Excel.

**Móvil (375×667 real, no emulado)**
11. El botón de menú abre y cierra la barra lateral sin desbordar.
12. El dashboard y las tablas se leen sin scroll horizontal raro.
13. Se puede registrar un pago desde el detalle del cliente con el pulgar.

---

## 8. Bloqueos que dependen de producción (no resueltos aquí)

1. **Disparo de processDueDates**: sin validar. Opciones: (a) probarlo en un
   proyecto de staging real, (b) disparar la función desplegada a mano con
   `gcloud pubsub topics publish`, (c) confiar en la primera ejecución real de las
   08:00 con revisión de logs al día siguiente.
2. **Índice compuesto**: crear y verificar con el script del punto 5.
3. **Bucket de respaldo + IAM**: crear antes de la migración.
4. **Migración**: requiere credenciales y decisión sobre las fichas ✗.
5. **Push real (FCM)**: sin tokens reales no se puede comprobar el envío; en el
   emulador siempre da 0 y el aviso queda ERROR.
6. **Push de la rama**: sigue sin hacerse (repo público, sin autorización).
