# KZ-OPS-001 · Registro de despliegue en producción

**Ejecutado:** 24 de octubre de 2026 · **Dictamen: GO PRODUCCIÓN**
**Proyecto Firebase:** `konfio-zinc` (plan Spark) · **Sitio:** https://konfiozinc.github.io/card/

Este documento registra la publicación real. Todo lo que afirma está respaldado por una
comprobación ejecutada; lo que no se pudo comprobar se declara como no comprobado.

---

## 1. Estado inicial

| Elemento | Valor verificado |
|---|---|
| `konfiozinc/card` `origin/main` | `8a80234d9a49d4e0aa95343c182c488f69e81ec5` |
| Reglas desplegadas **reales** (API Firebase Rules) | ruleset `projects/konfio-zinc/rulesets/43c2366a-dd0c-40f8-8cc4-16778305fec0`, 398 líneas / 21.633 B |
| Reglas desplegadas vs `origin/main:firestore.rules` | **byte-idénticas** (comprobado con la API, no con Git) |
| Índices desplegados | 5, todos `READY` |
| Worker de Cloudflare | `ee267e0c…` (no se ha tocado) |

La verificación de las reglas vivas confirmó lo que el handoff afirmaba y que hasta ahora no se
había comprobado contra la API. También confirmó que **la regla de `servicios` en producción no
admitía `createdAt`**: el defecto D1 estaba activo en producción.

## 2. Respaldos

| Qué | Dónde |
|---|---|
| Reglas Firestore **desplegadas** (no las de Git) | `14-HERRAMIENTAS-DESARROLLO/.secrets/kz-ops-001-backup/reglas-desplegadas__firestore.rules` + `meta-reglas-desplegadas.json` |
| Código anterior del sitio | `git revert 7e2610b 3cce86b` o `git checkout 8a80234 -- .` |
| Índices | `firestore.indexes.json` sin cambios; los 5 desplegados siguen en uso |
| Datos | No hubo migración ni escritura sobre datos reales: no se requiere respaldo de datos |

## 3. Publicación

### 3.1 Código

```
git push origin main     8a80234..7e2610b
SHA publicado: 7e2610b327ae86fb1c1c3442805e72a6381f5072
```

Commits publicados:

- `3cce86b` — consolidación operativa (12 defectos, servicios por servicio, contactos, pagos, vencimientos, dashboard).
- `7e2610b` — privacidad del formulario, endpoint ficticio, puerta de calidad y CI.

**Orden elegido: primero las reglas, después el código.** Las reglas nuevas son compatibles hacia
atrás (admiten lo que el panel anterior ya escribía) y el código nuevo **no** lo es con las reglas
viejas (el alta de servicios seguiría fallando). Publicar el código antes habría abierto una ventana
en la que el panel nuevo no podía crear servicios. Se desplegaron las reglas primero y se redujo
esa ventana a la duración del push.

### 3.2 Reglas Firestore

```
firebase deploy --only firestore:rules
```

- Compilación: correcta.
- Ruleset liberado: `projects/konfio-zinc/rulesets/342f0530-4731-43b1-a65b-df9a2e7cbd1a`
- Fecha del release: 2026-10-24T14:08:09Z
- **Verificación posterior por API:** el contenido desplegado es byte-idéntico a
  `firestore.rules` del commit publicado (27.615 B), incluye `clasificacionHistorica` y admite
  `createdAt` en `servicios`.

No se desplegaron Functions (no existen) ni se activó Blaze.

### 3.3 Índices

`firestore.indexes.json` **no cambió** respecto de `origin/main`, y la consulta de los índices vivos
por API devolvió los 5 declarados en estado `READY`. No fue necesario desplegarlos.

### 3.4 GitHub Pages

Verificado sirviendo el contenido del commit publicado: **6 activos clave comparados byte a byte**
(`assets/js/main.js`, `contacto.html`, `premium-assets/app.js`, `assets/js/admin/escrituras-local.js`,
`assets/js/admin/datos.js`, `admin/servicios.js`) son **idénticos** a los del repositorio.

## 4. Certificación en producción

| Batería | Comprobaciones | Resultado |
|---|---:|---|
| `humo-produccion-ops-001.js` — sitio, panel, activos idénticos al commit | 24 | 24/24 |
| `certificacion-produccion-ops-001.cjs` — `/leads`, escritura denegada, auditoría | 9 | 9/9 |
| `panel-produccion-ops-001.cjs` — panel con cuenta de prueba | 17 | 16/17 → 17/17 tras limpiar la ficha de usuario |
| `konfi-produccion-ops-001.cjs` — Asesor Konfi | 6 | 6/6 |
| **Total** | **56** | **56/56** |

