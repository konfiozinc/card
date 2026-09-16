# KONFÍO ZINC — Sitio web de soluciones digitales

Sitio web **multipágina**, responsive y optimizado para SEO de **KONFÍO ZINC**, agencia de
soluciones digitales en Colombia. Incluye home, página de servicios, 6 páginas de servicio,
portafolio con casos de estudio, blog, nosotros, contacto y un **panel privado de gestión de
clientes** con base de datos en Firebase Firestore y notificaciones push automáticas.

- **URL en producción:** https://konfiozinc.github.io/card/
- **Panel de administración:** https://konfiozinc.github.io/card/admin.html (privado)
- **Repositorio:** https://github.com/konfiozinc/card
- **Rama de despliegue:** `main` (GitHub Pages, carpeta raíz `/`)
- **Responsable:** Darwin Montalvo — Fundador · `konfiozinc@gmail.com` · WhatsApp +57 320 641 1340

> ⚠️ **Respaldo del sitio anterior:** el `index.html` de la landing one-page original quedó
> guardado como **`index-old.html`**. Los servicios de marketing digital genéricos (SEO, redes
> sociales, publicidad digital, desarrollo web genérico, branding y email marketing) se
> **retiraron del sitio** porque la agencia no los ofrece: sus páginas siguen recuperables desde
> el historial de Git (`git log --diff-filter=D --name-only`).

---

## 1. Descripción del proyecto

| Aspecto | Detalle |
|---|---|
| Tecnología | HTML5 + CSS3 + JavaScript vanilla (sitio estático, sin build step) |
| Backend | Firebase (Firestore + Authentication + Cloud Functions + Cloud Messaging) |
| Identidad visual | Negro `#000000`, dorado `#F0B429`, naranja `#F97316`, cian `#00E5FF` |
| Tipografías | Orbitron (títulos) · Inter (textos), cargadas con `display=swap` |
| Iconografía | Font Awesome 6.5.1 (CDN) |
| Componentes compartidos | Header fijo, menú móvil, footer, WhatsApp flotante, “volver arriba”, agente IA flotante, modal, FAQ acordeón, animaciones on-scroll, contadores |
| SEO | Títulos y meta descripciones únicos, canonical, Open Graph, Twitter Cards, datos estructurados (Schema.org), `sitemap.xml`, `robots.txt` |
| Analytics | Placeholder de GA4 y de Search Console en el `<head>` de cada página + eventos de tracking en CTAs |
| Rendimiento | CSS crítico inline, `<script defer>`, miniaturas con `loading="lazy"`, video de YouTube con carga diferida (se inyecta el iframe solo al hacer clic) |

### Los 6 servicios reales de la agencia

| Servicio | Página | Precio desde | Categoría de portafolio |
|---|---|---|---|
| Tarjetas Digitales (planes **Star**, **Pro**, **Elite**) | `servicios/tarjetas-digitales.html` | $49.900 | `tarjetas` |
| Catálogos Digitales | `servicios/catalogos-digitales.html` | $120.000 | `catalogos` |
| Menús Digitales | `servicios/menus-digitales.html` | $150.000 | `menus` |
| Landing Pages | `servicios/landing-pages.html` | $350.000 | `landing` |
| Códigos QR | `servicios/codigos-qr.html` | $50.000 | `qr` |
| Agentes IA | `servicios/agentes-ia.html` | $250.000 | `agentes` |

> Las subcategorías **Star / Pro / Elite** existen solo en Tarjetas Digitales. No son categorías
> de filtro del portafolio: se muestran dentro de su página de servicio y de su página de casos.

El sitio **no requiere compilación**: se sube tal cual a GitHub Pages.

---

## 2. Estructura de archivos

