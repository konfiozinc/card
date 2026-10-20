<#
═══════════════════════════════════════════════════════════════════
 demo-staging.ps1 · KONFÍO ZINC — CARD
 Levanta el CRM en tu propia pantalla, con emuladores locales y datos
 ficticios, para que puedas probarlo sin tocar producción.

 QUÉ HACE
   1. Comprueba que existe la copia aislada del sitio (la que tiene los SDK
      locales y sin nada que apunte a producción).
   2. Arranca los emuladores de Auth, Firestore y Hosting en 127.0.0.1.
   3. Carga datos ficticios (usuarios, clientes, pagos, planes, contactos,
      notificaciones) para que el panel no esté vacío.
   4. Imprime la URL y las credenciales.

 CÓMO SE USA
   powershell -ExecutionPolicy Bypass -File herramientas\demo-staging.ps1
   (Ctrl+C para parar los emuladores)

 CREDENCIALES FICTICIAS (todas con la misma contraseña: Ficticia#1)
   superadmin@demo.test   SUPERADMIN  (todo)
   admin@demo.test        ADMIN       (planes, notificaciones, pagos)
   operador@demo.test     OPERADOR    (clientes y pagos, sin confirmar)

 NADA DE ESTO TOCA PRODUCCIÓN: el proyecto es `demo-card-seguridad`, el
 prefijo `demo-` impide resolver contra un proyecto real, y todo escucha
 solo en 127.0.0.1.
═══════════════════════════════════════════════════════════════════#>

param(
  [switch]$SinEmuladores,
  [string]$Staging = (Join-Path $env:TEMP 'kz-card-staging-p1')
)

$ErrorActionPreference = 'Stop'
$proyecto = 'demo-card-seguridad'
$puerto   = 5000

function Escribir($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

Escribir "`n═══ DEMO LOCAL DEL CRM — KONFÍO ZINC ═══`n" 'Cyan'

# ── 1. Comprobaciones previas ──────────────────────────────────────
if (-not (Test-Path $Staging)) {
  Escribir "No existe la copia aislada en: $Staging" 'Red'
  Escribir "Esa carpeta es la que tiene los SDK locales y el cortafuegos de staging." 'Yellow'
  Escribir "Se construye con el script de aislamiento del proyecto (constrir-staging + ajustes)." 'Yellow'
  exit 1
}
if (-not (Test-Path (Join-Path $Staging 'sitio'))) {
  Escribir "La copia existe pero no tiene la carpeta sitio\." 'Red'
  exit 1
}
$config = Join-Path $Staging 'firebase-emulador-funciones.json'
if (-not (Test-Path $config)) {
  Escribir "Falta $config (configuración de emuladores)." 'Red'
  exit 1
}
Escribir "✓ copia aislada encontrada" 'Green'

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  Escribir "No está el CLI de Firebase (firebase) en el PATH." 'Red'
  exit 1
}
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
if (Test-Path $env:JAVA_HOME) {
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
  Escribir "✓ Java del JBR de Android Studio disponible para el emulador" 'Green'
}

# ── 2. Emuladores ─────────────────────────────────────────────────
if (-not $SinEmuladores) {
  Escribir "`nArrancando emuladores (Auth 9099 · Firestore 8080 · Hosting $puerto)…" 'Cyan'
  Start-Process -FilePath 'firebase' `
    -ArgumentList "emulators:start", "--config", "firebase-emulador-funciones.json", "--only", "auth,firestore,hosting", "--project", $proyecto `
    -WorkingDirectory $Staging -WindowStyle Minimized
  # esperar a que el hosting responda
  $listo = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$puerto/admin/index.html" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $listo = $true; break }
    } catch { }
  }
  if (-not $listo) {
    Escribir "Los emuladores no respondieron en 80 s. Revisa la ventana minimizada de firebase." 'Red'
    exit 1
  }
  Escribir "✓ emuladores en marcha" 'Green'
}

