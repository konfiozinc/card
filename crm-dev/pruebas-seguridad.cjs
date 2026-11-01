/* KZ-CRM-016 · matriz de seguridad del alta pública de prospectos.

   IMPORTANTE: esta batería se ejecuta contra el archivo que se desplegaría,
   crm/firestore.rules (producción), no contra el del emulador. El emulador sólo
   aporta el servidor; las reglas cargadas son las de producción. Los roles se
   siembran con el bypass privilegiado `Authorization: Bearer owner`, que es
   exactamente el papel que en producción cumple la consola / el Admin SDK.

   Ejecutar:
     firebase emulators:exec --only auth,firestore --project demo-crm-016 \
       --config crm/emulador-produccion.json "node crm/pruebas-seguridad.cjs"

   Cubre los siete casos exigidos por la misión:
     · campo no permitido          · consentimiento incorrecto
     · fecha inválida              · teléfono duplicado
     · manipulación del marcador   · solicitudes concurrentes
     · acceso no autorizado
   Más controles positivos (alta válida, miembro del equipo con rol) y negativos. */

const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const AUTH = "http://127.0.0.1:9099";
const OWNER = { authorization: "Bearer owner" };

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;

/** Documento de alta válido según el contrato vigente. */
const valido = (tel) => ({
  nombre: { stringValue: "Prospecto Ficticio" },
  telefono: { stringValue: tel },
  industria: { stringValue: "restaurantes" },
  servicio_interes: { stringValue: "Mini Web Pro" },
  consentimiento: { booleanValue: true },
  consentimiento_version: { stringValue: "v1-2026-11" },
  retencion_hasta: { timestampValue: TS(ANIO) },
  estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: TS(0) },
  historial: { arrayValue: { values: [] } },
  origen: { stringValue: "formulario-web" },
});

