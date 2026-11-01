/* Reproducción focalizada del 403: mismo documento, misma condición anónima.
   Se ejecuta con: firebase emulators:exec --only firestore --project demo-crm-016 --config crm/emulador.json "node crm/diagnostico-403.cjs" */
const BASE = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/(default)/documents";
const BASE_ALT = "http://127.0.0.1:8080/v1/projects/demo-crm-016/databases/default/documents";
let ok = 0, ko = 0;
const chk = (n, c, e) => { c ? ok++ : ko++; console.log((c ? "  PASS  " : "  FALLA ") + n + (e ? "  (" + e + ")" : "")); };
const enviar = (url, campos) => fetch(`${url}/crm_leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields: campos }) });

const docExacto = () => ({
  nombre: { stringValue: "Prospecto Ficticio A" },
  telefono: { stringValue: "3001112233" },
  industria: { stringValue: "restaurantes" },
  consentimiento: { booleanValue: true },
  estado: { stringValue: "nuevo" },
  creado_en: { timestampValue: new Date().toISOString() },
});

(async () => {
  console.log("=== 1. Documento EXACTO que falló en producción, anónimo");
  const a = await enviar(BASE, docExacto());
  console.log("   POST …/databases/(default)/documents/crm_leads -> " + a.status);
  if (a.status !== 200) console.log("   " + (await a.text()).slice(0, 200));
  chk("el documento exacto PASA en el emulador con las reglas candidatas", a.status === 200);

  const b = await enviar(BASE_ALT, docExacto());
  chk("misma llamada usando el identificador literal 'default'", b.status === 200, "HTTP " + b.status);

  console.log("\n=== 2. Condiciones evaluadas una por una (cada variante debe ser rechazada)");
  const variantes = [
    ["sin consentimiento", { ...docExacto(), consentimiento: { booleanValue: false } }],
    ["nombre de 1 letra", { ...docExacto(), nombre: { stringValue: "A" } }],
    ["teléfono de 5 dígitos", { ...docExacto(), telefono: { stringValue: "30011" } }],
    ["estado distinto de nuevo", { ...docExacto(), estado: { stringValue: "ganado" } }],
    ["creado_en como texto en vez de timestamp", { ...docExacto(), creado_en: { stringValue: new Date().toISOString() } }],
    ["falta industria", (() => { const d = docExacto(); delete d.industria; return d; })()],
  ];
  for (const [nombre, campos] of variantes) {
    const r = await enviar(BASE, campos);
    chk("rechaza: " + nombre, r.status === 403, "HTTP " + r.status);
  }

  console.log("\n=== 3. Comparación de representaciones");
  const p1 = await enviar(BASE, docExacto());
  const cuerpo1 = await p1.json().catch(() => ({}));
  console.log("   REST  → nombre.tipo=" + (cuerpo1.fields && cuerpo1.fields.nombre && Object.keys(cuerpo1.fields.nombre)[0]) +
    " · creado_en.tipo=" + (cuerpo1.fields && cuerpo1.fields.creado_en && Object.keys(cuerpo1.fields.creado_en)[0]));
  console.log("   Nota: el SDK de JavaScript envía el mismo tipo (Timestamp) y las mismas claves;");
  console.log("   la diferencia relevante es el identificador de base: '(default)' frente a 'default'.");

  console.log("\n=== 4. Lecturas y ventas anónimas");
  chk("anónimo NO lee prospectos", (await fetch(`${BASE}/crm_leads`)).status === 403);
  chk("anónimo NO crea ventas", (await fetch(`${BASE}/crm_sales`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields: { lead_id: { stringValue: "x" } } }) })).status === 403);

  console.log("\nRESULTADO DIAGNÓSTICO: PASS " + ok + " · FALLA " + ko);
  process.exit(ko ? 3 : 0);
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(2); });
