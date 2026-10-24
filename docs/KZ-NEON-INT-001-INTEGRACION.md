# KZ-NEON-INT-001 · Integración final de Neon Tech

**Estado: GO LOCAL PARA REVISIÓN VISUAL. No publicado. `main` intacto.**
**Rama:** `kz-next-001/neon-tech` (base `e8491f2`) · **Previsualización local incluida.**

---

## 1. Lo primero: el Design System de Codex no existe en este entorno

El encargo pedía integrar `codex/kz-tech-001`, commit `220c2417`, con su carpeta `design-system/` y sus
dos documentos. **Nada de eso está disponible aquí.** Búsqueda agotada:

| Dónde se buscó | Resultado |
|---|---|
| Rama `codex/kz-tech-001` | no existe |
| Commit `220c2417…` | no existe (`git cat-file` falla) |
| `refs/` locales y `packed-refs` | ninguna referencia con `tech`, `codex` ni `design` |
| Commits inalcanzables (`git fsck`) | 2 commits, ambos de octubre y sin relación |
| `design-system/` en todo el workspace | ninguna carpeta |
| Archivos `KZ-TECH-*` | ninguno |
| Otros clones de `konfiozinc/card` | no hay: los worktrees comparten este mismo repositorio |
| `Documents`, `Desktop`, `Downloads`, `%TEMP%` | ninguno |
| `origin` | solo `main` |

**No se ha inventado ni recreado el trabajo de Codex**, y no se ha atribuido a él nada de lo que hay
aquí. Lo que sigue es lo que sí se ha podido hacer: perfeccionar y certificar Neon Tech, y **resolver de
forma verificable** una parte de lo que un design system debía aportar (§3).

## 2. Lo que se integró de verdad

Sobre el candidato de KZ-NEXT-001 (`24af778`) se añadieron tres cosas, todas verificadas:

### 2.1 Corrección de accesibilidad: campos a 16 px

Los controles de formulario **no heredan** el tamaño del cuerpo: el navegador les aplica 13,33 px, y las
hojas base lo bajaban a 14,4 px. Por debajo de 16 px, **iOS hace zoom automático al enfocar un campo**,
el teclado tapa media pantalla y el visitante pierde el contexto del formulario.

Corregido en `assets/css/kz-neon.css` con una regla explícita. Va con `!important` y con el motivo
escrito al lado: `.form-group input` tiene especificidad (0,1,1) y gana a cualquier `:where()`. Es la
única excepción deliberada a la cascada, y solo afecta al **tamaño**, nunca a la identidad.

Medido: **14,4 px → 16 px** en los campos del laboratorio.

### 2.2 Auditoría de identidad uniforme — herramienta nueva

`herramientas/auditar-identidad-uniforme.js` abre **las 23 páginas** y comprueba en el navegador que el
acento computado es el cian de Neon Tech y no el oro heredado, que ambas hojas están cargadas y que no
hay errores de JavaScript.

**Resultado: 23/23 con identidad correcta, 0 errores.**

Detectaba un riesgo real que había quedado sin cubrir: `assets/css/styles.css` todavía declaraba
el nombre heredado del oro con el valor `#F0B429` y solo lo anulaba `kz-neon.css` al cargarse después.
Si alguien invertía el orden de los `<link>`, las páginas comerciales se volvían doradas al instante.
La auditoría lo detectaba y dejaba constancia del invariante.

> **Riesgo cerrado en KZ-DESIGN-001.** El nombre heredado ya no existe: las 214 referencias se
> renombraron a `var(--kz-cyan)` / `var(--kz-cyan-light)` / `var(--kz-rgb-cyan)` y las
> declaraciones se retiraron de `styles.css`, `admin.css`, `premium-assets/styles.css` y
> `panel.html`. Ya no queda ningún orden de `<link>` capaz de repintar el sitio de oro.

### 2.3 Laboratorio de componentes — `design-system/lab.html`

