# KZ-OPS-001 · Consolidación operativa integral

**Corte:** 24 de octubre de 2026 · **Estado:** candidato local certificado (GO LOCAL) · **Producción:** sin cambios.

Este documento es el registro de la misión de consolidación. Recoge **qué estaba mal y con qué evidencia**, **qué se cambió**, **cómo se prueba** y **cómo se despliega o se revierte**. Sustituye como referencia operativa a los informes parciales anteriores sobre el mismo flujo.

---

## 1. Qué se consolidó

El recorrido completo de la agencia, de punta a punta:

```
Visitante → Web premium → Asesor Konfi / formulario → Worker /leads
   → contactos (Firestore) → seguimiento comercial → conversión a cliente
   → servicios contratados (1 cliente → N servicios) → cobros por concepto
   → renovaciones ligadas al servicio → vencimientos por obligación → dashboard
```

Antes de esta misión cada pieza existía, pero **no cerraban el circuito**: el alta de servicios fallaba en silencio, el seguimiento comercial no existía, el estado de un servicio se cambiaba sobre el cliente entero y la renovación calculaba la fecha con el dato equivocado. Todo eso está corregido y probado.

---

## 2. Defectos encontrados y corregidos

Cada defecto se **midió primero** contra el emulador y después se corrigió. Los números de las sondas son reproducibles con los comandos del §6.

### D1 · Crear un servicio desde el panel devolvía PERMISSION_DENIED (crítico)

- **Evidencia:** sonda REST con los campos exactos que escribe `crearServicio()` → `403 PERMISSION_DENIED`; quitando `createdAt` → `200`.
- **Causa:** la regla de `servicios` usaba `keys().hasOnly([...])` con una lista cerrada que **no incluía `createdAt`**, y el panel lo escribía en cada alta.
- **Agravante:** `crearCliente()` creaba el servicio en una llamada aparte envuelta en `.catch(() => {})`. Al ser denegado, **el cliente se guardaba sin ningún servicio y la pantalla decía «creado»**. De ahí salían tres síntomas que parecían fallos distintos: el detalle del cliente sin servicios, el selector «Servicio asociado» vacío en el cobro (que bloqueaba todas las renovaciones) y Vencimientos sin obligación por servicio.
- **Corrección:** `createdAt` admitido en la regla (exigiendo `timestamp`); `crearCliente()` escribe **cliente y primer servicio en un mismo lote** (`writeBatch`), así que o se guardan los dos o no se guarda ninguno. Los fallos de bitácora se devuelven como `aviso`, no se silencian.

### D2 · Las acciones de la página Servicios actuaban sobre el CLIENTE, no sobre el servicio

- **Evidencia:** `admin/servicios.js` llamaba a `escrituras.reactivarServicio(clienteId)`, y esa función escribe `clientes/{id}.estadoCliente`. Con varios servicios por cliente, **suspender un servicio suspendía todos** y el `estado` del servicio no cambiaba nunca.
- **Corrección:** nueva `cambiarEstadoServicio(servicioId, nuevo, motivo)` (ADMIN+), que escribe en el documento **del servicio** y deja constancia en `historial_estados` (con su `clienteId`) y en `auditoria`. El estado del cliente ya no se toca desde esa página.

### D3 · Edición individual de servicios inexistente

- Era la mejora pendiente documentada. Ahora `admin/servicios.js` tiene editor por fila (servicio, categoría, precio, estado, fechas) y `actualizarServicio()` con validaciones; `activo` se deriva del estado para que no queden servicios «INACTIVO con activo: true». `firestore.rules` valida `estado` y fechas: antes un ADMIN podía guardar `estado: 'BASURA_INVENTADA'` o `fechaVencimiento: 'no-es-fecha'` (ambos verificados con sonda).

### D4 · La renovación calculaba la nueva fecha desde el cliente, no desde el servicio

- **Causa:** `confirmarPago()` usaba `clientes.fechaVencimiento` como base. Esa fecha es un agregado del cliente: con dos servicios de vencimientos distintos, **renovar el segundo saltaba a una fecha calculada sobre el primero**.
- **Corrección:** la base es `servicios/{pago.servicioId}.fechaVencimiento`. La fecha genérica del cliente pasa a ser la obligación **más lejana** entre sus servicios, recalculada con las lecturas previas a la transacción.

### D5 · Una consulta dentro de la transacción abortaba la confirmación entera

