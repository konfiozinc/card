/* ── cotizacion-nueva.js · crear / editar una cotización ──────────────
   KZ-CRM-COTIZACIONES-002.

   Sirve para las dos cosas:
     · sin parámetros  → cotización nueva (desde cero o desde Contactos con
                          `?contacto=<id>`, que precarga los datos);
     · con `?id=<id>`  → editar un borrador existente.

   Los totales se calculan aquí para verlos en vivo, pero el número bueno lo
   manda el servidor: las reglas exigen que `total == subtotal − descuento`. */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc, fmtCOP, val, marcarInvalido } from '../assets/js/admin/ui.js';
import { cargarContactos, cargarCotizacion, escrituras, CFG } from '../assets/js/admin/datos.js';
/* KZ-CRM-007 · misma regla que aplica el módulo de escrituras, para avisar antes
   de tocar Firebase en lugar de después. */
import { revisarImportes } from '../assets/js/admin/reglas-cotizacion.js';

const sesion = await requireAuth('cotizaciones');
if (!sesion) throw new Error('Sin acceso');

const params = new URLSearchParams(location.search);
const idEdicion = params.get('id');
const idContacto = params.get('contacto');

const contactos = await cargarContactos().catch(() => []);
const existente = idEdicion ? await cargarCotizacion(idEdicion) : null;
if (idEdicion && !existente) throw new Error('La cotización no existe');

setTitulo(idEdicion ? 'Editar cotización' : 'Nueva cotización');
const cont = document.getElementById('app-content');

/* ── Estado del formulario ───────────────────────────────────────────── */
const hoy = new Date();
const enQuince = new Date(hoy.getTime() + 15 * 86400000);
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let items = (existente?.items || []).map((i) => ({ concepto: i.concepto, detalle: i.detalle || '', cantidad: i.cantidad, valorUnitario: i.valorUnitario }));
if (items.length === 0) items = [{ concepto: '', detalle: '', cantidad: 1, valorUnitario: 0 }];

const contactoInicial = idContacto ? contactos.find((c) => c.id === idContacto) : null;

/* Presets de precio: los oficiales de la casa (pago único, sin mensualidades). */
const PRESETS = [
  ...(CFG.servicios || []).map((s) => ({ nombre: s.etiqueta, precio: s.precioDesde || 0 })),
  { nombre: 'Mini Web Básica', precio: 49900 },
  { nombre: 'Mini Web Pro', precio: 99900 },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function pintarItems() {
  const tbody = document.getElementById('cot-items');
  tbody.innerHTML = items.map((it, i) => `
    <tr data-i="${i}">
      <td><input class="cot-concepto" value="${esc(it.concepto)}" placeholder="Mini Web Pro" list="cot-presets">
          <input class="cot-detalle" value="${esc(it.detalle || '')}" placeholder="detalle opcional" style="margin-top:.3rem;font-size:.75rem"></td>
      <td><input class="cot-cantidad" type="number" min="1" step="1" value="${esc(it.cantidad)}" style="text-align:right"></td>
      <td><input class="cot-valor" type="number" min="0" step="100" value="${esc(it.valorUnitario)}" style="text-align:right"></td>
      <td class="num cot-sub" style="text-align:right;padding-top:.9rem">${esc(fmtCOP((it.cantidad || 0) * (it.valorUnitario || 0)))}</td>
      <td style="padding-top:.9rem"><button class="quitar" data-quitar="${i}" title="Quitar" type="button"><i class="fas fa-xmark"></i></button></td>
    </tr>`).join('');
}

function totales() {
  const subtotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.valorUnitario) || 0), 0);
  const desc = Math.max(0, Math.min(Math.round(Number(val('cot-descuento')) || 0), subtotal));
  return { subtotal, descuento: desc, total: subtotal - desc };
}

function pintarTotales() {
  const t = totales();
  document.getElementById('cot-subtotal').textContent = fmtCOP(t.subtotal);
  document.getElementById('cot-total').textContent = fmtCOP(t.total);
  if (Number(val('cot-descuento')) > t.subtotal) document.getElementById('cot-descuento').value = String(t.subtotal);
  return t;
}

