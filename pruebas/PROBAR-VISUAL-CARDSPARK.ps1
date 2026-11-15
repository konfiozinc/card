# KZ-UNIFICACION-002 · Prueba visual automatizada del módulo Seguimiento en Card Spark.
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\pruebas\PROBAR-VISUAL-CARDSPARK.ps1
#
# AISLAMIENTO: todo corre contra el proyecto `demo-kz-crm-prospectos`. El navegador
# BLOQUEA cualquier petición a hosts de Firebase productivos y la prueba FALLA si
# detecta una. No se usan cuentas reales ni se escribe en producción.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$demo = 'demo-kz-crm-prospectos'
$evid = Join-Path $raiz '..\..\evidencias\kz-unificacion-002'
New-Item -ItemType Directory -Force -Path $evid | Out-Null
$log = Join-Path $evid 'ejecucion.log'
$fallos = 0
$web = $null
$emuladores = $null
function Paso($t) { $linea = "[$(Get-Date -Format 'HH:mm:ss')] $t"; Write-Host $linea; Add-Content -Path $log -Value $linea }
function Falla($t) { $script:fallos++; Paso "FAIL · $t" }
function CerrarPropios {
  foreach ($p in @($script:web, $script:emuladores)) {
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
}

try {
  Paso '== 1 · Herramientas =='
  foreach ($c in @('node','npx','java')) {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Paso "FATAL: falta $c"; Paso 'RESULTADO: FAIL (herramientas)'; exit 1 }
    Paso "  OK $c"
  }
  $pw = Join-Path $raiz 'herramientas\node_modules\playwright'
  if (-not (Test-Path $pw)) { Paso 'FATAL: falta Playwright en herramientas/node_modules'; exit 1 }
  Paso '  OK Playwright'

  Paso '== 2 · Archivos necesarios y aislamiento =='
  $servidor = Join-Path $PSScriptRoot 'servidor-aislado.mjs'
  $guion = Join-Path $PSScriptRoot 'visual-completo.mjs'
  $config = Join-Path $PSScriptRoot 'firebase.emuladores.json'
  foreach ($f in @($servidor, $guion, $config)) {
    if (-not (Test-Path $f)) { Paso "FATAL: falta $f"; Paso 'RESULTADO: FAIL (archivos)'; exit 1 }
    Paso "  OK $(Split-Path $f -Leaf)"
  }
  if ($demo -notlike 'demo-*') { Paso 'FATAL: el proyecto debe ser demo-*'; exit 1 }
  foreach ($f in @('admin\seguimiento.js','admin\seguimiento.html')) {
    $txt = Get-Content (Join-Path $raiz $f) -Raw
    if ($txt -match 'konfio-zinc') { Falla "$f menciona el proyecto productivo" } else { Paso "  OK $f sin referencias productivas" }
  }

  Paso '== 3 · Emuladores (auth 9099 + firestore 8080) =='
  $emuladores = Start-Process -FilePath 'npx' -ArgumentList '--yes','firebase-tools','emulators:start','--only','auth,firestore','--project',$demo,'--config',$config -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evid 'emuladores.log') -RedirectStandardError (Join-Path $evid 'emuladores.err.log')
  $listo = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 3
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue) { $listo = $true; break }
  }
  if (-not $listo) { Paso 'FATAL: el emulador no levantó en 8080 (ver emuladores.log)'; CerrarPropios; Paso 'RESULTADO: FAIL (emulador)'; exit 1 }
  Paso '  OK emuladores en 127.0.0.1:8080 / :9099'

  Paso '== 4 · Servidor aislado =='
  $web = Start-Process -FilePath 'node' -ArgumentList $servidor, (Resolve-Path $raiz) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evid 'web.log') -RedirectStandardError (Join-Path $evid 'web.err.log')
  $vivo = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5500/admin/dashboard.html' -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $vivo = $true; break }
    } catch { }
  }
  if (-not $vivo) { Paso 'FATAL: el servidor aislado no responde en 127.0.0.1:5500 (ver web.log)'; CerrarPropios; Paso 'RESULTADO: FAIL (servidor)'; exit 1 }
  Paso '  OK servidor aislado en http://127.0.0.1:5500'

  Paso '== 5 · Recorrido con Playwright =='
  $out = & node $guion (Resolve-Path $raiz) $evid 2>&1
  $out | ForEach-Object { Paso "  $_" }
  $salidaGuion = $LASTEXITCODE
  if ($salidaGuion -ne 0) { Falla 'el recorrido visual terminó con fallos' } else { Paso '  OK recorrido visual completo' }

  Paso '== 6 · Cierre de los procesos de la prueba =='
  CerrarPropios
  Paso '  OK procesos iniciados por la prueba detenidos (no se tocaron otros)'

  Paso ('Evidencias en: ' + (Resolve-Path $evid))
  if ($script:fallos -eq 0 -and $salidaGuion -eq 0) { Paso 'RESULTADO: PASS'; exit 0 }
  Paso "RESULTADO: FAIL (fallos=$script:fallos guion=$salidaGuion)"
  exit 1
} finally {
  CerrarPropios
}
