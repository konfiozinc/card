#!/usr/bin/env node
/* KONFÍO ZINC · herramientas/estilos-logo-oficial.js
   Añade a kz-neon.css (la capa de identidad que cargan todas las páginas)
   el tamaño del logotipo oficial en cabecera, móvil y pie.
   Es idempotente: si el bloque ya existe, no lo duplica. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const HOJA = path.join(RAIZ, 'assets/css/kz-neon.css');
const MARCA = '/* ═══ LOGOTIPO OFICIAL (KZ-ID-001) ═══ */';

const bloque = `

${MARCA}
/* El logotipo es la imagen oficial del propietario, con el fondo ya separado.
   Se dimensiona por ALTO para no deformarlo nunca: el ancho lo pone la
   proporcion real del archivo (1332 x 574). */
.brand__logo,
.nav-logo-img {
  display: block;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  border-radius: 0;
}

.brand__logo {
  height: 46px;
}

.nav-logo-img {
  height: 44px;
}

/* El pie usa la marca cuadrada. */
.footer-logo {
  height: 52px;
  width: auto;
  object-fit: contain;
  border-radius: 0;
}

@media (max-width: 900px) {
  .brand__logo { height: 36px; }
  .nav-logo-img { height: 34px; }
  .footer-logo { height: 46px; }
}

/* Cabeceras estrechas: el logotipo baja un paso antes de que el menú apriete. */
@media (max-width: 380px) {
  .brand__logo { height: 32px; }
  .nav-logo-img { height: 30px; }
}
`;

let t = fs.readFileSync(HOJA, 'utf8');
if (t.includes(MARCA)) {
  console.log('  el bloque ya existe en kz-neon.css: no se duplica');
} else {
  fs.writeFileSync(HOJA, t.replace(/\s*$/, '') + bloque + '\n', 'utf8');
  console.log('  bloque añadido a assets/css/kz-neon.css (' + bloque.length + ' caracteres)');
}

const final = fs.readFileSync(HOJA, 'utf8');
console.log('  contiene .brand__logo : ' + /\.brand__logo\s*\{/.test(final));
console.log('  contiene .nav-logo-img: ' + /\.nav-logo-img\s*\{/.test(final));
console.log('  BOM: ' + (fs.readFileSync(HOJA)[0] === 0xef ? 'SI' : 'no') + ' · mojibake: ' + (final.includes('\uFFFD') ? 'SI' : 'no'));