- **Evidencia:** al confirmar una renovación, **el pago y la fecha quedaban intactos** y la pantalla solo mostraba un error de reglas.
- **Causa:** `tx.get(query(...))` **no está soportado** por el SDK web; solo admite referencias. La excepción abortaba la transacción completa.
- **Corrección:** los servicios hermanos del cliente se leen **antes** de `runTransaction`; la decisión (estado del pago, concepto, fechas) sigue tomándose dentro con el estado real del servidor.

### D6 · Renovar sin pago, sin concepto y sin auditoría

- **Evidencia:** `admin/clientes.js` tenía un botón «Renovar 12 meses» que hacía `updateDoc` directo sobre `clientes.fechaVencimiento` sumando 12 meses: **sin pago, sin concepto, sin servicio identificado, sin historial ni auditoría**. Era exactamente el comportamiento que CARD-SPARK-002 eliminó, reintroducido en la interfaz, y convivía con la vía correcta.
- **Corrección:** botón y acción eliminados. La única vía para renovar es registrar un pago con concepto y que un ADMIN lo confirme.

### D7 · Registrar un cobro sin descripción fallaba siempre

- **Evidencia:** sonda REST con `descripcion: null` → `403`; sin la clave → `200`.
- **Causa:** el panel enviaba `descripcion: null` y la regla exigía `descripcion is string`.
- **Corrección:** la regla admite `null` (la descripción es opcional por diseño) **y** el panel omite la clave cuando está vacía.

### D8 · Desfase de un día en todas las fechas

- **Evidencia:** con `TZ=America/Bogota`, renovar un servicio que vence `2027-10-24` daba **`2028-10-23`**; `fechaLarga('2027-10-24')` mostraba «23 de oct».
- **Causa:** `new Date('YYYY-MM-DD')` interpreta la cadena como medianoche **UTC** (19:00 del día anterior en Colombia) y después se formatea y se suma en hora local.
- **Corrección:** `aFecha()` en `datos.js` y en `escrituras-local.js` parsea las fechas de calendario como locales (`v + 'T00:00:00'`). Afectaba a **todas** las fechas mostradas y a cada cálculo de renovación.

### D9 · El panel podía reescribir los datos de origen de un lead

- **Evidencia:** un ADMIN podía hacer `PATCH` del `telefono` y del `mensaje` de un contacto (`200`).
- **Corrección:** `contactos` exige ahora que `nombre`, `telefono`, `email`, `mensaje`, `servicio` y `createdAt` sean **inmutables** en toda actualización, y limita lo que se puede escribir a los campos de gestión. El OPERADOR puede hacer seguimiento (es quien llama); un ADMIN puede borrar.

### D10 · El seguimiento comercial no existía

- Solo había `NUEVO`/`ATENDIDO`, sin notas, sin historial y sin forma de convertir un lead en cliente. Ahora hay cinco estados (`NUEVO`, `CONTACTADO`, `ATENDIDO`, `DESCARTADO`, `CONVERTIDO`), historial de atención con autor y fecha, y una **conversión explícita** que crea cliente + primer servicio en un lote y vincula el contacto. Nunca ocurre sola, y `CONVERTIDO` **exige** `clienteId`.

### D11 · Vencimientos derivaba la obligación del cliente, no del servicio

- La obligación se calculaba desde el campo único `clientes.servicio`, así que un cliente con dominio y landing mostraba **una sola** obligación. Ahora cada fila es una obligación de un servicio concreto (`obligacionServicio()` en `datos.js`), el estado que se muestra es el **del servicio**, y suspender desde esa página afecta solo a ese servicio. Los clientes sin servicios registrados siguen apareciendo, marcados como tales, en vez de desaparecer.

### D12 · El staging aislado podía escribir en producción

- **Evidencia:** `node herramientas/preparar-staging.js` avisaba «fugas a producción: main.js con el Worker de producción» y **seguía adelante**. Además encontró `contacto.html` y `panel.html` con la configuración de Firebase **de producción inline** (apiKey y proyecto reales) y la CSP de `index.html` autorizando el Worker de producción.
- **Corrección:** el recetario cubre `WORKER_LEADS` (el endpoint del formulario estándar, que no se parcheaba) y sustituye proyecto/apiKey/origen del Worker en todas las páginas. **La comprobación de fugas es ahora bloqueante:** si queda una referencia a producción, el staging no se genera y no se usa para pruebas.

---

## 3. Permisos resultantes

