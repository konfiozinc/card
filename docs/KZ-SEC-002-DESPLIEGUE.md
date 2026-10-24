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

## 3. Transición EN FASES (no dejar formularios sin backend)

La regla `contactos` **NO se cierra hasta que la ruta nueva esté verificada y el frontend
publicado**. Así ningún envío se pierde durante la transición y se puede revertir cada fase.

### Fase 1 — Worker con `/leads` (reglas ABIERTAS)
```bash
cd 9-AGENTES-IA/Asistente-IA/asesor_web
# Cuenta de servicio DEDICADA (no admin general): solo datastore.user sobre konfio-zinc
npx wrangler secret put FIREBASE_SA       # pegar el JSON de kz-leads (nunca en GitHub)
npx wrangler deploy                        # mismo Worker del chat + ruta /leads
# Verificar: POST /leads con datos ficticios -> 200 saved:true + documento en Firestore
```
La regla sigue permitiendo la escritura pública temporal: si algo falla, el formulario actual
sigue funcionando (doble ruta).

### Fase 2 — Frontend (formularios → Worker)
```bash
cd 6-LANDING-PAGES/Konfio-Zinc-Web && git push origin main
# Verificar en producción: ambos formularios envían y el contacto aparece en Card Spark → Contactos
```

### Fase 3 — Cerrar la escritura directa (último paso)
```bash
firebase deploy --only firestore:rules,firestore:indexes
# Verificar: escritura directa del navegador a contactos -> DENEGADA; el panel sigue leyendo
```

**Degradación segura:** si el Worker no tiene `FIREBASE_SA`, `/leads` responde **503** y el
formulario muestra el WhatsApp de respaldo con texto honesto (sin confirmación falsa).

**Nota de concurrencia (Cloudflare KV):** el límite (5 por 10 min por IP) y la deduplicación
usan KV, cuyas operaciones **no son atómicas** (get/put separados): dos peticiones simultáneas
desde la misma IP podrían colarse por encima del límite. Es una mitigación razonable, no una
barrera criptográfica; se documenta como tal.

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

## 7. Respaldos verificables (antes de publicar)

| Elemento | Respaldo |
|---|---|
| SHA público de GitHub | `origin/main` = `8ec2e2a` (anotar `git rev-parse origin/main`) |
| Worker desplegado | versión `a44754db-4f8d-4399-8613-f7a286fae105` (conservada en Cloudflare) |
| Reglas anteriores | `git show 8ec2e2a:firestore.rules` (contactos ABIERTO con validación) |
| Reglas candidatas | commit `f5237b1` / `e6fbdfd` (contactos CERRADO) |
| Cuenta de servicio | Identidad DEDICADA `kz-leads` con `roles/datastore.user` (crear el secreto solo con autorización) |

## 8. Reversión coordinada (sin pérdida de contactos)

```bash
# Fase 3 revertida: reabrir la regla (contactos vuelve a crear público con validación)
git show 8ec2e2a:firestore.rules > firestore.rules
firebase deploy --only firestore:rules

# Fase 2 revertida: formularios de vuelta al flujo anterior
git revert --no-edit f5237b1 && git push origin main

# Fase 1 revertida: Worker de vuelta a a44754db (sin /leads)
cd 9-AGENTES-IA/Asistente-IA/asesor_web
wrangler versions deploy a44754db-4f8d-4399-8613-f7a286fae105

# El secreto FIREBASE_SA puede quedarse (no da acceso si el código no lo usa).
```

- **Contactos ya recibidos:** viven en Firestore `contactos`; ninguna reversión de código los
  borra (el panel los sigue leyendo).
- **Orden inverso:** reabrir regla → revertir web → revertir Worker. Nunca cerrar la regla sin
  el Worker nuevo ya desplegado.
- **KV `KZ_CONOCIMIENTO`:** no se toca en esta misión.

## 9. Operaciones que requieren autorización de producción

1. Crear la cuenta de servicio `kz-leads` en GCP y cargar su JSON como secreto Cloudflare.
2. `wrangler deploy` (Worker con `/leads`).
3. `firebase deploy --only firestore:rules,firestore:indexes` (Fase 3).
4. `git push origin main` (Fase 2).
5. Ejecutar las pruebas de verificación en producción con datos ficticios.
