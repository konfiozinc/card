# KZ-CONVERSION-015 · Inventario de la agencia

**Repositorio:** `konfiozinc/card` (local: `6-LANDING-PAGES/Konfio-Zinc-Web`) · **Rama auditada:** `main` @ `a8cf194`
**Fecha:** 2-nov-2026 · **Estado:** auditoría hecha, trabajo en rama `feature/kz-conversion-015`

## 1. Estructura del sitio

Páginas publicadas (todas en la raíz, GitHub Pages):

| Página | Tamaño | Función |
|---|---|---|
| `index.html` | 26 KB | Portada con planes y CTA a contacto |
| `servicios.html` | 37 KB | Detalle de servicios + FAQ con datos estructurados |
| `precios.html` | 40 KB | Precios oficiales y comparativa |
| `portafolio.html` | 68 KB | Casos con capturas locales (sin thum.io) |
| `aliados.html` | 33 KB | Programa de aliados: comisión 20 %, descuentos 30/40/50 |
| `nosotros.html` | 35 KB | Equipo e identidad |
| `contacto.html` | 33 KB | Formulario y canales |
| `blog.html`, `blog/` | 30 KB | Contenido |
| `recursos.html`, `gracias.html`, `404.html`, `politica-privacidad.html` | 2–20 KB | Soporte |
| `admin/`, `panel.html` | 1–11 KB | Paneles internos (Firebase) |

Soporte: `functions/` (Firebase Functions), `firebase.json`, `firestore.rules`, `firebase-messaging-sw.js`, `manifest.json`, `design-system/`, `herramientas/`, `docs/`, `KIT_COMERCIAL/`.

## 2. Componentes reutilizables

- **`design-system/`**: `tokens.css` (5 KB), `components.css` (21 KB), `components.js` (5 KB) y `lab.html`. Orden de carga obligatorio documentado: `assets/css/kz-neon.css` → `design-system/tokens.css` → `components.css`. Los tokens **no definen paleta propia**: la toman de `kz-neon.css`, que es la fuente única verificada por la auditoría de identidad.
- **`assets/css/kz-neon.css`**: paleta oficial (cian + violeta, fondo `#050B14`).
- **`assets/js/`**: `main.js` (56 KB, navegación y formularios), `solicitar.js` (9 KB, solicitud por WhatsApp), `config.js`, `firebase-config.js`, `push.js` (notificaciones), `kz-carrusel.js`.

## 3. Servicios y precios publicados

Verificados en `precios.html` y `servicios.html`: **Mini Web Básica $49.900 COP** y **Mini Web Pro $99.900 COP**, pago único. `aliados.html` publica comisión de referido **20 %** y descuentos de distribuidor **30 % (Bronce, 1–4 ventas), 40 % (Plata), 50 % (Oro)**. **No se modificó ninguno.**

## 4. Asesor Konfi

El asistente del sitio vive fuera de este repositorio (Cloudflare Worker `calm-heart-6828`, código en `9-AGENTES-IA/Asistente-IA/asesor_web/worker.js`, conocimiento en KV `KZ_CONOCIMIENTO`). En el repo solo hay enlaces y el formulario. **No se tocó** el Worker ni su base de conocimiento: hacerlo requiere autorización específica según las restricciones de la misión.

## 5. Formularios y contacto

`contacto.html` y `assets/js/solicitar.js` construyen un mensaje de WhatsApp. La página ya usa `window.open` con `wa.me`. **Oportunidad detectada:** no existía ningún recorrido guiado, ni demostraciones, ni cotizador, ni métrica de intención.

## 6. Dependencias

Google Analytics 4 (`G-0JKTZNMPWX`), Font Awesome por CDN con carga diferida, tipografías propias en `assets/fonts`, Firebase (auth/panel/functions/push), sin frameworks JS.

## 7. Rendimiento y accesibilidad (muestreo)

- Las páginas usan `preload` + `onload` para Font Awesome y `defer` en los scripts: buena base.
- `portafolio.html` (68 KB) es la página más pesada; no se tocó.
- Faltaba CSS propio de una página de conversión: los componentes nuevos se apoyan en los tokens existentes.
- El sitio no tenía objetivos táctiles por debajo de 44 px en lo auditado; la página nueva se construyó directamente con ese mínimo.

## 8. Seguridad y privacidad

- No hay CRM publicado ni base de prospectos en el sitio: los leads solo existen en el WhatsApp del visitante.
- **Riesgo identificado:** cualquier módulo de CRM requeriría autenticación, autorización por rol, validación del lado servidor y una revisión de privacidad. Por eso **no se implementó el CRM** (fase 3) y se documenta como puerta pendiente.
- No se tocó Firebase, ni el Worker, ni `firestore.rules`, ni datos de clientes.

## 9. Riesgos de compatibilidad

| Riesgo | Mitigación aplicada |
|---|---|
| Romper páginas existentes | La entrega **añade** `soluciones.html` y dos archivos nuevos; no se editaron las demás páginas |
| Duplicar la paleta | Se consumen los tokens existentes; no se declara ninguna variable de color propia de marca |
| Números de WhatsApp divergentes | Se usa el mismo número público del sitio (`573206411340`) |
| Prometer más de lo que existe | Todo lo no implementado se etiqueta como pendiente y no aparece como capacidad |
