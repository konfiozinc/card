# KZ-UNIFICACION-002 - Prueba visual automatizada del modulo Seguimiento en Card Spark.
#
# Uso:   powershell -ExecutionPolicy Bypass -File .\pruebas\PROBAR-VISUAL-CARDSPARK.ps1
#        powershell -ExecutionPolicy Bypass -File .\pruebas\PROBAR-VISUAL-CARDSPARK.ps1 -Limpiar
#
# AISLAMIENTO: todo corre contra el proyecto `demo-kz-crm-prospectos`. El navegador
# BLOQUEA cualquier peticion a hosts de Firebase productivos y la prueba FALLA si
# detecta una. No se usan cuentas reales ni se escribe en produccion.
#
# ORDEN (corregido tras la corrida real del 15-nov-2026, 16:02-16:06):
#   1. herramientas y archivos
#   2. puertos libres (un emulador viejo con reglas abiertas invalidaria la prueba)
#   3. emuladores auth 9099 + firestore 8080
#   4. CASO AISLADO de disponibilidad, siembra y login (sin navegador)
#      -> si falla, se ABORTA: no se levanta el servidor ni se ejecuta el recorrido
#   5. servidor aislado 5500
#   6. recorrido visual con Playwright
#   7. cierre verificado de los procesos propios
#
# Este archivo se mantiene en ASCII a proposito: PowerShell 5.1 lo lee como ANSI y
# las tildes se corrompian en el log de evidencias ("FAIL -A Sembrar...").

param([switch]$Limpiar)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$raiz = Split-Path -Parent $PSScriptRoot
$demo = 'demo-kz-crm-prospectos'
$evid = Join-Path $raiz '..\..\evidencias\kz-unificacion-002'
New-Item -ItemType Directory -Force -Path $evid | Out-Null
$log = Join-Path $evid 'ejecucion.log'
Set-Content -Path $log -Value '' -Encoding UTF8
$fallos = 0
$web = $null
$emuladores = $null

function Paso($t) { $linea = "[$(Get-Date -Format 'HH:mm:ss')] $t"; Write-Host $linea; Add-Content -Path $log -Value $linea -Encoding UTF8 }
function Falla($t) { $script:fallos++; Paso "FAIL - $t" }

function PuertosOcupados {
  $r = @()
  foreach ($p in 9099, 8080, 4400, 9150, 5500) {
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue) { $r += $p }
  }
  return $r
}

# Cierra SOLO los procesos que esta prueba arranco (arbol completo). La corrida
# anterior mato unicamente el envoltorio de npx y dejaron de escuchar java (8080)
# y un node del emulador de auth (9099): el "OK procesos detenidos" era falso.
function CerrarPropios {
  foreach ($p in @($script:web, $script:emuladores)) {
    if ($p) { try { & taskkill.exe /T /F /PID $p.Id 2>&1 | Out-Null } catch { } }
  }
  Start-Sleep -Milliseconds 1200
}

# Solo con -Limpiar: cierra emuladores de Firebase huerfanos, identificados por su
# linea de comandos. No toca ningun otro proceso de la maquina.
function CerrarEmuladoresHuerfanos {
  $objetivo = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.CommandLine -and ($_.CommandLine -match 'cloud-firestore-emulator' -or $_.CommandLine -match 'emulators:start')
    })
  foreach ($o in $objetivo) {
    Paso ("  cerrando PID " + $o.ProcessId + " (" + $o.Name + ")")
    try { & taskkill.exe /T /F /PID $o.ProcessId 2>&1 | Out-Null } catch { }
  }
  Start-Sleep -Milliseconds 1500
  return $objetivo.Count
}