/* ── Pintado de la página ────────────────────────────────────────────── */
cont.innerHTML = `
  <div class="page-head">
    <div>
      <p class="celda-suave" style="margin:0 0 .2rem"><a href="cotizaciones.html"><i class="fas fa-arrow-left"></i> Cotizaciones</a></p>
      <h2>${idEdicion ? 'Editar cotización' : 'Nueva cotización'}</h2>
      <p class="celda-suave">Se guarda como <b>borrador</b> hasta que la envíes. Al enviarla recibe número y enlace público.</p>
    </div>
  </div>

  <div class="card">
    <h3 style="margin:0 0 .6rem;font-size:.95rem">Prospecto</h3>
    <div class="campo" style="margin-bottom:.8rem">
      <label for="cot-contacto">Elegir de Contactos (opcional)</label>
      <select id="cot-contacto">
        <option value="">— escribir a mano —</option>
        ${contactos.map((c) => `<option value="${esc(c.id)}" ${(contactoInicial?.id === c.id) ? 'selected' : ''}>${esc(c.nombre)}${c.telefono ? ' · ' + esc(c.telefono) : ''}</option>`).join('')}
      </select>
      <span class="campo__nota">Elegir uno rellena el nombre y el teléfono de abajo.</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.9rem">
      <div class="campo" style="margin:0"><label for="cot-nombre">Nombre o negocio *</label>
        <input id="cot-nombre" value="${esc(existente?.prospectoNombre || contactoInicial?.nombre || '')}" placeholder="Panadería La Espiga"></div>
      <div class="campo" style="margin:0"><label for="cot-telefono">WhatsApp</label>
        <input id="cot-telefono" value="${esc(existente?.prospectoTelefono || contactoInicial?.telefono || '')}" placeholder="300 000 0000"></div>
    </div>
  </div>

  <div class="card">
    <h3 style="margin:0 0 .6rem;font-size:.95rem">Ítems</h3>
    <table class="tabla" style="min-width:0">
      <thead><tr><th style="width:46%">Concepto</th><th style="width:12%;text-align:right">Cant.</th><th style="width:20%;text-align:right">Valor unitario</th><th style="width:16%;text-align:right">Subtotal</th><th></th></tr></thead>
      <tbody id="cot-items"></tbody>
    </table>
    <datalist id="cot-presets">${PRESETS.map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
    <button class="btn btn--ghost" id="btn-add" type="button" style="margin-top:.7rem;font-size:.78rem"><i class="fas fa-plus"></i> Añadir ítem</button>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.7rem" id="cot-chips"></div>

    <div style="display:grid;grid-template-columns:1fr 300px;gap:1.2rem;margin-top:1.2rem;align-items:start">
      <div>
        <div class="campo"><label for="cot-nota">Nota para el cliente (sale en la cotización)</label>
          <textarea id="cot-nota" rows="2" style="width:100%">${esc(existente?.notaCliente || '')}</textarea></div>
        <div class="campo"><label for="cot-internas">Notas internas (NO las ve el cliente)</label>
          <textarea id="cot-internas" rows="2" style="width:100%">${esc(existente?.notasInternas || '')}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.9rem">
          <div class="campo" style="margin:0"><label for="cot-validez">Válida hasta</label>
            <input id="cot-validez" type="date" value="${esc(existente?.validaHasta || isoDia(enQuince))}"></div>
          <div class="campo" style="margin:0"><label for="cot-pago">Forma de pago</label>
            <select id="cot-pago">
              <option value="UNICO" ${existente?.formaPago !== 'MITAD' ? 'selected' : ''}>Pago único</option>
              <option value="MITAD" ${existente?.formaPago === 'MITAD' ? 'selected' : ''}>50% inicio + 50% entrega</option>
            </select></div>
        </div>
      </div>
      <div>
        <div class="campo"><label for="cot-descuento">Descuento (COP)</label>
          <input id="cot-descuento" type="number" min="0" step="100" value="${esc(existente?.descuento || 0)}"></div>
        <div style="border-top:1px solid var(--border);padding-top:.6rem;font-size:.88rem">
          <div style="display:flex;justify-content:space-between"><span class="celda-suave">Subtotal</span><span id="cot-subtotal">$ 0</span></div>
          <div style="display:flex;justify-content:space-between;margin-top:.5rem;font-size:1.05rem"><b>Total</b><b id="cot-total">$ 0</b></div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem;flex-wrap:wrap">
      <a class="btn btn--ghost" href="cotizaciones.html">Cancelar</a>
      <button class="btn btn--ghost" id="btn-guardar" type="button"><i class="fas fa-floppy-disk"></i> Guardar borrador</button>
      <button class="btn btn--primary" id="btn-enviar" type="button"><i class="fab fa-whatsapp"></i> Guardar y enviar</button>
    </div>
  </div>`;

