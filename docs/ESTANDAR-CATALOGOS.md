# ESTÁNDAR KONFÍO ZINC — Catálogos Digitales

> Estándar oficial de la agencia para construir catálogos digitales (no e-commerce: catálogo informativo + cierre por WhatsApp).
> Referencia de implementación: `7-CATALOGOS/DTA-Chanclas` y `7-CATALOGOS/NBC-Company`.
> Complementa al estándar de menús: `docs/ESTANDAR-MENUS-DIGITALES.md`.

---

## 🎯 Stack técnico obligatorio

| Componente | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML + JS vanilla (Alpine.js opcional) | Ligero, sin build |
| Backend DB | Firebase RTDB (proyecto `el-titi-menu`) | Real-time, gratis, multi-cliente por namespace |
| Auth | Firebase Auth (email/contraseña) | Login seguro del panel |
| Imágenes | Cloudinary (unsigned preset) | Subida desde móvil sin tokens |
| Hosting | GitHub Pages | Gratis, sin servidor |
| Dominios autorizados | `konfiozinc.github.io` | Producción (IP local solo si se quiere probar en red) |

---

## 📁 Estructura de archivos

```
7-CATALOGOS/[NombreCatalogo]/
├── index.html              ← Catálogo público
├── admin.html              ← Panel admin
├── admin-config.js         ← Config Firebase + Cloudinary + color de marca
├── scripts.js  (o js/app.js) ← Lógica del catálogo público (lee Firebase)
├── styles.css  (o css/styles.css)
├── content/
│   └── productos.json  (o catalogo.json) ← Fallback local (respaldo)
├── assets/
│   ├── og-[catalogo].jpg    ← 1200×630 para OG
│   └── (fotos de productos)
├── manifest.json            ← PWA
├── service-worker.js
├── robots.txt
├── sitemap.xml
└── README.md
```

> DTA usa `js/app.js` + `css/styles.css`; NBC usa `scripts.js` + `styles.css` en la raíz. Ambas variantes son válidas.

---

## 🔥 Estructura Firebase obligatoria

```
[namespace]/                    ← ej. dta-chanclas, nbc-company
├── meta/                       ← { nombre, telefono, whatsapp, email?, ubicacion, categorias[], redes }
└── productos/                  ← Objeto { id: { ...campos según tipo } }
```

**Regla:** cada catálogo usa un namespace distinto dentro del proyecto `el-titi-menu`. El nodo `promo/` es propio de los menús; en catálogos es opcional.

### Configuración compartida (no cambiar)

```js
firebase: {
  apiKey: "AIzaSy… (copiar de Eltiti/scripts.js — clave pública del proyecto el-titi-menu)",
  authDomain: "el-titi-menu.firebaseapp.com",
  databaseURL: "https://el-titi-menu-default-rtdb.firebaseio.com",
  projectId: "el-titi-menu",
  storageBucket: "el-titi-menu.firebasestorage.app",
  messagingSenderId: "903648110789",
  appId: "1:903648110789:web:6ac58748862dfeb5a568ac"
}
```

> La `apiKey` es **pública por diseño** (la seguridad está en las Security Rules). Se omite aquí porque el repo `card` tiene un hook que bloquea API keys; cópiala de los repos de referencia.

### Cloudinary (compartido)

```js
cloudinary: { cloudName: 'f07x0wga', uploadPreset: 'menu-digital' }
```

---

## 📦 Modelos de datos por tipo

### Tipo A — Catálogo con precios duales (mayor + detal) · DTA Chanclas

Cada entrada es una **línea de producto** (una categoría con galería de fotos), no un producto individual.

```json
{
  "dama-planas": {
    "nombre": "Dama Planas",
    "categoria": "Dama",
    "descripcion": "Chanclas planas para dama.",
    "precioMayor": 24000,
    "precioDetal": 33000,
    "tallas": "Dama 35 a 41",
    "fotos": ["assets/catalogo_dta/dama-planas/planas1.jpg", "https://res.cloudinary.com/…"],
    "destacado": false,
    "agotado": false,
    "orden": 1
  }
}
```

- `precioMayor` + `precioDetal`: dos precios por línea.
- `tallas`: **string** libre (ej. "Dama 35 a 41"). No `variantes[]`.
- `fotos`: **galería múltiple** (rutas relativas o URLs de Cloudinary).

### Tipo B — Catálogo con precio único opcional · NBC Company

Cada entrada es un **producto individual** con descripción y características.

```json
{
  "set-de-ollas-10-piezas": {
    "nombre": "Set de Ollas 10 Piezas",
    "categoria": "ollas",
    "descripcionCorta": "Set completo en acero 316L.",
    "descripcionLarga": "Descripción completa…",
    "caracteristicas": ["Acero 316L", "Garantía 50 años"],
    "precio": 0,
    "precioVisible": false,
    "imagen": "assets/img/productos/placeholder.jpg",
    "destacado": true,
    "agotado": false,
    "orden": 1
  }
}
```

