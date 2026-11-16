# KZ-WEB-CREDIBILIDAD-2026-11-15 — Informe consolidado
Fecha de corte: 15 de noviembre de 2026
Repositorio: konfiozinc/card
Base: cb124f2c39087a8507f3cf4554c85b1e9f302686
Rama de preparación: fix/kz-web-credibilidad-20261115

## Alcance
Se corrigieron 14 páginas públicas: index.html, precios.html, aliados.html, contacto.html, nosotros.html, portafolio.html, politica-privacidad.html, servicios.html, servicios/agentes-ia.html, servicios/catalogos-digitales.html, servicios/codigos-qr.html, servicios/landing-pages.html, servicios/menus-digitales.html y servicios/tarjetas-digitales.html.

## Cambios
- Portafolio: se retiraron cuatro fichas que no tienen respaldo suficiente o pueden exigir autorización (Dra. Ana Pérez, Juan Pérez, Century 21 Radial y ALÍ Binary). La cuadrícula visible pasa de 29 a 25 fichas. Se sustituyó la afirmación absoluta de que todo son clientes reales por identificación de proyectos y demostraciones. Mega Express y Konfio Sports se etiquetan como demostraciones.
- Inicio: se corrigió el enlace de portafolio a /card/portafolio.html, se agregó Aliados al menú, se retiraron cifras de clientela no certificadas y la promesa genérica de dominio incluido.
- Navegación de interiores: se añadió enlace a Precios donde faltaba. Los enlaces de YouTube ahora abren la página del video, no un reproductor embebido presentado como canal. Se mantuvieron etiquetas accesibles de enlaces sociales.
- Planes: Mini Web Básica $49.900 y Mini Web Pro $99.900 preservadas, sin reincorporar Elite. Se corrigió la frase residual “tres planes” en tarjetas.
- Landing pages: se quitaron afirmaciones de alojamiento y dominio incluidos automáticamente, cuentas de correo corporativas, edición autónoma garantizada, reCAPTCHA preconfigurado y envíos por formulario sin backend comprobado. Se distinguieron servicios que requieren cotización e integración.
- Privacidad: se añadieron GitHub Pages, Firebase Auth/Firestore, Cloudflare, Google Analytics 4, Google Maps, YouTube y tratamiento por Asesor ZINC/Gemini, incluyendo datos de formularios y correo. Se indicó el objetivo de 60 días para registros anonimizados sin afirmar que el borrado o anonimización estén verificados.
- Servicios y precios: se aclara que un pago de desarrollo no elimina costos recurrentes de proveedores externos de IA, dominios y mensajería.

## Controles y limitaciones
- No se alteraron admin/, firestore.rules, Firebase, Workers ni precios de Mini Web.
- No se hizo merge a main ni se desplegó.
- Se comprobaron estáticamente el contenido HTML, las dos tarifas y la validez sintáctica de JSON-LD en páginas clave.
- **No se ejecutaron pruebas reales de formulario ni navegación con navegador, ni verificación del mecanismo de borrado de logs a 60 días.** La auditoría legal definitiva y las verificaciones de producción siguen pendientes.
- No es legítimo declarar “100% funcionando” ni autorizar despliegue solo sobre estos controles estáticos.

## Riesgos residuales
- La home y las páginas interiores conservan componentes de navegación visual diferentes; la nomenclatura y rutas se alinearon parcialmente, pero la homologación estética completa requiere prueba visual.
- Las funciones reales de recepción de leads y el ciclo de conservación deben auditarse antes de prometer comportamiento confirmado.
- Algunos textos comerciales fuera de estas 14 páginas (artículos antiguos del blog y fichas secundarias) pueden conservar referencias históricas. Deben contrastarse con la fuente canónica y no se afirma una revisión exhaustiva de 63 páginas.

Estado: BLOQUE CONSOLIDADO PREPARADO EN RAMA, NO PUBLICADO.
