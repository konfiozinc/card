# ════════════════════════════════════════════════════════════════════════
#  KONFÍO ZINC · CARD — publicación del sitio en GitHub Pages, con frenos
#
#  Por omisión NO publica nada: comprueba todo e imprime el comando exacto.
#  Para publicar de verdad hacen falta -Publicar y -ConfirmarPruebas.
#
#  Qué comprueba antes de tocar nada:
#    1. El árbol de trabajo está limpio (no arrastra trabajo ajeno).
#    2. La publicación sería un avance rápido (fast-forward) sobre origin/main.
#    3. El candidato NO modifica precios.html (el precio viejo no se publica).
#    4. El verificador de precios y nomenclatura pasa.
#    5. Existe la etiqueta de retorno, para poder volver al estado publicado hoy.
#
#  Qué NO hace: no toca la copia local del repositorio de producción, no hace
#  merge, no reescribe historia y no usa --force.
#
#  Uso:
#    pwsh herramientas/publicar-paginas.ps1
#    pwsh herramientas/publicar-paginas.ps1 -ConfirmarPruebas -Publicar
# ════════════════════════════════════════════════════════════════════════
param(
  [switch]$Publicar,
  [switch]$ConfirmarPruebas,
  [string]$RamaRemota = 'main',
  [string]$Sitio = 'https://konfiozinc.github.io/card/'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$nodo = (Get-Command node -ErrorAction SilentlyContinue)

function Falla([string]$m) { Write-Host ""; Write-Host "  x $m" -ForegroundColor Red; Write-Host ""; exit 1 }
function Bien([string]$m)  { Write-Host "  ok $m" -ForegroundColor Green }
function Aviso([string]$m) { Write-Host "  !  $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  PUBLICACION EN GITHUB PAGES · sitio: $Sitio" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Push-Location $raiz
try {
  # ── 1. Árbol limpio ────────────────────────────────────────────────
  $sucio = (git status --porcelain) -join ''
  if ($sucio.Trim() -ne '') { Falla "El árbol de trabajo tiene cambios sin confirmar. Publica desde un commit limpio.`n$sucio" }
  Bien "árbol de trabajo limpio"

  $head = (git rev-parse HEAD).Trim()
  $headCorto = (git rev-parse --short HEAD).Trim()
  Write-Host "  commit candidato: $headCorto"

  # ── 2. Avance rápido sobre origin/main ────────────────────────────
  git fetch origin $RamaRemota --quiet 2>$null
  $remoto = (git rev-parse "origin/$RamaRemota").Trim()
  git merge-base --is-ancestor $remoto HEAD
  if ($LASTEXITCODE -ne 0) { Falla "La publicación NO sería un avance rápido: origin/$RamaRemota tiene commits que este candidato no incluye. Resuélvelo antes." }
  $adelanto = (git rev-list --count "$remoto..HEAD").Trim()
  Bien "avance rápido sobre origin/$RamaRemota ($($remoto.Substring(0,7))) · $adelanto commit(s) nuevos"

  # ── 3. precios.html intacto ───────────────────────────────────────
  $diffPrecios = (git diff --name-only "$remoto..HEAD" -- precios.html) -join ''
  if ($diffPrecios.Trim() -ne '') { Falla "El candidato modifica precios.html. No se publica hasta que la migración de precios viaje completa y revisada." }
  Bien "precios.html no cambia con esta publicación"
  $huellaPrecios = (git rev-parse "HEAD:precios.html").Trim().Substring(0,12)
  Write-Host "  precios.html publicado seguirá siendo $huellaPrecios (idéntico al actual)"

  # ── 4. Verificación de precios y nomenclatura ─────────────────────
  if (-not $nodo) { Aviso "node no está en el PATH: no se pudo ejecutar el verificador de precios" }
  else {
    $vp = & node (Join-Path $raiz 'herramientas\verificar-precios.js') 2>&1
    if ($LASTEXITCODE -ne 0) { Falla "El verificador de precios falló. No se publica.`n$($vp | Select-Object -Last 6)" }
    Bien "verificador de precios y nomenclatura en verde"
  }

  # ── 5. Etiqueta de retorno ────────────────────────────────────────
  $etiqueta = "release/previo-$($remoto.Substring(0,7))"
  $existe = (git tag --list $etiqueta) -join ''
  if ($existe.Trim() -eq '') {
    if ($Publicar) { git tag $etiqueta $remoto; Bien "etiqueta de retorno creada: $etiqueta -> $($remoto.Substring(0,7))" }
    else { Aviso "la etiqueta de retorno $etiqueta se creará al publicar (marca el estado que está hoy en producción)" }
  } else { Bien "etiqueta de retorno ya existe: $etiqueta" }

  # ── 6. Qué archivos cambian en el sitio ───────────────────────────
  $cambiados = (git diff --name-only "$remoto..HEAD") | Where-Object { $_ }
  Write-Host ""
  Write-Host "  archivos que cambiarían en producción ($($cambiados.Count)):" -ForegroundColor Cyan
  $cambiados | Group-Object { ($_ -split '/')[0] } | ForEach-Object { Write-Host ("    {0,-24} {1} archivo(s)" -f $_.Name, $_.Count) }

  # ── 7. Comando y frenos ───────────────────────────────────────────
  Write-Host ""
  Write-Host "  Comando de publicación:" -ForegroundColor Cyan
  Write-Host "    git push origin HEAD:$RamaRemota"
  Write-Host ""
  Write-Host "  Reversión si algo sale mal:" -ForegroundColor Cyan
  Write-Host "    git revert --no-edit $headCorto && git push origin HEAD:$RamaRemota"
  Write-Host "    (emergencia: devolver $RamaRemota a $etiqueta sólo con autorización expresa)"
  Write-Host ""

  if (-not $ConfirmarPruebas) {
    Aviso "Falta -ConfirmarPruebas: sólo se añade después de ejecutar las suites y verlas en verde."
    Write-Host ""
    Write-Host "  Suites que deben estar en verde antes de publicar:" -ForegroundColor Yellow
    Write-Host "    node herramientas/test/pruebas-pagos-p1.js          (reglas)"
    Write-Host "    node herramientas/test/pruebas-callables-p1.js      (Callables)"
    Write-Host "    node herramientas/test/pruebas-motor-p1.js          (interruptor del motor)"
    Write-Host "    node herramientas/test/pruebas-lanzamiento-p1.js    (panel sin/con backend)"
    Write-Host "    node herramientas/test/pruebas-loteB-p1.js          (panel)"
    Write-Host "    node herramientas/test/pruebas-loteC-p1.js          (panel)"
    Write-Host ""
    exit 0
  }

  if (-not $Publicar) {
    Bien "todas las comprobaciones pasaron; modo simulación (añade -Publicar para publicar)"
    Write-Host ""
    exit 0
  }

  Write-Host "  Publicando..." -ForegroundColor Yellow
  git push origin "HEAD:$RamaRemota"
  if ($LASTEXITCODE -ne 0) { Falla "El push falló. Revisa el remoto (debe ser SSH: git@github.com:konfiozinc/card.git)." }
  Bien "push completado"

  # ── 8. Comprobación posterior (GitHub Pages tarda ~1 minuto) ──────
  Write-Host ""
  Write-Host "  Esperando a que GitHub Pages publique..." -ForegroundColor Yellow
  $listo = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 6
    try {
      $r = Invoke-WebRequest -Uri ($Sitio + 'admin/index.html') -UseBasicParsing -TimeoutSec 8
      if ($r.StatusCode -eq 200) { $listo = $true; break }
    } catch { }
  }
  if (-not $listo) { Aviso "El sitio no respondió 200 en 3 minutos. Comprueba a mano antes de dar la publicación por buena." }
  else { Bien "el sitio responde 200" }

  Write-Host ""
  Write-Host "  Comprobaciones que faltan, a mano:" -ForegroundColor Cyan
  Write-Host "    1. Cargar $($Sitio)admin/index.html e iniciar sesión con un usuario real."
  Write-Host "    2. Crear un cliente de prueba y confirmar que aparece (usa las Callables)."
  Write-Host "    3. Abrir la ficha de un cliente y ver el historial (índice historial_estados)."
  Write-Host "    4. Comprobar que precios.html sigue igual que antes de publicar."
  Write-Host ""
}
finally {
  Pop-Location
}
