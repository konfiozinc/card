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
  $inicializacion = Join-Path $PSScriptRoot 'inicializacion.mjs'
  $servidor = Join-Path $PSScriptRoot 'servidor-aislado.mjs'
  $guion = Join-Path $PSScriptRoot 'visual-completo.mjs'
  foreach ($f in @($entorno, $aislado, $inicializacion, $servidor, $guion)) {
    if (-not (Test-Path $f)) { Paso "FATAL: falta $f"; Paso 'RESULTADO: FAIL (archivos)'; exit 1 }
    Paso "  OK $(Split-Path $f -Leaf)"
  }
  if ($demo -notlike 'demo-*') { Paso 'FATAL: el proyecto debe ser demo-*'; exit 1 }

  foreach ($f in @('admin\seguimiento.js', 'admin\seguimiento.html')) {
    $txt = Get-Content (Join-Path $raiz $f) -Raw
    if ($txt -match 'konfio-zinc') { Falla "$f menciona el proyecto productivo" } else { Paso "  OK $f sin referencias productivas" }
  }

  # ---------------------------------------------------------------------------
  # 2b - Directorio temporal exclusivo del emulador
  #
  # firebase-tools resuelve la ruta de reglas contra el directorio del ARCHIVO DE
  # CONFIGURACION (lib/detectProjectRoot.js: projectDir = dirname(configPath)) y
  # rechaza cualquier ruta que se salga de el (lib/config.js:140-142):
  #     "../firestore.rules is outside of project directory"
  # Por eso la configuracion vive junto a una COPIA de las reglas: asi la ruta
  # "firestore.rules" queda dentro del directorio del proyecto y el original
  # firestore.rules del repositorio no se toca ni se mueve.
  # ---------------------------------------------------------------------------
  Paso '== 2b - Directorio temporal del emulador =='
  $dirEmu = Join-Path $PSScriptRoot 'emulador-temporal'
  if (Test-Path $dirEmu) { Remove-Item $dirEmu -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dirEmu | Out-Null

  $reglasOrigen = Join-Path $raiz 'firestore.rules'
  if (-not (Test-Path $reglasOrigen)) { Paso "FATAL: no existe $reglasOrigen"; Paso 'RESULTADO: FAIL (reglas)'; exit 1 }
  $reglasCopia = Join-Path $dirEmu 'firestore.rules'
  Copy-Item -Path $reglasOrigen -Destination $reglasCopia -Force

  $hashOrigen = (Get-FileHash $reglasOrigen -Algorithm SHA256).Hash
  $hashCopia = (Get-FileHash $reglasCopia -Algorithm SHA256).Hash
  if ($hashOrigen -ne $hashCopia) {
    Paso 'FATAL: la copia de las reglas no es identica al original'
    Paso "  original: $hashOrigen"
    Paso "  copia   : $hashCopia"
    Paso 'RESULTADO: FAIL (reglas)'
    exit 1
  }
  Paso "  OK copia identica al original (SHA-256 " + $hashOrigen.Substring(0, 16) + "...)"
  Paso "  OK original intacto: firestore.rules ($((Get-Item $reglasOrigen).Length) bytes)"

  $config = Join-Path $dirEmu 'firebase.json'
  $jsonEmu = @'
{
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  },
  "firestore": { "rules": "firestore.rules" }
}
'@
  Set-Content -Path $config -Value $jsonEmu -Encoding ASCII
  $objConfig = Get-Content $config -Raw | ConvertFrom-Json
  $valorReglas = $objConfig.firestore.rules
  if ($valorReglas -match '\.\.') {
    Paso "FATAL: la ruta de reglas se sale del directorio del proyecto ($valorReglas)"
    Paso 'RESULTADO: FAIL (reglas)'
    exit 1
  }
  if (-not (Test-Path (Join-Path $dirEmu $valorReglas))) {
    Paso "FATAL: la ruta de reglas configurada no existe dentro de $dirEmu"
    Paso 'RESULTADO: FAIL (reglas)'
    exit 1
  }
  Paso "  OK firebase.json generado con rules = `"$valorReglas`" (dentro del mismo directorio)"

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
  Paso "  raiz del emulador: $dirEmu"
  if ($cliFirebase) {
    Paso "  CLI instalada: $($cliFirebase.Source)"
    $emuladores = Start-Process -FilePath $cliFirebase.Source -ArgumentList $argsEmu -PassThru -WindowStyle Hidden -WorkingDirectory $dirEmu -RedirectStandardOutput $logSalida -RedirectStandardError $logError
  } else {
    Paso '  CLI no instalada: se usa npx --yes firebase-tools'
    $emuladores = Start-Process -FilePath 'npx.cmd' -ArgumentList (@('--yes', 'firebase-tools') + $argsEmu) -PassThru -WindowStyle Hidden -WorkingDirectory $dirEmu -RedirectStandardOutput $logSalida -RedirectStandardError $logError
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

  Paso '== 7 - Prueba focalizada de inicializacion (importmap, shell, roles) =='
  # Antes del recorrido completo: si #app-shell no pinta la navegacion o el
  # modulo no inicializa, el resto de operaciones no tiene sentido.
  $outIni = & node $inicializacion (Resolve-Path $raiz) $evid 2>&1
  $outIni | ForEach-Object { Paso "  $_" }
  $codigoIni = $LASTEXITCODE
  if ($codigoIni -ne 0) {
    Falla "inicializacion NO aprobada (codigo $codigoIni)"
    Paso 'ABORTADO: sin inicializacion validada no se ejecuta el recorrido comercial.'
    CerrarPropios
    $restantesIni = PuertosOcupados
    if ($restantesIni.Count -gt 0) { Falla ("tras el cierre siguen ocupados: " + ($restantesIni -join ',')) }
    Paso 'RESULTADO: FAIL (abortado en la inicializacion)'
    exit 1
  }
  Paso '  OK inicializacion aprobada'

  Paso '== 8 - Recorrido visual con Playwright =='
  $out = & node $guion (Resolve-Path $raiz) $evid 2>&1
  $out | ForEach-Object { Paso "  $_" }
  $salidaGuion = $LASTEXITCODE
  if ($salidaGuion -eq 0) { Paso '  OK recorrido visual completo' }
  elseif ($salidaGuion -eq 2) { Falla 'el recorrido se aborto en la preparacion o en el login (codigo 2)' }
  else { Falla "el recorrido visual termino con fallos (codigo $salidaGuion)" }

  Paso '== 9 - Cierre verificado de los procesos de la prueba =='
  CerrarPropios

  # Los logs propios del emulador se escriben en su directorio raiz: se copian a
  # evidencias para que queden junto al resto de la corrida.
  foreach ($n in @('firebase-debug.log', 'firestore-debug.log')) {
    $origen = Join-Path $dirEmu $n
    if (Test-Path $origen) {
      Copy-Item $origen (Join-Path $evid $n) -Force
      $avisoReglas = Select-String -Path $origen -Pattern 'allowing all reads and writes|outside of project directory' -ErrorAction SilentlyContinue
      if ($avisoReglas) { Falla "$n contiene un aviso de reglas no aplicadas o de ruta fuera del proyecto" } else { Paso "  OK $n copiado a evidencias (sin avisos de reglas)" }
    } else {
      Paso "  nota: no se encontro $n en el directorio del emulador"
    }
  }

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
