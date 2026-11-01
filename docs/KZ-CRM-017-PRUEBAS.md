# KZ-CRM-017 · Pruebas

**Fecha:** 2-nov-2026 · **URL publicada:** https://konfiozinc.github.io/card/crm/

---

## Resumen

| Batería | Alcance | Resultado |
|---|---|---|
| `crm-dev/pruebas-publicado.cjs` | **el sitio publicado**, navegador real | **26/26** |
| `crm-dev/capturas.cjs` | visual, 4 tamaños, servidor local | **32/32** |
| `crm-dev/certificar-produccion.cjs` | acceso anónimo contra Firebase real | **17/17** |
| `crm-dev/verificar-destino-reglas.cjs` | estado de los dos releases | **8/8** |
| `crm-dev/verificar-operacion.cjs` | cuenta, rol y coherencia de datos | **11/11** |
| `crm-dev/verificar-aislamiento.cjs` | aislamiento de Firebase | **15/15** |
| **Total** | | **109 comprobaciones · 0 fallos** |

## 1. Certificación del sitio publicado (26/26)

Ejecutada contra `https://konfiozinc.github.io/card/crm/`, no contra local.

**A. Recursos (10)**

| Comprobación | Resultado |
|---|---|
| `/crm/`, `/crm/index.html`, `/crm/crm.js`, `/crm/crm.css`, `/crm/alta-prospecto.js` | 200 |
| `/assets/css/kz-tokens.css` (paleta oficial) | 200 |
| `/crm-dev/firestore.rules` · `/crm-dev/activar-admin.cjs` · `/crm-dev/pruebas.cjs` | **404** |
| `/crm/formulario.html` (captación) | **404** |

**B. Configuración (6)**: pantalla de acceso visible para cualquiera · el panel no está en modo
emulador · el cliente declara la base `default` · **un visitante sin sesión recibe
`permission-denied`** · las peticiones declaran `databases%2Fdefault` · ninguna usa `(default)`.

**C. Autenticación (5)**: con contraseña incorrecta muestra **«Correo o contraseña
incorrectos.»** (en español, accionable) · no revela si el correo existe · no entra · 0 errores
de JavaScript o recursos propios · el único 400 de red es el acceso fallido provocado por la
prueba misma.

**D. Responsive (4)**: 375×812, 768×1024, 1440×900 y 1920×1080 sin desbordamiento horizontal.

> **Sobre la prueba C:** no inicia sesión. Usa el correo del administrador con una contraseña
> deliberadamente incorrecta, así que no obtiene credenciales ni escribe datos. Lo que demuestra
> es que la cadena `página → SDK → kzfio-crm → Authentication` está viva y bien configurada.

## 2. Verificación visual (32/32, 4 tamaños)

Por cada tamaño: sin desbordamiento de página ni de `body` · formulario visible · paleta
oficial cargada (`--kz-cyan` = `#00E5FF`) · todos los controles visibles ≥ 40 px de alto ·
sin errores de consola · contraste AA del título (**19.73:1**) y de la nota (**9.79:1**).

Capturas en `crm-dev/capturas/`:
`movil-375x812.png` · `tablet-768x1024.png` · `escritorio-1440x900.png` · `escritorio-1920x1080.png`
y las del sitio publicado `publicado-*.png`.

La revisión visual cualitativa la hizo Codex sobre las cuatro capturas: jerarquía clara, el
formulario cabe completo en móvil sin recortes, ancho cómodo de 420 px en escritorio, buen
contraste. Señaló un solo defecto (**VIS-01**: el botón «Entrar» pegado al campo de contraseña),
que se corrigió.

## 3. Acceso anónimo contra producción (17/17)

Sin credencial, contra la base real: lectura de `crm_leads`, `crm_quotes`, `crm_sales`,
`crm_audit` y `crm_usuarios` → **403**. **Escritura anónima de un prospecto válido → 403**
(la prueba que discrimina). Modificar, borrar, cotizar, vender, auditar y fabricarse un rol →
**403**. Control positivo: la credencial privilegiada sí alcanza la base.

## 4. Coherencia y estado (11/11)

La cuenta del administrador existe, está habilitada, ha iniciado sesión y tiene rol `admin`
activo. Las colecciones comerciales están vacías (no se introdujeron datos reales ni ficticios,
como exige la misión). Invariantes verificados sobre lo existente: contrato de prospectos,
importes de cotización, venta↔cotización, coherencia de la estadística y acciones de auditoría.

## 5. Lo que estas pruebas NO demuestran

- **No** demuestran el recorrido autenticado completo *en el sitio publicado*: para eso hace
  falta la contraseña del administrador, que sólo él tiene. Se certificó la pantalla de acceso,
  la configuración y el rechazo; el flujo comercial se certificó en el emulador con el mismo
  archivo de reglas (31/31 y 52/52 en KZ-CRM-016) y contra producción en KZ-CRM-016.
- **No** sustituyen una prueba en un móvil físico: las capturas son de navegador con viewport
  móvil, no de un teléfono real.
- **No** hay revisión de seguridad independiente del código corregido: el auditor revisó la
  versión anterior y las correcciones se validaron con estas baterías.

## 6. Cómo se repiten

```bash
cd 6-LANDING-PAGES/Konfio-Zinc-Web
export RCL_CHROMIUM="C:\Program Files\Google\Chrome\Application\chrome.exe"

node crm-dev/pruebas-publicado.cjs        # sitio publicado (no inicia sesión)
node crm-dev/capturas.cjs                 # visual en 4 tamaños
node crm-dev/certificar-produccion.cjs    # anónimo contra Firebase real
node crm-dev/verificar-destino-reglas.cjs
node crm-dev/verificar-operacion.cjs
node crm-dev/verificar-aislamiento.cjs
```
