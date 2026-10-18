# Ventana de lanzamiento controlada · CARD `d11ba0c`

Secuencia única para ejecutar en una sola sesión de trabajo. **Cada etapa se verifica antes de
empezar la siguiente.** Si una verificación no da lo esperado, se detiene la ventana y se revierte
esa etapa; no se sigue «para ver si al final queda bien».

Lo que **no** forma parte de esta ventana: activar o desplegar `processDueDates`, migrar usuarios,
ejecutar `seedInicial`, ejecutar `recalcularEstados`, desplegar Firebase Hosting, crear buckets ni
tocar IAM.

---

## Tabla de etapas

| # | Etapa | Comando | Evidencia de que salió bien | Criterio de parada | Reversión |
|---|---|---|---|---|---|
| 0 | Pre-vuelo local | `node herramientas/verificar-precios.js` y las 7 suites | todo en verde, 0 fallos | cualquier suite en rojo | — (no se toca producción) |
| 1 | Respaldo fresco | `node C:\KONFIO-RESPALDOS\_kit\respaldo-fiel.js --destino …` + `verificar.js` | manifiesto `COMPLETO`, huella del conjunto anotada | verificación no da ÍNTEGRO | — |
| 2 | Índice `historial_estados` | `firebase deploy --only firestore:indexes --project konfio-zinc` | `firebase firestore:indexes` lo muestra `READY` | sigue `CREATING` más de 30 min | quitar del JSON y volver a desplegar |
| 3 | Callables administrativas | `pwsh herramientas/desplegar-funciones.ps1 -Etapa admin -Ejecutar` | `firebase functions:list` → 17 funciones, **sin** `processDueDates` | aparece `processDueDates` en la lista | volver a desplegar la versión anterior |
| 4 | Validar funciones e interruptor | `estadoMotor` desde el panel con un SUPERADMIN | `habilitado: false` y motivo que nombra la variable ausente | `habilitado: true` | cerrar el documento y **detener** la ventana |
| 5 | Publicar frontend | `pwsh herramientas/publicar-paginas.ps1 -ConfirmarPruebas -Publicar` | push en avance rápido, sitio responde 200, «Usuario creado» funciona | el script se niega o el sitio no responde | `git revert` del commit publicado |
| 6 | Reglas de Firestore | `firebase deploy --only firestore:rules --project konfio-zinc` | regresión de reglas en verde contra el sitio publicado | cualquier regla falla | volver a desplegar el `firestore.rules` anterior |
| 7 | Validación crítica con datos reales | crear un cliente de prueba y ver su historial | aparece en la lista, historial carga, auditoría registra | el historial falla por índice o el alta no aparece | revertir reglas (etapa 6) y detener |
| 8 | Migración de usuarios | **NO SE EJECUTA** en esta ventana | — | — | — |
| 9 | Motor programado | **NO SE DESPLIEGA** | — | — | — |

Orden obligatorio: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**. Las reglas van **después** del frontend
porque el panel publicado hoy gestiona usuarios escribiendo `usuarios/*` desde el navegador; si se
desplegaran antes, la gestión de usuarios del panel actual dejaría de funcionar en silencio.

---

## Etapa por etapa, con lo que hay que mirar

### 0 · Pre-vuelo local (5 minutos)

```powershell
cd C:\Users\usuario29\Documents\KONFIO_ZINC\6-LANDING-PAGES\card-pagos-p1
node herramientas/verificar-precios.js
```
Debe terminar en `RESULTADO: OK`. Los avisos de nomenclatura son la migración de precios pendiente y
no bloquean.

Suites (con el entorno de emuladores arriba y sembrado):

```powershell
node herramientas/test/pruebas-pagos-p1.js          # reglas
node herramientas/test/pruebas-callables-p1.js      # Callables
node herramientas/test/pruebas-motor-p1.js          # interruptor del motor
node herramientas/test/pruebas-lanzamiento-p1.js    # panel con y sin backend
node herramientas/test/pruebas-loteB-p1.js          # panel
node herramientas/test/pruebas-loteC-p1.js          # panel
```

Guía rápida para el entorno ficticio:

```powershell
pwsh herramientas/demo-staging.ps1                 # emuladores + datos ficticios
# y para la prueba de "servidor ausente":
#   arrancar los emuladores con --only auth,firestore,hosting  (sin functions)
#   node herramientas/test/pruebas-lanzamiento-p1.js --modo ausente
```

