# CARD en modo Spark · arquitectura sin Cloud Functions

**Decisión del propietario:** el proyecto `konfio-zinc` permanece en el plan gratuito (Spark).
No se activa Blaze, no se despliega `processDueDates` y no se usan servicios de pago.

El código de `functions/` **se conserva como referencia histórica** y no se despliega. El panel
ya no lo necesita: escribe desde el navegador y **la única autoridad son las reglas de Firestore**.

---

## 1. Cómo queda montado

```
Navegador (GitHub Pages)
  ├── Firebase Auth  ─── login por correo y contraseña
  ├── SDK cliente Firestore ── lecturas y escrituras directas
  └── reglas de Firestore ──── autorización real: rol, campos, transiciones
        └── usuarios/{uid}.rol  (o usuarios/{correo} en fichas heredadas)
```

No hay servidor propio. No hay función privilegiada. Cada escritura del panel pasa por las reglas.

## 2. Qué se puede hacer sin backend privilegiado

| Función | Estado | Cómo se garantiza |
|---|---|---|
| Login y roles (OPERADOR/ADMIN/SUPERADMIN) | ✅ | El rol se lee de Firestore en cada regla; el navegador no puede subirse de rol (`usuarios` es de solo lectura) |
| Compatibilidad con fichas heredadas `usuarios/{correo}` | ✅ | Las reglas y el panel prueban uid y, si no hay, correo |
| Clientes: alta, edición, baja lógica | ✅ | OPERADOR edita contacto; ADMIN lo comercial; SUPERADMIN la baja |
| Servicios (1 cliente → N) | ✅ | Cada servicio tiene su estado, su precio y su vigencia; el ciclo de vida es **por servicio** y solo ADMIN+ lo cambia |
| Pagos: registrar, confirmar, anular | ✅ | Importe inmutable; tres transiciones y una sola vez; transacciones en el cliente |
| Idempotencia de pagos | ✅ | Con referencia, el id del documento se deriva de ella: reintentar no duplica |
| Clasificar un pago histórico | ✅ | Una sola vez, con motivo y auditoría; no reclasifica ni toca el importe |
| Contactos: seguimiento comercial | ✅ | OPERADOR gestiona estado, notas e historial; los datos de origen del lead son **inmutables** |
| Convertir un contacto en cliente | ✅ | Acto explícito: crea cliente + primer servicio en un lote y vincula el contacto |
| Planes y estadísticas | ✅ | Catálogo y KPIs calculados en el panel desde los datos reales |
| Historial de estados y auditoría | ✅ | Se crean con el uid propio; no se modifican ni se borran |
| Vencimientos | ✅ (manual) | Página que calcula la obligación de **cada servicio** al abrirse; sin motor programado |
| Avisos a clientes | ⚠️ manual | Se preparan y se envían a mano por WhatsApp; el panel deja registro y marca de enviado |
| Gestión de usuarios (crear, rol, deshabilitar) | ❌ navegador | Exige Admin SDK → herramienta local `herramientas/admin-spark.js` |
| Motor automático de vencimientos (`processDueDates`) | ❌ | Necesita Cloud Functions + Cloud Scheduler (Blaze). No se despliega |
| Notificaciones push (FCM) | ❌ | Enviar FCM requiere servidor o servicio externo de pago |
| Respaldo automático a Cloud Storage | ❌ | Requiere bucket y roles en GCP |

## 3. Lo que no se puede ofrecer igual y su alternativa

1. **Crear cuentas y cambiar roles:** herramienta local con Admin SDK, en el ASUS autorizado,
   simulando primero (`--aplicar --autorizado-por "nombre"` obligatorio).
2. **Avisos automáticos 10/5/3/1 días antes:** no existen. Se sustituyen por la página
   **Vencimientos**, que muestra los casos cuando alguien la abre, y por avisos preparados a mano.
3. **Suspensión automática por vencimiento:** no existe. Suspender es un botón con confirmación;
   reactivar **no extiende** la vigencia (para renovar hay que confirmar un pago).
4. **Push real:** el registro de tokens y el service worker siguen ahí, pero sin servidor no hay
   envío. Los avisos salen por WhatsApp.

## 4. Detalles técnicos que costaron encontrarse (y que hay que respetar)

- **`.exists` no es fiable en el motor de reglas del emulador**: devolvía `false` incluso con el
  documento presente, y con eso denegaba operaciones legítimas. Las reglas comparan campos
  (`data.get('rol','')`) y no preguntan `.exists`. Un documento ausente produce un error que **no**
  tumba la expresión: la rama del correo se evalúa igual (verificado con sondas).
- **Cada `get()` cuenta** para el límite de 10 lecturas por petición. Los helpers de rol se
  escribieron para leer cada ficha una sola vez por rama y se ordenan para cortocircuitar.
