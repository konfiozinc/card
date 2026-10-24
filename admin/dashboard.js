/* ── dashboard.js · resumen del negocio ────────────────────────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, kpisHTML } from '../assets/js/admin/ui.js';
import { cargarClientes, cargarPagos, CFG, NEG, cop, dias, esc } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('dashboard');
if (!sesion) throw new Error('Sin acceso');

setTitulo('Dashboard');
const cont = document.getElementById('app-content');

const [clientes, pagos] = await Promise.all([cargarClientes(), cargarPagos()]);

/* Solo los clientes vigentes en las listas (los de baja lógica no cuentan). */
const visibles = clientes.filter(c => !c.eliminado);

/* KPIs */
const activos = visibles.filter(c => c.estadoCliente === 'ACTIVO').length;
const porVencer = visibles.filter(c => c.estadoCliente === 'POR_VENCER').length;
const pendPago = visibles.filter(c => c.estadoCliente === 'PENDIENTE_PAGO').length;
const inactivos = visibles.filter(c => c.estadoCliente === 'INACTIVO').length;
const suspendidos = visibles.filter(c => c.estadoCliente === 'SUSPENDIDO').length;
const inhabilitados = visibles.filter(c => c.estadoCliente === 'INHABILITADO').length;

const mes = new Date().getMonth(), anio = new Date().getFullYear();
const ingresosMes = pagos
  .filter(p => p.estado === 'CONFIRMADO' && p.fechaPago && new Date(p.fechaPago).getMonth() === mes && new Date(p.fechaPago).getFullYear() === anio)
  .reduce((s, p) => s + (Number(p.monto) || 0), 0);

/* CARD-SPARK-002: separar ingresos realizados de importes pendientes, y
   desglosar por CONCEPTO (un pago de desarrollo NO es un ingreso recurrente). */
const pendientesMonto = pagos
  .filter(p => p.estado === 'PENDIENTE')
  .reduce((s, p) => s + (Number(p.monto) || 0), 0);
const porConcepto = {};
pagos.filter(p => p.estado === 'CONFIRMADO').forEach(p => {
  const k = p.concepto || 'SIN_CLASIFICAR';
  porConcepto[k] = (porConcepto[k] || 0) + (Number(p.monto) || 0);
});
const conceptosTxt = (CFG.conceptosPago || []).map(x => ({ ...x, total: porConcepto[x.codigo] || 0 })).filter(x => x.total > 0);
const renovacionesProx = visibles.filter(c => c.dias !== null && c.dias >= 0 && c.dias <= 60).length;

/* Barras: clientes por servicio */
const conteo = {};
CFG.servicios.forEach(s => conteo[s.etiqueta] = 0);
visibles.forEach(c => { if (conteo[c.servicio] !== undefined) conteo[c.servicio]++; });
const maximo = Math.max(1, ...Object.values(conteo));
const barras = CFG.servicios.map(s => {
  const n = conteo[s.etiqueta] || 0;
  return `<div class="barra__head"><span>${esc(s.etiqueta)}</span><span>${n}</span></div>
    <div class="barra__track"><div class="barra__fill" style="width:${Math.round(n / maximo * 100)}%"></div></div>`;
}).join('');

/* Próximos vencimientos a 60 días */
const proximos = visibles
  .filter(c => c.dias !== null && c.dias >= 0 && c.dias <= 60)
  .sort((a, b) => a.dias - b.dias)
  .slice(0, 10);

const listaVenc = proximos.length
  ? proximos.map(c => `<div class="barra__head">
      <span>${esc(c.nombre)} <span class="celda-suave">· ${esc(c.servicio)}</span></span>
      <span class="badge ${c.dias <= 5 ? 'badge--pendiente' : 'badge--por_vencer'}">${c.dias === 0 ? 'Hoy' : 'en ' + c.dias + ' d'}</span>
    </div>`).join('')
  : '<p class="celda-suave">No hay vencimientos en los próximos 60 días.</p>';

cont.innerHTML = `
  ${kpisHTML([
    { label: 'Clientes activos', valor: activos, tono: 'ok', nota: 'Con servicio vigente' },
    { label: 'Por vencer', valor: porVencer, tono: 'alerta', nota: `≤ ${NEG.diasPorVencer} días` },
    { label: 'Pendientes de pago', valor: pendPago, tono: 'peligro', nota: 'Vencidos, por cobrar' },
    { label: 'Inactivos', valor: inactivos, tono: 'neutro', nota: 'Servicio desactivado' },
    { label: 'Suspendidos', valor: suspendidos, tono: 'alerta', nota: 'Pausa temporal' },
    { label: 'Inhabilitados', valor: inhabilitados, tono: 'peligro', nota: 'Bloqueados' },
    { label: 'Ingresos confirmados (mes)', valor: cop(ingresosMes), tono: 'info', nota: 'Cobros CONFIRMADOS' },
    { label: 'Pagos pendientes (monto)', valor: cop(pendientesMonto), tono: 'peligro', nota: 'Registrados sin confirmar' },
    { label: 'Renovaciones próximas', valor: renovacionesProx, tono: 'alerta', nota: '≤ 60 días' },
    { label: 'Total clientes', valor: visibles.length, tono: 'neutro', nota: 'En base de datos' }
  ])}

  <div class="card">
    <h3><i class="fas fa-coins" aria-hidden="true"></i> Ingresos confirmados por concepto</h3>
    ${conceptosTxt.length
      ? conceptosTxt.map(x => `<div class="barra__head"><span>${esc(x.etiqueta)}</span><span>${cop(x.total)}</span></div>`).join('')
      : '<p class="celda-suave">Sin cobros confirmados clasificados todavía.</p>'}
    <p class="celda-suave" style="margin-top:.5rem">Los pagos sin concepto se cuentan como «sin clasificar» hasta que un ADMIN los clasifique.</p>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3><i class="fas fa-layer-group" aria-hidden="true"></i> Clientes por servicio</h3>
      <div class="barras">${barras}</div>
    </div>
    <div class="card">
      <h3><i class="fas fa-clock" aria-hidden="true"></i> Próximos vencimientos (60 días)</h3>
      <div class="barras">${listaVenc}</div>
    </div>
  </div>

  <div class="page-head">
    <p class="celda-suave">Los avisos son MANUALES por WhatsApp: este panel los prepara y el operador los envía. No hay motor automático de notificaciones en el plan Spark.</p>
    <div class="page-head__acciones">
      <a class="btn btn--primary" href="clientes.html"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo cliente</a>
      <a class="btn btn--ghost" href="pagos.html"><i class="fas fa-money-bill" aria-hidden="true"></i> Registrar pago</a>
    </div>
  </div>`;
