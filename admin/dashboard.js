/* ── dashboard.js · resumen del negocio ────────────────────────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, kpisHTML } from '../assets/js/admin/ui.js';
import { cargarClientes, cargarPagos, CFG, NEG, cop, dias, esc } from '../assets/js/admin/datos.js';

const sesion = await requireAuth('dashboard');
if (!sesion) throw new Error('Sin acceso');

setTitulo('Dashboard');
const cont = document.getElementById('app-content');

const [clientes, pagos] = await Promise.all([cargarClientes(), cargarPagos()]);

/* KPIs */
const activos = clientes.filter(c => c.estadoCliente === 'ACTIVO').length;
const porVencer = clientes.filter(c => c.estadoCliente === 'POR_VENCER').length;
const pendPago = clientes.filter(c => c.estadoCliente === 'PENDIENTE_PAGO').length;
const inactivos = clientes.filter(c => c.estadoCliente === 'INACTIVO').length;

const mes = new Date().getMonth(), anio = new Date().getFullYear();
const ingresosMes = pagos
  .filter(p => p.estado === 'CONFIRMADO' && p.fechaPago && new Date(p.fechaPago).getMonth() === mes && new Date(p.fechaPago).getFullYear() === anio)
  .reduce((s, p) => s + (Number(p.monto) || 0), 0);

/* Barras: clientes por servicio */
const conteo = {};
CFG.servicios.forEach(s => conteo[s.etiqueta] = 0);
clientes.forEach(c => { if (conteo[c.servicio] !== undefined) conteo[c.servicio]++; });
const maximo = Math.max(1, ...Object.values(conteo));
const barras = CFG.servicios.map(s => {
  const n = conteo[s.etiqueta] || 0;
  return `<div class="barra__head"><span>${esc(s.etiqueta)}</span><span>${n}</span></div>
    <div class="barra__track"><div class="barra__fill" style="width:${Math.round(n / maximo * 100)}%"></div></div>`;
}).join('');

/* Próximos vencimientos a 60 días */
const proximos = clientes
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
    { label: 'Ingresos del mes', valor: cop(ingresosMes), tono: 'info', nota: 'Pagos confirmados' },
    { label: 'Total clientes', valor: clientes.length, tono: 'neutro', nota: 'En base de datos' }
  ])}

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
    <p class="celda-suave">Los avisos automáticos se envían ${NEG.diasAntes.join(', ')} días antes del vencimiento, mediante la función programada <code>processDueDates</code> (8:00 a.m. America/Bogota).</p>
    <div class="page-head__acciones">
      <a class="btn btn--primary" href="clientes.html"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo cliente</a>
      <a class="btn btn--ghost" href="pagos.html"><i class="fas fa-money-bill" aria-hidden="true"></i> Registrar pago</a>
    </div>
  </div>`;
