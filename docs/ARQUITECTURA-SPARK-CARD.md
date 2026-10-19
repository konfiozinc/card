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
| Servicios | ✅ | Se crean y actualizan; no se borran |
| Pagos: registrar, confirmar, anular | ✅ | Importe inmutable; tres transiciones y una sola vez; transacciones en el cliente |
| Idempotencia de pagos | ✅ | Con referencia, el id del documento se deriva de ella: reintentar no duplica |
| Planes y estadísticas | ✅ | Catálogo y KPIs calculados en el panel |
| Historial de estados y auditoría | ✅ | Se crean con el uid propio; no se modifican ni se borran |
| Vencimientos | ✅ (manual) | Página que calcula los casos al abrirse; sin motor programado |
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
- El **importe** de un pago es inmutable para todos los roles: corregirlo = anular y registrar otro.

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

- `herramientas/test/pruebas-spark-reglas-p1.js` — 46 comprobaciones de reglas (identidad, roles,
  escalamiento, importes, transiciones, doble confirmación, auditoría, avisos, configuración).
- `herramientas/test/pruebas-spark-panel-p1.js` — 18 comprobaciones de panel con reglas activas
  (login, listas, vencimientos, aviso preparado, suspender/reactivar, usuarios solo lectura, móvil,
  cero peticiones externas).
