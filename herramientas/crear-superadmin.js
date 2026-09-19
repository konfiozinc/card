/* Crea el primer SUPERADMIN usando la cuenta de servicio (Admin SDK).
   Usuario: konfiozinc@gmail.com
   - Crea el usuario en Firebase Auth (con contraseña temporal).
   - Crea el documento usuarios/{uid} con rol SUPERADMIN y activo:true.
   Idempotente: si ya existe, solo reasegura el documento de Firestore. */
'use strict';
const admin = require('firebase-admin');
const sa = require('../serviceAccount.json');

admin.initializeApp({ credential: admin.credential.cert(sa) });

const EMAIL = process.argv[2] || 'konfiozinc@gmail.com';
const PASSWORD = process.argv[3] || 'Kz2026!Temporal';
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
    { nombre: 'KZ Inicio', precio: 59900, servicio: 'tarjetas', categoria: 'STAR', duracionMeses: 12, orden: 1, estado: 'ACTIVO', incluye: ['Tarjeta Star', 'Código QR'] },
    { nombre: 'KZ Negocio', precio: 179900, servicio: 'tarjetas', categoria: 'PRO', duracionMeses: 12, orden: 2, estado: 'ACTIVO', incluye: ['Tarjeta Pro', 'Catálogo o menú'] },
    { nombre: 'KZ Profesional', precio: 279900, servicio: 'tarjetas', categoria: 'ELITE', duracionMeses: 12, orden: 3, estado: 'ACTIVO', incluye: ['Tarjeta Elite', 'Mini landing'] },
    { nombre: 'KZ Premium', precio: 479900, servicio: 'agentes', categoria: null, duracionMeses: 12, orden: 4, estado: 'ACTIVO', incluye: ['Todo Profesional', 'Agente IA'] }
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
