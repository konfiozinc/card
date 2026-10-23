/* Crea el primer SUPERADMIN usando la cuenta de servicio (Admin SDK).
   Usuario: konfiozinc@gmail.com
   - Crea el usuario en Firebase Auth (la contraseña se pasa por argumento,
     NUNCA hardcodeada).
   - Crea el documento usuarios/{uid} con rol SUPERADMIN y activo:true.
   Idempotente: si ya existe, solo reasegura el documento de Firestore. */
'use strict';
async function main() {
  const admin = require('firebase-admin');
  const sa = require('../serviceAccount.json');

  admin.initializeApp({ credential: admin.credential.cert(sa) });

  const EMAIL = process.argv[2] || 'konfiozinc@gmail.com';
  const PASSWORD = process.argv[3] || process.env.ADMIN_PASSWORD;
  if (!PASSWORD) {
    console.error('Falta la contraseña. Uso: node crear-superadmin.js [email] <contraseña>');
    console.error('Alternativa: variable de entorno ADMIN_PASSWORD.');
    process.exit(1);
  }
  const NOMBRE = 'Darwin Montalvo';
  const ROL = 'SUPERADMIN';

  let uid;
  try {
    const u = await admin.auth().getUserByEmail(EMAIL);
    uid = u.uid;
    console.log('✔ Usuario Auth ya existía');
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/configuration-not-found') {
      const creado = await admin.auth().createUser({ email: EMAIL, password: PASSWORD, displayName: NOMBRE });
      uid = creado.uid;
      console.log('✔ Usuario Auth creado');
    } else throw e;
  }

  await admin.firestore().doc(`usuarios/${uid}`).set({
    uid, nombre: NOMBRE, email: EMAIL, rol: ROL, activo: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✔ Documento de usuario con rol SUPERADMIN y activo:true');

  /* Siembra datos iniciales por si seedInicial del panel aún no se ejecutó */
  const planes = [
    /* IDs fijos: la siembra es idempotente y NUNCA duplica documentos.
       Oferta vigente (17-oct-2026): Mini Web Básica ($49.900) y Mini Web Pro ($99.900).
       Star y Elite quedaron retirados; los registros históricos que los referencien se
       conservan (este seed no borra nada, solo crea/actualiza por id).
       duracionMeses 12 = vigencia del dominio incluido el primer año (lo que muestra admin/planes.js). */
    { id: 'mini-web-basica', nombre: 'Mini Web Básica', precio: 49900, servicio: 'tarjetas', categoria: 'MINI WEB BÁSICA', duracionMeses: 12, orden: 1, estado: 'ACTIVO' },
    { id: 'mini-web-pro',    nombre: 'Mini Web Pro',    precio: 99900, servicio: 'tarjetas', categoria: 'MINI WEB PRO',    duracionMeses: 12, orden: 2, estado: 'ACTIVO' },
    /* [PENDIENTE] La vigencia de los tres niveles del Agente IA NO esta definida en la base
       de conocimiento canonica. No ejecutar contra produccion hasta que Darwin la confirme. */
    { id: 'agente-esencial', nombre: 'Agente IA Esencial', precio: 250000, servicio: 'agentes', categoria: null, duracionMeses: null, orden: 3, estado: 'ACTIVO' },
    { id: 'agente-negocio',  nombre: 'Agente IA Negocio',  precio: 420000, servicio: 'agentes', categoria: null, duracionMeses: null, orden: 4, estado: 'ACTIVO' },
    { id: 'agente-premium',  nombre: 'Agente IA Premium',  precio: 650000, servicio: 'agentes', categoria: null, duracionMeses: null, orden: 5, estado: 'ACTIVO' }
  ];
  for (const p of planes) {
    const { id, ...datos } = p;
    await admin.firestore().doc('planes/' + id).set(datos, { merge: true });
  }
  console.log('\u2714 Planes oficiales sembrados con IDs fijos (Mini Web Básica / Pro + 3 niveles de Agente IA)');

  const config = {
    diasAntes: [10, 5, 3, 1], diasPorVencer: 15, diasGracia: 5,
    mesesSuscripcion: 12, destinoVencido: 'contacto.html'
  };
  for (const [k, v] of Object.entries(config)) {
    const ex = await admin.firestore().doc(`configuracion/${k}`).get();
    if (!ex.exists) await admin.firestore().doc(`configuracion/${k}`).set({ clave: k, valor: v });
  }
  console.log('✔ Configuración de vencimientos sembrada');

  console.log('\n=== RESUMEN ===');
  console.log('Rol        : ' + ROL);
  console.log('Panel      : https://konfiozinc.github.io/card/admin/');
}

// No volcar errores del SDK: pueden contener parámetros de autenticación.
if (require.main === module) {
  main().then(() => process.exit(0)).catch(() => {
    console.error('✖ No se pudo completar la creación del administrador. Revisar configuración y permisos.');
    process.exit(1);
  });
}
