# ESTÁNDAR KONFÍO ZINC — Menús Digitales

> Estándar oficial de la agencia para construir menús digitales. **Todo menú nuevo se construye siguiendo este documento, sin excepción.**
> Referencia de implementación: `8-MENUS-DIGITALES/Colsabor` y `8-MENUS-DIGITALES/Eltiti`.

---

## 🎯 Stack técnico obligatorio

| Componente | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML + Alpine.js + JS vanilla | Ligero, sin build, funciona en cualquier hosting |
| Backend DB | Firebase RTDB (proyecto `el-titi-menu`) | Real-time, gratis, multi-cliente por namespace |
| Auth | Firebase Auth (email/contraseña) | Login seguro sin PIN |
| Imágenes | Cloudinary (unsigned preset) | Subida desde móvil sin tokens |
| Hosting | GitHub Pages | Gratis, sin servidor |
| Dominios autorizados | `konfiozinc.github.io` + IP local | Para desarrollo y producción |

---

## 📁 Estructura de archivos obligatoria

```
8-MENUS-DIGITALES/[NombreMenu]/
├── index.html              ← Menú público
├── admin.html              ← Panel admin
├── admin-config.js         ← Config Firebase + Cloudinary + color de marca
├── scripts.js              ← Lógica del menú público (lee Firebase)
├── styles.css              ← Estilos del menú público
├── data/
│   ├── productos.json      ← Fallback local (respaldo)
│   └── firebase-config.json ← Config pública
├── assets/
│   ├── og-[menu].jpg       ← 1200×630 para OG
│   ├── productos/          ← Fotos de productos
│   └── icon-192.png, icon-512.png ← PWA
├── manifest.json           ← PWA
├── sw.js                   ← Service worker
├── robots.txt
├── sitemap.xml
└── README.md               ← Documentación del menú
```

---

## 🔥 Estructura Firebase obligatoria

```
[namespace]/                    ← ej. colsabor, eltiti, [nuevo]
├── meta/                       ← { horario, categorias[], telefono, whatsapp, ubicacion, redes }
├── productos/                  ← Objeto { id: { nombre, categoria, precio, imagen, agotado, destacado, tiempo, descripcion } }
└── promo/                      ← String con la promo actual
```

**Regla:** cada menú nuevo usa un namespace distinto dentro del mismo proyecto `el-titi-menu`.

### Configuración real del proyecto (no cambiar)

> La `apiKey` de Firebase es **pública por diseño** (no es un secreto; la seguridad está en las Security Rules). Se omite aquí porque el repo `card` tiene un hook de seguridad que bloquea API keys. Cópiala de `8-MENUS-DIGITALES/Eltiti/scripts.js` — es la misma para todos los menús.

```js
firebase: {
  apiKey: "AIzaSy… (copiar de Eltiti/scripts.js)",
  authDomain: "el-titi-menu.firebaseapp.com",
  databaseURL: "https://el-titi-menu-default-rtdb.firebaseio.com",
  projectId: "el-titi-menu",
  storageBucket: "el-titi-menu.firebasestorage.app",
  messagingSenderId: "903648110789",
  appId: "1:903648110789:web:6ac58748862dfeb5a568ac"
}
```

### Cloudinary (compartido para todos los menús)

```js
cloudinary: {
  cloudName: 'f07x0wga',
  uploadPreset: 'menu-digital'   // unsigned, carpeta 'menus'
}
```

---

## 🎨 Características obligatorias

### Menú público (`index.html`)

- ✅ Carga productos desde Firebase (con fallback a JSON local)
- ✅ Patrón anti-bug: `JSON.parse(JSON.stringify())` para desproxear
- ✅ Muestra: nombre, categoría, precio, imagen, tiempo (⏱), destacados (⭐), agotados (overlay)
- ✅ Buscador funcional
- ✅ Filtros por categoría
- ✅ Botón WhatsApp por producto
- ✅ Modo claro/oscuro (opcional pero recomendado)
- ✅ PWA instalable
- ✅ OG metadata (1200×630, <300KB)

### Panel admin (`admin.html`)

