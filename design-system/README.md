# Neon Tech · KZ-TECH-001

Biblioteca aislada de interfaz para que KZ-NEXT-001 integre componentes sin
copiar estilos del laboratorio ni modificar Card Spark.

## Archivos

- `tokens.css`: contrato de color, tipografía, espaciado, forma, elevación,
  movimiento y layout.
- `components.css`: componentes bajo `.kz-tech` y el prefijo `kz-tech-`.
- `components.js`: navegación móvil, acordeón, modal, validación visual y
  apariciones progresivas.
- `lab.html`: catálogo técnico no publicable.

## Uso mínimo

```html
<link rel="stylesheet" href="/ruta/tokens.css">
<link rel="stylesheet" href="/ruta/components.css">
<body class="kz-tech">
  <a class="kz-tech-button kz-tech-button--primary" href="/contacto.html">
    Hablar con el equipo
  </a>
  <script src="/ruta/components.js" defer></script>
</body>
```

`components.css` ya importa `tokens.css`; el enlace explícito permite que una
integración sobrescriba tokens antes de cargar los componentes. No se requieren
fuentes, iconos, frameworks ni CDN externos.

## Reglas de integración

1. Aplicar `.kz-tech` en el contenedor raíz de la experiencia nueva.
2. Mantener el prefijo `kz-tech-`; no renombrar clases a nombres genéricos.
3. Sustituir textos y destinos del laboratorio por fuentes comerciales
   vigentes. El laboratorio no define precios ni testimonios.
4. Conservar atributos `aria-*`, `data-kz-tech-*`, etiquetas y relaciones
   `aria-controls` al trasladar componentes interactivos.
5. Importar una sola copia de `components.js` con `defer`.
6. No integrar esta hoja en `admin/`, Card Spark ni páginas de clientes.
7. Revisar a 320, 375, 390, 768, 1024 y 1440 px antes de aceptar cambios.
8. Ejecutar `node herramientas/test/pruebas-kz-tech-001-visual.js`.

La carpeta completa está excluida de GitHub Pages. Harness debe copiar solo los
archivos y patrones aprobados a su superficie pública durante una integración
autorizada.

---

# Integración con la identidad del sitio (KZ-NEON-INT-001)

Esta sección la añade Harness al integrar KZ-TECH-001 con la versión Neon Tech
del sitio. **El laboratorio, los componentes y las pruebas son de Codex**; lo que
cambia es de dónde salen los colores.

## 1. Un solo origen de color

`tokens.css` ya **no define colores literales**: los toma de
`assets/css/kz-neon.css`, que es la fuente única de la paleta del sitio (la que
usan las 40 páginas y la que verifica `herramientas/auditar-identidad-uniforme.js`
en 23/23).

```
assets/css/kz-neon.css   ← única fuente de valores (--kz-*)
design-system/tokens.css ← contrato del sistema (--kz-tech-*), alias de los anteriores
design-system/components.css ← componentes; importa tokens.css
```

**Orden de carga obligatorio:** `kz-neon.css` → `components.css` (este importa
`tokens.css`). Si se carga `components.css` sin la hoja de identidad, los colores
quedan sin resolver **a propósito**: es preferible un fallo visible a una segunda
paleta silenciosa.

## 2. Qué se cambió y por qué

| Token de Codex | Valor original | Valor integrado | Motivo |
|---|---|---|---|
| `--kz-tech-navy-950` | `#07121e` | `#050B14` (**--kz-bg**) | una sola base |
| `--kz-tech-surface-1` | `#0d1d2c` | `#101C35` (**--kz-surface**) | una sola superficie |
| `--kz-tech-text` | `#f4f8fb` | `#FFFFFF` (**--kz-text**) | un solo texto |
| `--kz-tech-gold-500` | `#f0b429` | **`--kz-violet`** | el oro está retirado; la identidad Neon es cian + violeta |
| `--kz-tech-gold-300` | `#ffd978` | **`--kz-violet-light`** | idem |
| `--kz-tech-orange-500` | `#f97316` | **`--kz-violet`** | fuera de la identidad |
| `--kz-tech-cyan-500/300` | `#00e5ff` / `#77f3ff` | se conservan | ya coincidían |

También se sustituyeron los `rgba(240, 180, 41, …)` y `rgba(249, 115, 22, …)`
literales de `components.css` por el violeta. El nombre `--kz-tech-shadow-gold`
se conserva para no romper los componentes que lo usan, pero la sombra ahora es
violeta.

**Ningún selector ni componente se ha renombrado.** El prefijo `kz-tech-`
permanece y los componentes funcionan igual; solo han cambiado los valores.

## 3. Qué NO se toca

- **El panel administrativo no se integra.** `admin/` y `assets/js/admin/`
  conservan su vocabulario (`.tabla`, `.aviso`, `.grid-2`) y su hoja
  `assets/css/admin.css`, que es independiente por razones funcionales: el panel
  no comparte la identidad comercial y mezclarla introduciría dos paletas en la
  misma vista. La compatibilidad documentada es esta: **el design system no se
  aplica al panel.**
- **Las páginas comerciales** siguen usando `assets/css/styles.css` +
  `kz-neon.css`. El design system es una base para experiencias nuevas, no un
  reemplazo de lo ya certificado.

## 4. Laboratorio único

`design-system/lab.html` es el **único** laboratorio. El que Harness había
construido en `design-system/index.html` se retiró al integrar: mostrar los
componentes en dos páginas distintas era duplicación.

Verificación: `node herramientas/verificar-laboratorio.js` (12 comprobaciones) y
la prueba visual de Codex `node herramientas/test/pruebas-kz-tech-001-visual.js`.

## 5. Hallazgo que sigue abierto

El sitio tiene **tres vocabularios de componentes** y solo se ha unificado el de
las experiencias nuevas:

| Vocabulario | Hoja | Botón se llama |
|---|---|---|
| Comercial | `assets/css/styles.css` | `.btn-primary` |
| Premium | `premium-assets/styles.css` | `.button--brand` |
| Panel | `assets/css/admin.css` | `.btn` |
| **Design system** | `design-system/` | `.kz-tech-button` (y `.kz-tech-button--gold`, ahora violeta) |

Unificarlos del todo exige renombrar en 40 páginas y en el panel, con sus propias
pruebas. No se ha hecho: hacerlo de prisa produciría exactamente las dos paletas
que esta integración evita. Queda como el siguiente trabajo real de design system.


