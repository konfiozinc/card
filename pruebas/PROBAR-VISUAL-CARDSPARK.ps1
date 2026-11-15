# KZ-UNIFICACION-002 · Prueba visual automatizada del módulo Seguimiento en Card Spark.
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\pruebas\PROBAR-VISUAL-CARDSPARK.ps1
#
# AISLAMIENTO: todo corre contra el proyecto `demo-kz-crm-prospectos`. El navegador
# BLOQUEA cualquier petición a hosts de Firebase productivos y la prueba FALLA si
# detecta una. No se usan cuentas reales ni se escribe en produccion.
#
# Requisitos: Node.js, Java, Playwright con Chromium (ya instalado en herramientas/),
# y acceso a npx para firebase-tools la primera vez.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$demo = 'demo-kz-crm-prospectos'
$evid = Join-Path $raiz '..\..\evidencias\kz-unificacion-002'
New-Item -ItemType Directory -Force -Path $evid | Out-Null
$log = Join-Path $evid 'ejecucion.log'
$fallos = 0
function Paso($t) { $linea = "[$(Get-Date -Format 'HH:mm:ss')] $t"; Write-Host $linea; Add-Content -Path $log -Value $linea }
function Falla($t) { $script:fallos++; Paso "FAIL · $t" }

Paso '== 1 · Herramientas =='
foreach ($c in @('node','npx','java')) {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Paso "FATAL: falta $c"; Paso 'RESULTADO: FAIL (herramientas)'; exit 1 }
  Paso "  OK $c"
}
$pw = Join-Path $raiz 'herramientas\node_modules\playwright'
if (-not (Test-Path $pw)) { Paso 'FATAL: falta Playwright en herramientas/node_modules'; exit 1 }
Paso '  OK Playwright'

Paso '== 2 · Aislamiento (proyecto demo-*) =='
if ($demo -notlike 'demo-*') { Paso 'FATAL: el proyecto debe ser demo-*'; exit 1 }
foreach ($f in @('admin\seguimiento.js','admin\seguimiento.html')) {
  $txt = Get-Content (Join-Path $raiz $f) -Raw
  if ($txt -match 'konfio-zinc') { Falla "$f menciona el proyecto productivo" } else { Paso "  OK $f sin referencias productivas" }
}

Paso '== 3 · Emuladores (auth + firestore) =='
$emuladores = Start-Process -FilePath 'npx' -ArgumentList '--yes','firebase-tools','emulators:start','--only','auth,firestore','--project',$demo,'--config',(Join-Path $PSScriptRoot 'firebase.emuladores.json') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evid 'emuladores.log') -RedirectStandardError (Join-Path $evid 'emuladores.err.log')
$listo = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 3
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue) { $listo = $true; break }
}
if (-not $listo) { Paso 'FATAL: el emulador no levantó en 8080 (ver emuladores.log)'; Stop-Process -Id $emuladores.Id -Force -ErrorAction SilentlyContinue; Paso 'RESULTADO: FAIL (emulador)'; exit 1 }
Paso '  OK emuladores en 127.0.0.1:8080 / :9099'

Paso '== 4 · Servidor web local =='
$servidor = Join-Path $PSScriptRoot 'servidor-aislado.mjs'