```
card/
├── index.html                     · Home (hero + video lite, métricas, 6 servicios, por qué elegirnos, proceso, testimonios, portafolio, garantía, FAQ, CTA)
├── index-old.html                 · Respaldo de la landing one-page anterior
├── nosotros.html                  · Historia, fundador (Darwin Montalvo), misión/visión/valores, equipo, números
├── servicios.html                 · Overview de los 6 servicios reales + proceso + paquetes + FAQ general
├── portafolio.html                · Portafolio con filtros por categoría y casos de estudio en modal
├── blog.html                      · Entrada al blog desde la raíz
├── aliados.html                   · Programa de aliados: modelos distribuidor y referido, comisiones y niveles
├── contacto.html                  · Formulario, datos de contacto, mapa, horarios y FAQ rápida
├── gracias.html                   · Confirmación de envío del formulario (noindex)
├── 404.html                       · Página de error personalizada (noindex)
├── admin.html                     · PANEL PRIVADO de gestión de clientes (Firebase, noindex)
├── firebase-messaging-sw.js       · Service worker de FCM para las notificaciones push
├── firebase.json                  · Configuración de Firebase (Firestore, Functions, Hosting)
├── firestore.rules                · Reglas de seguridad de Firestore (denegar por defecto)
├── firestore.indexes.json         · Índices compuestos que necesitan las consultas del panel
├── sitemap.xml                    · Sitemap con todas las URLs indexables
├── robots.txt                     · Instrucciones para crawlers + referencia al sitemap
├── README.md                      · Este documento
├── ESPECIFICACION_SITIO.md        · Especificación de componentes y SEO (documento interno de trabajo)
│
├── herramientas/
│   ├── verificar-sitio.js         · Verificador de integridad (enlaces, SEO, JSON-LD, sitemap)
│   ├── migracion-servicios.js     · Migración histórica a los 6 servicios reales (ya aplicada)
│   ├── corregir-rutas-raiz.js     · Corrección de prefijos de ruta en las páginas de la raíz
│   └── corregir-textos-servicios.js · Corrección de etiquetas de servicio antiguas
│
├── functions/                     · Cloud Functions (Node 20)
│   ├── index.js                   · verificarVencimientos + enviarRecordatorio + recalcularVencimientos
│   └── package.json               · Dependencias de las funciones
│
├── servicios/                     · Una página por servicio (problema, planes, proceso, beneficios, casos, FAQ, relacionados, CTA)
│   ├── tarjetas-digitales.html    · Con los planes Star, Pro y Elite
│   ├── catalogos-digitales.html
│   ├── menus-digitales.html
│   ├── landing-pages.html
│   ├── codigos-qr.html
│   └── agentes-ia.html
│
├── portafolio/                    · Casos de éxito por categoría (1 por servicio)
│   ├── tarjetas-digitales.html
│   ├── catalogos-digitales.html
│   ├── menus-digitales.html
│   ├── landing-pages.html
│   ├── codigos-qr.html
│   └── agentes-ia.html
│
├── blog/                          · Blog y artículos
│   ├── index.html                 · Índice del blog
│   ├── tarjetas-digitales-star-pro-elite.html
│   ├── catalogos-y-menus-digitales.html
│   └── agentes-ia-atencion-24-7.html
│
└── assets/
    ├── css/
    │   └── styles.css             · CSS global compartido por todas las páginas
    ├── js/
    │   └── main.js                · JS global compartido (módulos numerados y comentados)
    └── img/
        ├── logos/logo.jpeg        · Logotipo de la marca
        ├── equipo/darwin-montalvo.jpeg · Foto del fundador        └── portafolio/            · Carpeta para las imágenes propias del portafolio
```

### Rutas relativas (importante al crear páginas nuevas)

| Ubicación del archivo | `<html>` | Assets | Enlace a la raíz |
|---|---|---|---|
| Raíz (`index.html`) | `data-base="." data-root="."` | `assets/css/styles.css` | `index.html` |
| Subcarpeta (`servicios/`, `blog/`, `portafolio/`) | `data-base=".." data-root=".."` | `../assets/css/styles.css` | `../index.html` |

---

## 3. Cómo agregar un nuevo caso de portafolio

### 3.1 En la página con filtros (`portafolio.html`)

