# Herramientas del sitio KONFÍO ZINC

Scripts locales de mantenimiento. No forman parte del sitio público; se ejecutan
desde esta carpeta con Node.js.

## Migración de proyectos a Firestore (`migrar-proyectos.js`)

Importa los proyectos de clientes ya publicados en GitHub Pages a la colección
`clientes` de Firestore, extrayendo la información automáticamente.

### Qué hace
- Escanea las carpetas de proyectos del workspace (`1-TARJETAS-START`,
  `2-TARJETAS-PRO`, `3-TARJETAS-ELITE`, `4-TARJETAS-PREMIUM`, `6-LANDING-PAGES`,
  `7-CATALOGOS`, `8-MENUS-DIGITALES`, `9-AGENTES-IA`, `10-CODIGOS-QR`).
- Extrae de cada `index.html`: título, `<h1>`, meta description, `og:image`,
  `canonical`/`og:url` (la URL pública real), y determina servicio + categoría
  según la carpeta.
- Deja los campos manuales (precio, fecha de activación real, vencimiento,
  teléfono, email, ciudad) en `null` o `"PENDIENTE"` con estado
  `PENDIENTE_CONFIGURACION`.
- **Idempotente**: si ya existe un cliente con la misma `urlServicio`, lo salta
  (no sobrescribe ni duplica).

### Requisitos
- Node.js.
- `firebase-admin` disponible. Se resuelve automáticamente desde
  `functions/node_modules/firebase-admin`; si no existe, instálalo:
  ```bash
  cd herramientas && npm install firebase-admin
  ```
- La credencial de servicio en
  `14-HERRAMIENTAS-DESARROLLO/.secrets/serviceAccount.json` (o pásala con
  `--service-account <ruta>` / variable `KZ_SERVICE_ACCOUNT`).

### Cómo ejecutarlo
```bash
# 1) Vista previa (NO escribe nada) — recomendado primero
node herramientas/migrar-proyectos.js

# 2) Importar de verdad (pide confirmación antes de escribir)
node herramientas/migrar-proyectos.js --ejecutar

# 3) Importar sin pedir confirmación (solo en procesos conocidos)
node herramientas/migrar-proyectos.js --ejecutar --si
```

Opciones: `--root <ruta>` (workspace, por defecto
`C:/Users/usuario29/Documents/KONFIO_ZINC`), `--service-account <ruta>`.

### Cómo revisar el reporte
El script genera dos archivos (ignorados por git):
- `herramientas/reporte_importacion.csv` — abrir en Excel/Sheets.
- `herramientas/reporte_importacion.json` — para máquinas.

Columnas: Nombre, Cliente, Servicio, Categoría, URL, Fecha creación, Estado, Acción
(`Creado`, `Ya existía`, `Error`, `Simulado`). La URL marcada como
"aproximada" significa que el proyecto no tenía `canonical`/`og:url` y se derivó
del nombre de la carpeta; revísala antes de dar por buena la importación.

### Cómo completar los datos manuales desde el panel
1. Entra a https://konfiozinc.github.io/card/admin/clientes.html
2. Verás los proyectos importados con el badge **"Pendiente de configuración"**
   (cian).
3. Edita cada uno y completa: fecha de activación real, vencimiento, precio,
   método de pago, email, teléfono, ciudad y categoría (si es tarjeta).
4. Cambia el estado a "activo".

### Cómo evitar duplicados al ejecutar de nuevo
El script consulta Firestore por `urlServicio` antes de crear: si ya existe, lo
reporta como "Ya existía" y no lo toca. Puedes ejecutarlo las veces que quieras
sin riesgo de duplicados.
