# KZ-CONVERSION-015 · Implementación

**Rama:** `feature/kz-conversion-015` · **Publicación:** **no autorizada** (no se ha fusionado ni desplegado)
**Fecha:** 2-nov-2026

## 1. Qué quedó funcionando

### A. Selector de negocio — *hecho*

Cinco industrias (restaurantes y cafeterías, belleza y bienestar, profesionales independientes, comercios y tiendas, servicios empresariales). Al elegir una, la página muestra **la solución sugerida y el porqué**, y salta a la demostración correspondiente. También acepta `?industria=restaurantes` para enlazar desde otras páginas o campañas.

### B. Demostraciones — *hecho (3 de 3)*

1. **Tarjeta digital interactiva** — ficha de ejemplo (Valentina Ríos · Estudio Aurora). «Guardar contacto» genera y descarga un **`.vcf` real**; «Compartir» usa `navigator.share` o copia el enlace al portapapeles. Datos ficticios marcados.
2. **Menú / catálogo comercial** — tres platos de demostración, carrito con total real (2 × $18.900 = $37.800 en la prueba), contador y «Limpiar». Sin pasarela ni envío: el texto lo dice.
3. **Mini Web empresarial** — nombre del negocio, plantilla (Tibia / Colorida / Minimalista), color de acento y de fondo, con **vista previa en vivo** dentro de una maqueta de navegador.

### C. Recorrido comercial — *hecho*

Progreso de 5 pasos que **solo avanza con acciones reales**: elegir industria → usar una demo → marcar que leyó el alcance → elegir servicio → preparar la solicitud. Se muestra como «n de 5 pasos completados» con `aria-live`.

### D. Cotizador — *hecho, con precios oficiales*

Mini Web Básica **$49.900** y Pro **$99.900** (pago único), tomados de la web oficial; «Proyecto a medida» **no muestra cifra** y exige evaluación humana. Aclara que descuentos de distribuidor y comisiones se gestionan aparte.

### E. Solicitud con consentimiento — *hecho*

Nombre, WhatsApp (10–15 dígitos), consentimiento obligatorio. Al enviar: validación campo a campo, registro local (`kz-leads-local-v1`, máximo 50), apertura de WhatsApp con el mensaje ya escrito y aviso explícito de que **nada queda confirmado**.

### F. Actividad de la visita — *parcial, honesto*

Cuatro contadores de la sesión del visitante (demos iniciadas, completadas, cotizaciones, solicitudes) y ocho eventos GA4 preparados. **No** se presenta como estadística del negocio ni sustituye a un CRM.

## 2. Qué no se implementó (y no se disimula)

| Fase | Estado | Por qué |
|---|---|---|
| CRM digital con autenticación | **No** | Requiere Firebase/servidor, control de roles y revisión de privacidad: prohibido sin autorización específica |
| Configurador con exportación/publicación | **Parcial** | La vista previa y la personalización están; exportar/publicar necesita backend y separación de datos por cliente |
| Asesor Konfi ampliado | **No** | Vive en un Cloudflare Worker externo; no se tocó |
| Ventas confirmadas / seguimiento de aliados | **No** | Requiere fuente de verdad autenticada; confundir «WhatsApp abierto» con venta está prohibido |

## 3. Archivos

| Archivo | Estado |
|---|---|
| `soluciones.html` | **nuevo** (18 KB) |
| `assets/css/conversion-015.css` | **nuevo** (6 KB) |
| `assets/js/conversion-015.js` | **nuevo** (14 KB) |
| `docs/KZ-CONVERSION-015-*.md` | **nuevo** (5 documentos) |
| Resto del sitio | **sin cambios** |

Ninguna otra página, script, regla de Firebase, Worker ni precio fue modificado.

## 4. Cómo probarlo en local

```bash
cd Konfio-Zinc-Web
python -m http.server 8110
# http://127.0.0.1:8110/soluciones.html
```

Las pruebas automatizadas están en la evidencia del informe de pruebas (§ `KZ-CONVERSION-015-PRUEBAS.md`).

## 5. Decisiones que conviene saber

- **Número de WhatsApp:** se usa el público de la agencia (`573206411340`), el mismo que ya emplea el sitio, para no fragmentar la atención.
- **No se cargó GA4 en la página** para no duplicar etiquetas: si se publica dentro del sitio, hereda la analítica existente y los eventos `kz_*` start funcionando.
- **No hay enlace en la navegación del sitio** todavía: añadir un ítem de menú toca `index.html` y todas las páginas, y eso se decide contigo antes de publicar.