try {
  Paso '== 1 - Herramientas =='
  foreach ($c in @('node', 'npx', 'java')) {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Paso "FATAL: falta $c"; Paso 'RESULTADO: FAIL (herramientas)'; exit 1 }
    Paso "  OK $c"
  }
  $pw = Join-Path $raiz 'herramientas\node_modules\playwright'
  if (-not (Test-Path $pw)) { Paso 'FATAL: falta Playwright en herramientas/node_modules'; Paso 'RESULTADO: FAIL (herramientas)'; exit 1 }
  Paso '  OK Playwright'

  Paso '== 2 - Archivos necesarios y aislamiento =='
  $entorno = Join-Path $PSScriptRoot 'entorno-emuladores.mjs'
  $aislado = Join-Path $PSScriptRoot 'siembra-login.mjs'
  $servidor = Join-Path $PSScriptRoot 'servidor-aislado.mjs'
  $guion = Join-Path $PSScriptRoot 'visual-completo.mjs'
  $config = Join-Path $PSScriptRoot 'firebase.emuladores.json'
  foreach ($f in @($entorno, $aislado, $servidor, $guion, $config)) {
    if (-not (Test-Path $f)) { Paso "FATAL: falta $f"; Paso 'RESULTADO: FAIL (archivos)'; exit 1 }
    Paso "  OK $(Split-Path $f -Leaf)"
  }
  if ($demo -notlike 'demo-*') { Paso 'FATAL: el proyecto debe ser demo-*'; exit 1 }

  # Las reglas deben cargarse de verdad. El 15-nov el JSON apuntaba a
  # pruebas/firestore.rules (que no existe), firebase-tools avisaba "default
  # allowing all reads and writes" y el emulador corria SIN reglas.
  $objConfig = Get-Content $config -Raw | ConvertFrom-Json
  $rutaReglas = Join-Path $PSScriptRoot $objConfig.firestore.rules
  if (-not (Test-Path $rutaReglas)) { Paso "FATAL: las reglas configuradas no existen: $rutaReglas"; Paso 'RESULTADO: FAIL (reglas)'; exit 1 }
  Paso "  OK reglas del emulador -> $(Split-Path $rutaReglas -Leaf) (existe)"

  foreach ($f in @('admin\seguimiento.js', 'admin\seguimiento.html')) {
    $txt = Get-Content (Join-Path $raiz $f) -Raw
    if ($txt -match 'konfio-zinc') { Falla "$f menciona el proyecto productivo" } else { Paso "  OK $f sin referencias productivas" }
  }

  Paso '== 3 - Puertos libres antes de arrancar =='
  $ocupados = PuertosOcupados
  if ($ocupados.Count -gt 0) {
    if ($Limpiar) {
      Paso ("  puertos ocupados: " + ($ocupados -join ',') + " -> cerrando emuladores huerfanos (-Limpiar)")
      $n = CerrarEmuladoresHuerfanos
      Paso "  procesos cerrados: $n"
      $ocupados = PuertosOcupados
    }
  }
  if ($ocupados.Count -gt 0) {
    Paso ("FATAL: puertos ocupados por procesos de otra corrida: " + ($ocupados -join ','))
    Paso '  Un emulador viejo haria que la prueba corra contra un entorno que no es el de esta ejecucion.'
    Paso '  Cierrelos y repita, o ejecute este mismo script con el interruptor -Limpiar.'
    Paso 'RESULTADO: FAIL (entorno ocupado)'
    exit 1
  }
  Paso '  OK 9099, 8080, 4400, 9150 y 5500 libres'

  Paso '== 4 - Emuladores (auth 9099 + firestore 8080) =='
  $argsEmu = @('emulators:start', '--only', 'auth,firestore', '--project', $demo, '--config', $config)
  $logSalida = Join-Path $evid 'emuladores.log'
  $logError = Join-Path $evid 'emuladores.err.log'
  # Se reutiliza la CLI ya instalada (regla de oro del entorno): no hace falta
  # resolver firebase-tools contra el registro en cada corrida.
  $cliFirebase = Get-Command 'firebase.cmd' -ErrorAction SilentlyContinue
  if ($cliFirebase) {
    Paso "  CLI instalada: $($cliFirebase.Source)"
    $emuladores = Start-Process -FilePath $cliFirebase.Source -ArgumentList $argsEmu -PassThru -WindowStyle Hidden -RedirectStandardOutput $logSalida -RedirectStandardError $logError
  } else {
    Paso '  CLI no instalada: se usa npx --yes firebase-tools'
    $emuladores = Start-Process -FilePath 'npx.cmd' -ArgumentList (@('--yes', 'firebase-tools') + $argsEmu) -PassThru -WindowStyle Hidden -RedirectStandardOutput $logSalida -RedirectStandardError $logError
  }

  Paso '== 5 - Caso aislado: disponibilidad, siembra y login (sin navegador) =='
  # Aqui vive la puerta que la corrida anterior no tenia: se comprueban los DOS
  # servicios con peticiones reales y se siembra la ficha en usuarios/<uid>.
  $salidaAislado = & node $aislado $demo 180000 2>&1
  $salidaAislado | ForEach-Object { Paso "  $_" }
  $codigoAislado = $LASTEXITCODE
  if ($emuladores -and $emuladores.HasExited) { Falla 'el proceso de los emuladores termino durante el caso aislado' }
  if ($codigoAislado -ne 0) {
    Falla "caso aislado de siembra y login NO aprobado (codigo $codigoAislado)"
    Paso 'ABORTADO: sin sesion verificada no se ejecuta ninguna operacion comercial.'
    CerrarPropios
    $restantes = PuertosOcupados
    if ($restantes.Count -gt 0) { Falla ("tras el cierre siguen ocupados: " + ($restantes -join ',')) } else { Paso '  procesos de la prueba cerrados (puertos libres)' }
    Paso 'RESULTADO: FAIL (abortado en la preparacion)'
    exit 1
  }
  Paso '  OK siembra y login aprobados'

  Paso '== 6 - Servidor aislado =='
  $web = Start-Process -FilePath 'node' -ArgumentList $servidor, (Resolve-Path $raiz) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evid 'web.log') -RedirectStandardError (Join-Path $evid 'web.err.log')
  $vivo = $false
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5500/admin/dashboard.html' -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $vivo = $true; break }
    } catch { }
  }
  if (-not $vivo) { Paso 'FATAL: el servidor aislado no responde en 127.0.0.1:5500 (ver web.log)'; CerrarPropios; Paso 'RESULTADO: FAIL (servidor)'; exit 1 }
  Paso '  OK servidor aislado en http://127.0.0.1:5500'

  Paso '== 7 - Recorrido visual con Playwright =='
  $out = & node $guion (Resolve-Path $raiz) $evid 2>&1
  $out | ForEach-Object { Paso "  $_" }
  $salidaGuion = $LASTEXITCODE
  if ($salidaGuion -eq 0) { Paso '  OK recorrido visual completo' }
  elseif ($salidaGuion -eq 2) { Falla 'el recorrido se aborto en la preparacion o en el login (codigo 2)' }
  else { Falla "el recorrido visual termino con fallos (codigo $salidaGuion)" }

  Paso '== 8 - Cierre verificado de los procesos de la prueba =='
  CerrarPropios
  $restantes = PuertosOcupados
  if ($restantes.Count -gt 0) {
    Falla ("siguen escuchando tras el cierre: " + ($restantes -join ',') + " (la corrida anterior dejaba java en 8080 y node en 9099)")
  } else {
    Paso '  OK procesos de la prueba detenidos y puertos liberados (no se toco ningun otro proceso)'
  }

  Paso ('Evidencias en: ' + (Resolve-Path $evid))
  if ($script:fallos -eq 0 -and $salidaGuion -eq 0) { Paso 'RESULTADO: PASS'; exit 0 }
  Paso ("RESULTADO: FAIL (fallos=" + $script:fallos + " guion=" + $salidaGuion + ")")
  exit 1
} finally {
  CerrarPropios
}
