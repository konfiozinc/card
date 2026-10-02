# Slugs obsoletos — Mapa de correcciones

> Auditoría preventiva de URLs del sitio KONFÍO ZINC (`konfiozinc/card`).
> **Regla:** cuando renombres un repo en GitHub, actualiza las referencias el mismo día.

## Tabla de correcciones

| Slug obsoleto (viejo) | Slug correcto (actual) | Estado |
|---|---|---|
| `nandy_nails` | `nandy-nails` | ✅ Corregido |
| `makeup_artist` | `make-up` | ✅ Corregido |
| `nbccompany` | `nbc-company` | ✅ Corregido |
| `gruas_gyr_arias` | — (repo reutilizado como `samem`) | ❌ Eliminado del sitio |
| `restaurante_restobar` | `eltiti` | ✅ Reemplazado |
| `ali-binary-opcion` | `ali` | ⚠️ Solo en docs locales (gitignored) |
| `abogadofabianrinconcast` | `abogados-dta` (probable) | ⚠️ Solo en respaldos Firestore |

## Notas

- **Duplicados históricos** (ambos repos existían; el de guion medio es el vigente):
  - `nandy-nails` / `nandy_nails` → usar **`nandy-nails`**
  - `nbc-company` / `nbccompany` → usar **`nbc-company`**
  - `make-up` / `makeup_artist` → usar **`make-up`**
- **`gruas_gyr_arias`**: el repo fue reutilizado (hoy redirige a `samem`, sin relación con grúas). Se eliminó del sitio (galería de casos + chatbot).
- **`restaurante_restobar`**: repo inexistente (404). En el blog se reemplazó por el menú real de **El Titi** (`eltiti`).
- **Archivos gitignored** (`.md`/`.txt` de WhatsApp y respaldos `herramientas/`) pueden contener slugs viejos; no se despliegan, pero conviene limpiarlos.

## Checklist al renombrar un repo

- [ ] Renombrar en GitHub
- [ ] Actualizar `remote` local (`git remote set-url origin …`)
- [ ] Buscar referencias en TODOS los sitios (`grep -r "slug-viejo"`)
- [ ] Actualizar JSON-LD
- [ ] Actualizar documentación
- [ ] Commit + push

## Fecha

Auditoría realizada: 2026-10-01
