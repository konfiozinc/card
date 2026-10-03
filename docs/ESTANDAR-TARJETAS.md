# ESTÁNDAR KONFÍO ZINC — Tarjetas Digitales

> Estándar oficial de la agencia para tarjetas digitales (tiers Star / Pro / Elite / Premium).
> Es una **tarjeta de contacto digital** (no una landing ni un catálogo): identidad + servicios + contacto en 2-3 pantallas.
> Referencia de implementación: `2-TARJETAS-PRO/Deicy Buitrago` (Pro) y `3-TARJETAS-ELITE/SAMEM` (Elite).

---

## 🎯 Stack técnico obligatorio

| Componente | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JS vanilla | Sin frameworks, sin build, carga instantánea |
| Hosting | GitHub Pages | Gratis, sin servidor |
| PWA | manifest.json + service-worker.js | Instalable en la pantalla de inicio |
| Analytics | GA4 + Firestore (`konfio-zinc`) | Trackear clicks de WhatsApp |
| Compartir | `navigator.share` nativo | Compartir la tarjeta como enlace |

---

## 📁 Estructura de archivos

```
[1-4]-TARJETAS-[TIER]/[Nombre]/
├── index.html              ← La tarjeta
├── styles.css
├── app.js  (o scripts.js)  ← Lógica (links, share, vCard, PWA)
├── manifest.json            ← PWA
├── service-worker.js
├── 404.html
├── privacidad.html
└── assets/
    ├── logo/                ← Logo del cliente
    ├── img/                 ← og-image.jpg (1200×630), fotos
    └── icons/               ← favicon, icon-192, icon-512
```

---

## 🎨 Paleta de colores

- La paleta se define por la **marca del cliente** (`theme-color` = color de marca).
- Guía por tier:
  - **Elite / Premium** → look premium (negro/dorado).
  - **Start / Pro** → color de marca del cliente (ej. Deicy `#1A2B5C`, SAMEM `#E30613`).
- **Botones de contacto con colores oficiales** (siempre):
  - WhatsApp → verde `#25D366`
  - Instagram → gradiente (púrpura→rosa→naranja)
  - Teléfono → azul
  - Correo → rojo

---

## 📐 Secciones obligatorias

1. **Hero compacto** — logo + nombre + tagline + estado/rol (ej. "Administradora de Propiedad Horizontal").
2. **CTA WhatsApp** — botón principal (en hero y/o flotante).
3. **Servicios / especialidades** — lista corta (3-6 ítems).
4. **Contacto** — botones: WhatsApp, teléfono, correo, Instagram (colores oficiales).
5. **Footer compacto** — 1 línea (marca, año, legal).

---

## ✅ Características obligatorias

- SEO completo: `<title>`, `<meta description>`, `keywords`, `canonical`.
- Open Graph: `og:type`, `og:title`, `og:description`, `og:url`, `og:image` (1200×630, <300KB), `og:image:width/height`.
- Twitter Cards: `summary_large_image` + `twitter:title/description/image`.
- JSON-LD (`LocalBusiness` o `Person` + `sameAs` con redes sociales).
- `theme-color` = color de marca.
- PWA instalable (manifest + service worker + iconos 192/512).
- GA4 + tracking de clicks WhatsApp (Firestore).
- Botón **compartir nativo** (`navigator.share`).
- Mobile-first (375×667).

---

## 🚫 Reglas específicas de tarjetas

1. Respetar la **identidad/marca del cliente** (logo, colores, tono).
2. **NO convertir en landing** — es una tarjeta de contacto, no un sitio completo.
3. **NO scroll infinito** — todo debe caber en 2-3 pantallas.
4. **Un solo CTA principal** (WhatsApp); el resto son accesos secundarios.
5. Carga instantánea (archivos ligeros, sin dependencias pesadas).

---

## ⚙️ Checklist de setup

1. Crear repo `konfiozinc/[slug]` + GitHub Pages (`main`, `/ root`).
2. Generar `og-image.jpg` 1200×630 + iconos 192/512 + favicon.
3. `manifest.json` con nombre, colores e iconos.
4. `theme-color` = color de marca.
5. Inyectar GA4 + script de tracking Firestore (`konfio-zinc`).
6. Remote SSH: `git remote set-url origin git@github.com:konfiozinc/[slug].git`.
7. Probar en móvil real (compartir, WhatsApp, instalar PWA).

---

## 📝 Prompt de creación rápida

```
Crea una tarjeta digital para [NOMBRE] siguiendo el ESTÁNDAR KONFÍO ZINC — Tarjetas.

Datos:
- Nombre: [nombre]
- Rol/negocio: [profesión o giro]
- Tier: [Star | Pro | Elite | Premium]
- Color de marca: [hex]
- Ciudad: [ciudad]
- Teléfono: [número]
- WhatsApp: [número]
- Correo: [email]
- Instagram: [usuario]
- Servicios: [lista corta]

Requisitos:
- index.html + styles.css + app.js + manifest + service-worker
- Hero compacto + CTA WhatsApp + servicios + contacto (colores oficiales)
- SEO + OG + Twitter Cards + JSON-LD + PWA + GA4
- Mobile-first

Referencia: 2-TARJETAS-PRO/Deicy Buitrago (Pro) o 3-TARJETAS-ELITE/SAMEM (Elite).
```

---

## 📌 Referencias por tier

| Tier | Ejemplo | Carpeta |
|---|---|---|
| Start | NP Style Corte y Color | `1-TARJETAS-START` |
| Pro | Deicy Buitrago | `2-TARJETAS-PRO` |
| Elite | SAMEM, Tarjeta_Pre | `3-TARJETAS-ELITE` |
| Premium | Nómina Centinela | `4-TARJETAS-PREMIUM` |
