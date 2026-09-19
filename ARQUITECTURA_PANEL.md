# ARQUITECTURA DEL PANEL · KONFÍO ZINC

> **Fuente única de verdad del modelo de datos y del contrato de módulos.**
> Adaptado de la implementación que ya funciona en `unefibras/`, con el modelo de negocio de
> KONFÍO ZINC: 6 servicios, planes Star/Pro/Elite y **suscripción de 12 meses**.
>
> Si algo contradice este documento, manda este. Documento interno (`.gitignore`).

---

## 1. Qué se tomó de UneFibra y qué cambió

| Pieza de UneFibra | En KONFÍO ZINC | Por qué |
|---|---|---|
| App de administración **multipágina** en `/admin/` | Igual | Un archivo por sección: más mantenible que un `admin.html` de 20 KB |
| `shell.js` con sidebar + guard de auth y **roles** | Igual | El rol vive en Firestore, nunca en el frontend |
| `core.js` con `isConfigured()` y aviso honesto | Igual | Si Firebase no está configurado, se explica en vez de romperse |
| **importmap** con imports desnudos (`firebase/app`) | Igual | Mejor que URLs de CDN repetidas en cada archivo |
| Auditoría de todas las acciones | Igual | Trazabilidad de quién cambió qué |
| Clientes **nunca se eliminan** (estado INACTIVO) | Igual | Conserva historial y permite reactivar |
| Anti-duplicado de notificaciones (`claveDedup`) | Igual | Evita mandar el mismo aviso dos veces |
| `tokens_notificacion` en colección aparte | Igual | Un cliente puede tener varios dispositivos |
| `configuracion` clave/valor | Igual | Ajustes sin tocar código |
| Estado de servicio por **velocidad** (Mbps) | **Planes Star/Pro/Elite** | El producto es una tarjeta, no ancho de banda |
| `solicitudes_contacto` desde el sitio | **Se omite** | El sitio ya tiene Formspree + WhatsApp; el panel registra clientes cerrados |
| `planes` como catálogo de velocidades | `planes` = los 4 paquetes KZ (Inicio, Negocio, Profesional, Premium) | Mismo concepto, otro catálogo |

---

## 2. Roles y permisos

El rol se lee **siempre** de `usuarios/{uid}.rol` en Firestore. El frontend solo lo usa para pintar
el menú; la autoridad real son las reglas y las Cloud Functions.

| Nivel | Rol | Puede |
|---|---|---|
| 1 | `OPERADOR` | Ver dashboard, clientes, servicios, pagos, notificaciones. Crear clientes y registrar pagos |
| 2 | `ADMIN` | Todo lo del operador + **confirmar/anular pagos**, crear y editar planes, enviar notificaciones |
| 3 | `SUPERADMIN` | Todo + configuración, usuarios y auditoría |

`activo: false` en `usuarios/{uid}` cierra la sesión automáticamente.

---

## 3. Colecciones

Convenciones: los IDs son autogenerados por Firestore salvo `usuarios` (UID de Auth),
`configuracion` (clave) y `notificaciones` (clave de deduplicación).
Las fechas de negocio van como string `YYYY-MM-DD`; `createdAt`/`updatedAt` con `serverTimestamp()`.

### `usuarios` — administradores
| Campo | Tipo | Notas |
|---|---|---|
| uid | string | ID del documento = UID de Firebase Auth |
| nombre | string | |
| email | string | |
| rol | string | `OPERADOR` \| `ADMIN` \| `SUPERADMIN` |
| activo | boolean | |
| ultimoAcceso | timestamp \| null | |
| createdAt / updatedAt | timestamp | |

### `clientes`
| Campo | Tipo | Notas |
|---|---|---|
| nombre | string | obligatorio |
| empresa | string | nombre del negocio |
| documento | string \| null | cédula o NIT; criterio anti-duplicado |
| telefono | string | obligatorio |
| whatsapp | string | |
| email | string | |
| ciudad | string | |
| **servicio** | string | uno de los 6: Tarjetas Digitales, Catálogos Digitales, Menús Digitales, Landing Pages, Códigos QR, Agentes IA |
| **categoria** | string \| null | `STAR` \| `PRO` \| `ELITE` (solo Tarjetas Digitales) |
| planId | string \| null | ref → `planes` (paquete KZ, si aplica) |
| planNombre | string \| null | denormalizado |
| precio | number | valor pagado por el periodo |
| metodoPagoPreferido | string | Nequi, Daviplata, Transferencia, Efectivo |
| fechaActivacion | string | `YYYY-MM-DD` |
| fechaVencimiento | string | `fechaActivacion` + 12 meses |
| estadoCliente | string | `ACTIVO` \| `POR_VENCER` \| `PENDIENTE_PAGO` \| `SUSPENDIDO` \| `INACTIVO` |
| estadoServicio | string | `ACTIVO` \| `POR_VENCER` \| `SUSPENDIDO` \| `INACTIVO` |
| urlServicio | string \| null | enlace público entregado al cliente (tarjeta, menú, landing…) |
| proyectoId | string \| null | repo de GitHub Pages del cliente, si aplica |
| observaciones | string | |
| activo | boolean | |
| createdAt / updatedAt | timestamp | |

