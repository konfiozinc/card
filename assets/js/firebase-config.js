/**
 * ═══════════════════════════════════════════════════════════════════
 * firebase-config.js · KONFÍO ZINC
 *
 * Configuración del SDK de Firebase para el panel de administración
 * (admin.html) y el service worker de notificaciones push.
 *
 * ⚠️ PASO PREVIO OBLIGATORIO
 * Reemplaza cada "PENDIENTE" por el valor real de tu proyecto.
 * Lo encuentras en Firebase Console → ⚙️ Configuración del proyecto →
 * "Tus apps" → app web → "Configuración del SDK" → "Config".
 *
 * ¿Es seguro publicar esto en un repositorio público?
 * SÍ, y es normal: la configuración de una app web de Firebase no es un
 * secreto (está diseñada para viajar al navegador). La seguridad real la
 * dan DOS cosas que sí debes configurar:
 *   1. Firebase Authentication (solo usuarios autorizados entran al panel).
 *   2. Las reglas de Firestore (firestore.rules), que exigen `request.auth != null`.
 * Lo que NUNCA debe subirse al repositorio son las claves de servicio
 * (service account) que usa el backend: esas van en las variables de
 * entorno de Cloud Functions, no aquí.
 * ═══════════════════════════════════════════════════════════════════
 */

/* Configuración pública de la app web de Firebase */
export const firebaseConfig = {
  apiKey: 'PENDIENTE_API_KEY',
  authDomain: 'PENDIENTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PENDIENTE_PROJECT_ID',
  storageBucket: 'PENDIENTE_PROJECT_ID.appspot.com',
  messagingSenderId: 'PENDIENTE_SENDER_ID',
  appId: 'PENDIENTE_APP_ID'
};

/* Clave pública VAPID para Web Push (Cloud Messaging → Configuración web →
   "Certificados push web"). Sin ella no se pueden pedir tokens FCM. */
export const vapidKey = 'PENDIENTE_VAPID_KEY';

/* Identificador de la colección principal en Firestore */
export const COLECCION_CLIENTES = 'clientes';
export const SUBCOLECCION_PAGOS = 'pagos';

/* Catálogos usados por el panel (una sola fuente de verdad para los formularios) */
export const SERVICIOS = [
  'Tarjetas Digitales',
  'Catálogos Digitales',
  'Menús Digitales',
  'Landing Pages',
  'Códigos QR',
  'Agentes IA'
];

/* Categorías: solo las Tarjetas Digitales tienen planes */
export const CATEGORIAS_TARJETA = ['Star', 'Pro', 'Elite'];

export const ESTADOS = ['activo', 'por_vencer', 'inactivo'];

export const METODOS_PAGO = ['Nequi', 'Daviplata', 'Transferencia', 'Efectivo'];

/* Días de aviso antes del vencimiento (deben coincidir con functions/index.js
   y con los tipos de notificacion usados en el campo notificacionesEnviadas) */
export const DIAS_AVISO = [10, 5, 3, 1];

/* Precios de referencia por servicio (COP) para autocompletar el formulario */
export const PRECIOS_REFERENCIA = {
  'Tarjetas Digitales': 70000,
  'Catálogos Digitales': 120000,
  'Menús Digitales': 150000,
  'Landing Pages': 350000,
  'Códigos QR': 50000,
  'Agentes IA': 250000
};

/* Duración por defecto de una suscripción, en meses (1 año) */
export const MESES_SUSCRIPCION = 12;

/**
 * Comprueba si la configuración ya fue diligenciada.
 * El panel muestra un aviso claro mientras siga pendiente, en lugar de fallar
 * con un error críptico de Firebase.
 * @returns {boolean}
 */
export function configuracionPendiente() {
  return String(firebaseConfig.apiKey).startsWith('PENDIENTE') ||
         String(firebaseConfig.projectId).startsWith('PENDIENTE');
}