Autoridad única: `firestore.rules`. El panel solo oculta botones; no autoriza.

| Colección | OPERADOR | ADMIN | SUPERADMIN |
|---|---|---|---|
| `clientes` | Datos de contacto | + comercial, ciclo de vida | + baja lógica |
| `servicios` | Lee; corrige `clienteNombre` | Crea, edita campos comerciales, cambia estado **por servicio** | Igual |
| `pagos` | Registra (PENDIENTE) | Confirma, anula con motivo, **clasifica un histórico una sola vez** | Igual |
| `contactos` | Lee, estado y seguimiento | + eliminar | Igual |
| `historial_estados` | Crea con su uid | Igual | Igual |
| `auditoria` | Crea con su uid | Igual | Lee |
| `usuarios` | Solo su ficha | — | Lee todas; **nadie escribe** |

Invariantes que se conservan de KZ-SEC-002 y CARD-SPARK-002: el importe de un pago es inmutable; `contactos` sigue cerrado a creación desde el navegador (solo el Worker con cuenta de servicio); el servicio de un pago no se reasigna (si un histórico hay que corregirlo, se anula con motivo y se registra de nuevo).

---

## 4. Archivos tocados

| Archivo | Cambio |
|---|---|
| `firestore.rules` | `servicios` (createdAt, estado y fechas validadas), `contactos` (inmutabilidad del lead y campos de gestión), `pagos` (descripción opcional + clasificación histórica) |
| `assets/js/admin/escrituras-local.js` | Lote cliente+servicio, `crearServicio`/`actualizarServicio`/`cambiarEstadoServicio`, `confirmarPago` con base por servicio, validación de `servicioId`, `clasificarPago`, seguimiento de contactos y conversión |
| `assets/js/admin/datos.js` | Lecturas sin `orderBy` excluyente, `cargarContactos`, `obligacionServicio`, `aFecha` local |
| `admin/servicios.js` | Reescrito: estado por servicio, edición individual, filtros |
| `admin/contactos.js` | Reescrito: estados comerciales, historial, conversión |
| `admin/vencimientos.js` | Reescrito: obligación por servicio |
| `admin/pagos.js` | Reescrito: servicio asociado, clasificación, bloqueos explicados |
| `admin/dashboard.js` | KPIs y obligaciones sobre datos reales, servicios por tipo |
| `admin/clientes.js` | Ficha con servicios detallados, aviso de concepto/servicio en el cobro, **botón de renovación silenciosa eliminado** |
| `herramientas/preparar-staging.js` | Aislamiento completo y **bloqueante** |
| `herramientas/test/pruebas-ops-001-*.js` | Suites nuevas (43 reglas + 43 E2E) |

---

## 5. Certificación

Todo se ejecutó en **emuladores locales** con datos ficticios, sobre un staging reconstruido desde el árbol de trabajo y verificado como aislado.

| Suite | Comprobaciones | Resultado |
|---|---:|---|
| `pruebas-spark-reglas-p1.js` | 53 | 53/53 |
| `pruebas-seguridad-kz-sec-002.js` | 17 | 17/17 |
| `pruebas-captacion-kz-sec-002.js` | 7 | 7/7 |
| `pruebas-pagos-concepto-card-spark-002.js` | 5 | 5/5 |
| `pruebas-ops-001-servicios-contactos.js` | 43 | 43/43 |
| `pruebas-spark-panel-p1.js` | 18 | 18/18 |
| `pruebas-financiero-card-spark-002.js` | 6 | 6/6 |
| `pruebas-ops-001-e2e.js` | 43 | 43/43 |
| **Total** | **192** | **192/192** |

Asesor Konfi (fuente en `kz-workspace`, sin tocar el Worker desplegado): `saneamiento` 5/5, `aislamiento` 2/2, `pruebas-leads` 3/3 → **10/10**. El Worker ofrece Mini Web Básica $49.900 y Pro $99.900, responde de forma determinista ante el plan retirado Elite y conserva `/leads`.

---

## 6. Cómo reproducir