/* ── Catálogo rápido ─────────────────────────────────────────────────── */
document.getElementById('cot-chips').innerHTML = PRESETS.map((p, i) =>
  `<button class="chip" data-preset="${i}" type="button" style="font-size:.72rem;border:1px dashed var(--border);border-radius:999px;padding:.28rem .7rem;background:transparent;color:var(--text-muted);cursor:pointer">
     ${esc(p.nombre)} · ${esc(fmtCOP(p.precio))}</button>`).join('');
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = PRESETS[Number(b.dataset.preset)];
  const vacia = items.findIndex((i) => !i.concepto);
  const fila = { concepto: p.nombre, detalle: '', cantidad: 1, valorUnitario: p.precio };
  if (vacia !== -1) items[vacia] = fila; else items.push(fila);
  pintarItems(); pintarTotales();
}));

/* ── Interacción con la tabla de ítems ───────────────────────────────── */
document.getElementById('cot-contacto').addEventListener('change', (e) => {
  const c = contactos.find((x) => x.id === e.target.value);
  if (!c) return;
  document.getElementById('cot-nombre').value = c.nombre || '';
  document.getElementById('cot-telefono').value = c.telefono || '';
});

document.getElementById('cot-items').addEventListener('input', (e) => {
  const fila = e.target.closest('tr');
  if (!fila) return;
  const i = Number(fila.dataset.i);
  if (e.target.classList.contains('cot-concepto')) items[i].concepto = e.target.value;
  if (e.target.classList.contains('cot-detalle')) items[i].detalle = e.target.value;
  if (e.target.classList.contains('cot-cantidad')) items[i].cantidad = Math.max(1, Number(e.target.value) || 1);
  if (e.target.classList.contains('cot-valor')) items[i].valorUnitario = Math.max(0, Number(e.target.value) || 0);
  fila.querySelector('.cot-sub').textContent = fmtCOP((items[i].cantidad || 0) * (items[i].valorUnitario || 0));
  pintarTotales();
});

document.getElementById('cot-items').addEventListener('click', (e) => {
  const b = e.target.closest('[data-quitar]');
  if (!b) return;
  if (items.length === 1) { items[0] = { concepto: '', detalle: '', cantidad: 1, valorUnitario: 0 }; }
  else items.splice(Number(b.dataset.quitar), 1);
  pintarItems(); pintarTotales();
});

document.getElementById('btn-add').addEventListener('click', () => {
  items.push({ concepto: '', detalle: '', cantidad: 1, valorUnitario: 0 });
  pintarItems(); pintarTotales();
});
document.getElementById('cot-descuento').addEventListener('input', pintarTotales);

