# KZ-CRM-017 · Publicación y reversión

**Fecha:** 2-nov-2026 · **URL verificada:** https://konfiozinc.github.io/card/crm/

---

## 1. URL final

```
https://konfiozinc.github.io/card/crm/
```

Verificada en vivo: **HTTP 200**, formulario de acceso visible para cualquiera, y **ningún
dato comercial accesible sin sesión** (`permission-denied` comprobado en el navegador contra
el sitio publicado).

Funciona en computador y en celular: sin desbordamiento horizontal en 375, 768, 1440 y 1920 px.

## 2. Cómo se publicó

| Paso | Detalle |
|---|---|
| Rama de trabajo | `feature/kz-crm-017` (desde `main` actualizada, `5aec868`) |
| Qué viajó a `main` | **sólo** `crm/` (4 archivos) + `_config.yml` + `.githooks/pre-commit` + 2 documentos |
| Qué NO viajó | `crm-dev/` completo: reglas, emuladores, scripts de administración, pruebas y capturas |
| Commit en `main` | `6883d8f` |
| Push | `git push origin main` (`5aec868..6883d8f`) por **SSH** |
| Publicación | GitHub Pages + Jekyll reconstruye desde `main` |

`_config.yml` excluye `crm-dev`, así que aunque alguien lo subiera a `main` por error, no se
serviría. Doble cierre: exclusión **y** ausencia en el commit.

## 3. Evidencia de la publicación

```
200  /crm/                        ← el panel
200  /crm/index.html
200  /crm/crm.js
200  /crm/crm.css
200  /crm/alta-prospecto.js
200  /assets/css/kz-tokens.css    ← paleta oficial
404  /crm-dev/firestore.rules     ← interno, no servido
404  /crm-dev/activar-admin.cjs   ← interno, no servido
404  /crm/formulario.html         ← captación cerrada, no publicada
```

## 4. Configuración de Firebase que se modificó para publicar

| Elemento | Antes | Ahora |
|---|---|---|
| Dominios autorizados de Auth | `localhost`, `kzfio-crm.firebaseapp.com`, `kzfio-crm.web.app` | **+ `konfiozinc.github.io`** |
| Reglas `cloud.firestore/default` | ruleset `c9e8ba24` | **`a896ffce`** (con las correcciones de la auditoría) |
| Reglas `cloud.firestore` | ruleset `20678df8` | **`100d9c6c`** (mismo contenido) |
| Facturación | desactivada | **desactivada** (sin cambios) |

`konfiozinc.github.io` se autoriza **sin** protocolo y **sin** ruta: es el dominio, no la URL.

## 5. Reversión

### 5.1 Retirar el panel del sitio (inmediato, sin tocar datos)

```bash
cd 6-LANDING-PAGES/Konfio-Zinc-Web
git switch main
git revert 6883d8f          # o: git rm -r crm && git commit
git push origin main        # GitHub Pages deja de servir /crm/ en ~1 minuto
```

Efecto: la URL devuelve 404. **No afecta a Firestore ni a las cuentas**: los datos y el
administrador siguen intactos, sólo desaparece la interfaz.

### 5.2 Revertir las reglas de Firestore

Los rulesets anteriores siguen en el proyecto, no se ha borrado ninguno:

| Ruleset | Qué contiene |
|---|---|
| `c9e8ba24` | reglas privadas antes de las correcciones de auditoría |
| `20678df8` | versión del release heredado anterior |
| `14e642ae` | contrato antiguo — **permitía alta anónima** |
| `e0e2a79f` | bloqueo inicial de la base |

```bash
# repuntar un release a un ruleset anterior (no borra nada)
node crm-dev/publicar-release-heredado.cjs --confirmar   # tras editar firestore.rules
```

**Advertencia:** volver a `14e642ae` **reabre el alta anónima de prospectos**. Sólo tendría
sentido para deshacer toda la puesta en marcha, y sabiendo eso.

### 5.3 Revertir el dominio autorizado

Quitar `konfiozinc.github.io` de **Authentication → Settings → Authorized domains**. Si se
retira el panel y se deja el dominio, no hay riesgo: sin panel no hay origen desde el que
autenticarse.

### 5.4 Retirar al administrador

No se contempla en esta misión (prohibido eliminar su cuenta). Si algún día hiciera falta,
se desactiva la ficha `crm_usuarios/{uid}` (`activo: false`) desde un procedimiento
privilegiado: el panel dejaría de dejarlo entrar sin borrar la cuenta.

## 6. Registro de commits

| Commit | Rama | Contenido |
|---|---|---|
| `3ab501e` | `feature/kz-crm-017` | panel adaptado + `crm-dev/` + correcciones de auditoría + capturas |
| `6883d8f` | `main` | **publicación**: sólo el panel, la config y 2 documentos |

Historial previo relevante: `5aec868` (punto de partida de `main`), `fe02064` y `d871ee9`
(activación del administrador, KZ-CRM-016).

## 7. Qué falta para cerrar del todo

1. **Primer acceso de Darwin en la URL publicada** — es la única comprobación que no puedo
   hacer yo, porque requiere su contraseña. Debe ver el panel con estadísticas y los bloques
   de admin.
2. **Prueba en un celular real**, no sólo con viewport móvil.
3. Si aparecen errores, este documento §5 es el procedimiento de vuelta atrás.