- `precio` + `precioVisible`: si `precioVisible: false`, el precio **no se muestra** (venta por asesoría).
- `caracteristicas`: lista editable.
- `imagen`: **única** (no galería).

---

## 🎨 Características obligatorias

### Panel admin (`admin.html` + `admin-config.js`)

- ✅ Login Firebase Auth (email precargado en `admin-config.js`)
- ✅ CRUD completo (crear, editar, eliminar)
- ✅ Toggle destacado (⭐) y agotado (👁)
- ✅ Subida de imágenes a Cloudinary
- ✅ Buscador y filtros por categoría
- ✅ Mobile-first (375×667)
- ✅ Firebase fuera del estado reactivo de Alpine + `JSON.parse(JSON.stringify(...))`

**Campos por tipo:**
- Tipo A (dual): nombre, categoría, descripción, `precioMayor`, `precioDetal`, `tallas`, `fotos[]` (galería con añadir/quitar), destacado, agotado.
- Tipo B (único): nombre, categoría, `descripcionCorta`, `descripcionLarga`, `caracteristicas[]` (lista dinámica), `precio`, `precioVisible` (toggle), `imagen`, `orden`, destacado, agotado.

### Sitio público (`index.html`)

- ✅ Lee productos de Firebase con `.on('value')` (en vivo)
- ✅ Fallback a JSON local si Firebase falla
- ✅ Tipo A: galería por línea + precios mayor/detal + tallas + botón WhatsApp por línea
- ✅ Tipo B: destacados primero + overlay "No disponible" en agotados + precio solo si `precioVisible`
- ✅ Buscador y filtros (si aplica)
- ✅ OG metadata (1200×630, <300KB)
- ✅ PWA instalable

---

## ⚙️ Proceso de setup (checklist)

1. **Firebase Console → Authentication → Users:** crear `admin@[catalogo].com` + contraseña segura.
2. **Firebase Console → Authentication → Settings → Dominios autorizados:** verificar `konfiozinc.github.io`.
3. **Firebase Console → Realtime Database → Datos:** crear nodo `[namespace]/` con `meta/` y `productos/`. Migrar productos desde el JSON.
4. **GitHub → crear repo** `konfiozinc/[catalogo]`.
5. **SSH:** `git remote set-url origin git@github.com:konfiozinc/[catalogo].git`.
6. **GitHub Pages:** Source `main`, `/ (root)`.
7. **Probar:** público + panel + login + subir imagen + editar precio.

---

## 🚫 Reglas inquebrantables

| # | Regla |
|---|---|
| 1 | NUNCA Firebase Storage → usar Cloudinary |
| 2 | NUNCA guardar instancia Firebase dentro de Alpine → variable global |
| 3 | SIEMPRE `JSON.parse(JSON.stringify())` al leer de Firebase |
| 4 | NUNCA tokens en URLs de git → usar SSH |
| 5 | SIEMPRE mobile-first (375×667) |
| 6 | NUNCA publicar sin probar en móvil real |
| 7 | SIEMPRE fallback local si Firebase falla |
| 8 | NUNCA olvidar dominios autorizados en Firebase Auth |

**Específicas de catálogos:**
| # | Regla |
|---|---|
| 9 | Catálogo = informativo (cierre por WhatsApp), **NO** e-commerce → **sin stock numérico** (solo toggle agotado) |
| 10 | `precioVisible: false` → el precio **no** se muestra en el público |
| 11 | La `apiKey` de Firebase es pública; si un hook pre-commit la bloquea, agregarla a `KNOWN_KEYS` (nunca con `--no-verify`) |

---

## 📝 Prompt para crear un catálogo nuevo

```
Crea un catálogo digital para [NOMBRE] siguiendo el ESTÁNDAR KONFÍO ZINC — Catálogos.

Datos:
- Nombre: [nombre]
- Tipo: [precios duales (mayor/detal) | precio único opcional]
- Color de marca: [hex]
- Namespace Firebase: [slug]
- Categorías: [lista]
- Ciudad: [ciudad]
- WhatsApp: [número]

Requisitos:
- index.html + admin.html + admin-config.js + scripts.js + styles.css
- Firebase RTDB + Auth + Cloudinary
- Público lee de Firebase con fallback local
- Panel admin completo (CRUD + destacado + agotado + imágenes)
- OG 1200×630, PWA, mobile-first

Referencia: 7-CATALOGOS/DTA-Chanclas (dual) y NBC-Company (precio único).
```

---

## 💡 Ventajas

- Cliente no técnico gestiona su catálogo solo.
- Cero servidores (GitHub + Firebase + Cloudinary gratis).
- Real-time: cambiar precio en el panel → se refleja al instante.
- Un proyecto Firebase soporta N catálogos (un namespace por cliente).
- Reproducible en ~1 hora siguiendo el checklist.