# ── 3. Datos ficticios ────────────────────────────────────────────
Escribir "`nCargando datos ficticios…" 'Cyan'
$semilla = Join-Path $env:TEMP 'kz-demo-semilla.js'
$js = @'
const AUTH='http://127.0.0.1:9099', FS='http://127.0.0.1:8080', P='demo-card-seguridad', K='clave-ficticia';
const s=v=>({stringValue:v}), n=v=>({integerValue:String(v)}), b=v=>({booleanValue:v}), ts=v=>({timestampValue:v});
const u = r => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
async function pedir(metodo, url, cuerpo, token){
  const h={}; if (cuerpo!==undefined) h['Content-Type']='application/json'; if (token) h.Authorization='Bearer '+token;
  const r=await fetch(url,{method:metodo,headers:h,body:cuerpo===undefined?undefined:JSON.stringify(cuerpo)});
  let j=null; try{j=JSON.parse(await r.text())}catch(e){j={}}; return {st:r.status,j};
}
async function crear(c, id, campos, token='owner'){
  const r = await pedir('POST', u(c)+'?documentId='+id, {fields:campos}, token);
  if (r.st===409) return pedir('PATCH', u(c+'/'+id), {fields:campos}, token);
  return r;
}
const hoy=new Date();
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const masDias=d=>{const x=new Date(hoy);x.setDate(x.getDate()+d);return iso(x);};
(async()=>{
  const cuentas=[
    ['superadmin@demo.test','SUPERADMIN','Darwin (demo)'],
    ['admin@demo.test','ADMIN','Administradora Demo'],
    ['operador@demo.test','OPERADOR','Operador Demo'],
  ];
  for (const [email, rol, nombre] of cuentas) {
    let a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, {email, password:'Ficticia#1', returnSecureToken:true});
    if (a.st!==200) a = await pedir('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, {email, password:'Ficticia#1', returnSecureToken:true});
    await crear('usuarios', a.j.localId, { email:s(email), nombre:s(nombre), rol:s(rol), activo:b(true) });
  }
  const clientes=[
    ['demo-1','Panadería La Espiga','María Ficticia','Tarjetas Digitales','PRO',99900,'ACTIVO',45],
    ['demo-2','Restaurante El Fogón','Carlos Ficticio','Menús Digitales',null,150000,'POR_VENCER',9],
    ['demo-3','Boutique Aurora','Laura Ficticia','Catálogos Digitales',null,120000,'PENDIENTE_PAGO',-6],
    ['demo-4','Taller Los Pinos','Andrés Ficticio','Códigos QR',null,50000,'SUSPENDIDO',30],
    ['demo-5','Consultora Norte','Sofía Ficticia','Landing Pages',null,699000,'ACTIVO',180],
    ['demo-6','Clínica Bienestar','Julián Ficticio','Agentes IA',null,250000,'INACTIVO',20],
  ];
  for (const [id, empresa, nombre, servicio, categoria, precio, estado, dv] of clientes) {
    await crear('clientes', id, {
      nombre:s(nombre), empresa:s(empresa), telefono:s('3001234'+id.slice(-3)), email:s(id+'@demo.test'),
      ciudad:s('Medellín'), servicio:s(servicio), categoria: categoria?s(categoria):{nullValue:null},
      precio:n(precio), metodoPagoPreferido:s('Nequi'), fechaActivacion:s(masDias(-200)),
      fechaVencimiento:s(masDias(dv)), estadoCliente:s(estado), estadoServicio:s(estado),
      estado:s(estado), activo:b(estado!=='INACTIVO'), eliminado:b(false),
      observaciones:s('Cliente de demostración'),
    });
  }
  await crear('pagos','demo-pago-1',{clienteId:s('demo-1'),clienteNombre:s('María Ficticia'),monto:n(99900),metodoPago:s('Nequi'),fechaPago:s(iso(hoy)),referencia:s('DEMO-001'),estado:s('PENDIENTE'),registradoPor:s('demo'),registradoPorNombre:s('Operador Demo'),createdAt:ts(hoy.toISOString())});
  await crear('pagos','demo-pago-2',{clienteId:s('demo-2'),clienteNombre:s('Carlos Ficticio'),monto:n(150000),metodoPago:s('Transferencia'),fechaPago:s(masDias(-12)),referencia:s('DEMO-002'),estado:s('CONFIRMADO'),registradoPor:s('demo'),registradoPorNombre:s('Administradora Demo'),createdAt:ts(hoy.toISOString())});
  await crear('pagos','demo-pago-3',{clienteId:s('demo-3'),clienteNombre:s('Laura Ficticia'),monto:n(120000),metodoPago:s('Daviplata'),fechaPago:s(masDias(-40)),referencia:s('DEMO-003'),estado:s('ANULADO'),registradoPor:s('demo'),registradoPorNombre:s('Operador Demo'),createdAt:ts(hoy.toISOString())});
  for (const [i, p] of [['1','Básica',49900],['2','Pro',99900],['3','Premium apps',149900]].entries()) {
    await crear('planes','demo-plan-'+p[0],{orden:n(i+1),nombre:s(p[1]),servicio:s('tarjetas'),precio:n(p[2]),duracionMeses:n(12),estado:s('ACTIVO')});
  }
  await crear('configuracion','diasPorVencer',{clave:s('diasPorVencer'),valor:n(15),descripcion:s('Días antes del vencimiento para marcar POR_VENCER')});
  await crear('configuracion','mesesSuscripcion',{clave:s('mesesSuscripcion'),valor:n(12),descripcion:s('Duración de la suscripción en meses')});
  for (let i=1;i<=3;i++) {
    await crear('contactos','demo-con-'+i,{nombre:s('Visitante Demo '+i),email:s('visitante'+i+'@demo.test'),telefono:s('300000000'+i),servicio:s('Tarjetas Digitales'),mensaje:s('Consulta ficticia número '+i),origen:s('contacto'),estado:s(i===1?'NUEVO':'ATENDIDO'),createdAt:ts(hoy.toISOString())});
    await crear('notificaciones','demo-noti-'+i,{clienteId:s('demo-'+i),tipo:s('VENCIMIENTO'),canal:s('PUSH'),mensaje:s('Aviso ficticio de vencimiento '+i),estado:s('ENVIADA'),fechaEnvio:ts(hoy.toISOString())});
  }
  await crear('historial_estados','demo-hist-1',{clienteId:s('demo-2'),estadoAnterior:s('PENDIENTE_PAGO'),estadoNuevo:s('ACTIVO'),motivo:s('Pago confirmado (demo)'),usuarioId:s('demo'),usuarioNombre:s('Administradora Demo'),fecha:ts(hoy.toISOString())});
  console.log('  ✓ 3 usuarios · 6 clientes · 3 pagos · 3 planes · 2 ajustes · 3 contactos · 3 avisos · 1 historial');
})();
'@
$js | Set-Content -Path $semilla -Encoding UTF8
& node $semilla
Remove-Item $semilla -Force -ErrorAction SilentlyContinue

# ── 4. Instrucciones ──────────────────────────────────────────────
Escribir "`n════════════════════════════════════════════════════════" 'Cyan'
Escribir "  LISTO. Abre esta dirección en tu navegador:" 'White'
Escribir ""
Escribir "     http://127.0.0.1:$puerto/admin/index.html" 'Green'
Escribir ""
Escribir "  Contraseña para las tres cuentas:  Ficticia#1" 'White'
Escribir "     superadmin@demo.test   → todo el panel" 'Gray'
Escribir "     admin@demo.test        → planes, avisos, pagos" 'Gray'
Escribir "     operador@demo.test     → clientes y pagos (no confirma)" 'Gray'
Escribir ""
Escribir "  Para parar: cierra la ventana minimizada de firebase," 'Yellow'
Escribir "  o mata el proceso con:  Get-Process firebase | Stop-Process" 'Yellow'
Escribir "════════════════════════════════════════════════════════" 'Cyan'
