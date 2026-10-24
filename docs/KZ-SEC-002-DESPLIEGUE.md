# KZ-SEC-002 · Candidato local · Despliegue y reversión

> Estado: **candidato local certificado en emulador**. No se ejecutó ninguna publicación.
> Commits locales sobre `main` (sin push): `359a33b`, `4779a77`, `4948508`, `3551bc9`.

## 1. Qué cambia el candidato

| Archivo | Cambio | Riesgo |
|---|---|---|
| `firestore.rules` | `servicios`: OPERADOR no toca precio/fechaVencimiento/estado/planId (solo ADMIN+). `tokens_notificacion`: esOperador + token==docId + whitelist. `contactos`: whitelist, tamaños, email opcional con formato. | Alto (permisos) |
| `premium-assets/app.js` | `/api/leads` (inexistente) → escribe en `contactos` vía Firestore REST; cooldown 60 s; honeypot. | Medio |
| `herramientas/test/pruebas-seguridad-kz-sec-002.js` | 17 pruebas negativas de blindaje. | — |
| `herramientas/test/pruebas-captacion-kz-sec-002.js` | 8 pruebas E2E formulario → Firestore → panel. | — |

## 2. Evidencia (emulador Auth 9099 + Firestore 8080, proyecto `demo-card-seguridad`)

```
pruebas-spark-reglas-p1.js         → 53 · PASAN 53 · FALLAN 0   (regresión)
pruebas-seguridad-kz-sec-002.js    → 17 · PASAN 17 · FALLAN 0   (blindaje)
pruebas-captacion-kz-sec-002.js    →  8 · PASAN  8 · FALLAN 0   (E2E formulario→panel)
```

## 3. Orden seguro de publicación (cuando se autorice)

```bash
# 0) Respaldos: la regla actual queda en git; anota su hash en Cloudflare/Firebase
cd 6-LANDING-PAGES/Konfio-Zinc-Web
git hash-object firestore.rules          # 1c...  (respaldar el id)
git diff origin/main --stat              # revisar el diff exacto

# 1) Reglas Firestore (cambian permisos: primero y con ventana de verificación)
firebase deploy --only firestore:rules,firestore:indexes

# 2) Web (formulario reparado + cooldown)
git push origin main

# 3) Verificación en producción
#    - panel abre, clientes/servicios/pagos sin regresión
#    - formulario premium envía y el documento aparece en Card Spark → Contactos
#    - herencia: OPERADOR no puede cambiar precio de un servicio (403)
```

**No publicar el Worker en esta misión.** El Worker `calm-heart-6828` ya corre `a44754db`
(sin caché, respuesta determinista para Elite). Si en el futuro se redeploya, **hacerlo solo
desde el árbol corregido** (worker.js sin `cacheKey`/`cache:v2`), nunca desde `kz-workspace/main`.

## 4. Reversión

```bash
# Web: revertir commits sin reescribir historia
git revert --no-edit 3551bc9 4948508 && git push origin main

# Reglas: volver al archivo anterior y desplegarlo
git show 9d26775:firestore.rules > firestore.rules   # o el commit previo a este candidato
firebase deploy --only firestore:rules
```

- **Datos:** el candidato no modifica clientes, pagos ni configuraciones reales. Revertir el
  código no borra contactos ya recibidos (permanecen en `contactos`, visibles en el panel).
- **KV:** no se toca `KZ_CONOCIMIENTO` en esta misión.

## 5. Riesgos residuales (declarados)

1. **Rate-limit del lado servidor: NO implementado.** El honeypot, el cooldown (60 s,
   localStorage, evadible), la validación de campos y las reglas de Firestore son las barreras
   actuales. El techo real es la cuota gratuita de Firestore. Una barrera fuerte requiere un
   endpoint con limitación por IP (el Worker ya tiene `superaLimite`): **preparado como opción,
   no activado**.
2. **E2E verificado en emulador, no en producción.** La publicación debe repetir las 3 suites
   contra el entorno real y comprobar que el documento aparece en Card Spark → Contactos.
3. **Duplicados:** no hay deduplicación en servidor; dos envíos del mismo cliente crean dos
   documentos. El panel los muestra; la deduplicación se resuelve a mano o con una regla futura.

## 6. Protección frente a regresiones del Worker

- El `worker.js` corregido (sin caché compartida) vive en la rama
  `harness/kz-ai-001-certificacion` de `kz-workspace` y en el árbol `asesor_web/`.
- `kz-workspace/main` conserva el `worker.js` **antiguo** (con `cache:` y registro de
  mensajes completos). **Riesgo:** un redeploy desde `main` reintroduce ambos.
- Mitigación documentada: alinear `main` con la versión desplegada **antes** de cualquier
  redeploy, y mantener la rama certificada como única fuente de despliegue del Worker.
