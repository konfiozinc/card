# ════════════════════════════════════════════════════════════════════════
#  KONFÍO ZINC · CARD — despliegue de Cloud Functions POR ETAPAS
#
#  Por omisión NO despliega nada: solo imprime los comandos y comprueba los
#  requisitos. Para ejecutar hace falta -Ejecutar.
#
#  La etapa «admin» despliega las Callables administrativas y NUNCA el motor.
#  La etapa «motor» despliega processDueDates y exige autorización explícita,
#  porque en cuanto exista en el proyecto pasa a ejecutarse cada día a las
#  08:00 (America/Bogota), envía notificaciones y suspende servicios.
#
#  Uso:
#    pwsh herramientas/desplegar-funciones.ps1                       # muestra el plan
#    pwsh herramientas/desplegar-funciones.ps1 -Etapa admin -Ejecutar
#    pwsh herramientas/desplegar-funciones.ps1 -Etapa motor -Ejecutar -AutorizadoPor "Darwin"
# ════════════════════════════════════════════════════════════════════════
param(
  [ValidateSet('admin', 'motor')][string]$Etapa = 'admin',
  [switch]$Ejecutar,
  [string]$Proyecto = 'konfio-zinc',
  [string]$AutorizadoPor = '',
  [string]$Entorno = ''
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$indice = Join-Path $raiz 'functions\src\index.js'

# ── Qué se despliega en cada etapa (lista explícita, nunca comodines) ────
$ADMIN = @(
  'crearCliente', 'actualizarCliente',
  'registrarPago', 'confirmarPago', 'anularPago',
  'suspenderServicio', 'reactivarServicio', 'desactivarServicio', 'activarServicio',
  'enviarNotificacion', 'registrarToken',
  'crearUsuario', 'actualizarUsuario',
  'seedInicial', 'recalcularEstados',
  'ejecutarVencimientos', 'estadoMotor'
)
$MOTOR = @('processDueDates')

function Falla([string]$mensaje) { Write-Host ""; Write-Host "  ✗ $mensaje" -ForegroundColor Red; Write-Host ""; exit 1 }
function Bien([string]$mensaje)  { Write-Host "  ✓ $mensaje" -ForegroundColor Green }
function Aviso([string]$mensaje) { Write-Host "  ! $mensaje" -ForegroundColor Yellow }

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DESPLIEGUE POR ETAPAS · etapa: $Etapa · proyecto: $Proyecto" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

if (-not (Test-Path $indice)) { Falla "No encuentro functions/src/index.js. ¿Estás ejecutando desde el repositorio correcto?" }

# ── 1. La lista debe coincidir EXACTAMENTE con los exports del código ────
$codigo = Get-Content $indice -Raw -Encoding UTF8
$exports = [regex]::Matches($codigo, 'exports\.([A-Za-z0-9_]+)\s*=') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$declaradas = @($ADMIN + $MOTOR | Sort-Object -Unique)

$faltanEnLista = @($exports | Where-Object { $declaradas -notcontains $_ })
$sobranEnLista = @($declaradas | Where-Object { $exports -notcontains $_ })

Write-Host ""
Write-Host "  Funciones exportadas en el código: $($exports.Count)"
Write-Host "  Funciones declaradas en este script: $($declaradas.Count)"
if ($faltanEnLista.Count -gt 0) { Aviso "Exportada(s) en el código y NO incluidas aquí: $($faltanEnLista -join ', ')" }
if ($sobranEnLista.Count -gt 0) { Falla "El script declara funciones que el código ya no exporta: $($sobranEnLista -join ', '). Actualiza la lista antes de desplegar." }

# ── 2. El motor no puede colarse en la etapa administrativa ──────────────
$seleccion = if ($Etapa -eq 'admin') { $ADMIN } else { $MOTOR }
if ($Etapa -eq 'admin') {
  $colado = @($seleccion | Where-Object { $MOTOR -contains $_ })
  if ($colado.Count -gt 0) { Falla "La etapa admin incluiría el motor ($($colado -join ', ')). Abortado." }
  Bien "La etapa admin NO incluye processDueDates."
}

# ── 3. Interruptor del motor: estado esperado ────────────────────────────
$archivoEntorno = if ($Entorno) { $Entorno } else { Join-Path $raiz ("functions\.env." + $Proyecto) }
$tieneBandera = $false
if (Test-Path $archivoEntorno) {
  $lineas = Get-Content $archivoEntorno
  $tieneBandera = @($lineas | Where-Object { $_ -match '^\s*KZ_MOTOR_VENCIMIENTOS\s*=\s*HABILITADO\s*$' }).Count -gt 0
}

Write-Host ""
Write-Host "  Interruptor del motor:"
Write-Host "    variable: KZ_MOTOR_VENCIMIENTOS = HABILITADO"
Write-Host "    documento: configuracion/motorVencimientos { habilitado: true }"
Write-Host "    archivo de entorno: $archivoEntorno"
if ($tieneBandera) { Aviso "el archivo DEFINE la bandera: el motor quedaría CERRADO SOLO por el documento." }
else { Bien "el archivo NO define la bandera: el motor queda cerrado aunque el documento exista." }

if ($Etapa -eq 'motor') {
  if (-not $tieneBandera) { Falla "La etapa motor exige $archivoEntorno con KZ_MOTOR_VENCIMIENTOS=HABILITADO. Sin la bandera el programador existiría para no hacer nada." }
  if ([string]::IsNullOrWhiteSpace($AutorizadoPor)) { Falla "La etapa motor exige -AutorizadoPor ""nombre"". No es un trámite: enciende un trabajo diario que envía notificaciones y suspende servicios." }
  Aviso "Autorizada por: $AutorizadoPor"
  Aviso "Comprueba antes: respaldo verificado, reglas desplegadas y aceptación de reglas en verde."
}

# ── 4. Comando exacto ────────────────────────────────────────────────────
$solo = ($seleccion | ForEach-Object { "functions:$_" }) -join ','
$comando = "firebase deploy --only $solo --project $Proyecto"

Write-Host ""
Write-Host "  Funciones seleccionadas ($($seleccion.Count)):"
$seleccion | ForEach-Object { Write-Host "    · $_" }
Write-Host ""
Write-Host "  Comando:" -ForegroundColor Cyan
Write-Host "    $comando" -ForegroundColor White
Write-Host ""

if (-not $Ejecutar) {
  Write-Host "  (modo simulación: no se ejecutó nada. Añade -Ejecutar para desplegar.)" -ForegroundColor Yellow
  Write-Host ""
  exit 0
}

# ── 5. Ejecución ─────────────────────────────────────────────────────────
Write-Host "  Ejecutando…" -ForegroundColor Yellow
Push-Location $raiz
try {
  & firebase deploy --only $solo --project $Proyecto
  $codigoSalida = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($codigoSalida -ne 0) { Falla "El despliegue terminó con código $codigoSalida." }
Bien "Despliegue terminado."

Write-Host ""
Write-Host "  Siguiente comprobación (lectura, no escribe nada):" -ForegroundColor Cyan
Write-Host "    firebase functions:list --project $Proyecto"
Write-Host "    y desde el panel, con un SUPERADMIN: estadoMotor (debe decir habilitado: false)"
Write-Host ""