/** Alta anónima con id explícito: el id ES el teléfono. */
const alta = (id, campos) => fetch(`${FS}/crm_leads?documentId=${id}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ fields: campos }),
}).then((r) => r.status);

const parche = (ruta, campos, headers) => fetch(`${FS}/${ruta}`, {
  method: "PATCH",
  headers: Object.assign({ "content-type": "application/json" }, headers || {}),
  body: JSON.stringify({ fields: campos }),
}).then((r) => r.status);

const altaUsuario = async (email) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }),
  });
  return fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "crm12345", returnSecureToken: true }),
  }).then((r) => r.json());
};

(async () => {
  console.log("=== A. Alta pública válida (control positivo)");
  chk("alta válida anónima con id = teléfono", (await alta("3101110001", valido("3101110001"))) === 200);

  console.log("\n=== B. Teléfono duplicado (deduplicación por identidad de documento)");
  const dup = await alta("3101110001", valido("3101110001"));
  chk("segundo alta del mismo teléfono rechazada", dup === 409 || dup === 403, "HTTP " + dup);
  chk("id distinto del teléfono rechazado", (await alta("otro-id", valido("3101110002"))) === 403);

  console.log("\n=== C. Campo no permitido");
  const extra = Object.assign(valido("3101110003"), { rol: { stringValue: "admin" } });
  chk("campo no declarado (rol) rechazado", (await alta("3101110003", extra)) === 403);
  const conHistorial = Object.assign(valido("3101110004"), {
    historial: { arrayValue: { values: [{ stringValue: "nota inyectada por el anónimo" }] } },
  });
  chk("historial inyectado en el alta rechazado", (await alta("3101110004", conHistorial)) === 403);
  const origenMalo = Object.assign(valido("3101110005"), { origen: { stringValue: "consola-admin" } });
  chk("origen fuera de la lista blanca rechazado", (await alta("3101110005", origenMalo)) === 403);
  const anonimizadoMalo = Object.assign(valido("3101110006"), { anonimizado: { booleanValue: true } });
  chk("alta que se declara ya anonimizada rechazada", (await alta("3101110006", anonimizadoMalo)) === 403);

  console.log("\n=== D. Consentimiento incorrecto");
  const sinConsent = Object.assign(valido("3101110007"), { consentimiento: { booleanValue: false } });
  chk("consentimiento en falso rechazado", (await alta("3101110007", sinConsent)) === 403);
  const versionMala = Object.assign(valido("3101110008"), { consentimiento_version: { stringValue: "v0" } });
  chk("versión de consentimiento distinta rechazada", (await alta("3101110008", versionMala)) === 403);
  const sinVersion = valido("3101110009"); delete sinVersion.consentimiento_version;
  chk("consentimiento sin versión rechazado", (await alta("3101110009", sinVersion)) === 403);

  console.log("\n=== E. Fecha inválida");
  const fechaVieja = Object.assign(valido("3101110010"), { creado_en: { timestampValue: "2000-01-01T00:00:00Z" } });
  chk("creado_en muy anterior al servidor rechazado", (await alta("3101110010", fechaVieja)) === 403);
  const fechaFutura = Object.assign(valido("3101110011"), { creado_en: { timestampValue: TS(ANIO) } });
  chk("creado_en en el futuro rechazado", (await alta("3101110011", fechaFutura)) === 403);
  const fechaTexto = Object.assign(valido("3101110012"), { creado_en: { stringValue: TS(0) } });
  chk("creado_en como texto rechazado", (await alta("3101110012", fechaTexto)) === 403);
  const retenPasada = Object.assign(valido("3101110013"), { retencion_hasta: { timestampValue: "2020-01-01T00:00:00Z" } });
  chk("retención en el pasado rechazada", (await alta("3101110013", retenPasada)) === 403);
  const retenLarga = Object.assign(valido("3101110014"), { retencion_hasta: { timestampValue: TS(ANIO * 10) } });
  chk("retención de 10 años rechazada", (await alta("3101110014", retenLarga)) === 403);
  const sinRetencion = valido("3101110015"); delete sinRetencion.retencion_hasta;
  chk("alta sin retención rechazada", (await alta("3101110015", sinRetencion)) === 403);

  console.log("\n=== F. Contenido fuera de rango");
  const telCorto = Object.assign(valido("310111"), { telefono: { stringValue: "310111" } });
  chk("teléfono demasiado corto rechazado", (await alta("310111", telCorto)) === 403);
  const telLetras = Object.assign(valido("3101110016"), { telefono: { stringValue: "310abc0016" } });
  chk("teléfono con letras rechazado", (await alta("3101110016", telLetras)) === 403);
  const nombreCorto = Object.assign(valido("3101110017"), { nombre: { stringValue: "A" } });
  chk("nombre de una letra rechazado", (await alta("3101110017", nombreCorto)) === 403);
  const estadoMalo = Object.assign(valido("3101110018"), { estado: { stringValue: "ganado" } });
  chk("estado inicial distinto de «nuevo» rechazado", (await alta("3101110018", estadoMalo)) === 403);

  console.log("\n=== G. Manipulación del marcador de deduplicación");
  /* El diseño vigente NO usa una colección de marcadores reservables: el id del
     prospecto es el teléfono. Estas comprobaciones demuestran que (1) no existe
     ninguna colección paralela que un anónimo pueda ocupar, y (2) aun intentándolo,
     no puede liberar ni reservar un número. */
  chk("anónimo NO puede crear un marcador en crm_dedupe",
    (await fetch(`${FS}/crm_dedupe?documentId=3101110001`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { telefono: { stringValue: "3101110001" } } }),
    }).then((r) => r.status)) === 403);
  chk("anónimo NO puede leer crm_dedupe", (await fetch(`${FS}/crm_dedupe`)).status === 403);
  chk("anónimo NO puede borrar un marcador",
    (await fetch(`${FS}/crm_dedupe/3101110001`, { method: "DELETE" })).status === 403);
  chk("el número ya registrado sigue bloqueado pese a intentar liberarlo",
    (await alta("3101110001", valido("3101110001"))) !== 200);

  console.log("\n=== H. Solicitudes concurrentes (atomicidad sin comprobación previa)");
  const telConcurrente = "3107770001";
  const respuestas = await Promise.all(
    Array.from({ length: 8 }, () => alta(telConcurrente, valido(telConcurrente)))
  );
  const exitos = respuestas.filter((s) => s === 200).length;
  chk("de 8 altas simultáneas del mismo teléfono sólo 1 prospera", exitos === 1,
    "200=" + exitos + " · " + respuestas.join(","));

  console.log("\n=== I. Acceso no autorizado");
  chk("anónimo NO lee prospectos", (await fetch(`${FS}/crm_leads`)).status === 403);
  chk("anónimo NO modifica un prospecto existente",
    (await parche("crm_leads/3101110001", valido("3101110001"))) === 403);
  chk("anónimo NO borra un prospecto",
    (await fetch(`${FS}/crm_leads/3101110001`, { method: "DELETE" })).status === 403);
  chk("anónimo NO crea ventas", (await fetch(`${FS}/crm_sales`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields: { lead_id: { stringValue: "x" } } }),
  })).status === 403);
  chk("anónimo NO escribe auditoría", (await fetch(`${FS}/crm_audit`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields: { accion: { stringValue: "estado_cambiado" } } }),
  })).status === 403);

  /* Usuario autenticado pero SIN ficha en crm_usuarios: no pertenece al equipo. */
  const sinRol = await altaUsuario("sinrol@crm.test");
  chk("autenticado sin rol NO lee prospectos", (await fetch(`${FS}/crm_leads`, {
    headers: { authorization: "Bearer " + sinRol.idToken },
  })).status === 403);
  chk("autenticado sin rol NO puede fabricarse una ficha con rol admin",
    (await parche(`crm_usuarios/${sinRol.localId}`,
      { rol: { stringValue: "admin" }, activo: { booleanValue: true } },
      { authorization: "Bearer " + sinRol.idToken })) === 403,
    "reglas de producción: crm_usuarios escribe sólo la administración");

  console.log("\n=== J. Controles positivos con siembra privilegiada");
  const admin = await altaUsuario("admin-seg@crm.test");
  chk("la administración privilegiada sí puede sembrar el rol",
    (await parche(`crm_usuarios/${admin.localId}`,
      { rol: { stringValue: "admin" }, activo: { booleanValue: true } }, OWNER)) === 200);
  const lectura = await fetch(`${FS}/crm_leads`, { headers: { authorization: "Bearer " + admin.idToken } });
  const cuerpo = await lectura.json().catch(() => ({}));
  const docs = cuerpo.documents || [];
  chk("el miembro del equipo con rol admin lee los prospectos", lectura.status === 200, "documentos=" + docs.length);

  const ocurrencias = docs.filter((d) => d.name.endsWith("/" + telConcurrente)).length;
  chk("el prospecto concurrente quedó guardado una sola vez", ocurrencias === 1, "ocurrencias=" + ocurrencias);

  const marcadores = await fetch(`${FS}/crm_dedupe`, { headers: OWNER });
  const cuerpoMarcadores = await marcadores.json().catch(() => ({}));
  chk("crm_dedupe existe pero está vacía: no hay marcadores reservables",
    marcadores.status === 200 && (cuerpoMarcadores.documentCount || 0) === 0,
    "documentCount=" + (cuerpoMarcadores.documentCount || 0));

  console.log("\nRESULTADO SEGURIDAD (reglas de producción): PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
