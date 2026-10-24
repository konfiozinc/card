# KZ-TECH-001 — certificación local Neon Tech

Fecha: 24 de octubre de 2026. Base: `e8491f2360df2a7f95b348a599844c64017df023`.

## Entrega

- Tokens CSS para color, tipografía, espaciado, radios, elevación, foco,
  movimiento y layout.
- Componentes reutilizables con namespace `kz-tech-`: navegación, menú móvil,
  botones, producto, precio, portafolio, badges, formularios, modal, FAQ,
  carga, mensajes, vacío, CTA y footer.
- Interacción progresiva en JavaScript nativo.
- Laboratorio local, no indexable y excluido del artefacto de GitHub Pages.
- Contrato de integración para KZ-NEXT-001.
- Job de CI sin secretos, escritura ni despliegue.

## Evidencia ejecutada

- Suite Playwright Neon Tech: **41/41 aprobadas**.
- Responsive: 320, 375, 390, 768, 1024 y 1440 px, sin desbordamiento ni
  controles recortados.
- Reflow equivalente a zoom 200 %, teclado, foco, menú, modal, FAQ, estados de
  formulario, movimiento reducido, funcionamiento sin JavaScript y objetivos
  táctiles verificados.
- Contrastes críticos: texto 17,65:1; botón cian 13,07:1; botón oro 10,79:1.
- Recursos externos: 0. Errores JavaScript: 0. Recursos locales 404: 0.
- Presupuesto de CSS + JavaScript: 29.124 bytes sin comprimir.
- Puerta KZ-QA-001 existente: **186/186 aprobadas**.
- Artefacto estático: 55 páginas y 1.794 referencias locales, sin fallos.
- Artefacto dinámico: 22 páginas, 13 rutas internas excluidas y 8 recursos
  públicos esenciales, sin fallos.

Capturas de referencia:

- `docs/evidencias/kz-tech-001/laboratorio-375.jpg`
  (`b04899f7d02d951de032f818c36baa1de25518f63c5a796f68b5fd5df240f35b`).
- `docs/evidencias/kz-tech-001/laboratorio-1440.jpg`
  (`1c1948372bba8d2068e9d19caced2fcb750fa96c2cd72fb286c113805fbbcd14`).

## Compatibilidad y límites

La biblioteca no modifica la web premium, Card Spark, reglas Firestore,
precios, Asesor Konfi ni `/leads`. El namespace evita colisiones con los estilos
vigentes. La rama local de Harness no estaba disponible, por lo que se certifica
la biblioteca sobre el `main` público vigente y queda pendiente repetir estas
pruebas después de que Harness la integre en KZ-NEXT-001.

Las capturas apoyan la revisión visual; no certifican contenidos comerciales ni
sustituyen una aprobación humana de marca. El dictamen es **GO LOCAL para
integración controlada**, sin autorización de publicación.
