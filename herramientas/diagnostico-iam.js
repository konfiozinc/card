/* Diagnóstico: lista los roles que tiene la cuenta de servicio en el proyecto. */
'use strict';
const { GoogleAuth } = require('google-auth-library');
const sa = require('C:/Users/PC/Documents/KONFIO_ZINC/0-Agencia y Recursos/Agencia_Konfio_Zinc/serviceAccount.json');

(async () => {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const url = 'https://cloudresourcemanager.googleapis.com/v1/projects/konfio-zinc:getIamPolicy';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log('getIamPolicy:', res.status);
  const data = await res.json();
  if (data.bindings) {
    for (const b of data.bindings) {
      const members = b.members.filter(m => m.includes('fbsvc')).join(', ');
      if (members) console.log('  ' + b.role + '  →  ' + members);
    }
  } else {
    console.log(JSON.stringify(data));
  }
})();
