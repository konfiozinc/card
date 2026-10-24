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

