# KZ-CRM-019 · Publicación ejecutada

**Fecha:** 2 de noviembre de 2026
**Autorización:** Darwin aprobó publicar el rediseño (opción «Aprobar y publicar»).
**Alcance:** sólo el panel. **No se tocan reglas de Firestore, datos, cuentas ni Cloud Functions.**

---

## 1. Qué se publicó

| Dato | Valor |
|---|---|
| Commit publicado | `9ddfe59` — «feat: rediseno del panel del CRM con areas, cartera y ficha (kz-crm-019)» |
| Método | fast-forward de `main` (`729e610` → `9ddfe59`), luego `git push origin main` |
| Remoto | `git@github.com:konfiozinc/card.git` (SSH) |
| Punto de recuperación | tag **`release/previo-kz-crm-019`** → `729e610` |
| URL | https://konfiozinc.github.io/card/crm/ |

Archivos publicados:

| Archivo | Estado |
|---|---|
| `crm/index.html` | rediseñado (15.967 B en destino) |
| `crm/crm.css` | reescrito (25.340 B) |
| `crm/crm-ui.js` | **nuevo** (9.593 B) |
| `crm/crm.js` | **sin cambios** (idéntico al anterior) |
| `crm/alta-prospecto.js` | **sin cambios** |

`crm-dev/` **no se publicó** (sigue fuera de git, como estaba previsto).

---

## 2. Verificación de la propagación

- El HTML nuevo apareció en el tercer intento (~45 s), con `crm-ui.js` y `kz-tokens.css` referenciados.
- **Contenido idéntico** al local en los cuatro archivos (comparación SHA-256 con finales de línea normalizados a LF).
- La diferencia de tamaño observada (−798 / −631 / −208 / −329 B) es **exactamente 1 byte por línea** (736 / 586 / 180 / 299 líneas): CRLF en el árbol de trabajo local frente a LF en el repositorio. No es una diferencia de contenido.
- `https://konfiozinc.github.io/card/assets/css/kz-tokens.css` → **HTTP 200**, así que la paleta oficial carga en producción.

---

## 3. Prueba de humo contra el sitio publicado

`PASS 24 · FALLA 0` (escritorio 1440×900 y móvil 390×844), con:

| Comprobación | Resultado |
|---|---|
| El panel responde 200 | ✅ |
| Se muestra el formulario de acceso | ✅ |
| Carga la paleta oficial (`--kz-cyan` = `#00E5FF`) | ✅ |
| El rediseño está aplicado (marca con sigla) | ✅ |
| La navegación no aparece sin sesión | ✅ |
| El área Resumen existe y está oculta | ✅ |
| Sólo la cartera queda a la vista | ✅ (`resumen:oculta, cartera:visible, equipo:oculta, auditoria:oculta`) |
| `crm.js` y `crm-ui.js` cargan | ✅ |
| Apunta a la base `default` | ✅ |
| Sin desbordamiento horizontal | ✅ 0 px |
| Botones ≥ 40 px | ✅ |
| Sin errores de consola | ✅ |

> Nota de método: los tres primeros intentos de esta prueba dieron 2 fallos **del propio instrumento**, no del panel: `[data-seccion='resumen']` capturaba el botón del nav en lugar del área, y `#panel-resumen` no existe porque el área del resumen no lleva `id` (se identifica por `data-seccion`). Corregido el selector, la corrida quedó limpia.

---

## 4. Lo que NO se ejecutó

- No se desplegaron reglas de Firestore (`crm-dev/firestore.rules` no se tocó).
- No se modificó ningún documento, colección ni cuenta de producción.
- No se creó ni modificó ningún usuario ni rol.

---

## 5. Pendiente (para el dueño)

1. **Entrar al panel con tu cuenta en el celular real** y recorrer: cartera → abrir un prospecto → nota → cotizar. Es la comprobación que el estándar de la agencia exige antes de dar por cerrado un cambio de interfaz.
2. Si algo no gusta, se corrige en la misma rama y se vuelve a publicar.

## 6. Cómo revertir (si hiciera falta)

```bash
# Opción A — volver exactamente al estado anterior
git reset --hard release/previo-kz-crm-019
git push --force-with-lease origin main

# Opción B — dejar constancia en la historia (recomendada)
git revert --no-edit 9ddfe59
git push origin main
```

El panel anterior vuelve solo: no hay datos ni estado que migrar, porque el rediseño es sólo presentación.
