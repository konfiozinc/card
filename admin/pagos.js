/* ── pagos.js · historial, clasificación y confirmación (KZ-OPS-001) ──
   Un pago nace PENDIENTE y solo un ADMIN lo confirma. El efecto de la
   confirmación depende del CONCEPTO: los renovables (dominio, hosting,
   mantenimiento, servicio periódico) extienden la vigencia del SERVICIO que
   indica el pago; los de pago único (desarrollo, ampliación, otro) no extienden
   nada.

   Los pagos anteriores a CARD-SPARK-002 se registraron sin concepto. No se les
   inventa uno: un ADMIN los CLASIFICA una sola vez, con motivo, y queda
   auditado. Si un pago renovable antiguo no tiene servicio asociado, el camino
   correcto es anularlo con motivo y volver a registrarlo con su servicio: el
   servicio de un pago no se reasigna (protege la trazabilidad del dinero). */
import { requireAuth, canAccess } from '../assets/js/admin/shell.js';
import { setTitulo, toast, confirmar, badgeEstado, esc } from '../assets/js/admin/ui.js';
import { cargarPagos, escrituras, cop, fechaLarga, CFG } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('pagos');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Pagos');
const cont = document.getElementById('app-content');
const esAdmin = canAccess(sesion.rol, 'ADMIN');

let pagos = [];
let filtroEstado = '';
let filtroConcepto = '';

const defConcepto = (codigo) => (CFG.conceptosPago || []).find((x) => x.codigo === codigo) || null;

function conceptoTexto(p) {
  if (!p.concepto) return '<span class="celda-suave">Histórico sin clasificar</span>';
  const d = defConcepto(p.concepto);
  return `${esc(d ? d.etiqueta : p.concepto)}${d && d.extensible ? '' : ' <span class="celda-suave">(pago único)</span>'}`;
}

function servicioTexto(p) {
  if (!p.servicioId) return '<span class="celda-suave">—</span>';
  return `<span class="celda-suave">${esc(p.servicioId)}</span>`;
}

function puedeConfirmar(p) {
  if (p.estado !== 'PENDIENTE') return false;
  if (!p.concepto) return false;                       // primero clasificar
  const d = defConcepto(p.concepto);
  if (d && d.extensible && !p.servicioId) return false; // renovación sin servicio
  return true;
}

function motivoBloqueo(p) {
  if (!p.concepto) return 'Sin concepto: clasifícalo antes de confirmar (no se asume «DESARROLLO»).';
  const d = defConcepto(p.concepto);
  if (d && d.extensible && !p.servicioId) {
    return 'Renovación sin servicio asociado: anúlalo con motivo y vuelve a registrarlo eligiendo el servicio.';
  }
  return '';
}

