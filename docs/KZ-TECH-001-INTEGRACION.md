# KZ-TECH-001 — contrato de integración Neon Tech

## Alcance

La biblioteca aporta identidad, componentes y validación visual a KZ-NEXT-001.
No sustituye páginas, no cambia rutas, no modifica contenido comercial y no se
carga en el sitio publicado. Su namespace evita colisiones con `premium-*`,
`assets/css/styles.css` y `assets/css/admin.css`.

## Componentes disponibles

| Componente | Contrato |
| --- | --- |
| Navegación | `[data-kz-tech-nav]`, toggle y menú relacionados por `aria-controls` |
| Botones | `.kz-tech-button` más una variante visual |
| Producto, precio y portafolio | `.kz-tech-card`, cuerpo y media opcional |
| Insignias | `.kz-tech-badge` con variantes cian u oro |
| Formularios | `.kz-tech-field`, descripción y error asociado por `aria-describedby` |
| Modal | `<dialog class="kz-tech-modal">` y controles `data-kz-tech-*` |
| FAQ | botón con `aria-expanded`, `aria-controls` y panel asociado |
| Carga | `.kz-tech-loader` o `.kz-tech-skeleton` con nombre accesible externo |
| Mensajes | `.kz-tech-alert`; usar `role="alert"` solo para errores urgentes |
| Vacío | `.kz-tech-empty` con explicación y acción recuperable |
| CTA y footer | bloques semánticos con acciones y enlaces reales |

## Convenciones

- Los tokens públicos empiezan por `--kz-tech-`.
- Las clases públicas empiezan por `kz-tech-`.
- Los hooks JavaScript empiezan por `data-kz-tech-`.
- Los componentes dependen de un ancestro `.kz-tech` para tipografía, color y
  foco. Las reglas globales se limitan a `box-sizing`.
- El sistema usa fuentes de sistema y recursos locales.
- El JavaScript mejora progresivamente: el contenido sigue visible sin scripts.

## Secuencia recomendada para Harness

1. Copiar `tokens.css`, `components.css` y `components.js` a su rama.
2. Integrar primero un componente sin alterar rutas ni Card Spark.
3. Aplicar contenidos comerciales desde la fuente vigente.
4. Ejecutar la suite visual y la puerta KZ-QA-001.
5. Comparar capturas controladas de 375 y 1440 px.
6. Verificar teclado, zoom al 200 %, movimiento reducido y contraste.
7. Mantener `design-system/lab.html` fuera del artefacto público.

## Límites certificados

- La suite comprueba estructura, estados, foco, responsive, overflow, recursos,
  contraste de pares críticos y ausencia de errores JavaScript.
- Las capturas no sustituyen una aprobación humana de marca y contenido.
- No se ha probado la biblioteca dentro de la rama local inaccesible de Harness.
- No se certifican aquí datos reales, Worker, Firebase, Card Spark ni producción.

