/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · functions/src/motor.js
   Interruptor del motor de vencimientos. FALLA CERRADO.

   El motor procesa vencimientos, envía notificaciones y suspende servicios.
   Para que corra tienen que cumplirse DOS condiciones independientes:

     1. La variable de entorno KZ_MOTOR_VENCIMIENTOS vale exactamente
        «HABILITADO». Se define al desplegar (functions/.env.konfio-zinc) y
        no viaja en el código.
     2. El documento configuracion/motorVencimientos existe con
        habilitado === true (booleano estricto).

   Si falta una, si valen cualquier otra cosa, o si no se pueden leer, el
   motor NO corre: ninguna de las dos se activa por omisión, y la de Firestore
   no se puede abrir desde el navegador (firestore.rules lo impide), así que
   abrirla exige el Admin SDK de una persona con credenciales.

   La lógica de negocio (./vencimientos) NO se toca: la puerta se evalúa en los
   puntos de entrada —el programador y la llamada manual— para que el motor siga
   siendo comprobable de forma aislada.
   ═══════════════════════════════════════════════════════════════════ */

const RUTA_CONFIG = 'configuracion/motorVencimientos';
const VARIABLE_ENTORNO = 'KZ_MOTOR_VENCIMIENTOS';
const VALOR_UNICO = 'HABILITADO';

/* Devuelve el texto de la variable, nunca el valor crudo del proceso. */
function leerVariable(env) {
  const bruto = env ? env[VARIABLE_ENTORNO] : undefined;
  return typeof bruto === 'string' ? bruto.trim() : '';
}

/* Lee la configuración sin lanzar: cualquier error se convierte en «cerrado». */
async function leerConfiguracion(db) {
  const base = {
    ruta: RUTA_CONFIG, existe: false, habilitado: false,
    actualizadoPor: null, actualizadoEn: null, error: null
  };
  try {
    const snap = await db.doc(RUTA_CONFIG).get();
    if (!snap || !snap.exists) return base;
    const d = snap.data() || {};
    return {
      ...base,
      existe: true,
      habilitado: d.habilitado === true,
      actualizadoPor: typeof d.actualizadoPor === 'string' ? d.actualizadoPor : null,
      actualizadoEn: d.actualizadoEn || null
    };
  } catch (e) {
    return { ...base, error: (e && e.message) || 'error desconocido al leer la configuración' };
  }
}

/* Estado completo del interruptor. Se usa tanto para decidir como para
   informar (callable estadoMotor), de modo que lo que se informa es
   exactamente lo que se evalúa. */
async function estadoDelMotor({ db, env }) {
  if (!db) {
    return {
      habilitado: false,
      motivo: 'no hay conexión a Firestore, así que no se puede comprobar la configuración',
      entorno: { variable: VARIABLE_ENTORNO, presente: false, esperada: VALOR_UNICO, correcta: false },
      configuracion: { ruta: RUTA_CONFIG, existe: false, habilitado: false, actualizadoPor: null, error: 'sin db' }
    };
  }

  const variable = leerVariable(env);
  const correcta = variable === VALOR_UNICO;
  const cfg = await leerConfiguracion(db);

  const motivos = [];
  if (!correcta) {
    motivos.push(variable === ''
      ? `falta la variable de entorno ${VARIABLE_ENTORNO}`
      : `la variable ${VARIABLE_ENTORNO} no vale «${VALOR_UNICO}»`);
  }
  if (cfg.error) motivos.push(`no se pudo leer ${RUTA_CONFIG}: ${cfg.error}`);
  else if (!cfg.existe) motivos.push(`no existe el documento ${RUTA_CONFIG}`);
  else if (!cfg.habilitado) motivos.push(`${RUTA_CONFIG} no tiene habilitado = true`);

  const habilitado = correcta && cfg.existe && cfg.habilitado && !cfg.error;

  return {
    habilitado,
    motivo: habilitado ? 'habilitado' : motivos.join(' · '),
    entorno: {
      variable: VARIABLE_ENTORNO,
      presente: variable !== '',
      esperada: VALOR_UNICO,
      correcta
    },
    configuracion: cfg
  };
}

/* Atajo booleano: cualquier duda devuelve false. */
async function permiteEjecutar({ db, env }) {
  const estado = await estadoDelMotor({ db, env });
  return { si: estado.habilitado, estado };
}

module.exports = {
  RUTA_CONFIG,
  VARIABLE_ENTORNO,
  VALOR_UNICO,
  estadoDelMotor,
  permiteEjecutar
};