### 1 · Respaldo fresco (3 minutos)

```powershell
$sello = Get-Date -Format 'yyyy-MM-dd_HHmm'
node C:\KONFIO-RESPALDOS\_kit\respaldo-fiel.js --destino "C:\KONFIO-RESPALDOS\$sello"
node C:\KONFIO-RESPALDOS\_kit\verificar.js --origen "C:\KONFIO-RESPALDOS\$sello"
```

Anotar la **huella del conjunto**. Tiene que decir `RESULTADO: ÍNTEGRO`. El respaldo del LOTE I
sigue disponible como referencia, pero la ventana usa uno fresco hecho minutos antes.

### 2 · Índice (2 minutos + espera)

```powershell
firebase deploy --only firestore:indexes --project konfio-zinc
firebase firestore:indexes --project konfio-zinc
```

El único índice compuesto que necesita el panel es `historial_estados (clienteId ASC, fecha DESC)`;
las demás consultas son de un solo campo y Firestore las indexa solo. Debe aparecer `READY`.

### 3 · Callables administrativas (5 minutos)

```powershell
pwsh herramientas/desplegar-funciones.ps1                                    # plan, no despliega
pwsh herramientas/desplegar-funciones.ps1 -Etapa admin -Ejecutar
firebase functions:list --project konfio-zinc
```

El script valida que la lista coincide con los `exports` reales y aborta si `processDueDates` se
cuela. En la lista deben salir 17 funciones y **ninguna** `processDueDates`.

### 4 · Funciones e interruptor (3 minutos)

En el panel, con un SUPERADMIN, llamar `estadoMotor`. Respuesta esperada: `habilitado: false` y un
motivo que empieza por «falta la variable de entorno KZ_MOTOR_VENCIMIENTOS».

Crear un usuario de prueba desde el panel: debe funcionar (prueba de que las Callables responden de
verdad en producción). Después, desactivarlo.

### 5 · Publicar el frontend (10 minutos)

```powershell
pwsh herramientas/publicar-paginas.ps1                                        # ensayo con todas las comprobaciones
pwsh herramientas/publicar-paginas.ps1 -ConfirmarPruebas -Publicar
```

El script no publica nada si: el árbol no está limpio, la publicación no sería avance rápido,
`precios.html` cambia, o el verificador de precios falla. Crea la etiqueta de retorno
`release/previo-<commit>` antes de empujar y comprueba el sitio al terminar.

**No toca la copia local de producción** (`Konfio-Zinc-Web`), que sigue con su `precios.html`
modificado sin publicar. Nadie debe hacer `git pull` en esa copia durante la ventana.

### 6 · Reglas (3 minutos)

```powershell
firebase deploy --only firestore:rules --project konfio-zinc
```

Después, volver a la regresión de reglas contra el sitio publicado. Si falla: **detener** y revertir.

### 7 · Validación crítica (10 minutos, con datos reales mínimos)

1. Alta de un cliente de prueba desde el panel → aparece en la lista.
2. Abrir su ficha → el historial carga (esto valida el índice de la etapa 2).
3. Comprobar en Firestore que quedaron `auditoria` e `historial_estados` de esa alta.
4. Borrar el cliente de prueba (baja lógica) y comprobar que desaparece de la lista.
5. Revisar que `precios.html` publicado sigue igual que antes de la ventana.

Es la única etapa que escribe datos reales: se hace con un cliente de prueba creado y eliminado en
la misma ventana, nunca con un cliente existente.

---

## Condiciones que obligarían a no empezar

- Alguna suite en rojo en la etapa 0.
- El respaldo fresco no verifica.
- `firebase functions:list` muestra `processDueDates` ya desplegada (alguien desplegó el motor: hay
  que cerrarlo **antes** de tocar nada).
- `estadoMotor` responde `habilitado: true`.
- El árbol de trabajo del candidato no está limpio o el commit no es `d11ba0c`.
- `precios.html` aparece como modificado por el candidato.

## Qué queda pendiente después de la ventana

- Migración de usuarios (necesita autorización propia y un ensayo en seco sobre datos reales).
- Motor programado: desplegar `processDueDates` y abrir sus dos controles.
- Respaldo automático en Cloud Storage (bucket, roles y ciclo de vida).
- Confirmar en consola el rol de despliegue de la cuenta.
