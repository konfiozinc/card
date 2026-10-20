# Estado verificado de Card — 19/10/2026

> Este documento **no es un informe de intenciones**: cada afirmación viene de un comando
> ejecutado hoy sobre el repositorio local, no de otro documento. Nace porque el
> *Handoff Maestro del 18/10/2026* da por pendientes tres correcciones (P2/P3) que **ya
> están en el árbol**, y una cifra vieja en un expediente hace que el siguiente agente
> trabaje sobre algo que ya existe — o peor, que lo reescriba.

**Rama verificada:** `harness/premium-integracion`
**HEAD verificado:** `7816b06` (`fix(web): el formulario de solicitud viajaba por GET`)
**Árbol de trabajo:** limpio · **Nada publicado, empujado ni desplegado.**

---

## 1. Lo que el handoff daba por pendiente y ya está hecho

| Punto del handoff | Estado real | Evidencia |
|---|---|---|
| **CARD-P2-REACTIVAR** · «el estado manual se ignora y no aparece reactivar» | **Corregido** | `admin/clientes.js` distingue estados manuales (`ESTADOS_MANUALES`) y `estActual()` ya no pinta ACTIVO un servicio suspendido; el botón existe y reactiva sin tocar fechas. Commit `1c74a57`. Suite del panel: «Reactivar vuelve a ACTIVO sin regalar vigencia → estado=ACTIVO · vence=2026-10-09» |
| **CARD-P2-USUARIOS** · «el CRM escribe `usuarios` desde el cliente contra una regla cerrada» | **Resuelto por decisión de arquitectura, no por Callable** | El proyecto pasó a **plan Spark** (sin Cloud Functions). `assets/js/admin/callables.js` fue eliminado en `32aa159`; `escrituras-local.js` ya no escribe usuarios (`crearUsuario`/`actualizarUsuario` lanzan `SIN_ADMIN_SDK`); la gestión privilegiada vive en `herramientas/admin-spark.js` con Admin SDK (`dc72658`). Las reglas mantienen `match /usuarios/{clave} { allow write: if false; }` |
| **CARD-P3-NOTIF-REFRESH** · «la tabla no se refresca tras escribir» | **Corregido** | `admin/notificaciones.js` tiene `refrescar()` y lo llama tras preparar o marcar un aviso. Suite del panel: «Preparar aviso deja constancia en pantalla», «Se crea UN registro de aviso (PREPARADA) 0 → 1», «Marcar enviado actualiza el registro» |
| **LOTES B y C** (crear plan, usuarios, cobertura del CRM) | **Ejecutados** | `85d5a26` (LOTE B), `1c227aa` (LOTE C), `51ad326`, `2c1b491`, `76d74e8`, `d11ba0c`, `2cb05e0`, `de94ab2` |

Además del handoff, entre `de94ab2` y este HEAD hay **tres commits de un giro mayor** que el
documento del 18/10 no conoce:

| Commit | Qué hizo |
|---|---|
| `32aa159` | Panel adaptado al **plan Spark**: se elimina `callables.js`, se reescriben reglas (338 líneas), nace `admin/vencimientos.html` + `.js`, entran las suites `pruebas-spark-panel-p1.js` y `pruebas-spark-reglas-p1.js` |
| `dc72658` | **Administración privilegiada local** con Admin SDK (`herramientas/admin-spark.js`) y `docs/ARQUITECTURA-SPARK-CARD.md` |
| `a27c7fa` | Contador de SUPERADMIN, panel sin rastro de Functions, pruebas de identidad |

Y encima de eso, la línea premium de la web pública (`1a624f2` … `7816b06`), que es lo
certificado en la sesión de hoy.

---

## 2. Lo que se ejecutó hoy (resultados reales, no estimaciones)

### 2.1 Reglas de Firestore contra el JAR real, con las reglas de este HEAD

- Emulador `cloud-firestore-emulator-v1.22.0.jar` (136 MB, caché local) + Auth Emulator 9099.
- Configuración temporal `firebase.emu.json` → **`firebase.json` de producción no se tocó**.
- Proyecto `demo-card-seguridad`, todo en `127.0.0.1`, datos ficticios, la configuración
  temporal se borró al terminar (árbol limpio, verificado).

```
═══ SUITE DE REGLAS (Spark) ═══
TOTAL: 53 · PASAN: 53 · FALLAN: 0
```

Cubre: roles leídos de Firestore, `usuarios` solo lectura, ciclo de clientes por rol, pagos
con importe inmutable y **una sola confirmación** (segunda confirmación → HTTP 403), anular
con motivo, reapertura de un anulado → 403, auditoría e historial firmados con el uid propio
y no reescribibles, avisos que nacen `PREPARADA`, y el **interruptor del motor cerrado al
navegador** (403).

### 2.2 Panel completo en navegador real, sobre una copia aislada

