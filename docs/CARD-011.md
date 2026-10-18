# CARD-011 — Texto no confiable en el panel de reporte

Base: `ac4411580a7af00d428d137fb068b6fe5327b7b9`.
Rama independiente: `fix/card-011-inyeccion`.
No incorpora CARD-017/019 ni cambios de UNEFibra o kz-workspace.

## Evidencia previa y alcance

La auditoría conservó CARD-011 como riesgo P1, con interpolación de HTML inocuo
reproducida en una prueba aislada. No se ejecutaron cargas activas ni se comprobó
una explotación en producción. Evidencias acumuladas: `prueba-card011-panel.json`
y `probe-card011-panel.cjs` del registro de auditoría, sin modificarlos ni repetir
la auditoría general.

En la base auditada:

- `panel.html:161-167`: el nombre `tarjeta` se interpolaba en `innerHTML` de la tabla.
- `panel.html:170-174`: `tarjeta` y `etiqueta` se interpolaban en los últimos eventos.
- `firestore.rules:172-178`: `eventos` admitía creación pública; exigía cadena para
  tarjeta/evento y una lista de campos permitidos, sin garantizar una etiqueta
  segura para HTML. Esto demuestra un origen no confiable y un sumidero en código;
  no demuestra que esas reglas estén desplegadas o que haya datos afectados.

La corrección se limita a `render(docs)` en `panel.html`. No cambia reglas,
autenticación, consultas, botones, intervalo, estilos, estructura estática,
Firebase, tarjetas digitales ni páginas de venta. La página de reporte conserva
su ubicación. No hay cambios de configuración ni despliegues.

## Tratamiento por contexto

- Tarjeta y etiqueta: solo se admiten cadenas para mostrar texto. Se crean nodos
  con `document.createElement` y `textContent`; el HTML se muestra literalmente,
  sin escapar manualmente ni interpretarse de nuevo. No hay `innerHTML`,
  `outerHTML`, `insertAdjacentHTML` ni `document.write` en el renderizador.
- Grupos: `Map` conserva por separado nombres como `__proto__`, `constructor` y
  `toString`, evitando tratarlos como propiedades heredadas de un objeto.
- Etiquetas de tipo de evento: nombres de clases y textos salen de constantes
  internas, según comparación exacta con `generate_lead` como en el flujo anterior.
- Barras: `style.width` recibe solamente un porcentaje calculado con contadores
  internos; ningún texto recibido llega a CSS.
- Fecha: admite número finito, cadena reconocible, Date o Timestamp con
  `toDate`. Una fecha inválida no se muestra. Se conserva el formato `es-CO` y el
  tratamiento vacío de valores falsos del flujo anterior.
- Valores de tipos inesperados no se convierten implícitamente a HTML: registros
  que no sean objetos se descartan; tarjeta no textual usa `Sin tarjeta`; etiqueta
  no textual usa vacío. Esto afecta entradas malformadas, no cadenas válidas.
- Campos adicionales de analítica, como `pagina` y `ua`, no se presentan ni se
  convierten en enlaces, atributos, recursos o estilos.

## Compatibilidad

Se conservan KPI, orden alfabético de tarjetas, badges, contadores, barras,
mensajes vacíos y los veinte eventos recientes. `replaceChildren` sustituye los
nodos sin acumular duplicados y conserva el flujo de refresco. El código usa
APIs nativas de navegadores actuales; no añade dependencias de producción.

La consulta original sigue limitada a 500 eventos, ordenada por `ts` descendente.
Los datos válidos producen capturas PNG idénticas a la base auditada en las dos
resoluciones probadas. No se modifica el mecanismo de acceso ni se certifica la
autorización real de Firestore mediante una sesión simulada.

## Pruebas ejecutadas

Desde la raíz de la rama, con Node 24.19.0, Playwright ya disponible y Chromium
154.0.8037.57 instalado en este entorno:

```sh
CARD_CHROMIUM=/usr/bin/chromium node --test --test-isolation=none --test-reporter=tap herramientas/test/panel-inyeccion.test.cjs
node --check herramientas/test/panel-inyeccion.test.cjs
git diff --check
```

Playwright ya está declarado en `herramientas/package.json` de la base; no se
instaló nada ni se modificaron manifiestos o lockfiles. El ejecutable se puede
seleccionar con `CARD_CHROMIUM`. La comparación necesita el objeto Git de la base
auditada; la prueba no debe descargarlo automáticamente (`GIT_NO_LAZY_FETCH=1`).

Resultado final: **12 aprobadas, 0 fallidas, 0 omitidas**. Una comprobación estática
verifica que todo lo ajeno a `render` conserva sus bytes. Once pruebas usan DOM
real de Chromium para comprobar:

- HTML inocuo en nombres/etiquetas: texto literal, sin elementos añadidos.
- Comillas, ampersands, Unicode y URL ordinaria sin atributos ni enlaces nuevos.
- Claves coincidentes con propiedades de Object y contadores independientes.
- Orden, KPI, clases, porcentajes y máximo de veinte eventos recientes.
- Tipos inesperados, fechas inválidas y fechas válidas/SDK simulado.
- Refrescos repetidos y estados vacíos, incluso prohibiendo el setter `innerHTML`.
- Comparación visual exacta con datos ficticios válidos a 375×667 y 1024×768,
  sin desbordamiento horizontal en esas fixtures.
- Login, credencial incorrecta, refresco, intervalo y logout con Auth ficticio.
- Lectura denegada simulada y manejo de error existente.

El navegador usa contextos separados sin persistencia. Todas las peticiones se
interceptan: únicamente se entrega la fixture local del panel; cualquier otra
petición se aborta y hace fallar la prueba. La copia de prueba reemplaza los tres
SDK externos por interfaces ficticias, retira el favicon externo y añade CSP
`default-src 'none'`. Estos cambios solo existen en memoria para probar; no se
aplican al HTML de producción. No se leen clientes, credenciales ni eventos reales.

Un intento inicial quedó bloqueado por restricciones del entorno al lanzar
procesos. Una ejecución posterior se abortó al detectar sintaxis incorrecta en
la fixture; se corrigió esa simulación antes de la ejecución final completa.
Ninguno de esos intentos se contabiliza como aprobación.

## Riesgos pendientes y reversión

- La creación pública, esquema y límites de tamaño de eventos en reglas no se
  endurecen aquí. Abuso, volumen y etiquetas muy largas pueden seguir afectando
  datos, métricas o presentación; convertirlos en texto no resuelve esos riesgos.
- La prueba evita interpretar HTML en este consumidor. No revisa ni certifica
  todos los demás consumidores del repositorio ni otros hallazgos CARD.
- No se evaluó el SDK real, reglas desplegadas, autenticación de producción ni
  el comportamiento en Firefox, Safari, dispositivos físicos o navegadores
  antiguos sin las APIs nativas utilizadas. La prueba móvil es Chromium emulado.
- No se sanea ni se elimina contenido histórico. Si se despliega posteriormente,
  las cadenas existentes también se mostrarán como texto en este renderizador.

Para revertir código en una integración futura autorizada: revertir únicamente
el commit de esta rama, considerando que restauraría las interpolaciones de
HTML originales. No hay migración de datos ni operación de reversión en Firebase.
Este lote no hace push, PR, merge ni despliegue y mantiene producción intacta.
