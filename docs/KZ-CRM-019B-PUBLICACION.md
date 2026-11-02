# KZ-CRM-019B · Publicación ejecutada

**Fecha:** 2 de noviembre de 2026
**Autorización:** Darwin aprobó publicar los ajustes móviles.
**Alcance:** sólo el panel (`crm/`). **No se tocan reglas de Firestore, datos, cuentas ni Cloud Functions.**

---

## 1. Qué se publicó

| Dato | Valor |
|---|---|
| Commits publicados | `7378cac` (los ajustes) y `c7ee88e` (base, ya en línea) |
| Método | fast-forward de `main` (`c7ee88e` → `7378cac`) y `git push origin main` |
| Remoto | `git@github.com:konfiozinc/card.git` (SSH) |
| Punto de recuperación | tag **`release/previo-kz-crm-019b`** → `c7ee88e` |
| URL | https://konfiozinc.github.io/card/crm/ |

Archivos publicados:

| Archivo | Estado |
|---|---|
| `crm/index.html` | chip de cuenta, contenedor de tarjetas, textos de filtro y buscador |
| `crm/crm.css` | tarjetas, chip, encabezado de dos filas, filtros compactos |
| `crm/crm-ui.js` | tarjetas, apertura de ficha, chip, encuadre, aviso de bienvenida |
| `crm/crm.js` | **sin cambios** |
| `crm/alta-prospecto.js` | **sin cambios** |

`crm-dev/` **no se publicó** (sigue fuera de git, como estaba previsto).

---

## 2. Propagación

El panel nuevo apareció en el **cuarto intento (~45–60 s)**: `index.html` de 15.967 B → **17.132 B**, ya con `lista-tarjetas` y `chip-cuenta` en el HTML servido.

## 3. Contenido idéntico al probado

Comparación SHA-256 con finales de línea normalizados a LF:

| Archivo | Resultado |
|---|---|
| `crm/index.html` | **idéntico** (17.132 B) |
| `crm/crm.css` | **idéntico** (31.791 B) |
| `crm/crm-ui.js` | **idéntico** (18.320 B) |
| `crm/crm.js` | **idéntico** (38.246 B) — la lógica no cambió |

## 4. Prueba de humo contra el sitio publicado

`PASS 33 · FALLA 0` en 1440×900, 390×844 y **320×640**:

| Comprobación | Resultado |
|---|---|
| Responde 200 | ✅ |
| Paleta oficial cargada (`#00E5FF`) | ✅ |
| El contenedor de tarjetas está publicado | ✅ |
| El chip de cuenta existe y **no** se muestra sin sesión | ✅ |
| La navegación no aparece sin sesión | ✅ |
| Sólo la cartera a la vista | ✅ |
| El filtro dice «Todos» | ✅ |
| El buscador dice «Buscar nombre o teléfono» | ✅ |
| Sin desbordamiento horizontal | ✅ 0 px |
| `crm.js` y `crm-ui.js` cargan; base `default` | ✅ |
| Sin errores de consola | ✅ |

Las pruebas **con sesión** (tarjetas, chip abierto, apertura de ficha, filtros) se ejecutaron contra el emulador con el mismo código y quedaron en **192 PASS · 0 FALLA**, y la regresión funcional en **794 PASS · 0 FALLA**.

---

## 5. Lo que NO se ejecutó

- No se desplegaron reglas de Firestore (`crm-dev/firestore.rules` sigue con el mismo hash `6b221832…`).
- No se modificó ningún documento, colección ni cuenta.
- No se creó ni modificó ningún usuario ni rol.

## 6. Pendiente (para el dueño)

**Abrirlo en tu celular real** y comprobar: la cartera como tarjetas, el chip de cuenta con el correo completo, y que el encabezado se siente más liviano. Es la prueba que yo no puedo hacer.

## 7. Cómo revertir

```bash
# Opción A — volver exactamente al estado anterior
git reset --hard release/previo-kz-crm-019b
git push --force-with-lease origin main

# Opción B — dejar constancia en la historia (recomendada)
git revert --no-edit 7378cac
git push origin main
```

Es sólo presentación: no hay datos ni estado que migrar.
