# KZ-DESIGN-001 · Despliegue de Neon Tech en producción

> **Dictamen: GO PRODUCCIÓN.** Neon Tech está publicado, integrado y verificado en el
> sitio real. Firebase, Cloudflare y los datos no se tocaron.

## 1. Integración

| Dato | Valor |
|---|---|
| Repositorio | `konfiozinc/card` |
| `main` antes | `e8491f2360df2a7f95b348a599844c64017df023` |
| Rama integrada | `kz-next-001/neon-tech` @ `48fed1d` |
| `merge-base` | `e8491f2` (la rama es **descendiente directo** de `main`) |
| Commits de `main` ausentes en la rama | **0** |
| `main` después | `587014fab187db9ea0732c8841d8db31a269d540` |
| Tipo de integración | `git merge --no-ff` (fusión normal, historial conservado, sin force-push) |

**Por qué no puede haber revertido nada.** La comprobación no fue a ojo: `git rev-list
--count kz-next-001/neon-tech..main` devolvió **0**, y `git merge-base --is-ancestor
e8491f2 kz-next-001/neon-tech` devolvió **exit 0**. Es decir, `main` es ancestro de la
rama, así que las correcciones de **KZ-SEC-002**, **CARD-SPARK-002**, **KZ-OPS-001**,
**KZ-OPS-002** y **KZ-QA-001** ya estaban dentro y ninguna podía perderse por
construcción. El árbol fusionado quedó idéntico al de la rama (`git diff` vacío).

Los 8 commits integrados: `24af778`, `6b4c97d`, `a30ad20`, `ff99623`, `0572463`,
`8fb4e54`, `7ad0398`, `48fed1d`.

## 2. Publicación

- `git push origin main` → `e8491f2..587014f  main -> main`, exit 0. Sin force-push.
- GitHub Actions sobre `587014f`:
  - **`pages build and deployment` → success**
  - **`Calidad KONFÍO ZINC` → success**
- El despliegue de Pages es un workflow de Actions y por eso tiene run propio; el
  `calidad.yml` del repo declara explícitamente que **no publica** nada.

## 3. El sitio público sirve lo nuevo, no la caché

No se comprobó «a ojo» con un 200. Se comparó el contenido servido con el committed:

- `index.html`: servido 23 950 caracteres, local 24 283 → **idénticos tras normalizar
  CRLF/LF** (la diferencia es solo el fin de línea de Windows).
- `assets/css/kz-neon.css`, `assets/css/kz-tokens.css`, `servicios.html`, `precios.html`:
  200 y equivalentes.
- La prueba de humo de producción vuelve a comparar 6 archivos con el criterio
  «desplegado == commiteado»: **24/24 en verde**.

## 4. Certificación de la identidad visual en producción

`herramientas/test/certificar-produccion-neon.js` mide el sitio **real** en escritorio
(1440×900) y móvil (375×667), no el local. **40 comprobaciones · PASAN 40 · FALLAN 0.**

| Página | h1 escritorio | h1 móvil | Oro | Desborde | Flotante bloquea |
|---|---|---|---|---|---|
| Portada | 48 px | 32,25 px | 0 | 0 px | 0 |
| Servicios | 49,6 px | 30,4 px | 0 | 0 px | 0 |
| Precios | 49,6 px | 30,4 px | 0 | 0 px | 0 |
| Portafolio | 49,6 px | 30,4 px | 0 | 0 px | 0 |
| Blog | 49,6 px | 30,4 px | 0 | 0 px | 0 |
| Contacto | 49,6 px | 30,4 px | 0 | 0 px | 0 |

En las 12 combinaciones: `h1` computa **Orbitron**, `document.fonts.check` confirma que
la fuente está disponible, los **6 enlaces** de la navegación de la portada y los **15**
de las páginas interiores resuelven con HTTP 200, y `--gold` **no está declarada**.

**Cero oro.** Se recorrieron todos los elementos de cada página leyendo `color`,
`backgroundColor` y los cuatro bordes, buscando `rgb(240, 180, 41)`: **0 hallazgos** en
las 12 vistas.

**Un solo botón flotante.** En las 7 páginas medidas a 375 px hay exactamente **un**
flotante visible (`#kzFabToggle` en 303,595) y **ningún solape**. El antiguo `.wa-float`
queda oculto por `kz-neon.css`, como se diseñó.

**Ningún control con el centro tapado** por el flotante, en ninguna página.

## 5. Regresión funcional en producción