Copia este bloque dentro de `<div class="portfolio-grid">` y ajusta los datos. El filtrado y el
modal son automáticos (los gestiona `assets/js/main.js`):

```html
<button class="case reveal" data-category="tarjetas menus" data-open-modal
  data-title="Nombre del cliente — Servicio"
  data-url="https://konfiozinc.github.io/nombre-del-proyecto/"
  data-img="https://image.thum.io/get/width/900/crop/1200/https://konfiozinc.github.io/nombre-del-proyecto/"
  data-sector="Sector · Ciudad"
  data-metrics="+120% ventas|+40% contactos"
  data-challenge="Cuál era el problema del cliente antes del proyecto."
  data-solution="Qué hicimos exactamente para resolverlo."
  data-result="Qué se logró, con cifras."
  data-testimonial="Frase textual del cliente.">
  <img src="https://image.thum.io/get/width/600/crop/900/https://konfiozinc.github.io/nombre-del-proyecto/"
       alt="Descripción del proyecto para accesibilidad" loading="lazy" width="600" height="900">
  <div class="case-overlay">
    <span class="case-metric">+120% ventas</span>
    <span class="case-name">Nombre del cliente · Sector</span>
  </div>
</button>
```

**Reglas:**
1. `data-category` acepta una o varias categorías separadas por espacio. Valores válidos:
   `tarjetas`, `catalogos`, `menus`, `landing`, `qr`, `agentes`.
2. `data-metrics` separa cada métrica con `|` (se muestran como chips en el modal).
3. Todos los atributos `data-*` de texto deben usar comillas dobles exteriores y **no** incluir
   comillas dobles dentro del valor (usa comillas simples si necesitas entrecomillar).
4. El `alt` es obligatorio y descriptivo.
5. Si usas una imagen propia en lugar de la miniatura automática, guárdala en
   `assets/img/portafolio/` y referencia esa ruta (desde la raíz) o `../assets/img/portafolio/`
   (desde una subcarpeta).

### 3.2 En la página de categoría (`portafolio/<categoria>.html`)

Usa una ficha de caso de estudio completa:

```html
<article class="case-study reveal">
  <div class="case-study-img">
    <img src="https://image.thum.io/get/width/900/crop/700/https://konfiozinc.github.io/proyecto/"
         alt="Descripción del proyecto" loading="lazy" width="900" height="700">
  </div>
  <div class="case-study-body">
    <h3>Nombre del cliente — Servicio</h3>
    <p class="case-study-sector">Sector · Ciudad</p>
    <div class="case-metrics">
      <span class="chip"><i class="fas fa-arrow-trend-up"></i> +120% ventas</span>
      <span class="chip chip-cyan"><i class="fas fa-clock"></i> Entrega en 48 h</span>
    </div>
    <p><strong>Desafío:</strong> …</p>
    <p><strong>Solución:</strong> …</p>
    <p><strong>Resultado:</strong> …</p>
    <blockquote>"Testimonio del cliente."</blockquote>
  </div>
</article>
```

### 3.3 Checklist al publicar un caso nuevo

- [ ] Añadir la URL del proyecto a `sitemap.xml` **solo** si es una página propia del sitio.
- [ ] Añadir el proyecto a la lista `PROJECTS` en `assets/js/main.js` (botón “Ver todos los proyectos”).
- [ ] Enlazar el caso desde la página de servicio relacionada (`servicios/*.html`) y desde `index.html` si es destacado.
- [ ] Verificar que el enlace en vivo responda 200 antes de publicarlo.

---

## 4. Cómo agregar un artículo al blog

1. **Duplica** una plantilla existente para mantener la estructura:
   `blog/menu-digital-interactivo.html` → `blog/mi-nuevo-articulo.html`.
