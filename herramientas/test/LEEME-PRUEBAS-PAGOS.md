# Pruebas de reglas de `pagos` (P1 · integridad financiera)

`pruebas-pagos-p1.js` verifica con **el emulador oficial de Firestore** que las
reglas de `pagos` se comportan como dicen. No es una prueba de unidad con
dobles: las reglas reales de `firestore.rules` se cargan en el emulador y cada
petición se evalúa contra ellas con identidades reales del emulador de Auth.

## Qué cubre (47 comprobaciones)

| Bloque | Qué comprueba |
|---|---|
| **A** | El defecto P1: un OPERADOR no puede cambiar el monto (49.900 → 1), ni reasignar el cliente, ni falsificar `createdAt`, ni editar metadatos, ni anular. |
| **B** | Lo legítimo sigue funcionando: alta con los 12 campos reales del CRM, rechazo de montos ≤ 0, alta ya CONFIRMADA rechazada, confirmar, anular (incluso un CONFIRMADO), corregir metadatos como ADMIN, y que ni ADMIN ni SUPERADMIN toquen el dinero. |
| **C** | Lectura por rol, denegación sin sesión y borrado prohibido. |
| **D** | Transiciones: PENDIENTE→CONFIRMADO, PENDIENTE→ANULADO, CONFIRMADO→ANULADO permitidas; inversas y cualquier salida de ANULADO rechazadas. Los campos de auditoría no se pueden inyectar en la operación equivocada y `confirmadoEn`/`anuladoEn` deben ser marcas de tiempo. |
| **E** | El historial del cliente se lee de la colección raíz `pagos` filtrando por `clienteId`, sin abrir la subcolección `clientes/{id}/pagos`. |

## Requisitos (todos ya presentes en la máquina; no se instala nada)

- `firebase-tools` (el CLI que descarga y valida el emulador).
- Java 21. En este equipo está en Android Studio:
  `C:\Program Files\Android\Android Studio\jbr`
- JAR del emulador de Firestore en caché
  (`%USERPROFILE%\.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar`).
  La primera vez lo descarga el CLI y valida tamaño y checksum contra su propio
  manifiesto.

## Cómo reproducirla de forma segura

**Nunca contra un proyecto real.** Todo ocurre contra el proyecto ficticio
`demo-card-pagos-p1`, que empieza por `demo-`: los emuladores lo aceptan sin
credenciales y no puede resolver contra un proyecto de Firebase existente.

```powershell
# 1) Java solo para estos procesos: NO se tocan variables globales del sistema
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# 2) Un directorio de trabajo aislado con estas dos cosas:
#      firebase.json  -> { "firestore": { "rules": "firestore.rules" },
#                          "emulators": { "auth": {"host":"127.0.0.1","port":9099},
#                                         "firestore": {"host":"127.0.0.1","port":8080},
#                                         "singleProjectMode": true } }
#      firestore.rules -> copia de las reglas a probar
#    (nunca se apunta el emulador a las reglas de producción)

# 3) Arrancar SOLO auth y firestore, atados a 127.0.0.1
firebase emulators:start --only auth,firestore --project demo-card-pagos-p1

# 4) En otra terminal, ejecutar la suite
node pruebas-pagos-p1.js
```

Resultado esperado: **47 pasan, 0 fallan** (código de salida 0).

Como referencia histórica, con las reglas anteriores a esta corrección pasaban
24 y fallaban 23; esa comparación es la que demuestra que la prueba detecta el
defecto y no solo lo acompaña.

### Probar contra otro proyecto de emulador

```powershell
$env:KZ_PROYECTO = 'demo-card-seguridad'   # el staging del CRM
node pruebas-pagos-p1.js
```

## Detalles que conviene conocer

- **Los updates usan `updateMask`.** Es la forma de replicar el `updateDoc`
  parcial que hace el CRM. Sin máscara, un `PATCH` REST reemplaza el documento
  entero y la prueba dejaría de representar lo que ocurre en producción.
- **La siembra usa el token `owner`.** El emulador lo reconoce como acceso
  administrativo (es lo que usa el Admin SDK por dentro) y permite crear los
  documentos `usuarios/{uid}` con su rol. Ese token **no vale nada** fuera del
  emulador.
- **La suite borra los datos del emulador** al empezar
  (`DELETE /emulator/v1/projects/<proyecto>/databases/(default)/documents`).
  Solo afecta al emulador; jamás a un proyecto real.
- **Datos ficticios**: correos `@pagos.test`, montos de prueba y clientes
  inventados. No se usa ninguna cuenta ni dato de cliente real.
