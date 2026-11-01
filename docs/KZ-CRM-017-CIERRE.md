# KZ-CRM-017 · Cierre de fase: correcciones móviles

**Fecha:** 2-nov-2026 · **URL:** https://konfiozinc.github.io/card/crm/ · **Commit publicado:** `c463979`

---

## 1. Defecto reportado y su causa real

La casilla de consentimiento aparecía como **un bloque blanco desproporcionado en móvil**.

Causa: la casilla es un `<input>`, y `crm.css` tenía un selector genérico
`input, select, textarea { width: 100%; min-height: 44px; }` que **también se aplicaba al
checkbox**. No existía ninguna regla `.consent` que lo acotara.

Medido antes de corregir:

| Tamaño | Casilla | Desfase con su texto |
|---|---|---|
| 375×812 | **323 × 44 px** | 50 px |
| 768×1024 | **702 × 44 px** | 51 px |

Es decir: ocupaba todo el ancho del formulario, con el texto empujado muy abajo.

## 2. Corrección

Regla `.consent` nueva, con anulación explícita de lo heredado:

```css
.consent { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; }
.consent input[type="checkbox"] {
  width: 20px; min-width: 20px; max-width: 20px;
  height: 20px; min-height: 0; flex: 0 0 20px;
  margin: 2px 0 0;
  accent-color: var(--kz-cyan, #00E5FF);   /* casilla cian, no un bloque blanco */
}
```

Medido después:

| Tamaño | Casilla | Fila táctil | Desfase | Contraste |
|---|---|---|---|---|
| 375×812 | **20 × 20 px** | 57 px | **2 px** | 14.53:1 |
| 768×1024 | 20 × 20 px | 44 px | 2 px | 14.53:1 |
| 1440×900 | 20 × 20 px | 44 px | 2 px | 14.53:1 |
| 1920×1080 | 20 × 20 px | 44 px | 2 px | 14.53:1 |

## 3. Dos defectos más que encontró la medición

Al medir todos los controles aparecieron dos problemas que no estaban reportados:

| Defecto | Corrección |
|---|---|
| El botón **Exportar CSV** medía **40 px** en móvil (el resto 44) | En `≤560px`, `button` y `.mini` pasan a `min-height: 44px` |
| **`q-plan`, `s-quote` y `s-monto` sin etiqueta**: sólo tenían `placeholder` | Etiquetas visibles con `label[for]` y `autocomplete`/`inputmode` |

Sin etiqueta, un lector de pantalla anuncia el campo sin decir para qué sirve, y el
`placeholder` desaparece al escribir.

## 4. Pruebas ejecutadas

| Batería | Alcance | Resultado |
|---|---|---|
| `crm-dev/pruebas-formularios.cjs` | 4 tamaños, sitio **local** | **44/44** |
| `crm-dev/pruebas-formularios.cjs --publicado` | 4 tamaños, sitio **publicado** | **44/44** |
| `crm-dev/pruebas-publicado.cjs` | sitio publicado (recursos, config, Auth, responsive) | **26/26** |
| `crm-dev/certificar-produccion.cjs` | acceso anónimo contra Firebase real | **17/17** |
| **Total** | | **131 comprobaciones · 0 fallos** |

La batería nueva mide, por cada tamaño: medidas de la casilla, alineación con el texto, área
táctil de la fila, contraste AA, etiquetado de todos los controles, altura mínima, contenedor
de tabla con desplazamiento propio y ausencia de desbordamiento.

> Para medir la vista autenticada **sin credenciales**, la prueba quita los atributos `hidden`
> con JavaScript. No inicia sesión, no lee datos y no escribe nada: es una prueba de
> maquetación, no de permisos.

## 5. Verificación en producción

Tras publicar (`471fcfa..c463979`), contra el sitio real:

- formularios: **44/44**;
- certificación del sitio publicado: **26/26** (recursos 200, `crm-dev` 404,
  `crm/formulario.html` 404, base `default`, `permission-denied` para anónimo,
  mensaje de error correcto, 0 errores de consola propios);
- acceso anónimo a Firestore: **17/17 denegado**;
- el panel sigue conectado a `kzfio-crm`, base `default`, sin ninguna ruta de emulador.

## 6. Lo que NO pude verificar (y no doy por hecho)

| Punto de la misión | Estado |
|---|---|
| **Sesión del administrador tras recargar** | El mecanismo (`browserLocalPersistence`) está en el código y se certificó en el emulador (KZ-CRM-016, 52/52). **En el sitio publicado requiere la contraseña de Darwin**: no lo doy por verificado hasta que él recargue y siga dentro. |
| **Navegación y tablas en Android** | Verificado en 4 viewports con Chrome real, incluida la tabla con desplazamiento propio. **No** en un dispositivo Android físico. |
| **Prueba en móvil real** | Pendiente. Un viewport de 375 px no es un teléfono. |

Son las tres únicas casillas que no puedo cerrar yo, y quedan declaradas como abiertas.

## 7. Reversión

```bash
git revert c463979 && git push origin main   # retira la corrección en ~1 minuto
```

Revierte sólo CSS y dos etiquetas: no toca datos, reglas ni cuentas.

## 8. Dictamen

> **GO** para cerrar KZ-CRM-017.
>
> El defecto reportado está corregido y medido (323→20 px, desfase 50→2 px), se corrigieron
> dos problemas adicionales de accesibilidad, y las 131 comprobaciones pasan tanto en local
> como en el sitio publicado.
>
> **Queda abierto**, y no se declara cumplido: la persistencia de sesión de Darwin en el
> sitio publicado y la prueba en un dispositivo Android físico.