Una página local, **no pública** (`noindex`, fuera de la navegación del sitio y del sitemap), que carga
**el mismo par de hojas que una página comercial** y muestra: color con contraste declarado, tipografía,
acciones, formularios con sus estados de error, tarjetas de precio con los importes oficiales, etiquetas,
avisos y el contrato del sistema.

No define ni un color propio: todos los valores salen de `--kz-*`.

> **Nota de KZ-DESIGN-001:** el laboratorio propio de esta misión era `design-system/index.html`.
> Se retiró para no dejar dos laboratorios enseñando vocabularios distintos; el único vigente es
> `design-system/lab.html`, el de la biblioteca que entregó Codex en KZ-TECH-001, ya re-baseado
> sobre `--kz-*`. Los nombres `--kz-tech-gold-500/300` y las clases `--gold` también se
> renombraron a `--violet`, porque pintaban violeta con etiqueta de oro.

**Verificado con `herramientas/verificar-laboratorio.js`: 12/12.**

## 3. Hallazgo de fondo: el sitio tiene DOS vocabularios de componentes

Esto es lo más importante que salió del intento de integrar un design system, y conviene que el
propietario lo sepa:

| Vocabulario | Dónde vive | Componentes |
|---|---|---|
| **Comercial** | `assets/css/styles.css` | `.card`, `.badge-activo`, `.btn-primary`, `.form-group`, `.check-list`, `.eyebrow`, `.display` |
| **Premium** | `premium-assets/styles.css` | `.button`, `.button--brand`, `.button--line`, `.lead-form` |
| **Panel** | `assets/css/admin.css` | `.tabla`, `.aviso`, `.grid-2`, `.muted`, `.celda-fuerte` |

**Ninguna hoja cubre los tres.** No existe una base de componentes compartida: hay tres conjuntos
disjuntos y dos de ellos ni siquiera usan el mismo nombre para un botón (`.btn` frente a `.button`).

Eso explica por qué un "design system" era necesario, y por qué **no se ha fingido tenerlo**: unificar el
vocabulario es un trabajo aparte (renombrar en 40 páginas y en el panel, con pruebas), y hacerlo de
prisa ahora habría introducido exactamente lo que el encargo prohíbe — dos paletas y componentes con
estilos incompatibles.

**Lo que sí se ha hecho:** el laboratorio muestra el vocabulario comercial, documenta la brecha y
establece el contrato. La unificación queda como el siguiente trabajo real, no como algo ya resuelto.

## 4. Certificación del candidato integrado

| Suite | Resultado |
|---|---|
| Identidad uniforme (23 páginas, en navegador) | **23/23**, 0 errores JS |
| Puerta de calidad de la web pública (`pruebas-qa-001-web-publica.js`) | **186/186** |
| Verificador de precios | **OK** |
| Verificador Neon (`verificar-neon.js`) | **0 fallos, 0 avisos** |
| Laboratorio de componentes | **12/12** |
| Comparación medida contra la web vigente (115 métricas) | **0 bloqueantes** |

La puerta de calidad confirma que los dos formularios siguen apuntando al Worker `/leads`, que no hay
persistencia de datos personales, que no hay endpoints ficticios y que no se anuncia ningún plan retirado.

### Comparación contra la versión vigente

115 métricas en 5 páginas, a 1440 y 375 px:

| | |
|---|---:|
| Iguales | 85 |
| Gana la web vigente | 18 |
| Gana Neon Tech | 7 |

Las victorias de la vigente siguen teniendo la misma causa única: Neon carga **una hoja más**
(+1 petición, +25 reglas CSS, +1 nodo DOM). Neon gana ahora en 7 —subió desde 3— porque los campos a
16 px mejoran los indicadores de legibilidad y de zoom móvil.

**Bloqueantes de Neon: 0** — sin desbordes, sin precios retirados, sin precios perdidos, sin campos sin
etiqueta.

## 5. Previsualización para el propietario

