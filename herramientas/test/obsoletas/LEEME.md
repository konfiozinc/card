# Suites heredadas del modelo con Cloud Functions

Estas seis suites se escribieron cuando el panel llamaba a Cloud Functions
(`httpsCallable`). El 19/10/2026 el producto pasó al plan Spark: se eliminó
`assets/js/admin/callables.js`, la administración privilegiada se movió a
`herramientas/admin-spark.js` (Admin SDK) y las reglas cerraron la escritura
de `usuarios`.

Por eso estas pruebas **no se pueden ejecutar**: invocan Callables que ya no
existen. Se conservan aquí como registro histórico, no como verificación.

Las suites vigentes son:

| Suite | Qué comprueba | Resultado del 19/10/2026 |
|---|---|---|
| `pruebas-spark-reglas-p1.js` | reglas de Firestore con el emulador real | 53/53 |
| `pruebas-spark-panel-p1.js` | panel en navegador real sin backend | 18/18 |
| `../probar-web-publica.js` | batería de calidad de la web pública | 14/14 |

No ejecutes nada de esta carpeta: si alguna vez devuelve un fallo, no
significa que el producto esté roto, significa que estás probando el diseño
anterior.