/* ── Guardar ─────────────────────────────────────────────────────────── */
function recoger() {
  const nombre = val('cot-nombre');
  const telefono = val('cot-telefono');
  if (!nombre) return marcarInvalido('cot-nombre', 'Escribe el nombre o negocio del prospecto.');
  const limpios = items.filter((i) => String(i.concepto || '').trim() !== '');
  if (limpios.length === 0) return marcarInvalido('cot-items', 'Añade al menos un ítem con concepto.');
  const t = totales();
  return {
    items: limpios,
    descuento: t.descuento,
    prospectoId: document.getElementById('cot-contacto').value || null,
    prospectoNombre: nombre,
    prospectoTelefono: telefono,
    validaHasta: val('cot-validez'),
    formaPago: document.getElementById('cot-pago').value,
    notaCliente: document.getElementById('cot-nota').value,
    notasInternas: document.getElementById('cot-internas').value
  };
}

async function guardar() {
  const datos = recoger();
  if (!datos) return null;
  if (idEdicion) {
    await escrituras.actualizarCotizacion(idEdicion, datos);
    return idEdicion;
  }
  const r = await escrituras.crearCotizacion(datos);
  return r.id;
}

document.getElementById('btn-guardar').addEventListener('click', async () => {
  try {
    const id = await guardar();
    if (!id) return;
    toast('Borrador guardado', 'ok');
    location.href = 'cotizaciones.html';
  } catch (e) { toast(e.message || 'No se pudo guardar', 'error'); }
});

document.getElementById('btn-enviar').addEventListener('click', async () => {
  try {
    /* KZ-CRM-007 · se comprueba el importe ANTES de escribir nada: si el total es
       cero no se crea ni el borrador en Firebase, así que no queda basura en la
       base ni un número de cotización gastado. */
    const t = totales();
    const problema = revisarImportes(t.subtotal, t.total);
    if (problema) {
      marcarInvalido('cot-items', problema);
      toast(problema, 'error');
      return;
    }
    const id = await guardar();
    if (!id) return;
    const r = await escrituras.enviarCotizacion(id);
    toast('Cotización enviada: ' + r.numero, 'ok');
    mostrarEnvio(r, val('cot-nombre'), val('cot-telefono'));
  } catch (e) { toast(e.message || 'No se pudo enviar', 'error'); }
});

/** Ventana final: enlace público + botón de WhatsApp con el mensaje escrito. */
function mostrarEnvio(r, nombre, telefono) {
  const base = location.pathname.split('/admin/')[0] || '';
  const enlace = `${location.origin}${base}/cotizacion.html?id=${r.token}`;
  const mensaje = `Hola ${nombre}. Te dejo la cotización ${r.numero} de KONFÍO ZINC. ` +
    `Puedes verla, descargarla y aceptarla aquí: ${enlace}`;
  const wa = telefono ? `https://wa.me/57${String(telefono).replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}` : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal is-open';
  overlay.innerHTML = `
    <div class="modal__box" role="dialog" aria-modal="true" style="max-width:560px">
      <div class="modal__body">
        <h3 style="margin:0 0 .3rem">Cotización ${esc(r.numero)} enviada</h3>
        <p class="celda-suave" style="margin:0 0 1rem">Este es el enlace que verá el cliente. Se abre sin contraseña.</p>
        <div class="campo"><label>Enlace público</label>
          <input id="env-enlace" readonly value="${esc(enlace)}"></div>
        <div class="campo"><label>Mensaje listo para WhatsApp</label>
          <textarea id="env-mensaje" rows="3" readonly style="width:100%">${esc(mensaje)}</textarea></div>
      </div>
      <div class="modal__foot"><div class="modal__actions">
        <button class="btn btn--ghost" data-r="copiar" type="button"><i class="fas fa-copy"></i> Copiar enlace</button>
        ${wa ? `<a class="btn btn--primary" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Abrir WhatsApp</a>` : ''}
        <a class="btn btn--ghost" href="cotizaciones.html">Ir a la lista</a>
      </div></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-r="copiar"]')) {
      navigator.clipboard?.writeText(enlace).then(() => toast('Enlace copiado', 'ok')).catch(() => {});
    }
  });
}

/* ── Arranque ────────────────────────────────────────────────────────── */
pintarItems();
pintarTotales();
