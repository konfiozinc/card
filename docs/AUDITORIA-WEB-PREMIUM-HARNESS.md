# Web pública premium · auditoría, matriz de migración y protocolo de calidad (Harness)

Estado del trabajo de **Harness** (calidad e integración) sobre la web pública de KONFÍO ZINC.
No modifica la Intranet ni Card Spark. No publica nada. Fecha: 2026-10-19.

---

## A · Inventario del sitio actual (verificado, solo lectura)

Fuente: `herramientas/auditar-sitio-publico.js` → `docs/AUDITORIA-WEB-PUBLICA.json` (datos reales, no estimados).

| Métrica | Valor |
|---|---|
| Páginas HTML recorridas | **30** (tope del recorrido; el sitemap lista las oficiales) |
| HTML total | **1.054 KB** (20–66 KB por página: CSS y JS en línea) |
| Imágenes únicas | **56** · **5.457 KB** (≈5,3 MB) · **0 sin alt** |
| `description` / `canonical` / JSON-LD | 30/30 · 30/30 · 30/30 ✅ |
| `h1` por página | exactamente 1 en todas ✅ |
| `lang` y `viewport` | presentes en todas ✅ |
| Enlaces internos rotos | **0** |
| Terceros cargados | googletagmanager, fonts.googleapis, fonts.gstatic, cdnjs (Font Awesome), wa.me, redes sociales, gstatic, policies.google |
| Formularios con datos en la URL (GET) | **0** |
| Errores críticos de JS | 0 (en las páginas probadas) |

**Estructura real:** `index` · `servicios` + 6 fichas · `portafolio` + 6 fichas · `blog` + 9 artículos ·
`nosotros` · `contacto` · `precios` · `aliados` · `politica-privacidad` · `panel`/`admin` (CRM).

**Defectos comprobados (no supuestos):**
1. **Peso**: 5,3 MB de imágenes y ~1 MB de HTML para 30 páginas. Las imágenes ya existen en local; el problema es tamaño/formato, no dependencia.
2. **Dependencias externas frágiles**: Google Fonts, Font Awesome por CDN y GTM. Si el CDN falla, la página sigue mostrando contenido (probado), pero pierde tipografía e iconos.
3. **CSS/JS en línea** en cada página: no hay caché compartida; cualquier cambio se descarga entero en cada visita.
4. **Doble vía de datos del sitio**: las tarjetas del portafolio y el blog se repiten por ficha, lo que multiplica HTML.
5. Ya corregido en Card Spark (`a27c7fa`) y **fuera del artefacto público**: `docs/`, `herramientas/`, `functions/`, reglas e índices responden 404.

**Afirmaciones comerciales que requieren respaldo** (no inventar): catálogo de precios vigente
(Mini Web Básica $49.900 / Pro $99.900; los nombres *Star/Pro/Elite* y $149.900 están retirados),
«atención 24/7» (el criterio interno es *soporte de fallas 24/7 · atención comercial Lun-Sáb*),
resultados y tiempos de entrega, número de clientes/proyectos, y cualquier métrica de conversión.

## B · Matriz de migración

| Contenido | Decisión | Notas |
|---|---|---|
| Home, servicios (6 fichas), portafolio (6), nosotros, contacto, privacidad | **Conservar** contenido y URLs | Son las rutas indexadas; no deben romperse |
| Blog (9 artículos) + índice | **Conservar** rutas exactas | Cada artículo es una URL con valor SEO |
| `precios.html` | **Conservar ruta**, actualizar contenido | Los precios vigentes son dos Mini Webs; no reintroducir retirados |
| `aliados.html` | **Conservar** | Contiene comisiones internas: revisar qué se publica |
| `panel.html` / `admin/*` | **Conservar** (CRM) | No forman parte de la web comercial; el CRM vive en Spark |
| Imágenes | **Optimizar** (WebP/AVIF, tamaños responsivos) | 5,3 MB → objetivo < 1,2 MB |
| CSS/JS en línea | **Extraer** a archivos con caché | Mejora TTFB y reutilización |
| Google Fonts / Font Awesome CDN | **Localizar** o aceptar con respaldo | Evita dependencia frágil |
| GTM | **Mantener** (analítica) con consentimiento | Revisar política de privacidad |
| Afirmaciones sin respaldo | **Validar con el propietario** antes de publicar | Lista en la sección A |
| Archivos internos | **Excluir** vía `_config.yml` (ya hecho) | Verificado 404 en producción |