2. Cambia en el `<head>`:
   - `<title>` (máx. 60 caracteres), `meta description` (máx. 155), `og:*` y `twitter:*`.
   - `<link rel="canonical" href="https://konfiozinc.github.io/card/blog/mi-nuevo-articulo.html">`.
   - El JSON-LD `BlogPosting`: `headline`, `description`, `image`, `datePublished`,
     `dateModified`, `author` (`Darwin Montalvo`) y `mainEntityOfPage`.
3. Actualiza el contenido: `<h1>`, `.article-meta` (autor, fecha, tiempo de lectura, categoría),
   `.article-toc` con enlaces a los anclas de los `<h2 id="...">`, y el cuerpo del artículo en `.prose`.
4. Escribe **al menos 900 palabras**, con `H2`/`H3` lógicos, listas y una `.article-cta` en medio.
5. Añade el artículo a la rejilla en **dos lugares**:
   - `blog/index.html` → enlace relativo: `href="mi-nuevo-articulo.html"`
   - `blog.html` (raíz) → enlace relativo: `href="blog/mi-nuevo-articulo.html"`
6. Añade la URL a `sitemap.xml` con su `<lastmod>` en formato `AAAA-MM-DD`.
7. Recomendado: enlaza desde el artículo a 2 páginas de servicio y 1 de portafolio (enlazado interno).

Plantilla base del encabezado del artículo:

```html
<article class="article">
  <img class="article-hero" src="…" alt="…" loading="lazy" width="1200" height="525">
  <div class="article-meta">
    <span><i class="fas fa-user"></i> Darwin Montalvo</span>
    <span><i class="fas fa-calendar"></i> 15 de septiembre de 2026</span>
    <span><i class="fas fa-clock"></i> 6 min de lectura</span>
    <span><i class="fas fa-tag"></i> Categoría</span>
  </div>
  <nav class="article-toc" aria-label="Contenido del artículo">
    <strong>En este artículo</strong>
    <a href="#seccion-1">1. Título de la sección</a>
  </nav>
  <div class="prose">
    <h2 id="seccion-1">Título de la sección</h2>
    <p>…</p>
  </div>
</article>
```

---

## 5. Cómo agregar un servicio nuevo

1. Crea `servicios/nombre-servicio.html` partiendo de `servicios/tarjetas-digitales.html` (es la
   plantilla canónica: hero, el problema, planes, cómo funciona, beneficios, casos, FAQ,
   relacionados, CTA).
2. Añade el `<a>` correspondiente en el submenú de **todas** las páginas y en la columna
   "Servicios" del footer (bloques `<div class="nav-sub">` y `<h4>Servicios</h4>`), además de una
   tarjeta en `servicios.html` y en `index.html`.
3. Añade la URL a `sitemap.xml` y crea su categoría en `portafolio/` con una tarjeta y un
   `data-filter` en `portafolio.html`.
4. Añade el nuevo servicio a las constantes `SERVICIOS` y `PRECIOS_REFERENCIA` de
   `assets/js/firebase-config.js` para que aparezca en el panel de administración.
5. Añade la palabra clave del servicio a la función de respaldo del agente IA (`getLocalResponse`
   en `assets/js/main.js`) si quieres que el asesor lo mencione.
6. Ejecuta `node herramientas/verificar-sitio.js` para confirmar que no rompiste ningún enlace.

---

## 6. Programa de aliados (`liados.html)

Página pública que explica cómo ganar dinero vendiendo las tarjetas digitales. Tiene dos modelos:

| Modelo | Cómo funciona | Ganas |
|---|---|---|
| **Distribuidor** (recomendado) | Compra a precio de aliado y vende al precio que defina | La diferencia. Niveles por ventas mensuales: **Bronce** 1–4 ventas (30%), **Plata** 5–9 (40%), **Oro** 10+ (50%) |
| **Referido** (sin inversión) | Presenta el cliente; KONFÍO ZINC cierra y cobra | **20%** de comisión: $9.980 START · $19.980 PRO · $29.980 ELITE |

**Incentivo de activación:** tarjeta PRO de muestra con 50% de descuento (.950) al activarse; gratis al cerrar las primeras 3 ventas.