```bash
# 1. Staging aislado desde el árbol actual (falla si queda una referencia a producción)
node herramientas/preparar-staging.js

# 2. Emuladores (requiere un JDK en PATH o JAVA_HOME)
cd %TEMP%/kz-card-staging-b68108b
firebase emulators:start --config firebase-emulador-funciones.json --project demo-card-seguridad --only auth,firestore,hosting

# 3. Suites (en otra terminal, desde la raíz del repo)
node herramientas/test/pruebas-spark-reglas-p1.js
node herramientas/test/pruebas-seguridad-kz-sec-002.js
node herramientas/test/pruebas-captacion-kz-sec-002.js
node herramientas/test/pruebas-pagos-concepto-card-spark-002.js
node herramientas/test/pruebas-ops-001-servicios-contactos.js
node herramientas/test/pruebas-spark-panel-p1.js
node herramientas/test/pruebas-financiero-card-spark-002.js
node herramientas/test/pruebas-ops-001-e2e.js
```

---

## 7. Despliegue controlado (requiere autorización expresa)

Nada de esto se ha ejecutado. El candidato está listo, pero publicar es una decisión del propietario.

**Antes de desplegar**

1. Copiar las reglas vigentes en producción como respaldo (`firebase firestore:rules` o consola) y guardarlas fuera del repositorio.
2. Confirmar que `card/main` sigue en `8a80234` y que el árbol local solo contiene los cambios de esta misión.
3. Verificar el staging una última vez: `node herramientas/preparar-staging.js` debe terminar con «aislamiento verificado».

**Publicación (en este orden)**

```bash
git add -A && git commit -m "feat(kz-ops-001): consolidación operativa ..."
git push origin main                                  # solo con autorización
firebase deploy --only firestore:rules,firestore:indexes   # NUNCA sin --only
```

**Después de desplegar**

1. Comprobar que el panel entra y que `admin/servicios.html` lista y edita.
2. Registrar un cobro de prueba **con un cliente ficticio real de producción** o, mejor, no crear nada: el humo debe ser no destructivo.
3. Confirmar que el sitio público responde 200 y que el formulario sigue devolviendo `saved:true` (no modificar el Worker).

**Reversión**

- Reglas: volver a publicar el respaldo copiado en el paso 1 (`firebase deploy --only firestore:rules`).
- Código: `git revert <commit>` y push. **No** usar `reset --hard` ni force-push.
- Datos: las correcciones no borran ni reescriben datos en masa. Si un cobro se confirmó con la lógica anterior, su efecto quedó registrado en `pagos` y `historial_estados`; se corrige anulándolo con motivo y registrando otro, nunca editando el importe.

---

## 8. Riesgos residuales (conocidos y aceptados)

1. **`roles/datastore.user` a nivel de proyecto** en `kz-leads@konfio-zinc.iam.gserviceaccount.com`. No está limitado a `contactos`. Reducirlo exige una política IAM específica (roles personalizados o condición), que **no se tocó** en esta misión.
2. **Rate limit de Cloudflare KV no atómico:** 5 peticiones/10 min por IP con dedup de 10 min, pero dos peticiones simultáneas pueden pasar ambas. Es mitigación de abuso, no garantía.
3. **La API key web de Firebase es pública** por diseño. Mitigación pendiente: restricción por dominio en Google Cloud Console (fuera de alcance: no se modifican credenciales).
4. **`AIzaSy…` está replicada en 6 archivos** (`contacto.html`, `panel.html`, `firebase-messaging-sw.js`, `config.js`, `firebase-config.js`, `push.js`). Es riesgo de mantenimiento, no de secreto.
5. **La certificación es de emulador.** No se ejercitó el flujo financiero sobre documentos reales de producción. El primer cobro real debe hacerse con acompañamiento y verificando el resultado.
6. **Pagos históricos sin servicio asociado:** si un pago renovable antiguo no tiene `servicioId`, no se puede confirmar. El camino correcto —y el único habilitado— es anularlo con motivo y registrarlo de nuevo eligiendo el servicio. No se reasigna el servicio de un pago porque eso rompería la trazabilidad del dinero.
7. **Clasificación de históricos:** es de un solo uso y exige motivo. No existe reclasificación; si una clasificación fue errónea, el pago se anula y se registra de nuevo.
8. **Clientes sin servicios registrados:** los anteriores a esta misión pueden no tener ningún documento en `servicios` (por el defecto D1). Vencimientos y Dashboard los muestran marcados, pero sus renovaciones no se pueden calcular por servicio hasta que se les añada el servicio correspondiente. **Requiere una revisión manual de los clientes reales** (no ejecutada: implicaría leer datos de producción).
9. **La página Vencimientos solo lista lo que requiere atención** (vencidos, por vencer, sin fecha, inactivos). El inventario completo está en `admin/servicios.html`.
