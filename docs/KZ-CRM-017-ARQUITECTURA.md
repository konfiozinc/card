# KZ-CRM-017 · Arquitectura del CRM publicado

**Fecha:** 2-nov-2026 · **URL:** https://konfiozinc.github.io/card/crm/
**Proyecto Firebase:** `kzfio-crm` · **Base Firestore:** `default` (literal) · **Plan:** Spark

---

## 1. Decisión estructural: lo público y lo interno viven en carpetas distintas

El sitio se publica con GitHub Pages, que sirve la **raíz del repositorio** filtrada por
`_config.yml`. Por tanto **todo lo que esté en la ruta publicada es público**. Con esa
restricción, mezclar el panel con los scripts de administración habría publicado
`activar-admin.cjs`, el correo del administrador y los scripts de despliegue.

```
6-LANDING-PAGES/Konfio-Zinc-Web/
├── crm/                    ← SE PUBLICA (4 archivos, nada más)
│   ├── index.html          · pantalla de acceso + panel
│   ├── crm.js              · lógica del panel (Auth + Firestore)
│   ├── crm.css             · estilos sobre la paleta oficial
│   └── alta-prospecto.js   · validación y alta de prospecto
│
└── crm-dev/                ← NO SE PUBLICA (excluido en _config.yml)
    ├── firestore.rules             · reglas de producción
    ├── firestore.rules.emulador    · generado desde las de producción
    ├── firestore.rules.captacion   · modo captación, NO desplegado
    ├── emulador*.json              · configuración de emuladores
    ├── activar-admin.cjs           · alta del administrador
    ├── desplegar-reglas.cjs        · despliegue de reglas
    ├── certificar-produccion.cjs   · verificación de acceso anónimo
    ├── verificar-operacion.cjs     · auditoría de datos
    ├── pruebas*.cjs                · suites de prueba
    └── capturas/                   · evidencias visuales
```

Doble cierre: `crm-dev` está excluido en `_config.yml` **y** los archivos internos no viajan
en el commit de `main`. Si alguien borrase la exclusión, seguiría sin servir nada porque la
rama publicada tampoco los contiene.

## 2. Cómo habla el panel con Firebase

```
Navegador (konfiozinc.github.io)
   │  apiKey pública + appId  (config del SDK, sin secretos)
   ├─► Firebase Auth   kzfio-crm  → sesión persistente (browserLocalPersistence)
   └─► Firestore       kzfio-crm / base «default»
              └── crm_leads · crm_quotes · crm_sales · crm_audit · crm_usuarios
                     ▲
                     └── las reglas deciden TODO: rol leído de crm_usuarios/{uid}
```

- **Sin emulador en producción:** el panel publicado no contiene ni una línea de
  `connectAuthEmulator` / `connectFirestoreEmulator`. Se eliminó la rama completa; no queda
  una ruta inerte que active el emulador por un parámetro de URL.
- **Base explícita:** `getFirestore(app, "default")`. El proyecto **no** usa la base por
  omisión `(default)`, y omitir el identificador fue justo el fallo que impidió el primer
  acceso (KZ-CRM-016-FIX-BASE-DATOS.md).
- **Sin credenciales privilegiadas:** sólo viaja la configuración pública del SDK. La
  administración se hace por scripts en `crm-dev/`, con la sesión de `firebase login`.

## 3. Autorización: el rol vive en el servidor, no en la interfaz

| Capa | Qué hace | Qué NO puede hacer |
|---|---|---|
| Interfaz (`crm.js`) | Oculta bloques según el rol | No es la frontera de seguridad: es comodidad |
| Reglas de Firestore | Decide cada lectura y escritura con `crm_usuarios/{uid}` | — |
| crm_usuarios | Sólo lo escribe un procedimiento privilegiado | El navegador **no** puede crear ni cambiar roles, ni siendo admin |

Modificar `window.CRM.sesion.rol` en la consola del navegador cambia lo que se ve, pero no
un solo permiso real: el servidor vuelve a consultar la ficha en cada operación.

## 4. Flujo comercial y sus invariantes

```
alta de prospecto → seguimiento → cotización → venta confirmada → estadísticas
```

| Invariante | Dónde se garantiza |
|---|---|
| Un prospecto por teléfono | el id del documento **es** el teléfono |
| Una venta por cotización | el id del documento de venta **es** el id de la cotización |
| Importe de venta = importe de cotización | regla (salvo «a medida»: entero positivo) |
| Toda venta cita cotización existente, del mismo prospecto, en estado enviada/aceptada | regla con `get()` |
| Venta + estado «ganado» juntos o ninguno | `writeBatch` en el cliente |
| Auditoría no falsificable | autor y rol comparados contra la ficha real |
| Consentimiento y retención inmutables | regla: no se pueden cambiar ni borrar |

## 5. Persistencia y cierre de sesión

- `browserLocalPersistence`: al recargar o volver en otro momento, la sesión continúa.
- El cierre es **voluntario** (botón Salir) y ahora **limpia de verdad**: vacía `leads`,
  las tablas, el detalle, el historial mostrado, el campo de contraseña y el estado en
  memoria. Ocultar el panel no era suficiente.

## 6. Identidad visual

`crm/index.html` enlaza `assets/css/kz-tokens.css`, la **fuente única de la paleta oficial**
Neo Tech (cian `#00E5FF`, violeta `#8B5CF6`, fondos `#050B14`/`#101C35`). `crm.css` no declara
ni un color de identidad: sólo referencia variables, con respaldo literal por si el archivo
de tokens no cargara.

## 7. Límites conocidos de esta arquitectura

| Límite | Motivo | Consecuencia |
|---|---|---|
| Sin captación pública | prohibición vigente | el formulario vive en `crm-dev/`, no se publica |
| Un solo usuario | no se autorizan cuentas nuevas | el CRM es de uso individual hasta que se autoricen más |
| Sin rate limiting por IP | requiere Blaze | la superficie pública es sólo un formulario de acceso autenticado |
| Retención sin automatismo | Spark no tiene procesos programados | revisión manual con `retencion-vencida.cjs` |
| Datos en `nam5` (EE. UU.) | configuración de la base | decisión del negocio antes de datos reales |