**Reglas:** el aliado gestiona la venta y el cobro; KONFÍO ZINC hace diseño, publicación, hosting del primer año y soporte. Precios en COP. Medios de pago: Bancolombia, Davivienda, Nequi, Daviplata, Bre-B, Transfiya, Mercado Pago y efectivo.

> 📌 **Fuente única de verdad:** PROGRAMA_ALIADOS.md (documento interno, **no se versiona** porque
> contiene condiciones de negociación). Si cambias comisiones o niveles ahí, actualiza también
> `liados.html y la función de respaldo del agente IA en `ssets/js/main.js.

> ⚠️ La página publica las tablas del programa, pero **no** los márgenes internos por debajo de
> costo ni las condiciones negociables: la regla del documento es que las comisiones «no se negocian
> en el chat» y toda negociación se deriva a Darwin (+57 320 641 1340).

---

## 7. Panel de administración de clientes (Firebase)

El panel vive en **`admin.html`** y es una aplicación de una sola página que habla directamente
con Firestore desde el navegador (SDK modular v10 por CDN, sin build step).

### 6.1 Qué hace

| Función | Detalle |
|---|---|
| Autenticación | Email/contraseña con Firebase Auth + lista blanca en la colección `admins` |
| Dashboard | Clientes activos, por vencer (≤15 días) e inactivos; ingresos del mes; clientes por servicio; próximos vencimientos a 30 días |
| Tabla de clientes | Filtros por estado, servicio y categoría + búsqueda por nombre, correo, teléfono o empresa; orden por vencimiento, nombre o precio |
| CRUD | Crear, editar, eliminar y ver detalle de cada cliente |
| Renovación | Botón que recalcula el vencimiento +12 meses y reinicia los avisos del nuevo ciclo |
| Pagos | Subcolección `pagos` con historial por cliente y total acumulado |
| Exportación | CSV compatible con Excel (separador `;` y BOM UTF-8) de lo que esté filtrado |
| Push | Suscripción del navegador a FCM y guardado del token en la ficha del cliente |
| Recordatorio manual | Invoca la Cloud Function `enviarRecordatorio` para un cliente concreto |

### 6.2 Configuración inicial en Firebase Console (paso a paso)

1. **Crear el proyecto** en https://console.firebase.google.com (o usa el existente de KONFÍO ZINC).
2. **Registrar una app web:** ⚙️ Configuración del proyecto → *Tus apps* → `</>` → copia el objeto
   `firebaseConfig`.
3. **Pegar la configuración en dos archivos** (deben quedar idénticos):
   - `assets/js/firebase-config.js` → `firebaseConfig` y `vapidKey`
   - `firebase-messaging-sw.js` (raíz) → `firebaseConfig`
4. **Activar Authentication:** *Compilación* → Authentication → Comenzar → habilitar
   **Correo electrónico/contraseña**. Luego en *Usuarios* → **Agregar usuario** con el correo del
   administrador (por ejemplo `konfiozinc@gmail.com`) y una contraseña robusta.
5. **Autorizar el dominio:** Authentication → *Configuración* → **Dominios autorizados** → agregar
   `konfiozinc.github.io`. Sin esto, el inicio de sesión falla desde GitHub Pages.
6. **Crear Firestore:** *Compilación* → Firestore Database → Crear base de datos → modo producción.
7. **Nombrar administradores:** en Firestore, crea la colección `admins` y un documento cuyo **ID
   sea el UID** del usuario creado en el paso 4 (Authentication → Usuarios → columna *UID*). El
   documento puede quedar vacío; lo que importa es que exista. Sin esto, el panel cierra la sesión
   automáticamente por seguridad.
8. **Desplegar reglas e índices:**
   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase use --add          # selecciona tu proyecto y asígnale el alias "default"
   firebase deploy --only firestore:rules,firestore:indexes
   ```
9. **Activar Cloud Messaging:** *Compilación* → Messaging → en *Configuración web* → **Certificados
   push web** → genera el par de claves y copia la **clave VAPID** en `assets/js/firebase-config.js`.
10. **Verificar:** abre `https://konfiozinc.github.io/card/admin.html`, inicia sesión y comprueba que
    carga el dashboard. Si ves el aviso azul de "Firebase está sin configurar", los placeholders
    `PENDIENTE…` siguen en su sitio.