| Capacidad | Resultado |
|---|---|
| Humo de producción | **24/24** |
| Asesor Konfi (Worker real) | **6/6** — ofrece Básica $49.900 y Pro $99.900, no anuncia $149.900 ni Elite |
| Widget Konfi en la web | Presente y visible en las 6 páginas; abre (356×567) y saluda |
| `/leads` | GET → 405, OPTIONS → 204: el endpoint existe y **no se envió ningún POST**, así que no se creó ningún dato |
| Formulario de contacto | Sin `action` externa; `main.js` apunta al Worker `/leads` |
| Panel `/admin.html` y `/panel.html` | Cargan con tokens, sin `--gold`, sin errores |
| Módulos del panel (`/admin/servicios.html`, `/admin/contactos.html`) | Cargan y **protegen sin sesión** con `requireAuth()`; sin credenciales lo correcto es acabar en la pantalla de acceso |
| Precios | Básica $49.900 y Pro $99.900 vigentes en la página; la oferta anterior no aparece |

`herramientas/test/certificacion-produccion-ops-001.cjs` **no se ejecutó**: escribe y
borra documentos en Firestore real, y el encargo prohíbe modificar datos reales.

## 6. Sistemas protegidos: intactos

- **Firebase:** ninguna operación. No se ejecutó `firebase deploy`, ni se tocaron reglas,
  índices, Auth o Firestore.
- **Cloudflare:** ninguna operación. No se ejecutó `wrangler`, ni se modificaron el
  Worker, los bindings KV ni los secretos. El Worker `calm-heart-6828` sigue respondiendo
  igual (6/6 del Asesor Konfi).
- **Datos reales:** no se creó, modificó ni borró ningún documento. La única escritura de
  la publicación fue el `push` a GitHub.

## 7. Defectos detectados y corregidos

Ninguno apareció en producción. Los tres se detectaron y corrigieron **antes** de
publicar, y se documentan porque dos estaban ocultos por verificadores que mentían:

1. **Botón primario blanco sobre cian (1,54:1).** `.kz-tech a { color: inherit }` (0,1,1)
   ganaba por especificidad a `.kz-tech-button--primary` (0,1,0) y el botón, que es un
   `<a>`, heredaba el blanco del body. Corregido con `:not(.kz-tech-button)` → 12,83:1.
2. **Hora del chat ilegible.** `#666` a 10 px daba 3,4:1 en la burbuja del bot y 1,9:1 en
   la cian del usuario. Ahora usa el token de texto apagado y hereda el color oscuro.
3. **Tres verificadores que daban falsa confianza.** El test de contraste de KZ-TECH-001
   comparaba literales de una paleta retirada; `verificar-panel-identidad` afirmaba que el
   oro resolvía al cian; `auditar-paleta` contaba modificadores BEM como conflictos. Los
   tres se corrigieron para medir de verdad.

Dos falsos positivos de mis propias comprobaciones, corregidos y no ocultados: el panel
«fallando» por lanzar `Sin acceso` sin sesión (es la protección), y `contacto.html`
«usando un endpoint ficticio» por mencionar Formspree en un comentario que dice lo
contrario.

## 8. Respaldo y reversión

- Tag **`respaldo/produccion-antes-neon`** → `e8491f2` (local).
- Rama **`respaldo/main-e8491f2`** → `e8491f2` (local).
- Además, `e8491f2` sigue siendo ancestro de `main`: **nunca sale del historial**, así que
  la versión anterior es recuperable aunque se pierdan las referencias locales.

Reversión si hiciera falta, sin force-push y sin resets destructivos:

```bash
git revert -m 1 587014f      # deshace la fusión entera como un commit nuevo
git push origin main
```

## 9. Evidencia

- 24 capturas de producción (6 páginas × escritorio y móvil × primera pantalla y página
  completa) en `C:\KZ-EVIDENCIA\produccion-neon\`.
- 30 capturas del candidato local en `C:\KZ-EVIDENCIA\design-001\integracion-final\`.
- Herramientas: `herramientas/test/certificar-produccion-neon.js` (identidad y maqueta en
  producción) y `herramientas/test/evidencia-produccion-neon.js` (liveness de `/leads` y
  capturas).

## 10. Límite declarado

`design-system/lab.html` devuelve 404 en el sitio público **a propósito**: `_config.yml`
excluye `design-system`, `docs`, `herramientas`, `functions`, las reglas de Firestore y la
configuración de Firebase. El laboratorio se revisa en local; no se sirve.
