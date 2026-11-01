/* KZ-CRM-018 · Helper de PRUEBAS para dar de alta un prospecto en el modelo UUID.
   INTERNO: crm-dev/lib/. No se publica.

   POR QUÉ EXISTE
   Antes del modelo UUID, cada suite creaba prospectos con `documentId = teléfono` y
   después los leía por el mismo id: `crm_leads/3201110001`. Al pasar a UUID, el id ya
   no es el teléfono, así que esas suites dejaron de encontrar los documentos. Reescribir
   cada suite con un mapa «teléfono → id» obliga a tocar cientos de llamadas y es fácil
   equivocarse.

   SOLUCIÓN: identificar el prospecto de prueba con un UUID DETERMINISTA derivado del
   teléfono. Así cada suite conserva su vocabulario (`TEL_A`), sabe calcular el id sin
   llevar estado, y el alta sigue siendo la real: prospecto + marcador en el MISMO lote,
   que es lo que exigen las reglas.

   OJO: esto es SÓLO para pruebas. En el producto el UUID es aleatorio
   (crypto.randomUUID) y no se deriva del teléfono: un identificador derivado del número
   reintroduciría justo lo que el modelo quiere evitar.
*/

const crypto = require("node:crypto");

/** UUID v4 determinista a partir del teléfono (sólo para pruebas). */
function idDePrueba(telefono) {
  const h = crypto.createHash("sha256").update("kz-pruebas-lead:" + String(telefono)).digest("hex");
  const variante = "89ab"[parseInt(h[16], 16) % 4];
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-" +
    variante + h.slice(17, 20) + "-" + h.slice(20, 32);
}

/** Prefijo de documentos a partir de la URL REST usada por las suites. */
const prefijoDe = (FS) => new URL(FS).pathname.replace(/^\//, "");

const cabecera = (token) => ({
  "content-type": "application/json",
  ...(token ? { authorization: "Bearer " + token } : {}),
});

/**
 * Alta de prospecto como la hace el panel: prospecto con UUID + marcador de
 * deduplicación, en un único commit.
 * @returns {Promise<{status:number, id:string, telefono:string}>}
 */
async function altaLead(FS, campos, token, idElegido) {
  const prefijo = prefijoDe(FS);
  const telefono = campos.telefono.stringValue;
  const id = idElegido || idDePrueba(telefono);
  const writes = [
    { update: { name: `${prefijo}/crm_leads/${id}`, fields: campos } },
    { update: { name: `${prefijo}/crm_dedup/${telefono}`, fields: {
      lead_id: { stringValue: id },
      creado_en: campos.creado_en || { timestampValue: new Date().toISOString() },
      creado_por: campos.creado_por || { stringValue: "pruebas" },
    } } },
  ];
  const r = await fetch(`${FS}:commit`, {
    method: "POST", headers: cabecera(token), body: JSON.stringify({ writes }),
  });
  return { status: r.status, id, telefono };
}

/** Borra el prospecto de prueba y su marcador con la credencial privilegiada. */
async function borrarLead(FS, telefono, tokenDueno) {
  const prefijo = prefijoDe(FS);
  const id = idDePrueba(telefono);
  await fetch(`${FS}:commit`, { method: "POST", headers: cabecera(tokenDueno),
    body: JSON.stringify({ writes: [
      { delete: `${prefijo}/crm_leads/${id}` },
      { delete: `${prefijo}/crm_dedup/${telefono}` },
    ] }) });
}

module.exports = { idDePrueba, altaLead, borrarLead, prefijoDe, cabecera };