> **Los clientes no se eliminan nunca.** `estadoCliente = INACTIVO` conserva el historial.
> La única acción de borrado real es `borrarDemo`, restringida a SUPERADMIN y a registros
> marcados como demo.

### `planes` — paquetes y productos (catálogo)
| Campo | Tipo | Notas |
|---|---|---|
| nombre | string | Star, Pro, Elite, o un servicio suelto |
| descripcion | string | |
| servicio | string | servicio principal que incluye |
| categoria | string \| null | STAR/PRO/ELITE si es tarjeta |
| precio | number | COP |
| duracionMeses | number | **12** por defecto |
| incluye | array\<string\> | lista de lo que trae |
| estado | string | `ACTIVO` \| `INACTIVO` |
| orden | number | |
| createdAt / updatedAt | timestamp | |

### `servicios` — instancia contractual por cliente
| Campo | Tipo | Notas |
|---|---|---|
| clienteId | string | ref → `clientes` |
| planId | string \| null | ref → `planes` |
| servicio | string | denormalizado |
| categoria | string \| null | |
| fechaInicio | string | |
| fechaVencimiento | string | |
| precio | number | |
| estado | string | `ACTIVO` \| `POR_VENCER` \| `SUSPENDIDO` \| `INACTIVO` |
| fechaSuspension | string \| null | |
| fechaReactivacion | string \| null | |
| motivoSuspension | string \| null | |
| urlServicio | string \| null | |
| createdAt / updatedAt | timestamp | |

### `pagos`
| Campo | Tipo | Notas |
|---|---|---|
| clienteId | string | ref → `clientes` |
| servicioId | string \| null | ref → `servicios` |
| monto | number | |
| metodoPago | string | |
| fechaPago | string | |
| periodoInicio / periodoFin | string | lo define `confirmarPago` (+12 meses) |
| referencia | string \| null | número de transacción |
| comprobanteUrl | string \| null | |
| estado | string | `PENDIENTE` \| `CONFIRMADO` \| `RECHAZADO` \| `ANULADO` |
| registradoPor | string | uid |
| confirmadoPor | string \| null | uid |
| createdAt | timestamp | |

### `notificaciones`
| Campo | Tipo | Notas |
|---|---|---|
| clienteId | string | |
| servicioId | string \| null | |
| tipo | string | `VENCIMIENTO_10D` \| `VENCIMIENTO_5D` \| `VENCIMIENTO_3D` \| `VENCIMIENTO_1D` \| `VENCIDO` \| `MANUAL` |
| titulo / mensaje | string | |
| fechaProgramada / fechaEnvio | timestamp | |
| estado | string | `PENDIENTE` \| `ENVIADA` \| `ERROR` \| `CANCELADA` |
| periodoServicio | string \| null | el `fechaVencimiento` que se está avisando |
| canal | string | `PUSH` \| `WHATSAPP` \| `EMAIL` |
| error | string \| null | |
| **claveDedup** | string | `clienteId_periodo_tipo` — **es el ID del documento** |

### `tokens_notificacion`
| Campo | Tipo |
|---|---|
| clienteId | string |
| token | string |
| plataforma | string |
| navegador | string |
| activo | boolean |
| fechaRegistro / ultimaActividad | timestamp |

### `historial_estados`
| Campo | Tipo |
|---|---|
| clienteId | string |
| estadoAnterior / estadoNuevo | string |
| motivo | string |
| fecha | timestamp |
| usuarioId / usuarioNombre | string |

### `auditoria`
| Campo | Tipo |
|---|---|
| usuarioId / usuarioNombre | string |
| accion | string (`CREAR_CLIENTE`, `REGISTRAR_PAGO`, `CONFIRMAR_PAGO`, …) |
| entidad / entidadId | string |
| datosAnteriores / datosNuevos | map \| null |
| fecha | timestamp |

### `configuracion` — clave/valor
| clave | valor por defecto | descripción |
|---|---|---|
| `diasAntes` | `[10, 5, 3, 1]` | días de aviso antes del vencimiento |
| `diasPorVencer` | `15` | umbral para marcar `POR_VENCER` |
| `diasGracia` | `5` | días tras el vencimiento antes de suspender |
| `mesesSuscripcion` | `12` | duración de la suscripción |
| `destinoVencido` | `contacto.html` | página a la que lleva la notificación |