function pintar() {
  const f = pagos.filter((p) => (!filtroEstado || p.estado === filtroEstado)
    && (!filtroConcepto || p.concepto === filtroConcepto));

  const historicos = pagos.filter((p) => !p.concepto && p.estado === 'PENDIENTE').length;

  cont.innerHTML = `
    <div class="page-head"><div><h2>Pagos</h2>
      <p class="celda-suave">${pagos.length} registros · ${f.length} mostrados</p>
      ${historicos ? `<p class="celda-suave">${historicos} pago(s) histórico(s) sin concepto: hay que clasificarlos antes de confirmarlos.</p>` : ''}
    </div>
      <div class="page-head__acciones"><a class="btn btn--primary" href="clientes.html"><i class="fas fa-plus" aria-hidden="true"></i> Registrar desde clientes</a></div></div>

    <div class="filtros">
      <div class="campo"><label for="f-estado">Estado</label><select id="f-estado">
        <option value="">Todos</option>
        ${CFG.estadosPago.map((e) => `<option ${filtroEstado === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select></div>
      <div class="campo"><label for="f-concepto">Concepto</label><select id="f-concepto">
        <option value="">Todos</option>
        ${(CFG.conceptosPago || []).map((x) => `<option value="${esc(x.codigo)}" ${filtroConcepto === x.codigo ? 'selected' : ''}>${esc(x.etiqueta)}</option>`).join('')}
      </select></div>
    </div>

    <div class="aviso aviso--error" id="pg-error" hidden></div>

    <div class="tabla__wrap"><table class="tabla"><thead><tr>
      <th>Cliente</th><th>Monto</th><th>Concepto</th><th>Servicio</th><th>Método</th><th>Fecha</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody>${f.map((p) => `<tr data-id="${esc(p.id)}">
      <td>${esc(p.clienteNombre || p.clienteId)}</td>
      <td>${cop(p.monto)}</td>
      <td>${conceptoTexto(p)}</td>
      <td>${servicioTexto(p)}</td>
      <td>${esc(p.metodoPago)}</td>
      <td>${fechaLarga(p.fechaPago)}</td>
      <td>${badgeEstado(p.estado)}</td>
      <td><div class="acciones-fila">
        ${esAdmin && p.estado === 'PENDIENTE' && !p.concepto
          ? `<button data-a="clasificar" title="Clasificar pago histórico" aria-label="Clasificar pago histórico"><i class="fas fa-tags" aria-hidden="true"></i></button>` : ''}
        ${esAdmin && puedeConfirmar(p)
          ? `<button data-a="confirmar" title="Confirmar" aria-label="Confirmar"><i class="fas fa-check" aria-hidden="true"></i></button>` : ''}
        ${esAdmin && (p.estado === 'PENDIENTE' || p.estado === 'CONFIRMADO')
          ? `<button data-a="anular" title="Anular con motivo" aria-label="Anular"><i class="fas fa-xmark" aria-hidden="true"></i></button>` : ''}
      </div></td></tr>`).join('')}</tbody></table>
    ${f.length ? '' : '<p class="tabla__vacia">Sin pagos que coincidan con el filtro.</p>'}</div>`;

  document.getElementById('f-estado').addEventListener('change', (e) => { filtroEstado = e.target.value; pintar(); });
  document.getElementById('f-concepto').addEventListener('change', (e) => { filtroConcepto = e.target.value; pintar(); });
  cont.querySelector('tbody').addEventListener('click', manejarAccion);
}

async function manejarAccion(e) {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const id = b.closest('tr').dataset.id;
  const p = pagos.find((x) => x.id === id);
  if (!p) return;
  const err = document.getElementById('pg-error');
  err.hidden = true;
  b.disabled = true;
  try {
    const a = b.dataset.a;

    if (a === 'clasificar') {
      const codigo = prompt('Concepto real de este cobro:\n' +
        (CFG.conceptosPago || []).map((x) => '  ' + x.codigo + ' — ' + x.etiqueta).join('\n') +
        '\n\nEscribe el código exacto (no se inventa ningún concepto):');
      if (!codigo) { b.disabled = false; return; }
      if (!defConcepto(codigo.trim())) {
        err.textContent = 'Ese código no está en el catálogo de conceptos: ' + codigo;
        err.hidden = false;
        return;
      }
      const motivo = prompt('Motivo de la clasificación (obligatorio, queda auditado):');
      if (!motivo) { b.disabled = false; return; }
      await escrituras.clasificarPago(id, codigo.trim(), motivo, null);
      toast('Pago clasificado como ' + codigo.trim());
    }

    if (a === 'confirmar') {
      const bloqueo = motivoBloqueo(p);
      if (bloqueo) { err.textContent = bloqueo; err.hidden = false; b.disabled = false; return; }
      const d = defConcepto(p.concepto);
      const msg = d && d.extensible
        ? `¿Confirmar este pago de ${d.etiqueta}? Extenderá ${d.meses} meses SOLO el servicio asociado; los demás servicios del cliente no cambian.`
        : `¿Confirmar este pago de ${d ? d.etiqueta : p.concepto}? Es un pago único: NO extiende ninguna vigencia.`;
      if (!await confirmar(msg, 'Confirmar')) { b.disabled = false; return; }
      const r = await escrituras.confirmarPago(id);
      toast(r.aviso || ('Pago confirmado (' + r.concepto + (r.nuevoVencimiento ? ' · vigencia hasta ' + r.nuevoVencimiento : ' · sin cambio de vigencia') + ')'));
    }

    if (a === 'anular') {
      const motivo = prompt('Motivo de la anulación (obligatorio):');
      if (!motivo) { b.disabled = false; return; }
      await escrituras.anularPago(id, motivo);
      toast('Pago anulado');
    }

    pagos = await cargarPagos();
    pintar();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    b.disabled = false;
  }
}

pagos = await cargarPagos();
pintar();
