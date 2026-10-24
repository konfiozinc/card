# KZ-DESIGN-001 · Integración visual final

> Estado: **candidato listo para aprobación del propietario. No publicado.**
> Rama `kz-next-001/neon-tech`. `main` sigue en `e8491f2` sin tocar.
> Commits de la misión: `0572463` → `8fb4e54` → `7ad0398`.

## 1. Qué pedía la misión

Unificar la tipografía corporativa y la navegación entre la portada premium y las
páginas comerciales; adoptar el lenguaje tipográfico geométrico de Neon Tech en los
titulares con tamaños adaptativos; dejar una navegación corporativa coherente y
funcional en escritorio y móvil; conservar las diferencias del panel de Card Spark
(sin navegación pública); mantener **un solo** botón flotante de Asesor Konfi en móvil
y no reintroducir solapamientos.

## 2. Qué se hizo

### Tipografía — una sola voz

| Antes | Ahora |
|---|---|
| La portada usaba `"Arial Black"` como fuente de titulares | Usa **Orbitron**, la misma de las páginas comerciales |
| El salto de fuente (FOUT) se veía al cargar | Orbitron e Inter se precargan en las 4 páginas premium |
| Titular móvil de 60 px que desbordaba | 32,25 px · 153 px de alto · 0,23 de la pantalla · sin desborde |

Verificado en navegador, no por lectura de CSS: la portada computa
`font-family: Orbitron, "Arial Black", …` y `document.fonts.check('700 32px Orbitron')`
devuelve `true`, es decir que la fuente está disponible y no se está usando una
alternativa.

### Navegación — los mismos seis destinos

La portada apuntaba a anclas internas (`#servicios`, `#portafolio`, `#precios`,
`#contacto`). Ahora usa la navegación corporativa del resto del sitio:

**Servicios · Portafolio · Precios · Nosotros · Blog · Contacto** + CTA
«Agendar diagnóstico».

Las seis rutas se comprobaron contra el sistema de archivos (no contra el HTML): todas
existen. El menú móvil abre, anuncia `aria-expanded="true"` y cierra con `Escape`.

## 3. Deuda de identidad cerrada

El nombre heredado del oro seguía vivo como alias. Se cerró por completo:

- **214 referencias** renombradas a los tokens reales (`--kz-cyan`,
  `--kz-cyan-light`, `--kz-rgb-cyan`).
- **10 declaraciones** retiradas de `assets/css/styles.css`, `assets/css/admin.css`,
  `premium-assets/styles.css` y `panel.html`.
- Alias `--cyan` (49 usos) y `--violet` (muerto, 0 usos) eliminados.
- `panel.html` declara su paleta con tokens en lugar de hexes propios.
- El sistema de diseño de KZ-TECH-001 renombró `--kz-tech-gold-500/300` y las clases
  `--gold` a `--violet`: pintaban violeta con etiqueta de oro.

**Consecuencia:** ya no existe ningún orden de hojas de estilo capaz de repintar el
sitio de dorado. Ese era el riesgo que documentaba `KZ-NEON-INT-001-INTEGRACION.md` §2.2
y que ahora queda cerrado.

## 4. Defectos reales encontrados por el camino

Ninguno de los dos estaba en el encargo; ambos se descubrieron al hacer que las pruebas
midieran de verdad.

### 4.1 Botón primario del laboratorio: blanco sobre cian (1,54:1)

El botón primario es un `<a>`. La regla `.kz-tech a { color: inherit }` tiene
especificidad (0,1,1) y **ganaba** a `.kz-tech-button--primary` (0,1,0), así que el
enlace heredaba el blanco del `body` y quedaba blanco sobre cian brillante.

Corregido excluyendo los botones del reset de enlaces:
`.kz-tech a:not(.kz-tech-button) { color: inherit; }` → **12,83:1**.

Este defecto estaba oculto porque la prueba de contraste comparaba **literales fijos**
de una paleta que ya no existía, y pasaba sin medir la página.

### 4.2 Hora del chat: gris ilegible en las dos burbujas

`.kz-msg-time` usaba `#666` a 10 px, que da 3,4:1 sobre el fondo oscuro del bot y
1,9:1 sobre la burbuja cian del usuario. Ahora usa el token de texto apagado en la
burbuja del bot y hereda el color oscuro con opacidad en la del usuario.

## 5. Pruebas: qué se corrigió para que significaran algo

Tres verificadores daban resultados que no se sostenían al leerlos. Se corrigieron, no
se silenciaron:

| Verificador | Qué hacía mal | Ahora |
|---|---|---|
| `test/pruebas-kz-tech-001-visual.js` | 3 chequeos de contraste comparaban literales de la paleta anterior; pasaban aunque el color no existiera | Mide el contraste real de cada botón del laboratorio — así se destapó el 1,54:1 |
| `verificar-panel-identidad.js` | Afirmaba que el nombre del oro resolvía al cian | Afirma el invariante correcto: el nombre ya no existe |
| `auditar-paleta.js` | Contaba como conflicto los modificadores BEM y las media queries (5 falsos positivos) | Distingue ámbito (archivo + selector + media); separa conflictos reales de redefiniciones legítimas |

## 6. Resultado verificado

| Prueba | Resultado |
|---|---|
| Identidad uniforme (23 páginas) | **23/23**, 0 errores de JavaScript |
| Auditoría de paleta | **0 bloqueantes** (heredados 0 · conflictos reales 0 · embebidos 0), 5 avisos con ámbito propio |
| `verificar-neon` | **0 fallos**, 0 avisos |
| Laboratorio de componentes | **12/12** |
| Identidad del panel | **8/8** |
| Gate de QA de la web pública | **186/186** |
| Diseño KZ-TECH-001 | **40/40** |
| Integración tipografía + navegación | **11/11** |
| Precios oficiales | OK (sin paquetes KZ, sin START, sin mensualidades) |

Evidencia visual: **30 capturas** en `C:\KZ-EVIDENCIA\design-001\integracion-final\`
(6 páginas × 5 anchos: 320, 375, 768, 1440, 1920).

## 7. Lo que queda en manos del propietario

Nada de esto lo puede decidir el agente:

1. **Aprobar o descartar Neon Tech.** La rama no se ha publicado y `main` no se tocó.
2. **Revisar las capturas.** La valoración visual final es suya; el agente no puede ver
   imágenes y verifica de forma programática.
3. **Decisión sobre la densidad y la jerarquía de lectura** (punto 5 de su revisión
   anterior), que quedó atendido solo en parte: se redujo el titular y se añadió aire
   inferior, pero el juicio es visual.
4. Siguen abiertas las decisiones de datos ya conocidas: 3 clientes de categoría **B**
   que requieren confirmación contractual y el marcado de los 26 registros de
   categoría **D** como `PORTAFOLIO`.

## 8. Límites declarados

- **Este documento no publica nada.** Producción sirve `e8491f2`; todo vive en la rama
  local `kz-next-001/neon-tech`.
- No se tocaron precios, funcionalidad comercial, Firebase ni Cloudflare.
- No se reconstruyó ninguna sección certificada.
- No se usan fuentes de CDN externo: Orbitron e Inter son locales.
- Los tres vocabularios de componentes (comercial, premium, panel) siguen siendo tres.
  Unificarlos no estaba en el encargo y no se hizo.