### 6.3 Modelo de datos en Firestore

**Colección `clientes`** — un documento por cliente:

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | string | Nombre completo del cliente |
| `email` | string | Correo electrónico |
| `telefono` | string | Teléfono / WhatsApp |
| `empresa` | string | Nombre del negocio |
| `servicio` | string | Uno de los 6 servicios reales |
| `categoria` | string | `Star`, `Pro` o `Elite` (solo Tarjetas Digitales) |
| `descripcion` | string | Detalle del proyecto contratado |
| `fechaActivacion` | timestamp | Inicio del servicio |
| `fechaVencimiento` | timestamp | `fechaActivacion` + 12 meses por defecto |
| `estado` | string | `activo` · `por_vencer` · `inactivo` |
| `precio` | number | Valor pagado en COP |
| `metodoPago` | string | Nequi · Daviplata · Transferencia · Efectivo |
| `fcmToken` | string | Token del dispositivo para notificaciones push |
| `notificacionesEnviadas` | array | `[{ tipo, diasRestantes, fecha }]` de avisos ya enviados |
| `notas` | string | Observaciones internas |
| `creadoEn` / `actualizadoEn` | timestamp | Auditoría |

**Subcolección `clientes/{clienteId}/pagos`** — historial de pagos: `fecha` (timestamp),
`monto` (number), `metodo` (string), `notas` (string), `registradoEn` (timestamp).

**Colección `admins`** — un documento por administrador, con el **UID** como id.

**Colección `notificaciones_log`** — auditoría de cada aviso enviado por la Cloud Function.

### 6.4 Cómo agregar o renovar un cliente

**Agregar:** pestaña **Nuevo / editar** → completa identificación, servicio (la categoría se
habilita solo para Tarjetas Digitales), fechas, precio y método de pago → **Guardar cliente**. Al
elegir la fecha de activación, el vencimiento se calcula solo a 12 meses (puedes cambiarlo).
El precio se autocompleta con el valor de referencia del servicio elegido.

**Renovar:** en la pestaña **Clientes**, botón <i class="fas fa-rotate"></i> de la fila. Toma como
base el vencimiento actual si todavía es futuro (no se pierden días pagados) o la fecha de hoy si
ya venció, suma 12 meses, pone el estado en `activo` y **reinicia el historial de avisos** para el
nuevo ciclo.