- **`orderBy` por un campo ausente EXCLUYE el documento.** Los avisos nuevos usan `preparadaEn`;
  `cargarNotificaciones()` ordena en memoria y admite `preparadaEn` o `fechaEnvio`.
  (KZ-OPS-001: el mismo problema afectaba a `servicios`; `cargarTodosLosServicios()` lee sin
  `orderBy` y ordena en memoria.)
- El **importe** de un pago es inmutable para todos los roles: corregirlo = anular y registrar otro.
- **`'YYYY-MM-DD'` es una fecha de CALENDARIO.** `new Date('2027-10-24')` la interpreta como
  medianoche **UTC**; en Colombia (UTC-5) eso es el día anterior, así que las fechas mostradas y las
  sumas de meses salían **un día antes**. `aFecha()` en `datos.js` y en `escrituras-local.js` añade
  `T00:00:00` para parsearla en local. No volver a usar `new Date(textoFecha)` directamente.
- **Una transacción del SDK web solo lee documentos por REFERENCIA.** `tx.get(query(...))` no está
  soportado y **aborta la transacción entera** (no escribe nada y el error parece de reglas). Las
  consultas necesarias se hacen antes de `runTransaction`.
- **`request.resource.data.keys().hasOnly(...)` es una lista cerrada.** Si el panel escribe una clave
  que no está en la lista, la escritura se deniega entera. Ese fue el origen de que **toda alta de
  servicio fallara** (`createdAt` no estaba en la lista) y de que se guardara el cliente sin servicio.
- **`null` no es `string`.** Un campo opcional que se envía como `null` con una regla `is string`
  hace fallar la creación completa; o se omite la clave o la regla admite `null`.

## 5. Operación

```bash
# estado de identidades (solo lectura)
node herramientas/admin-spark.js --diagnostico

# crear cuenta + ficha vinculada al UID (simula sin --aplicar)
node herramientas/admin-spark.js --crear-cuenta --email … --rol ADMIN --nombre "…" --password "…" \
     --aplicar --autorizado-por "nombre y apellido"

# cambiar rol / deshabilitar / vincular ficha heredada
node herramientas/admin-spark.js --rol --email … --valor OPERADOR --aplicar --autorizado-por "…"
node herramientas/admin-spark.js --deshabilitar --email … --aplicar --autorizado-por "…"
node herramientas/admin-spark.js --vincular --email … --aplicar --autorizado-por "…"
```

La herramienta vive en `herramientas/`, que `_config.yml` **excluye** del sitio público; igual que
`docs/`, `functions/` y la configuración de Firebase.

## 6. Pruebas

Todas se ejecutan contra los emuladores (Auth 9099 · Firestore 8080 · Hosting 5000) con datos
ficticios. **Ninguna toca producción.**

| Suite | Comprobaciones | Qué cubre |
|---|---:|---|
| `herramientas/test/pruebas-spark-reglas-p1.js` | 53 | Identidad, roles, escalamiento, importes, transiciones, doble confirmación, auditoría, avisos, configuración |
| `herramientas/test/pruebas-seguridad-kz-sec-002.js` | 17 | Captación cerrada, validación de campos del lead |
| `herramientas/test/pruebas-captacion-kz-sec-002.js` | 7 | Escritura del Worker vs lectura del panel |
| `herramientas/test/pruebas-pagos-concepto-card-spark-002.js` | 5 | Conceptos y periodos de pago |
| `herramientas/test/pruebas-ops-001-servicios-contactos.js` | 43 | Servicios (alta/edición/estado), contactos (inmutabilidad y seguimiento), clasificación de históricos |
| `herramientas/test/pruebas-spark-panel-p1.js` | 18 | Panel con reglas activas, vencimientos, avisos, móvil, cero peticiones externas |
| `herramientas/test/pruebas-financiero-card-spark-002.js` | 6 | Flujo financiero E2E |
| `herramientas/test/pruebas-ops-001-e2e.js` | 43 | Recorrido operativo completo: lead → cliente → servicios → cobro → renovación → vencimientos → dashboard |

**Total: 192 comprobaciones.**

## 7. Modelo financiero (CARD-SPARK-002)

Los pagos se clasifican por **concepto** y la confirmación aplica solo su efecto; el desarrollo es
pago único (no renueva) y la renovación afecta únicamente al servicio asociado (`servicioId`).
Clientes con varios servicios, migración de históricos sin concepto y despliegue/reversión:
ver **`docs/CARD-SPARK-002-FINANCIERO.md`**.

## 8. Consolidación operativa (KZ-OPS-001)

El flujo completo —captación, seguimiento comercial, conversión a cliente, servicios múltiples,
cobros por concepto, renovaciones por servicio, vencimientos y dashboard— queda documentado, con los
defectos corregidos y el procedimiento de despliegue y reversión, en
**`docs/KZ-OPS-001-CONSOLIDACION.md`**.
