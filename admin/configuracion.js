/* ── configuracion.js · ajustes clave/valor (SUPERADMIN) ──────────── */
import { requireAuth } from '../assets/js/admin/shell.js';
import { setTitulo, toast, esc } from '../assets/js/admin/ui.js';
import { cargarConfig, escrituras, CFG, NEG } from '../assets/js/admin/datos.js';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../assets/js/admin/core.js';

const sesion = await requireAuth('configuracion');
if (!sesion) throw new Error('Sin acceso');
setTitulo('Configuración');
const cont = document.getElementById('app-content');

const DEFECTOS = {
  diasAntes: { valor: NEG.diasAntes, desc: 'Días de aviso antes del vencimiento (lista separada por comas)' },
  diasPorVencer: { valor: NEG.diasPorVencer, desc: 'Días antes del vencimiento para marcar POR_VENCER' },
  diasGracia: { valor: NEG.diasGracia, desc: 'Días de gracia tras vencer antes de suspender' },
  mesesSuscripcion: { valor: NEG.mesesSuscripcion, desc: 'Duración de la suscripción en meses' },
  destinoVencido: { valor: 'contacto.html', desc: 'Página a la que lleva la notificación de vencido' }
};

const config = await cargarConfig();

cont.innerHTML = `<div class="page-head"><div><h2>Configuración</h2>
  <p class="celda-suave">Ajustes del motor de vencimientos. Solo SUPERADMIN.</p></div></div>
  <div class="card"><form id="cfg-form">
    ${Object.entries(DEFECTOS).map(([k, d]) => {
      const actual = config[k] !== undefined ? config[k] : d.valor;
      const valor = Array.isArray(actual) ? actual.join(',') : actual;
      return `<div class="campo"><label for="cfg-${esc(k)}">${esc(k)}</label>
        <input id="cfg-${esc(k)}" value="${esc(String(valor))}">
        <span class="campo__nota">${esc(d.desc)} · defecto: ${esc(String(Array.isArray(d.valor) ? d.valor.join(',') : d.valor))}</span></div>`;
    }).join('')}
    <div class="aviso aviso--ok" id="cfg-ok" hidden></div>
    <button class="btn btn--primary" type="submit"><i class="fas fa-floppy-disk"></i> Guardar configuración</button>
  </form></div>`;

document.getElementById('cfg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  for (const [k, d] of Object.entries(DEFECTOS)) {
    let v = document.getElementById('cfg-' + k).value.trim();
    /* diasAntes es una lista de números */
    if (k === 'diasAntes') v = v.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));
    else v = isNaN(Number(v)) ? v : Number(v);
    await setDoc(doc(db, 'configuracion', k), { clave: k, valor: v, descripcion: d.desc });
  }
  const ok = document.getElementById('cfg-ok');
  ok.textContent = 'Configuración guardada. El motor la aplicará en su próxima ejecución.';
  ok.hidden = false;
  toast('Configuración guardada');
});
