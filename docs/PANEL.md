# Panel de administración · Documentación

> Documentación del panel multipágina de KONFÍO ZINC (adaptada del patrón de UneFibra).
> La fuente de autoridad del esquema es `firestore.rules` (seguridad) y `functions/src/index.js`
> (lógica). Este documento es la referencia legible para operar el panel.

## 1. Modelo de datos (resumen)

El panel usa Firestore. Colecciones:

| Colección | Propósito | ID |
|---|---|---|
| `usuarios` | Administradores del panel | UID de Firebase Auth |
| `clientes` | Clientes de la agencia | autogenerado |
| `servicios` | Instancia contractual por cliente (1 cliente → N servicios) | autogenerado |
| `pagos` | Pagos (PENDIENTE → CONFIRMADO/ANULADO) | autogenerado |
| `planes` | Catálogo de paquetes KZ | autogenerado |
| `notificaciones` | Avisos de vencimiento | `clienteId_periodo_tipo` (dedup) |
| `tokens_notificacion` | Dispositivos para push | el propio token |
| `historial_estados` | Trazabilidad de cambios de estado | autogenerado |
| `auditoria` | Quién hizo qué | autogenerado |
| `configuracion` | Ajustes clave/valor | la clave |

**Campos de `clientes`** (los relevantes): `nombre`, `empresa`, `documento`, `telefono`,
`whatsapp`, `email`, `ciudad`, `servicio` (uno de los 6), `categoria` (STAR/PRO/ELITE, solo
tarjetas), `planId`, `precio`, `metodoPagoPreferido`, `fechaActivacion`, `fechaVencimiento`,
`estadoCliente`, `estadoServicio`, `urlServicio`, `proyectoId`, `observaciones`, `activo`.

**Reglas que no se rompen:**
- Los clientes **no se eliminan**: `INACTIVO` conserva historial.
- `confirmarPago` **suma 12 meses** al vencimiento y **reinicia avisos** del nuevo ciclo.
- Un aviso no se envía dos veces para el mismo cliente+periodo+tipo (dedup por ID).
- Avisos automáticos: **10, 5, 3 y 1 día** antes + aviso de vencido. Tras 5 días de gracia → SUSPENDIDO.
- Todo cambio de estado va a `historial_estados`; toda escritura va a `auditoria`.

## 2. Despliegue

1. Crear proyecto en Firebase Console y registrar la app web.
2. `node herramientas/configurar-firebase.js` (pega la config en `firebase-config-temp.json`).
   Esto inyecta la config en `assets/js/config.js`, `assets/js/firebase-config.js` y
   `firebase-messaging-sw.js`, activa `firebase.habilitado: true` y crea `.firebaserc`.
3. Authentication → habilitar Email/Password y **autorizar el dominio** `konfiozinc.github.io`.
4. Firestore → crear en modo producción.
5. `firebase deploy --only firestore:rules,firestore:indexes`.
6. `cd functions && npm install && cd ..` → `firebase deploy --only functions`.
   ⚠️ Las funciones programadas requieren **plan Blaze**; sin él el panel funciona pero no hay avisos automáticos.
7. **Primer SUPERADMIN:** Authentication → Add user → luego crear `usuarios/{UID}` con
   `{"uid":"UID","nombre":"Admin","email":"…","rol":"SUPERADMIN","activo":true}`.
8. Desde el panel → Planes → **Cargar catálogo inicial** (o llama a `seedInicial`).
9. Notificaciones push: Messaging → VAPID → pegar en `assets/js/config.js` y re-deploy del sitio.
10. GitHub Pages publica `/admin/` automáticamente (sin servidor propio).

Verificación rápida: `node herramientas/verificar-firebase.js`.

## 3. Plan de pruebas mínimo (ejecutar antes de producción)

1. Login con SUPERADMIN, ADMIN y OPERADOR; verificar menú distinto por rol.
2. OPERADOR intenta confirmar un pago → debe recibir "permiso denegado" (la función lo rechaza).
3. Crear cliente → duplicar documento → debe rechazar. Duplicar teléfono → rechazar.
4. Registrar pago → confirmar → el vencimiento avanza 12 meses y los avisos se reinician.
5. Ejecutar `processDueDates` dos veces el mismo día → no debe duplicar avisos (dedup).
6. SUPERADMIN intenta desactivarse a sí mismo → debe rechazar.
7. Exportar CSV de clientes → abre en Excel con acentos correctos.
8. Desactivar cliente → aparece INACTIVO con su historial intacto.

## 4. Canal de notificaciones

- Motor: `processDueDates`, programado a las 8:00 a.m. (America/Bogota).
- Push web: colección `tokens_notificacion`; un cliente puede tener varios dispositivos.
- Para avisar también por **WhatsApp** se requieren plantillas aprobadas en Meta
  (`aviso_vencimiento_10d`, `_5d`, `_3d`, `_1d`). Guía completa: `WHATSAPP_BUSINESS.md`.