### 6.5 Desplegar las Cloud Functions (notificaciones push)

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
```

Se despliegan tres funciones:

| Función | Tipo | Qué hace |
|---|---|---|
| `verificarVencimientos` | programada (cron) | Corre todos los días a las **8:00 a.m. (America/Bogota)**. Envía los avisos de **10, 5, 3 y 1 día** antes del vencimiento, marca como `inactivo` a quien ya venció y actualiza `por_vencer` a ≤15 días |
| `enviarRecordatorio` | callable | Recordatorio inmediato a un cliente; lo usa el botón 🔔 de la tabla |
| `recalcularVencimientos` | callable | Recalcula `fechaActivacion + 12 meses` y reinicia avisos (útil en lote) |

> ⚠️ Las funciones programadas requieren el **plan Blaze** (pago por uso). Para este volumen de
> datos el costo es de centavos al mes. Si no quieres activarlo, el panel sigue funcionando: solo
> se pierden los envíos automáticos (los recordatorios manuales también, porque son una función).

**Ver logs:** `firebase functions:log` o la pestaña *Registros* en la consola.

### 6.6 Cómo funciona el push en un sitio estático

El sitio no tiene backend propio, así que no hay "cliente logueado" al que asociar un dispositivo.
Por eso el panel pide elegir a qué cliente pertenece el navegador antes de suscribirlo: así se
vincula un celular concreto (el del dueño del negocio, por ejemplo) con su ficha, y el token se
guarda en `fcmToken`.

**Requisitos:** HTTPS (GitHub Pages ya lo da), permiso concedido por el usuario y la **clave VAPID**
configurada. Alternativa futura documentada: una página pública de suscripción que reciba el id del
cliente por enlace.

### 6.7 Seguridad: por qué el panel es privado de verdad

Tres capas independientes, y las tres son necesarias:

1. **`admin.html` con `noindex, nofollow`** y fuera del sitemap y del menú público (no aparece en
   buscadores, pero la URL es adivinable: **esto no protege nada por sí solo**).
2. **Firebase Authentication:** sin sesión válida no se cargan datos.
3. **`firestore.rules`:** deniega todo por defecto y solo permite leer/escribir a usuarios
   autenticados que además existan en la colección `admins`. La validación ocurre **en el servidor
   de Google**, así que aunque alguien copie la configuración pública de Firebase desde el HTML, no
   puede leer nada.

> La configuración de una app web de Firebase (`apiKey`, `projectId`, etc.) **no es un secreto**:
> está diseñada para viajar al navegador. Lo que nunca debe subirse al repositorio son las claves de
> servicio (*service account*), que van en las variables de entorno de Cloud Functions.

### 6.8 Modelo de suscripción

Los servicios son de **pago único con vigencia de 12 meses**. A los 12 meses se ofrece la renovación
(anual) y, opcionalmente, el plan de mantenimiento **KZ Activo**. Los avisos de vencimiento se envían
10, 5, 3 y 1 día antes para que la renovación se gestione a tiempo.

---

## 8. Despliegue en GitHub Pages

El repositorio ya está conectado: GitHub Pages publica la rama `main` en la raíz del repo, por lo
que la URL es `https://konfiozinc.github.io/card/`.

### 6.1 Método manual (Git)

```powershell
$git = "C:\Program Files\Git\cmd\git.exe"
$repo = "C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc"

# 1. Ver qué cambió
& $git -C $repo status

# 2. Preparar, confirmar y publicar
& $git -C $repo add -A
& $git -C $repo commit -m "Sitio multipágina: home, servicios, portafolio, blog, contacto y SEO técnico"
& $git -C $repo push origin main
```

### 6.2 Verificar el despliegue

1. GitHub Actions → pestaña **Actions** del repo: el flujo `pages-build-deployment` debe terminar en verde (~1–3 min).
2. Abre https://konfiozinc.github.io/card/ y navega: Inicio → Servicios → cada servicio → Portafolio → Blog → Contacto.
3. Comprueba que carguen el CSS (`/card/assets/css/styles.css`) y el JS (`/card/assets/js/main.js`) sin errores 404 en la consola del navegador.
4. Verifica `https://konfiozinc.github.io/card/sitemap.xml` y `https://konfiozinc.github.io/card/robots.txt`.

> Si la rama principal fuera otra, cambia `main` por el nombre correcto. Para publicar en la raíz
> de `konfiozinc.github.io` habría que mover los archivos al repositorio `konfiozinc.github.io`
> y, en ese caso, actualizar todas las canónicas, las URL de Open Graph, `sitemap.xml` y `robots.txt`
> (basta reemplazar `https://konfiozinc.github.io/card/` por `https://konfiozinc.github.io/`).

---

## 9. Configuración pendiente después del despliegue (placeholders)

| # | Qué | Dónde |
|---|---|---|
| 1 | **Google Analytics 4:** reemplazar `G-XXXXXXXXXX` por el ID real y descomentar el bloque | `<head>` de todas las páginas (bloque comentado marcado con ⚠️ PLACEHOLDER) |
| 2 | **Search Console:** pegar el código de verificación | `<meta name="google-site-verification" content="PENDIENTE-CODIGO-SEARCH-CONSOLE">` |
| 3 | **Formspree:** reemplazar `https://formspree.io/f/xxxxx` por el endpoint real del formulario | `contacto.html` → `<form id="contactForm" action="…">` |
| 4 | **Google Business Profile:** crear el perfil con el mismo NAP (nombre, dirección, teléfono) para SEO local | Externo a este repositorio |
| 5 | Enviar `sitemap.xml` en Search Console y solicitar indexación de las páginas principales | Search Console |