**Redirecciones necesarias:** ninguna nueva si Codex conserva las rutas y nombres de archivo
actuales. Si el candidato cambia rutas (por ejemplo `/servicios/` → `/servicios`), hay que añadir
páginas de redirección HTML estáticas, porque GitHub Pages no admite reglas de servidor.

## C · Protocolo de calidad (ejecutable)

```powershell
node herramientas/auditar-sitio-publico.js --max 40          # inventario (FASE A)
node herramientas/probar-web-publica.js --base <url>         # 14 comprobaciones de calidad
node herramientas/verificar-artefacto-paginas.js             # 176 publicables, interno fuera
node herramientas/verificar-precios.js                       # nomenclatura y precios
```

`probar-web-publica.js` cubre: estados 200, título/descripción, lang/viewport, un solo h1, alt en
imágenes, formularios sin GET, presupuesto de HTML, recorrido por teclado, texto al 200 %, móvil
375×667 (desbordamiento, CTA, tamaño de texto), funcionamiento sin red externa y errores de JS.
Se le pasa la base del candidato local, así que sirve tal cual cuando Codex entregue.

**Resultado actual (sitio en producción):** 14 comprobaciones en verde, 1 aviso (dependencias
externas de fuentes/iconos/analítica).

## D · Integración con Codex

**No he revisado ningún candidato premium: no existe todavía y no tengo acceso a él.** No afirmo lo
contrario. Mecanismo común necesario antes de auditar:

1. **Ubicación**: una rama en `konfiozinc/card` (por ejemplo `web/premium`) o un repositorio propio.
   Sin ZIP ni carpetas compartidas improvisadas.
2. **Acceso**: si es rama, Harness necesita que esté empujada al remoto (autorización del dueño) o
   un bundle Git entregado por el propietario. Hoy el repo es público: **no se empuja sin permiso**.
3. **Raíz de publicación**: si la web premium sustituye al sitio, debe ser la raíz del repo
   (GitHub Pages) y conservar `precios.html` y las rutas indexadas.
4. **Handoff**: commit exacto, rama, rutas nuevas/cambiadas, aviso de qué NO tocar (CRM en `admin/`).
5. **Regla de no colisión**: Harness corrige solo en su rama `harness/integracion-web`; los cambios
   de diseño vuelven a Codex como hallazgos.

## E · Preparación del lanzamiento (sin ejecutar)

```powershell
# 1. HEAD de producción
git fetch origin main && git rev-parse origin/main
# 2. comprobaciones previas (sirve para el candidato premium cambiando el commit)
pwsh herramientas/publicar-paginas.ps1            # árbol limpio, avance rápido, precios.html intacto
node herramientas/verificar-artefacto-paginas.js  # publicables y exclusiones
node herramientas/probar-web-publica.js --base http://127.0.0.1:5200/
```

- **Aprobación**: 0 fallos en la batería + 0 enlaces rotos + artefacto sin archivos internos +
  `precios.html` intacto + afirmaciones comerciales validadas por el propietario.
- **Publicación**: un único `git push` en avance rápido (nunca `--force`), etiqueta
  `release/previo-<commit>` antes de empujar.
- **Reversión**: `git revert` del commit publicado; emergencia: `main` vuelve a la etiqueta con
  autorización expresa. Datos del CRM: respaldo del kit privado, sin relación con este cambio.
- **Privacidad**: nada de credenciales, respaldos ni `docs/`, `herramientas/`, `functions/` en el
  artefacto; formularios solo por POST con backend o por WhatsApp (nunca datos en la URL).

## Riesgos críticos

1. **Rutas**: si el candidato cambia nombres de archivo, se pierde el SEO acumulado sin redirecciones.
2. **Peso**: 5,3 MB de imágenes es el mayor problema de rendimiento del sitio actual; el candidato debe
   bajar de ~1,2 MB pagando calidad.
3. **Doble origen de datos del CRM**: la web pública y el panel comparten repositorio; el panel es
   Spark y no debe tocar `admin/` ni `firestore.rules` en esta misión.
4. **Contenido no verificado**: publicar precios o servicios retirados es el error histórico ya
   documentado; el verificador de precios debe pasar siempre.