- ✅ Login Firebase Auth (email/contraseña)
- ✅ CRUD completo: crear, editar, eliminar productos
- ✅ Toggle destacado (⭐)
- ✅ Toggle agotado (ojo)
- ✅ Campo tiempo de preparación
- ✅ Campo descripción
- ✅ Subida de imágenes a Cloudinary
- ✅ Buscador en el panel
- ✅ Filtros por categoría
- ✅ Mobile-first (375×667)

### Configuración (`admin-config.js`)

```js
window.ADMIN_CONFIG = {
  nombre: 'NombreMenu',
  color: '#XXXXXX',           // Color de marca
  logo: '🍽️',                 // Emoji o imagen
  ruta: 'namespace',          // Namespace en Firebase
  categorias: ['...'],        // Categorías del menú
  firebase: { /* config el-titi-menu */ },
  cloudinary: {
    cloudName: 'f07x0wga',
    uploadPreset: 'menu-digital'
  }
};
```

---

## ⚙️ Proceso de setup (checklist)

Al crear un menú nuevo, hacer SIEMPRE:

1. **Firebase Console → Authentication → Users:** crear usuario `admin@[menu].com` + contraseña segura.
2. **Firebase Console → Authentication → Settings → Dominios autorizados:** verificar que `konfiozinc.github.io` esté (y la IP local para pruebas).
3. **Firebase Console → Realtime Database → Datos:** crear nodo `[namespace]/` con `meta/`, `productos/`, `promo/`. Migrar productos desde el JSON inicial.
4. **GitHub → crear repo:** `konfiozinc/[menu]`.
5. **Configurar SSH en el repo:**
   ```powershell
   git remote set-url origin git@github.com:konfiozinc/[menu].git
   ```
6. **GitHub Pages → Settings → Pages:** Source `main` branch, `/ (root)`. Activar y esperar deploy.
7. **Probar:**
   - `https://konfiozinc.github.io/[menu]/` → menú público
   - `https://konfiozinc.github.io/[menu]/admin.html` → panel
   - Login con el usuario creado
   - Subir imagen de prueba

---

## 🚫 Reglas inquebrantables

| # | Regla |
|---|---|
| 1 | NUNCA Firebase Storage (usar Cloudinary) |
| 2 | NUNCA guardar instancia Firebase dentro de Alpine (usar variable global) |
| 3 | SIEMPRE `JSON.parse(JSON.stringify())` al leer de Firebase |
| 4 | NUNCA commitear tokens en URLs de git (usar SSH) |
| 5 | SIEMPRE mobile-first antes de desktop |
| 6 | NUNCA publicar sin probar en móvil real |
| 7 | SIEMPRE fallback local si Firebase falla |
| 8 | NUNCA olvidar dominios autorizados en Firebase Auth |

---

## 📝 Prompt para crear un menú nuevo

```
Crea un menú digital para [NOMBRE] siguiendo el ESTÁNDAR KONFÍO ZINC documentado en AGENTS.md.

Datos del cliente:
- Nombre: [nombre]
- Tipo de comida: [tipo]
- Color de marca: [hex]
- Namespace Firebase: [slug]
- Categorías: [lista]
- Ciudad: [ciudad]
- WhatsApp: [número]

Requisitos:
- Estructura de archivos idéntica a Colsabor/El Titi
- admin.html + admin-config.js + scripts.js + styles.css
- Firebase Auth, RTDB, Cloudinary
- Menú público lee de Firebase
- Panel admin completo (CRUD + destacado + agotado + tiempo + descripción)
- OG metadata 1200×630
- PWA
- Mobile-first

Proceso:
1. Leer AGENTS.md y la spec completa
2. Crear estructura de archivos
3. Configurar Firebase (yo lo hago manual)
4. Migrar productos iniciales
5. Levantar servidor local para mi revisión
6. NO commitear hasta mi OK

Referencia: compara con 8-MENUS-DIGITALES/Colsabor y 8-MENUS-DIGITALES/Eltiti
```

---

## 💡 Ventajas de este estándar

- El cliente no técnico puede gestionar su menú solo.
- Cero mantenimiento de servidores (todo gratis: GitHub + Firebase + Cloudinary).
- Real-time (los cambios se ven al instante).
- Escalable (mismo proyecto Firebase soporta N menús).
- Mobile-first (dueños y clientes usan celular).
- Reproducible (nuevo menú en ~1 hora siguiendo el checklist).