### Eventos de tracking ya implementados

`assets/js/main.js` envía estos eventos a GA4 si `gtag` está disponible (si GA4 no está configurado,
no pasa nada: la función `track()` no falla):

| Evento | Cuándo se dispara |
|---|---|
| `click_whatsapp` | Clic en cualquier enlace `wa.me` o en el botón flotante de WhatsApp |
| `form_submit` | Envío correcto del formulario (con el método usado: Formspree o simulado) |
| `form_error` | Error de validación o fallo de red en el formulario |
| `filter_portfolio` | Uso de los filtros del portafolio (incluye cuántos resultados quedaron) |
| `play_video` | Clic para reproducir el video promocional |
| `ia_open` / `ia_message` / `ia_whatsapp_cta` | Interacción con el agente IA flotante |

---

## 10. Mantenimiento y buenas prácticas

- **No cambies la identidad visual** (colores, tipografías, radios): está centralizada en los
  tokens `:root` de `assets/css/styles.css`.
- **Reutiliza las clases existentes** antes de escribir CSS nuevo. El catálogo completo está
  documentado en `ESPECIFICACION_SITIO.md` (sección 9).
- **Mantén un solo `<h1>` por página** y la jerarquía H1 → H2 → H3.
- **Toda imagen necesita `alt` descriptivo**; usa `loading="lazy"` salvo en el logo del header.
- **Cada página nueva** debe incluir: canonical, Open Graph, Twitter Cards, favicon,
  `apple-touch-icon`, bloque GA4/Search Console comentado, y cerrar con
  `<script src="[../]assets/js/main.js" defer></script>`.
- **Antes de publicar**, revisa la consola del navegador en móvil, tablet y escritorio.
- **Respaldo:** `index-old.html` guarda la versión anterior del home; no lo borres hasta validar
  el nuevo sitio en producción.

### Verificación rápida antes de publicar (recomendado)

Incluye un verificador de integridad en Node.js que revisa enlaces rotos, metadatos SEO,
canonical, JSON-LD, jerarquía de encabezados, imágenes sin `alt` y coherencia del sitemap:

```powershell
cd "C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc"
node herramientas\verificar-sitio.js
```

Sale con código `0` si todo está bien y con `1` si hay errores, así que sirve también para CI.
Si detecta un enlace roto, corrígelo antes de hacer `push`.

### Comprobación manual de un enlace concreto (PowerShell)

```powershell
$repo = "C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc"
$html = Get-ChildItem -Path $repo -Recurse -Filter *.html | Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'index-old.html' }
foreach ($f in $html) {
  $content = Get-Content $f.FullName -Raw
  $base = $f.DirectoryName
  foreach ($m in [regex]::Matches($content, '(href|src)="([^"]+)"')) {
    $target = $m.Groups[2].Value
    if ($target -match '^(https?:|mailto:|tel:|#|data:|javascript:)') { continue }
    $target = $target.Split('#')[0].Split('?')[0]
    if ($target -eq '') { continue }
    if (-not (Test-Path (Join-Path $base $target))) { "ROTO · $($f.Name) -> $target" }
  }
}
```

---

## 11. Contacto del responsable

**Darwin Montalvo** — Fundador y Director de Estrategia Digital · KONFÍO ZINC

- Email: [konfiozinc@gmail.com](mailto:konfiozinc@gmail.com)
- WhatsApp: [+57 320 641 1340](https://wa.me/573206411340)
- Facebook: https://www.facebook.com/profile.php?id=61589654555930
- Instagram: https://www.instagram.com/konfiozinc
- TikTok: https://www.tiktok.com/@konfiozinc
