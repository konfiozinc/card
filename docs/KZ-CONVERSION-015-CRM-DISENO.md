# KZ-CONVERSION-015 · Diseño de la fase CRM digital

**Estado:** diseño únicamente. **No implementado, no publicado, sin tocar Firebase de producción.**
**Base:** entorno aislado y autorización específica previa.

## 1. Objetivo y límite

Un CRM que registre interesados **con consentimiento**, los clasifique y permita seguimiento, **sin confundir una cotización con una venta confirmada**. Lo que hoy existe en el sitio (un borrador en `localStorage`) **no es** un CRM y no debe presentarse como tal.

## 2. Regla de oro: dos verdades separadas

| Concepto | Dónde vive | Quién lo cambia |
|---|---|---|
| Intención del visitante (lead, cotización) | Base interna del CRM | El visitante (formulario) y el comercial |
| **Venta confirmada** | Registro de ventas con comprobante de pago | **Sólo** un usuario con rol `ventas` y validación de servidor |

`estado_lead` y `venta_confirmada` son campos distintos y nunca se derivan uno del otro. Abrir WhatsApp **jamás** cambia el estado a «enviado» ni «confirmado».

## 3. Arquitectura propuesta (aislada)

```
Navegador (formulario con consentimiento)
        │  POST /api/leads  (HTTPS, token de formulario, rate limit)
        ▼
Capa servidor  ──  Functions/Worker propio en proyecto de PRUEBAS
  · validación de esquema, antispam, límite por IP
  · guarda lead + auditoría inmutable (quién, qué, cuándo)
        ▼
Base de datos (proyecto aislado, NO el de producción)
  · colecciones: leads, seguimientos, cotizaciones, ventas, usuarios, auditoria
        ▼
Panel CRM (autenticación + roles)  ── sólo tras revisión de seguridad
```

Prohibido en esta fase: usar el proyecto `el-titi-menu` ni el Firebase/Worker actuales.

## 4. Modelo de datos

```text
leads/{id}
  nombre, telefono (cifrado en reposo), industria, servicio_interes
  consentimiento {otorgado: bool, texto_version, fecha, ip_hash}
  origen {utm, pagina, demo_probada}
  estado: nuevo | contactado | cotizado | ganado | perdido
  responsable_uid, creado_en, actualizado_en

seguimientos/{id}
  lead_id, fecha, canal, resumen, siguiente_accion, autor_uid

cotizaciones/{id}
  lead_id, plan (basica|pro|medida), monto_o_null, moneda, validez
  estado: borrador | enviada | aceptada | rechazada   (NO es una venta)

ventas/{id}
  cotizacion_id, monto, metodo_pago, comprobante_ref, confirmado_por_uid, confirmado_en
```

## 5. Autenticación y autorización

- Proveedor: **Firebase Auth** en proyecto de pruebas (email+contraseña, MFA opcional).
- Sin registro abierto: usuarios creados por un administrador.
- Roles en un nodo privado `usuarios/{uid}`: `admin`, `comercial`, `ventas`, `solo_lectura`.
- Reglas de servidor: el cliente **nunca** escribe `ventas`, `auditoria` ni `responsable_uid`; esas escrituras pasan por Functions con verificación de rol.
- Sesiones aisladas por aplicación (la lección de KZ-AUTH-014: una app de Firebase por módulo, claves de sesión distintas).

## 6. Privacidad y protección de datos

1. **Consentimiento explícito y previo**: casilla no premarcada, texto versionado con fecha, guardado junto al lead.
2. **Minimización**: sólo nombre, WhatsApp y necesidad comercial. Sin dirección ni datos sensibles.
3. **Retención**: 12 meses sin actividad → anonimización automática; borrado a solicitud en máximo 5 días hábiles.
4. **Derechos**: acceso, corrección y supresión con registro en auditoría.
5. **Cifrado**: TLS en tránsito; teléfono cifrado en reposo; logs sin datos personales completos.
6. **Acceso restringido**: ningún dato del CRM es legible públicamente. Prueba obligatoria: GET anónimo → 401.
7. **Política publicada** antes de abrir el módulo, y enlace desde el formulario.

## 7. Antispam y abuso

Token de formulario de un solo uso, límite por IP y por minuto, campo trampa oculto, y rechazo silencioso de duplicados idénticos en menos de 60 s.

## 8. Puertas obligatorias antes de escribir código

| Puerta | Qué exige |
|---|---|
| 1. Autorización | Aprobación explícita del CTO para crear un proyecto Firebase de **pruebas** |
| 2. Aislamiento | Confirmar que **nada** apunta al proyecto de producción |
| 3. Reglas | Revisión por pares de las reglas antes de desplegarlas en pruebas |
| 4. Privacidad | Política y flujo de consentimiento revisados antes de guardar datos reales |
| 5. Pruebas | Datos ficticios únicamente; pruebas de 401/403 por rol |
| 6. Publicación | Revisión de seguridad independiente + autorización de Darwin |

## 9. Plan de trabajo propuesto (sin ejecutar)

1. **S1 · Proyecto aislado**: crear `kzfio-crm-test`, sin datos reales.
2. **S2 · Modelo y reglas**: colecciones del §4 y reglas verificadas con pruebas automáticas (anónimo, comercial, ventas).
3. **S3 · API de leads**: validación, antispam, auditoría.
4. **S4 · Panel**: autenticación por rol, listado, ficha, seguimiento, cotización; separación visual clara entre «cotizado» y «vendido».
5. **S5 · Privacidad**: consentimiento versionado, retención, borrado.
6. **S6 · Revisión independiente y dictamen**.

## 10. Qué se puede hacer sin autorización

- Documentar este diseño (hecho).
- Preparar especificaciones y pruebas en seco.
- Nada que escriba en Firebase, cree proyectos o publique.
