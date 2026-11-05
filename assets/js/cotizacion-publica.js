/* ── cotizacion-publica.js · la cotización que ve el cliente ───────────
   KZ-CRM-COTIZACIONES-002.

   Se abre SIN sesión con un enlace que lleva un token aleatorio:
     /cotizacion.html?id=<token>

   Lee SOLO la proyección pública (`cotizaciones_publicas/{token}`), que no
   contiene notas internas ni datos del prospecto más allá de su nombre.
   El cliente puede responder (aceptar o rechazar) y eso es lo único que
   puede escribir: las reglas no le permiten tocar importes ni contenido.

   Usa `core.js` a propósito: así el panel y esta página comparten la misma
   configuración y, en las pruebas, el mismo aislamiento de emuladores. */
import { db, isConfigured } from './admin/core.js';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const root = document.getElementById('cot-root');
const token = new URLSearchParams(location.search).get('id');

const cop = (n) => '$ ' + (Number(n) || 0).toLocaleString('es-CO');
const AGENCIA = '573206411340';

function pantalla(titulo, texto, extra = '') {
  root.innerHTML = `<div class="centro"><h1>${titulo}</h1><p>${texto}</p>${extra}</div>`;
}

if (!isConfigured()) {
  pantalla('Configuración pendiente', 'Esta página necesita la configuración de Firebase del sitio.');
} else if (!token) {
  pantalla('Enlace incompleto', 'Falta el identificador de la cotización. Pide el enlace completo a KONFÍO ZINC.');
} else {
  cargar();
}

async function cargar() {
  let datos;
  try {
    const snap = await getDoc(doc(db, 'cotizaciones_publicas', token));
    if (!snap.exists()) {
      pantalla('Cotización no encontrada', 'El enlace no es válido o la cotización fue retirada. Escríbenos por WhatsApp y la reenviamos.');
      return;
    }
    datos = snap.data();
  } catch (e) {
    pantalla('No se pudo abrir la cotización', 'Revisa tu conexión e inténtalo otra vez.');
    return;
  }
  pintar(datos);
}

function pintar(c) {
  const hoy = new Date().toISOString().slice(0, 10);
  const vencida = c.validaHasta && String(c.validaHasta) < hoy;
  const respondida = c.estado === 'ACEPTADA' || c.estado === 'RECHAZADA';

  const estadoHtml = c.estado === 'ACEPTADA'
    ? `<div class="aviso-stado ok"><i class="fas fa-circle-check"></i> Cotización aceptada. ¡Gracias!</div>`
    : c.estado === 'RECHAZADA'
      ? `<div class="aviso-stado no"><i class="fas fa-circle-xmark"></i> Cotización rechazada</div>`
      : vencida
        ? `<div class="aviso-stado no"><i class="fas fa-clock"></i> Esta oferta venció el ${c.validaHasta}</div>`
        : `<div class="aviso-stado"><i class="fas fa-paper-plane"></i> Pendiente de tu respuesta</div>`;

  root.innerHTML = `
  <div class="hoja">
    <div class="cab">
      <div class="marca">KONFÍO <span>ZINC</span><small>Soluciones digitales · Medellín, Colombia</small></div>
      <div class="folio">Cotización<b>${c.numero || '—'}</b>Válida hasta ${c.validaHasta || '—'}</div>
    </div>
    <div class="cuerpo">
      ${estadoHtml}
      <div class="fila">
        <div class="bloque"><h4>Para</h4><p><b>${c.negocio || '—'}</b></p></div>
        <div class="bloque"><h4>Forma de pago</h4><p>${c.formaPago === 'MITAD' ? '50% al inicio y 50% a la entrega' : 'Pago único'}<br><span style="color:var(--suave)">Sin mensualidades</span></p></div>
        <div class="bloque"><h4>De</h4><p><b>KONFÍO ZINC</b><br>+57 320 641 1340</p></div>
      </div>

      <table>
        <thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Valor</th><th class="num">Subtotal</th></tr></thead>
        <tbody>
          ${(c.items || []).map((i) => `<tr>
            <td><b>${i.concepto}</b>${i.detalle ? `<br><span style="color:var(--suave);font-size:12px">${i.detalle}</span>` : ''}</td>
            <td class="num">${i.cantidad}</td><td class="num">${cop(i.valorUnitario)}</td><td class="num">${cop(i.subtotal)}</td></tr>`).join('')}
        </tbody>
      </table>

      <div class="tot">
        <div><span>Subtotal</span><span>${cop(c.subtotal)}</span></div>
        ${c.descuento ? `<div><span>Descuento</span><span>− ${cop(c.descuento)}</span></div>` : ''}
        <div class="t"><span>Total</span><span>${cop(c.total)}</span></div>
      </div>

      ${c.notaCliente ? `<div class="nota"><i class="fas fa-circle-info"></i> ${c.notaCliente}</div>` : ''}

      <div class="cond">
        <b>Qué incluye:</b> el trabajo descrito arriba, publicado en línea.<br>
        <b>Después:</b> sin mensualidades. La renovación del dominio y los cambios adicionales se cotizan aparte.<br>
        <b>Garantía:</b> 3 meses sobre el trabajo entregado.
      </div>

      <div class="acciones">
        ${respondida
          ? `<a class="b b--wa" href="https://wa.me/${AGENCIA}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Escribir a KONFÍO ZINC</a>`
          : `<button class="b b--ok" id="cot-aceptar"><i class="fas fa-check"></i> Aceptar esta cotización</button>
             <button class="b b--no" id="cot-rechazar"><i class="fas fa-xmark"></i> No por ahora</button>`}
        <button class="b b--pdf" id="cot-pdf"><i class="fas fa-file-pdf"></i> Descargar PDF</button>
        <a class="b b--wa" href="https://wa.me/${AGENCIA}?text=${encodeURIComponent('Hola, tengo una duda sobre la cotización ' + (c.numero || ''))}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Tengo una duda</a>
      </div>
    </div>
    <div class="pie">
      <div><b>KONFÍO ZINC</b> · konfiozinc.github.io/card</div>
      <div>Cualquier duda, escríbenos por WhatsApp.</div>
    </div>
  </div>`;

  document.getElementById('cot-pdf')?.addEventListener('click', () => window.print());
  document.getElementById('cot-aceptar')?.addEventListener('click', () => responder('ACEPTADA'));
  document.getElementById('cot-rechazar')?.addEventListener('click', () => responder('RECHAZADA'));
}

/** Envía la respuesta. Es lo ÚNICO que el cliente puede escribir. */
async function responder(estado) {
  const botones = document.querySelectorAll('#cot-aceptar, #cot-rechazar');
  botones.forEach((b) => { b.disabled = true; });
  try {
    await updateDoc(doc(db, 'cotizaciones_publicas', token), { estado, respondidaEn: serverTimestamp() });
    const snap = await getDoc(doc(db, 'cotizaciones_publicas', token));
    pintar(snap.data());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    botones.forEach((b) => { b.disabled = false; });
    pantalla('No se pudo registrar tu respuesta',
      'Puede que la cotización ya esté respondida o que el enlace haya caducado. Escríbenos por WhatsApp y lo arreglamos.',
      `<a class="b b--wa" style="max-width:320px;margin:0 auto" href="https://wa.me/${AGENCIA}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Escribir a KONFÍO ZINC</a>`);
  }
}