La copia `%TEMP%\kz-card-staging-p1` **ya estaba al día**: sus archivos son idénticos a este
HEAD salvo `assets/js/admin/core.js`, que es el único que lleva el cableado a emuladores
(+304 bytes de aislamiento), y sus `firestore.rules` son **byte a byte las de este HEAD**.

```
═══ SUITE DEL PANEL (Spark, navegador real) ═══
TOTAL: 18 · APROBADAS: 18 · FALLADAS: 0
```

Incluye: entra y pinta el panel sin Cloud Functions (8 KPIs), vencidos y por vencer
calculados al abrir la página, preparar aviso crea un único registro `PREPARADA`, suspender
con confirmación y reactivar sin regalar vigencia, marcar enviado explícito, usuarios en solo
lectura con la explicación de la herramienta local, **375×667 sin desbordar** y **0 peticiones
a internet**.

### 2.3 Web pública premium (certificada en esta misma sesión)

| Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---:|---:|---:|---:|
| Móvil | **100** | **100** | **100** | **100** |
| Escritorio | 70 (TBT de laboratorio) | **100** | **100** | **100** |

Batería de calidad: **14/14**. Artefacto publicable: **181 archivos, 101 excluidos, 0 fallos**.

---

## 3. Herramientas: las que ya estaban en el PC (Regla de Oro del entorno)

No se instaló nada. Ruta y versión realmente ejecutadas:

| Necesidad | Lo que ya estaba | Versión / ruta |
|---|---|---|
| Auditar la web | Lighthouse ya instalado, por API de Node | 13.5.0 |
| Navegador de pruebas | Playwright del repo web | `Konfio-Zinc-Web\herramientas\node_modules\playwright` |
| Emuladores | Firebase CLI global | 15.29.0 · `%APPDATA%\npm\firebase.ps1` |
| Java para Firestore | JBR de Android Studio | OpenJDK 21.0.10 |
| Motor de reglas | JAR en caché | `cloud-firestore-emulator-v1.22.0.jar` |
| Suites | versionadas en `herramientas/test/` | sin escribir pruebas nuevas |

---

## 4. Lo que sigue abierto (no se puede declarar cerrado)

1. **Nada está publicado.** Sin push, sin merge, sin deploy, sin tocar `main`. Publicar exige
   autorización explícita del propietario.
2. **`firebase.json` conserva un bloque `functions`** y `functions/src/` existe, pero el
   código del sitio **no invoca ninguna Callable** (0 apariciones de `httpsCallable`) y el
   proyecto es Spark. Un `firebase deploy` ingenuo intentaría desplegar funciones: hay que
   retirar ese bloque o documentarlo antes de publicar.
3. **Suites heredadas del modelo con Functions** (`pruebas-callables-p1.js`,
   `pruebas-loteB-p1.js`, `pruebas-loteC-p1.js`, `pruebas-motor-p1.js`,
   `pruebas-vencimientos-p1.js`, `pruebas-lanzamiento-p1.js`) siguen en el repo y **no se
   ejecutaron hoy**: suponen Callables que ya no existen. Deben retirarse o marcarse como
   obsoletas para que nadie las corra y crea que el producto falla.
4. **La semilla de demostración crea un plan «Premium apps $149.900»** (`demo-staging.ps1`),
   un precio **retirado** por la política vigente. Es dato ficticio de local, pero enseña la
   oferta vieja: hay que corregirlo.
5. **El asesor del chat del sitio (`assets/js/main.js`) sigue anunciando Star/Pro/Elite y
   aliados con la lista vieja** (224 avisos de `verificar-precios.js`). Se publica con el
   artefacto.
6. **Revisión visual humana pendiente** del cambio de contraste de la lista de precios
   (`rgb(86,83,76)`, capturas en `C:\KZ-EVIDENCIA\precios-375.png` y `precios-1440.png`).
7. **Los 23 hallazgos CARD-001..023 no están cerrados uno por uno** aquí: lo verificado hoy
   son pagos, precios, ciclo de cliente, avisos, usuarios, vencimientos y reglas.

---

## 5. Cómo reproducir esta verificación

```powershell
# 1. Reglas (crea una config temporal y la borra al terminar)
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
node $env:APPDATA\npm\node_modules\firebase-tools\lib\bin\firebase.js emulators:start `
  --only auth,firestore --project demo-card-seguridad --config firebase.emu.json
node herramientas/test/pruebas-spark-reglas-p1.js      # 53/53

# 2. Panel (sobre la copia aislada, que ya está al día)
node $env:APPDATA\npm\node_modules\firebase-tools\lib\bin\firebase.js emulators:start `
  --config firebase-emulador-funciones.json --only auth,firestore,hosting `
  --project demo-card-seguridad    # ejecutado en %TEMP%\kz-card-staging-p1
node herramientas/test/pruebas-spark-panel-p1.js       # 18/18
```

Ninguno de los dos pasos toca `firebase.json`, ni producción, ni datos reales: proyecto
`demo-*`, red de loopback y emuladores oficiales.
