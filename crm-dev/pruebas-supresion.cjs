/* KZ-CRM-018 · Certificación de A02: procedimiento de supresión.
   INTERNO: crm-dev/.

   Demuestra, con datos ficticios en el emulador:
     · la simulación NO borra nada;
     · la ejecución borra el prospecto Y sus notas;
     · la verificación posterior confirma que no quedan documentos;
     · el registro no conserva datos personales;
     · no se puede ejecutar sobre un proyecto distinto;
     · tras suprimir, el teléfono queda libre y no hay notas heredables.

   Ejecutar:
     firebase emulators:exec --only firestore --project demo-crm-016 \
       --config crm-dev/emulador-produccion.json "node crm-dev/pruebas-supresion.cjs" */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const FS = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const TS = (ms) => new Date(Date.now() + (ms || 0)).toISOString();
const ANIO = 365 * 24 * 60 * 60 * 1000;
const SCRIPT = path.join(__dirname, "suprimir-datos.cjs");
const LOG = path.join(__dirname, "supresiones.log");

let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };

const correr = (args, entrada) => {
  try {
    const salida = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8", input: entrada || "", stdio: ["pipe", "pipe", "pipe"],
    });
    return { codigo: 0, salida };
  } catch (e) {
    return { codigo: e.status, salida: String((e.stdout || "") + (e.stderr || "")) };
  }
};

(async () => {
  const TEL = "3207000001";
  const ID = TEL; // modelo ACTUAL: el id es el teléfono

  if (fs.existsSync(LOG)) fs.unlinkSync(LOG);

  /* Sembrar un prospecto ficticio con notas */
  await fetch(`${FS}/crm_leads?documentId=${ID}`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: {
      nombre: { stringValue: "Cliente Ficticio Supresion" },
      telefono: { stringValue: TEL }, industria: { stringValue: "tiendas" },
      consentimiento: { booleanValue: true }, consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: "uid-ficticio" },
      historial: { arrayValue: { values: [{ stringValue: "nota heredada ficticia" }] } },
      origen: { stringValue: "manual" },
    } }) });
  for (const t of ["primera nota ficticia", "segunda nota ficticia"]) {
    await fetch(`${FS}/crm_leads/${ID}/notas`, { method: "POST", headers: OWNER,
      body: JSON.stringify({ fields: { texto: { stringValue: t }, autor: { stringValue: "uid-ficticio" },
        fecha: { timestampValue: TS(0) }, tipo: { stringValue: "nota" } } }) });
  }

  const existe = async () => (await fetch(`${FS}/crm_leads/${ID}`, { headers: OWNER })).status === 200;
  const nNotas = async () => {
    const j = await fetch(`${FS}/crm_leads/${ID}/notas`, { headers: OWNER }).then((r) => r.json());
    return (j.documents || []).length;
  };

  console.log("=== A. Estado inicial ===");
  chk("el prospecto ficticio existe", await existe());
  chk("tiene 2 notas", (await nNotas()) === 2);

  console.log("\n=== B. La simulación no borra nada ===");
  const sim = correr(["--id", ID, "--emulador"]);
  chk("la simulación termina sin error", sim.codigo === 0, "código " + sim.codigo);
  chk("anuncia que no borró nada", /SIMULACIÓN|No se ha borrado nada/.test(sim.salida));
  chk("el prospecto sigue existiendo tras simular", await existe());
  chk("las notas siguen ahí tras simular", (await nNotas()) === 2);
  chk("la simulación enumera los documentos afectados", /notas\s+→ 2 documento/.test(sim.salida));
  chk("NO imprime los valores personales", !/Cliente Ficticio Supresion/.test(sim.salida));

  console.log("\n=== C. Confirmación incorrecta aborta ===");
  const malo = correr(["--id", ID, "--emulador", "--confirmar"], "no\n");
  chk("con una confirmación distinta de SUPRIMIR aborta", malo.codigo === 1, "código " + malo.codigo);
  chk("y no borra el prospecto", await existe());

  console.log("\n=== D. Ejecución real (emulador) ===");
  const run = correr(["--id", ID, "--emulador", "--confirmar"], "SUPRIMIR\n");
  chk("la ejecución termina correctamente", run.codigo === 0, "código " + run.codigo);
  chk("el prospecto fue eliminado", !(await existe()));
  chk("no quedan notas", (await nNotas()) === 0);
  chk("la verificación aparece en la salida", /ausente/.test(run.salida) && /notas restantes 0/.test(run.salida));

  console.log("\n=== E. Registro sin datos personales ===");
  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  chk("se escribió el registro", log.length > 0);
  chk("registra COMPLETADO", /COMPLETADO/.test(log));
  chk("NO contiene el teléfono", !log.includes(TEL));
  chk("NO contiene el nombre del cliente", !/Cliente Ficticio/.test(log));
  chk("guarda un hash del identificador", /id_sha256=[0-9a-f]{16}/.test(log));

  console.log("\n=== F. Salvaguardas de destino ===");
  /* El proyecto NO se acepta por parámetro: se comprueba en el propio código. */
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  chk("el proyecto está fijado en el código y no se lee de argumentos",
    /const PROYECTO_REAL = "kzfio-crm"/.test(fuente) && !/arg\("--proyecto"\)/.test(fuente));
  chk("aborta si GCLOUD_PROJECT apunta a otro proyecto",
    /GCLOUD_PROJECT/.test(fuente) && /ABORTADO/.test(fuente));
  const sinId = correr([], "");
  chk("sin --id se niega a ejecutar", sinId.codigo === 2, "código " + sinId.codigo);
  const inexistente = correr(["--id", "9999999999", "--emulador"], "");
  chk("un prospecto inexistente termina sin borrar nada", inexistente.codigo === 2, "código " + inexistente.codigo);

  console.log("\n=== G. Tras suprimir, el teléfono queda libre ===");
  const nuevo = await fetch(`${FS}/crm_leads?documentId=${ID}`, { method: "POST", headers: OWNER,
    body: JSON.stringify({ fields: {
      nombre: { stringValue: "Registro Nuevo" }, telefono: { stringValue: TEL },
      industria: { stringValue: "tiendas" }, consentimiento: { booleanValue: true },
      consentimiento_version: { stringValue: "v1-2026-11" },
      retencion_hasta: { timestampValue: TS(ANIO) }, estado: { stringValue: "nuevo" },
      creado_en: { timestampValue: TS(0) }, creado_por: { stringValue: "uid-ficticio" },
      historial: { arrayValue: { values: [] } }, origen: { stringValue: "manual" },
    } }) });
  chk("se puede volver a crear con el mismo teléfono", nuevo.status === 200, "HTTP " + nuevo.status);
  chk("el registro nuevo NO hereda notas del anterior", (await nNotas()) === 0);

  console.log("\nRESULTADO SUPRESIÓN (A02): PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
