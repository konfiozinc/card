/* Comprueba si la cuenta de servicio ya puede ver el estado de la API Firestore. */
'use strict';
const { GoogleAuth } = require('google-auth-library');
const sa = require('../serviceAccount.json');

(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const r = await fetch('https://serviceusage.googleapis.com/v1/projects/konfio-zinc/services/firestore.googleapis.com', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('serviceusage firestore:', r.status, (await r.text()).slice(0, 200));
})();
