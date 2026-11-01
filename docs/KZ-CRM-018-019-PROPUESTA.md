# KZ-CRM-018/019 · Propuesta técnica — **NO IMPLEMENTADO**

**Fecha:** 2-nov-2026 · **Estado: diseño solamente. No hay código, ni pruebas, ni despliegue.**

> Este documento existe para pedir autorización y decisiones, no para declarar avances.
> Nada de lo que hay aquí está construido, probado ni desplegado. Se escribe así a propósito,
> porque la misión prohíbe presentar como completado lo que sólo está diseñado.

---

## KZ-CRM-018 · Equipo comercial

### Qué exige y qué implica

La diferencia con el CRM actual no es la interfaz: es que **hoy todo el equipo ve todo**.
Pasar a asignaciones significa cambiar el modelo de acceso en las **reglas**, no en los botones.

### Modelo de datos propuesto

```text
crm_leads/{telefono}
  …campos actuales…
  asignado_a      : uid del asesor            ← nuevo
  asignado_en     : timestamp                 ← nuevo
  asignado_por    : uid                       ← nuevo (exigido por el punto 3 de la misión)

crm_usuarios/{uid}
  rol      : admin | comercial | ventas | lectura
  activo   : bool
  nombre   : texto (para la gestión de equipo)
```

### Regla central que habría que escribir (y probar)

```javascript
// Un comercial sólo ve lo suyo. No es una consulta filtrada: es una regla.
function esMio(lead) {
  return ficha().rol == 'comercial' && lead.asignado_a == request.auth.uid;
}
match /crm_leads/{leadId} {
  allow read: if tieneRol(['admin','ventas','lectura']) || esMio(resource.data);
  allow update: if tieneRol(['admin']) || (esMio(resource.data) && soloCamposDeSeguimiento());
}
```

**Lo que hay que resolver antes de escribirla** (y por lo que no la he implementado a medias):

1. **`ventas` y `lectura`**: ¿ven todo o sólo lo asignado? La misión dice «únicamente las
   operaciones permitidas» para ventas y «únicamente los registros expresamente autorizados»
   para lectura. Eso exige decidir el alcance del rol, y no es una decisión técnica.
2. **Índices y consultas**: filtrar por `asignado_a` cambia las consultas del panel
   (`where('asignado_a','==',uid)`) y requiere índice compuesto con `orderBy('creado_en')`.
3. **Reasignación**: quién puede reasignar, y si el asesor anterior conserva el historial.
4. **El teléfono como id** sigue funcionando, pero la asignación debe sobrevivir al cierre de
   un asesor (desactivar sin borrar historial: punto 5 de la misión).

### Qué necesito de ti para construirlo

- **Correos y roles** del equipo, para dar de alta las cuentas (la misión prohíbe crearlas
  sin ellos).
- **Decisión de alcance**: ¿`ventas` y `lectura` ven toda la cartera o sólo lo asignado?
- **Quién reasigna**: ¿sólo admin, o también comerciales entre sí?

### Estimación honesta

Modelo + reglas + interfaz (equipo, asignaciones, bandeja personal, seguimientos, actividad,
estadísticas por asesor) + batería de pruebas de acceso cruzado. Es un bloque grande; no cabe
en el mismo turno que el cierre de 017 con la calidad que se ha mantenido.

---

## KZ-CRM-019 · Captación automática segura

### El problema de fondo

El requisito 8 («impedir escrituras anónimas directas») y el 3 («antispam y limitación de
solicitudes») **no se pueden cumplir con reglas de Firestore**: las reglas no ven la IP ni
mantienen contadores entre peticiones. Hace falta un intermediario con estado.

### Arquitectura propuesta (para evaluar, no contratada)

```
soluciones.html
   │  Turnstile (captcha, gratis)
   ▼
Cloudflare Worker  ← NUEVO componente, distinto del Worker del Asesor Konfi (no se toca)
   │  · verifica Turnstile
   │  · rate limit por IP
   │  · valida y normaliza
   │  · escribe en Firestore con credencial privilegiada
   ▼
crm_leads  (solicitud recibida)  →  prospecto (operador)  →  cotización  →  venta
```

### Los tres problemas que hay que decidir antes de escribir una línea

1. **Dónde vive la credencial de escritura.** En Spark no hay Cloud Functions, así que el
   Worker necesitaría una clave de cuenta de servicio. Si ese Worker se compromete, la clave
   permite escribir en todo el CRM. Pasa de «cualquiera puede enviar un prospecto» a «una
   clave amplia vive en un tercero». **Es el punto que necesita tu autorización expresa.**
2. **Cuotas y costos.** No los he verificado en esta sesión y **no voy a citar cifras que no
   pueda sostener**. Hay que comprobarlos antes de decidir: capa gratuita del Worker,
   límites de KV/Durable Objects y si el rate limit exacto exige plan pago.
3. **Datos personales.** Un formulario público recoge nombre y teléfono de personas que aún
   no son clientes, pasa por un tercero (Cloudflare) y aterriza en `nam5` (EE. UU.). Eso hay
   que documentarlo y asumirlo antes de abrirlo.

### Diferenciación de estados (punto 9)

La propuesta separa explícitamente:

| Estado | Qué es | Quién lo crea |
|---|---|---|
| **Solicitud recibida** | El Worker confirmó recepción. No es un prospecto. | el Worker |
| **Prospecto** | Un operador la acepta y la trabaja | el operador |
| **Cotización** | Propuesta enviada | comercial/admin |
| **Venta confirmada** | `crm_sales` con cotización previa | ventas/admin |

La confirmación al visitante sólo se mostraría si el Worker **recibió y registró** la
solicitud; hoy `soluciones.html` es honesto porque no promete nada, y así debe seguir hasta
que esto exista y esté probado.

---

## Dictamen

| Fase | Estado |
|---|---|
| **KZ-CRM-017** | ✅ **cerrada y publicada** (commit `6512b96`) |
| **KZ-CRM-018** | ⛔ **NO IMPLEMENTADA**. Requiere: correos y roles, y 3 decisiones de alcance |
| **KZ-CRM-019** | ⛔ **NO IMPLEMENTADA**. Requiere: autorización del componente externo + verificación real de cuotas |

La captación pública sigue **deshabilitada**, como exige la misión.
