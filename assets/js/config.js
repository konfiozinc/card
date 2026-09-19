/* ═══════════════════════════════════════════════════════════════════
   KONFÍO ZINC · assets/js/config.js
   Configuración global del proyecto (script clásico, NO módulo ES).

   Se carga ANTES de cualquier módulo del panel y expone `window.KZ_CONFIG`.
   Aquí vive todo lo que cambia de vez en cuando: la marca, el catálogo de
   servicios y precios, los métodos de pago y la configuración de Firebase.
   Si cambia un precio, se cambia AQUÍ y no en veinte archivos.

   Lo consumen: assets/js/admin/core.js, assets/js/admin/shell.js y las
   páginas de /admin/. El sitio público no depende de este archivo.
   ═══════════════════════════════════════════════════════════════════ */

window.KZ_CONFIG = {

  /* ── Identidad de la marca (fuente: MARCA_Y_NOMBRES.md) ─────────── */
  marca: {
    nombre: 'KONFÍO ZINC',
    corto: 'KZ',
    tagline: 'Soluciones digitales para negocios',
    email: 'konfiozinc@gmail.com',
    whatsapp: '+573206411340',
    whatsappTexto: '+57 320 641 1340',
    sitio: 'https://konfiozinc.github.io/card/',
    panel: 'https://konfiozinc.github.io/card/admin/',
    fundador: 'Darwin Montalvo',
    ciudad: 'Colombia · atención 100 % online',
    redes: {
      instagram: 'https://www.instagram.com/konfio_zinc',
      tiktok: 'https://www.tiktok.com/@tarjetaszinc',
      facebook: 'https://www.facebook.com/share/1DRqH4Vvrt/'
    }
  },

  /* ── Los 6 servicios reales (precios públicos, COP) ─────────────── */
  servicios: [
    { slug: 'tarjetas',  etiqueta: 'Tarjetas Digitales',  icono: 'fa-id-card',        precioDesde: 49900,  url: 'servicios/tarjetas-digitales.html',  tieneCategorias: true },
    { slug: 'catalogos', etiqueta: 'Catálogos Digitales', icono: 'fa-book-open',      precioDesde: 120000, url: 'servicios/catalogos-digitales.html', tieneCategorias: false },
    { slug: 'menus',     etiqueta: 'Menús Digitales',     icono: 'fa-utensils',       precioDesde: 150000, url: 'servicios/menus-digitales.html',     tieneCategorias: false },
    { slug: 'landing',   etiqueta: 'Landing Pages',       icono: 'fa-window-maximize',precioDesde: 350000, url: 'servicios/landing-pages.html',       tieneCategorias: false },
    { slug: 'qr',        etiqueta: 'Códigos QR',          icono: 'fa-qrcode',         precioDesde: 50000,  url: 'servicios/codigos-qr.html',          tieneCategorias: false },
    { slug: 'agentes',   etiqueta: 'Agentes IA',          icono: 'fa-robot',          precioDesde: 250000, url: 'servicios/agentes-ia.html',          tieneCategorias: false }
  ],

  /* ── Planes de tarjeta (solo aplican a Tarjetas Digitales) ──────── */
  categoriasTarjeta: [
    { codigo: 'STAR',  etiqueta: 'Star',  precio: 49900,  para: 'Profesionales: presentación, contacto, redes y QR' },
    { codigo: 'PRO',   etiqueta: 'Pro',   precio: 99900,  para: 'Negocios con catálogo o menú, galería y varios botones' },
    { codigo: 'ELITE', etiqueta: 'Elite', precio: 149900, para: 'Marcas con agenda, formularios, varias sedes y agente IA' }
  ],

  /* ── Paquetes todo en uno (catálogo de `planes`) ────────────────── */
  paquetes: [
    { nombre: 'KZ Inicio',      precio: 59900,  servicio: 'tarjetas',  duracionMeses: 12, incluye: ['Tarjeta digital Star', 'Código QR con tu marca', 'Contacto, WhatsApp y redes', 'Ubicación con mapa'] },
    { nombre: 'KZ Negocio',     precio: 179900, servicio: 'tarjetas',  duracionMeses: 12, incluye: ['Tarjeta digital Pro', 'Catálogo o menú digital', 'Código QR con tu marca', 'Galería y botón de pedido'] },
    { nombre: 'KZ Profesional', precio: 279900, servicio: 'tarjetas',  duracionMeses: 12, incluye: ['Tarjeta digital Elite', 'Mini landing page', 'Catálogo o menú digital', 'Agenda de citas'] },
    { nombre: 'KZ Premium',     precio: 479900, servicio: 'agentes',   duracionMeses: 12, incluye: ['Todo lo del paquete Profesional', 'Agente IA 24/7 (1 año)', 'Entrenado con tu información'] }
  ],

  /* ── Catálogos de apoyo ─────────────────────────────────────────── */
  metodosPago: ['Nequi', 'Daviplata', 'Transferencia', 'Efectivo'],

  estadosCliente: ['ACTIVO', 'POR_VENCER', 'PENDIENTE_PAGO', 'SUSPENDIDO', 'INACTIVO'],
  estadosServicio: ['ACTIVO', 'POR_VENCER', 'SUSPENDIDO', 'INACTIVO'],
  estadosPago: ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'ANULADO'],

  /* Etiquetas legibles de los estados (para badges de la interfaz) */
  etiquetasEstado: {
    ACTIVO: 'Activo',
    POR_VENCER: 'Por vencer',
    PENDIENTE_PAGO: 'Pendiente de pago',
    SUSPENDIDO: 'Suspendido',
    INACTIVO: 'Inactivo',
    CONFIRMADO: 'Confirmado',
    PENDIENTE: 'Pendiente',
    RECHAZADO: 'Rechazado',
    ANULADO: 'Anulado',
    ENVIADA: 'Enviada',
    ERROR: 'Error',
    CANCELADA: 'Cancelada'
  },

  /* ── Reglas de negocio ──────────────────────────────────────────── */
  negocio: {
    mesesSuscripcion: 12,           // duración por defecto de la suscripción
    diasAntes: [10, 5, 3, 1],       // avisos antes del vencimiento
    diasPorVencer: 15,              // umbral para marcar POR_VENCER
    diasGracia: 5,                  // días tras vencer antes de suspender
    moneda: 'COP'
  },

  /* ── Roles del panel ────────────────────────────────────────────── */
  roles: {
    niveles: { OPERADOR: 1, ADMIN: 2, SUPERADMIN: 3 },
    descripcion: {
      OPERADOR: 'Ve el panel, crea clientes y registra pagos (sin confirmarlos)',
      ADMIN: 'Además confirma pagos, gestiona planes y envía notificaciones',
      SUPERADMIN: 'Además configuración, usuarios y auditoría'
    }
  },

  /* ── Firebase ───────────────────────────────────────────────────────
     `habilitado: false` hasta que se pegue la configuración real.
     El mismo objeto debe quedar en assets/js/firebase-config.js y en
     firebase-messaging-sw.js (ver herramientas/configurar-firebase.js).
     La configuración de una app web de Firebase NO es un secreto: la
     seguridad la dan Authentication y firestore.rules.               */
  firebase: {
    habilitado: false,
    config: {
      apiKey: 'PENDIENTE_API_KEY',
      authDomain: 'PENDIENTE_PROJECT_ID.firebaseapp.com',
      projectId: 'PENDIENTE_PROJECT_ID',
      storageBucket: 'PENDIENTE_PROJECT_ID.firebasestorage.app',
      messagingSenderId: 'PENDIENTE_SENDER_ID',
      appId: 'PENDIENTE_APP_ID'
    },
    vapidKey: 'PENDIENTE_VAPID_KEY',
    region: 'us-central1'
  },

  /* ── Agente IA (Cloudflare Worker) ──────────────────────────────── */
  agentes: {
    workerUrl: 'https://calm-heart-6828.konfiozinc.workers.dev'
  }
};
