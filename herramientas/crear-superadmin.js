/* Crea el primer SUPERADMIN usando la cuenta de servicio (Admin SDK).
   Usuario: konfiozinc@gmail.com
   - Crea el usuario en Firebase Auth (la contraseña se pasa por argumento,
     NUNCA hardcodeada).
   - Crea el documento usuarios/{uid} con rol SUPERADMIN y activo:true.
   Idempotente: si ya existe, solo reasegura el documento de Firestore. */
'use strict';
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

(async () => {
  let uid;
  try {
    const u = await admin.auth().getUserByEmail(EMAIL);
    uid = u.uid;
    console.log('✔ Usuario Auth ya existía:', EMAIL);
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/configuration-not-found') {
      const creado = await admin.auth().createUser({ email: EMAIL, password: PASSWORD, displayName: NOMBRE });
      uid = creado.uid;
      console.log('✔ Usuario Auth creado:', EMAIL);
    } else throw e;
  }

  await admin.firestore().doc(`usuarios/${uid}`).set({
    uid, nombre: NOMBRE, email: EMAIL, rol: ROL, activo: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✔ Documento usuarios/' + uid + ' con rol SUPERADMIN y activo:true');

  /* Siembra datos iniciales por si seedInicial del panel aún no se ejecutó */
  const planes = [
  { nombre: 'Tarjeta Star',  precio: 49900,  servicio: 'tarjetas', categoria: 'STAR',  duracionMeses: 12, orden: 1 },
  { nombre: 'Tarjeta Pro',   precio: 99900,  servicio: 'tarjetas', categoria: 'PRO',   duracionMeses: 12, orden: 2 },
  { nombre: 'Tarjeta Elite', precio: 149900, servicio: 'tarjetas', categoria: 'ELITE', duracionMeses: 12, orden: 3 },
  { nombre: 'Agente IA Esencial', precio: 250000, servicio: 'agentes', categoria: null, duracionMeses: 12, orden: 4 },
  { nombre: 'Agente IA Negocio',  precio: 420000, servicio: 'agentes', categoria: null, duracionMeses: 12, orden: 5 },
  { nombre: 'Agente IA Premium',  precio: 650000, servicio: 'agentes', categoria: null, duracionMeses: 12, orden: 6 }
];
  for (const p of planes) {
    const exist = await admin.firestore().collection('planes').where('nombre', '==', p.nombre).limit(1).get();
    if (exist.empty) await admin.firestore().collection('planes').add(p);
  }
  console.log('✔ Planes KZ sembrados (idempotente)');

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
  console.log('Email      : ' + EMAIL);
  console.log('Contraseña : ' + PASSWORD + '  (cámbiala en el primer acceso)');
  console.log('Rol        : ' + ROL);
  console.log('Panel      : https://konfiozinc.github.io/card/admin/');
})();