Lo comprobado en producción:

- `/leads` responde `200` con `saved:true`, y un envío idéntico **no duplica** (dedup del Worker).
- La escritura directa a `contactos` sigue **denegada** (403 sin credenciales, 401 con token inválido).
- El panel entra con una cuenta autorizada y **las 6 páginas cargan** con las reglas desplegadas:
  Dashboard (12 KPIs), Clientes (31), Servicios (2), Contactos, Vencimientos, Pagos, Notificaciones.
- **D1 corregido en producción:** desde la ficha de un cliente se creó un servicio y quedó guardado
  con `createdAt`, estado `ACTIVO` y su fecha de vencimiento.
- Asesor Konfi: ofrece Mini Web Básica $49.900 y Pro $99.900, **no** anuncia $149.900 y responde de
  forma determinista ante el plan retirado Elite.
- Sin errores de JavaScript en el recorrido del panel.

## 5. Auditoría histórica de solo lectura

Ejecutada con la cuenta de servicio, **sin una sola escritura** sobre datos reales. Solo se emiten
identificadores técnicos.

Datos leídos: **31 clientes · 2 servicios · 0 pagos · 0 contactos**.

| Tipo | Hallazgo | Gravedad | Cantidad |
|---|---|---|---:|
| H1 | Clientes sin ningún servicio registrado | **ALTA** | **29** |
| H2 | Servicios con `clienteId` inexistente (huérfanos) | ALTA | 0 |
| H3a | Pagos renovables sin `servicioId` | ALTA | 0 |
| H3b | Pagos con `servicioId` de otro cliente o inexistente | ALTA | 0 |
| H3c | Pagos históricos sin concepto | MEDIA | 0 |
| H4 | Clientes con fecha genérica y sin obligación por servicio | ALTA | 0 |
| H5 | Inconsistencia de estado cliente ↔ sus servicios | MEDIA | 0 |
| H6 | Servicios con vencimiento anterior al inicio | BAJA | 0 |

**Lectura del resultado.** No hay corrupción ni datos huérfanos: no existe un solo servicio apuntando
a un cliente inexistente, ni un pago cruzado, ni una fecha imposible. El único hallazgo es **H1: 29 de
31 clientes no tienen ningún servicio registrado**, que es exactamente la consecuencia de D1 (el alta
de servicios estaba denegada en producción y `crearCliente` lo silenciaba). Los 2 servicios existentes
no presentan incoherencias.

**Qué implica y qué NO se ha hecho.** Esos 29 clientes siguen operando con normalidad, pero su
renovación no se puede registrar por la vía nueva hasta que tengan el servicio correspondiente, y
Vencimientos no puede calcular su obligación por servicio. **No se ha creado ningún servicio para
ellos**: reconstruirlos exigiría suponer qué contrató cada cliente, y eso está expresamente prohibido.
Requiere revisión y decisión humanas.

Identificadores afectados (sin datos personales): registrados en
`C:/Users/usuario29/AppData/Local/Temp/kz-auditoria-produccion.json`.

## 6. Registros ficticios utilizados y limpieza

| Registro | Identificador | Estado |
|---|---|---|
| Contacto de captación | `tiNhwTR6tfc1gC1dEeUa` | **eliminado** (verificado) |
| Cliente de prueba | `mBREHwUkdLYN7j00xAPj` | **eliminado** |
| Servicio de prueba | `sdS90rqGRr2ChpFyz6gX` | **eliminado** |
| Ficha de usuario de prueba | `D4P36h6OyWZcC6gjmuUezMamN4P2` | **eliminado** |
| Cuenta de Authentication | `qa-ops-001-…@konfio-zinc.invalid` | **eliminada** |
| Entrada de auditoría | `fzYuYjUsJUrJPTVYVmat` | **eliminada** |

Todas las marcas de QA incluían el texto `QA OPS-001 FICTICIO`, y la limpieza se verificó
comparando los totales con el estado inicial.

**Estado final de las colecciones:** 31 clientes · 2 servicios · 0 contactos · 0 pagos ·
1 usuario (`SUPERADMIN` real) · 2 entradas de auditoría y 2 de historial, ninguna con marca de QA.

## 7. Datos reales intactos

No se modificó ningún cliente, servicio, pago, notificación ni histórico real. La única escritura
sobre producción fue **crear y borrar** los seis registros ficticios de la tabla anterior.

## 8. KZ-QA-001: procedencia