La evaluación estética te corresponde a ti. Así se abre:

```powershell
cd C:\Users\usuario29\Documents\KONFIO_ZINC\6-LANDING-PAGES\Konfio-Zinc-Web
git checkout kz-next-001/neon-tech

# Opción 1 — servidor del propio proyecto (lo más rápido)
node herramientas/capturar-neon.js --etiqueta vista --salida C:\KZ-EVIDENCIA\vista
# abre http://127.0.0.1:5211/ mientras captura; el servidor queda accesible durante la ejecución
```

**Alternativa estable** (deja el sitio servido sin capturar):

```powershell
node -e "const{crearServidor}=require('./herramientas/lib/servidor-estatico.js');crearServidor({raiz:process.cwd(),puerto:5211}).then(s=>console.log('abre '+s.url))"
```

Desde ahí:

| Página | URL |
|---|---|
| Portada Neon Tech | `http://127.0.0.1:5211/index.html` |
| Precios | `http://127.0.0.1:5211/precios.html` |
| Servicios | `http://127.0.0.1:5211/servicios.html` |
| Portafolio | `http://127.0.0.1:5211/portafolio.html` |
| Formulario | `http://127.0.0.1:5211/contacto.html` |
| **Laboratorio de componentes** | `http://127.0.0.1:5211/design-system/index.html` |

Para comparar con la web vigente, abre `https://konfiozinc.github.io/card/` en otra pestaña. Los
formularios de la previsualización apuntan al Worker de producción, pero **no se envía nada** salvo que
se pulse «Enviar».

## 6. Evidencias

`C:\KZ-EVIDENCIA\`:

| Carpeta | Contenido |
|---|---|
| `neon-int\integrado\` | **30 capturas del candidato integrado** (portada, precios, servicios, portafolio, contacto, nosotros, robot del chat) |
| `neon\neon\` | 30 capturas de Neon Tech antes de esta integración |
| `neon\main\` | 30 capturas de la web vigente, mismos tamaños y momento |

Anchos: **320, 375, 768, 1440 y 1920 px**, más página completa de cada una.

## 7. Qué NO se ha hecho, y por qué

| No hecho | Motivo |
|---|---|
| Integrar el Design System de Codex | no existe en este entorno (§1) |
| Unificar los tres vocabularios de componentes | exigiría renombrar en 40 páginas y en el panel con pruebas propias; hacerlo aquí habría introducido dos paletas (§3) |
| Cargar `admin.css` en el laboratorio | mezclaría la paleta del panel con la del sitio |
| Publicar, hacer merge a `main` o desplegar | fuera del alcance de esta misión |
| Crear testimonios | no hay fuentes verificables (KZ-NEXT-001 §2) |

## 8. Reversión

Todo vive en la rama `kz-next-001/neon-tech`. `main` sigue en `e8491f2`, local y remoto.

```bash
git checkout main                     # vuelve a la versión vigente, sin tocar nada
git branch -D kz-next-001/neon-tech   # solo si se descarta el candidato
```

No hay despliegues que revertir: no se ha publicado nada, ni en Firebase, ni en Cloudflare, ni en GitHub
Pages.

## 9. Riesgos residuales

1. **La valoración estética es tuya.** La certificación mide contraste, desbordes, foco, movimiento
   reducido y rendimiento; no mide si el diseño gusta.
2. **No puedo ver imágenes con este modelo.** Las 30 capturas y la previsualización están para que las
   mires: esa es la revisión que no puedo sustituir.
3. **El orden de las hojas es un invariante frágil** (§2.2). Está detectado por la auditoría, pero un
   cambio de orden en una página nueva lo rompería sin que ninguna otra prueba se entere.
4. **Tres vocabularios de componentes** sin unificar (§3). Es el trabajo de design system pendiente.
5. **Sin testimonios**, por falta de fuentes verificables.
6. **Solo probado en Chromium** con emulación de viewport y zoom; no en dispositivo físico.
