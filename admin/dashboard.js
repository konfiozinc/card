/* ── dashboard.js · resumen del negocio (KZ-OPS-001) ──────────────────
   Las cifras se calculan desde lo que HAY en Firestore, no desde una
   suposición: los clientes de baja lógica no cuentan, las obligaciones salen de
   cada SERVICIO (CARD-SPARK-002 permite varios por cliente) y los ingresos se
   separan por concepto, porque un cobro de desarrollo no es un ingreso
   recurrente. */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, kpisHTML } from '../assets/js/admin/ui.js';
import {
  cargarClientes, cargarPagos, cargarTodosLosServicios, agruparServiciosPorCliente,
  CFG, NEG, cop, dias, esc, obligacionServicio
} from '../assets/js/admin/datos.js';

const sesion = await requireAuth('dashboard');
if (!sesion) throw new Error('Sin acceso');

setTitulo('Dashboard');
const cont = document.getElementById('app-content');

const [clientes, pagos, servicios] = await Promise.all([
  cargarClientes(), cargarPagos(), cargarTodosLosServicios()
]);

/* Solo los clientes vigentes en las listas (los de baja lógica no cuentan). */
const visibles = clientes.filter(c => !c.eliminado);
const idsVisibles = new Set(visibles.map(c => c.id));
const serviciosVisibles = servicios.filter(s => idsVisibles.has(s.clienteId));

/* KPIs de clientes */
const activos = visibles.filter(c => c.estadoCliente === 'ACTIVO').length;
const porVencer = visibles.filter(c => c.estadoCliente === 'POR_VENCER').length;
const pendPago = visibles.filter(c => c.estadoCliente === 'PENDIENTE_PAGO').length;
const inactivos = visibles.filter(c => c.estadoCliente === 'INACTIVO').length;
const suspendidos = visibles.filter(c => c.estadoCliente === 'SUSPENDIDO').length;
const inhabilitados = visibles.filter(c => c.estadoCliente === 'INHABILITADO').length;

/* Ingresos del mes (solo CONFIRMADOS) */
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

/* ── Obligaciones reales por servicio ────────────────────────────────
   Cada servicio aporta su propia fecha. Los clientes sin servicios
   registrados siguen contando con su fecha genérica, para no ocultar datos
   incompletos. */
const porCliente = agruparServiciosPorCliente(serviciosVisibles);
const obligaciones = [];
for (const c of visibles) {
  const suyos = porCliente.get(c.id) || [];
  if (!suyos.length) {
    obligaciones.push({
      ambito: 'cliente', cliente: c.nombre, clienteId: c.id, servicio: c.servicio || '—',
      fecha: c.fechaVencimiento || null, d: dias(c.fechaVencimiento), estado: c.estadoCliente,
      obl: obligacionServicio(c.servicio, c.categoria)
    });
    continue;
  }
  for (const s of suyos) {
    obligaciones.push({
      ambito: 'servicio', cliente: s.clienteNombre || c.nombre, clienteId: c.id,
      servicio: s.servicio, fecha: s.fechaVencimiento || null, d: dias(s.fechaVencimiento),
      estado: s.estado || 'ACTIVO', obl: obligacionServicio(s.servicio, s.categoria)
    });
  }
}

const renovables = obligaciones.filter(o => o.obl.renovable);
const renovacionesProx = renovables.filter(o => o.d !== null && o.d >= 0 && o.d <= 60).length;
const vencidasHoy = renovables.filter(o => o.d !== null && o.d < 0).length;

/* Barras: servicios contratados por tipo (KZ-OPS-001).
   Antes se contaban CLIENTES por el campo único `servicio` del cliente, de modo
   que un cliente con tres servicios aparecía una sola vez. */
const conteo = {};
CFG.servicios.forEach(s => conteo[s.etiqueta] = 0);
serviciosVisibles.forEach(s => { if (conteo[s.servicio] !== undefined) conteo[s.servicio]++; });
/* Clientes sin servicios registrados: se cuentan por su servicio declarado,
   marcados aparte para que el total cuadre con la realidad. */
let sinServicios = 0;
visibles.forEach(c => { if (!(porCliente.get(c.id) || []).length) sinServicios++; });
const maximo = Math.max(1, ...Object.values(conteo));
const barras = CFG.servicios.map(s => {
  const n = conteo[s.etiqueta] || 0;
  return `<div class="barra__head"><span>${esc(s.etiqueta)}</span><span>${n}</span></div>
    <div class="barra__track"><div class="barra__fill" style="width:${Math.round(n / maximo * 100)}%"></div></div>`;
}).join('');

/* Próximas obligaciones a 60 días */
const proximos = renovables
  .filter(o => o.d !== null && o.d >= 0 && o.d <= 60)
  .sort((a, b) => a.d - b.d)
  .slice(0, 10);

const listaVenc = proximos.length
  ? proximos.map(o => `<div class="barra__head">
      <span>${esc(o.cliente)} <span class="celda-suave">· ${esc(o.servicio)} · ${esc(o.obl.etiqueta)}</span></span>
      <span class="badge ${o.d <= 5 ? 'badge--pendiente' : 'badge--por_vencer'}">${o.d === 0 ? 'Hoy' : 'en ' + o.d + ' d'}</span>
    </div>`).join('')
  : '<p class="celda-suave">No hay obligaciones renovables en los próximos 60 días.</p>';

cont.innerHTML = `
  ${kpisHTML([
    { label: 'Clientes activos', valor: activos, tono: 'ok', nota: 'Con servicio vigente' },
    { label: 'Por vencer', valor: porVencer, tono: 'alerta', nota: `≤ ${NEG.diasPorVencer} días` },
    { label: 'Pendientes de pago', valor: pendPago, tono: 'peligro', nota: 'Vencidos, por cobrar' },
    { label: 'Inactivos', valor: inactivos, tono: 'neutro', nota: 'Servicio desactivado' },
    { label: 'Suspendidos', valor: suspendidos, tono: 'alerta', nota: 'Pausa temporal' },
    { label: 'Inhabilitados', valor: inhabilitados, tono: 'peligro', nota: 'Bloqueados' },
    { label: 'Servicios contratados', valor: serviciosVisibles.length, tono: 'info', nota: 'Instancias por cliente' },
    { label: 'Ingresos confirmados (mes)', valor: cop(ingresosMes), tono: 'info', nota: 'Cobros CONFIRMADOS' },
    { label: 'Pagos pendientes (monto)', valor: cop(pendientesMonto), tono: 'peligro', nota: 'Registrados sin confirmar' },
    { label: 'Renovaciones próximas', valor: renovacionesProx, tono: 'alerta', nota: 'Obligaciones ≤ 60 días' },
    { label: 'Obligaciones vencidas', valor: vencidasHoy, tono: 'peligro', nota: 'Requieren contacto' },
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
      <h3><i class="fas fa-layer-group" aria-hidden="true"></i> Servicios contratados por tipo</h3>
      <div class="barras">${barras}</div>
      ${sinServicios ? `<p class="celda-suave" style="margin-top:.5rem">${sinServicios} cliente(s) sin servicio registrado: sus renovaciones no se pueden calcular por servicio.</p>` : ''}
    </div>
    <div class="card">
      <h3><i class="fas fa-clock" aria-hidden="true"></i> Próximas obligaciones (60 días)</h3>
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