---

## 4. Máquina de estados

```
                    +12 meses (confirmarPago)
        ┌──────────────────────────────────────────┐
        ▼                                          │
   [ACTIVO] ──≤15 días──▶ [POR_VENCER] ──vence──▶ [PENDIENTE_PAGO]
        ▲                      │                        │
        │                      │                        │ +diasGracia
        │   confirmarPago      │                        ▼
        └──────────────────────┴──────────────────[SUSPENDIDO]
                                                        │
                              desactivarServicio        │ reactivarServicio
                                    ▼                   ▼
                               [INACTIVO] ──────────▶ [ACTIVO]
```

Transiciones permitidas y quién puede ejecutarlas:

| Acción | De → A | Mínimo |
|---|---|---|
| `confirmarPago` | PENDIENTE_PAGO / POR_VENCER → ACTIVO | ADMIN |
| `suspenderServicio` | PENDIENTE_PAGO → SUSPENDIDO | ADMIN |
| `reactivarServicio` | SUSPENDIDO / INACTIVO → ACTIVO | ADMIN |
| `desactivarServicio` | cualquiera → INACTIVO | ADMIN |
| `processDueDates` (automática) | ACTIVO → POR_VENCER → PENDIENTE_PAGO | sistema |

---

## 5. Contrato de módulos (para que todo encaje)

### `assets/js/config.js` — configuración global (script clásico, no módulo)
Expone `window.KZ_CONFIG`:

```javascript
window.KZ_CONFIG = {
  marca: {
    nombre: "KONFÍO ZINC",
    tagline: "Soluciones digitales para negocios",
    email: "konfiozinc@gmail.com",
    whatsapp: "+573206411340",
    sitio: "https://konfiozinc.github.io/card/",
    redes: { instagram: "…", tiktok: "…", facebook: "…" }
  },
  servicios: [ /* los 6, con slug, etiqueta, icono y precioDesde */ ],
  categoriasTarjeta: ["STAR", "PRO", "ELITE"],
  metodosPago: ["Nequi", "Daviplata", "Transferencia", "Efectivo"],
  estadosCliente: [...], estadosServicio: [...], estadosPago: [...],
  firebase: { habilitado: false, config: { apiKey: "…", … } },
  agentes: { workerUrl: "…" }
};
```

### `assets/js/admin/core.js` — núcleo Firebase (módulo ES)
Exporta: `app`, `auth`, `db`, `functions`, `isConfigured()`, `MENSAJE_NO_CONFIGURADO`.

### `assets/js/admin/shell.js` — sidebar y guard
Exporta: `requireAuth(activeKey)` → `Promise<{uid, rol, nombre, email} | null>`, `canAccess(rol, min)`.
NAV: dashboard, clientes, servicios, pagos, planes, notificaciones, configuracion, usuarios, auditoria.

### `assets/js/admin/ui.js` — utilidades de interfaz
Exporta: `fmtCOP(n)`, `fmtFecha(str)`, `badgeEstado(estado)`, `toast(msg, tipo)`, `confirmar(msg)`,
`tablaHTML(...)`, `descargarCSV(nombre, filas, columnas)`, `setTitulo(t)`.

### `assets/js/admin/callables.js` — invocación de Cloud Functions
Exporta una función por callable: `crearCliente`, `registrarPago`, `confirmarPago`, `anularPago`,
`activarServicio`, `suspenderServicio`, `desactivarServicio`, `reactivarServicio`, `enviarNotificacion`,
`crearUsuario`, `actualizarUsuario`. Todas `async`, lanzan `Error` con mensaje legible.

### `admin/*.js` — una página cada uno
Cada página: `<div id="app-shell"></div>`, llama a `requireAuth("<clave>")` y pinta en `#app-content`.

---

## 6. Reglas de negocio que NO se pueden romper

1. **Un cliente no se elimina nunca** (salvo demo y por SUPERADMIN).
2. **El pago lo confirma un ADMIN**, nunca un OPERADOR. Registrar ≠ confirmar.
3. `confirmarPago` **suma 12 meses** al vencimiento y **reinicia el historial de avisos** del nuevo ciclo.
4. Una notificación **nunca se envía dos veces** para el mismo cliente, periodo y tipo (`claveDedup`).
5. Los avisos automáticos son a **10, 5, 3 y 1 día** antes del vencimiento, más el aviso de vencido.
6. Todo cambio de estado queda en `historial_estados`, y toda acción en `auditoria`.
7. Los precios en la base son los **públicos**: Star $49.900 · Pro $99.900 · Elite $149.900 · etc.
   Las condiciones de aliado viven en `PROGRAMA_ALIADOS.md` y **no** se cargan aquí.
