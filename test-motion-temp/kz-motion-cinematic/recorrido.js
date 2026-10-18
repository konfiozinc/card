'use strict';
// No clips todavía. El motor solo anima pósteres locales y cambia entre escenas.
mountScrollWorld(document.getElementById('world'), {
  nav: true,
  atmosphere: false,
  hint: 'Desplázate dentro del laboratorio',
  diveScroll: 1,
  sections: [
    {id:'presencia',label:'Presencia',still:'assets/presencia.svg',accent:'#F0B429'},
    {id:'productos',label:'Productos',still:'assets/productos.svg',accent:'#F0B429'},
    {id:'conexion',label:'Conexión',still:'assets/conexion.svg',accent:'#00E5FF'}
  ]
});