El encargo pedía integrar la rama `codex/kz-qa-001` (commit `76057470…`). **Esa rama y ese commit no
existen en este entorno**; se comprobó con `git cat-file`, `git fetch origin`, `git branch -r` y
búsqueda en los worktrees. No se integró nada de Codex porque no había nada que integrar.

Los dos defectos que el encargo describía **sí se corrigieron** (D13 y D14 de
`docs/KZ-OPS-001-CONSOLIDACION.md`) y la puerta de calidad se redactó cubriendo los mismos objetivos:
`herramientas/test/pruebas-qa-001-web-publica.js` (196 comprobaciones) y `.github/workflows/calidad.yml`
(dos trabajos, sin secretos, sin despliegue automático). Si la suite de Codex aparece después, se
incorpora **añadiendo** sus comprobaciones, no sustituyendo estas.

## 9. Reversión

Preparada y no ejecutada.

```bash
# 1. Código: volver al SHA anterior
git revert --no-edit 7e2610b 3cce86b
git push origin main

# 2. Reglas: volver a publicar el respaldo de las reglas que estaban activas
cp 14-HERRAMIENTAS-DESARROLLO/.secrets/kz-ops-001-backup/reglas-desplegadas__firestore.rules \
   firestore.rules
firebase deploy --only firestore:rules
```

**Criterio de activación:** pérdida o corrupción de datos, modificación cruzada de servicios,
renovaciones sin pago, fallos generalizados del panel, permisos financieros incorrectos, captación
inoperativa o regresión grave de privacidad.

**Advertencia honesta:** volver a las reglas antiguas **reabriría** los defectos D1 (alta de servicios
denegada), D6 (cobro sin descripción rechazado) y D9 (el panel podría reescribir los datos de un
lead). Si el código nuevo queda en producción, la reversión de reglas **no** es segura por sí sola:
en ese caso hay que revertir código y reglas juntos.

## 10. Riesgos residuales tras el despliegue

1. **H1: 29 clientes reales sin servicio registrado.** Pendiente de decisión humana. Mientras no se
   resuelva, su renovación no se puede registrar por la vía nueva y Vencimientos los muestra marcados
   como «clientes sin servicios registrados».
2. **`roles/datastore.user` a nivel de proyecto** para `kz-leads@konfio-zinc.iam.gserviceaccount.com`.
   Sin cambios (no autorizado tocar IAM).
3. **Rate limit de Cloudflare KV no atómico.**
4. **API key web de Firebase pública** y replicada en varios archivos. Mitigación pendiente:
   restricción por dominio en Google Cloud Console.
5. **`contacto.html` y `index.html` cargan Google Tag Manager**, dos hosts externos de analítica
   preexistentes. No reciben datos del formulario, pero conviene revisarlos si se endurece la
   privacidad.
6. **La puerta de calidad no se ejecutó en GitHub Actions:** el workflow está comitado y validado por
   partes en local, pero su primera ejecución real ocurrirá en el próximo push. No se afirma que haya
   pasado en CI porque no hay evidencia de ello.
7. **Las suites de navegador no están en CI** (necesitan el staging vendorizado). Siguen siendo
   locales.
8. **[HALLAZGO NUEVO, no corregido] El Asesor Konfi puede devolver respuestas cortadas.**
   Durante la verificación en producción, una respuesta terminó a mitad de frase: *«…Manejamos dos
   opciones: la Mini Web»*. La causa está en el Worker y **no** en este despliegue:

   ```js
   // worker.js · callGemini(): se toma el texto sin revisar finishReason
   const reply = data.candidates[0].content.parts.map((p) => p.text || "").join("");
   ```

   Si Gemini corta la generación por longitud (`finishReason: "MAX_TOKENS"`), el Worker devuelve el
   texto parcial como si fuera la respuesta completa. No es un fallo de las reglas ni del panel, y en
   una segunda consulta la misma pregunta devolvió la lista de precios completa.

   **No se ha corregido ni desplegado**: modificar y redesplegar el Worker está expresamente fuera
   del alcance de esta misión. Corrección preparada conceptualmente: comprobar `finishReason` y, si
   no es `STOP`, reintentar con el siguiente modelo de `MODELS` o responder con `respuestaLocal`;
   nunca devolver un texto parcial como completo. Requiere su propia autorización y sus propias
   pruebas (`saneamiento`, `aislamiento`, `pruebas-leads` siguen en 10/10 con la fuente actual).
9. **El modelo del Asesor Konfi es no determinista.** Las comprobaciones de precio preguntan dos veces
   y exigen que al menos una respuesta traiga los dos precios vigentes; las invariantes que sí se
   exigen siempre son: responde, no anuncia `$149.900` y rechaza el plan Elite.
