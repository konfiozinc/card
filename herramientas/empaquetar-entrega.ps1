# ═══════════════════════════════════════════════════════════════════════
# KONFÍO ZINC · herramientas/empaquetar-entrega.ps1
# KZ-AUDIT-001 · Prepara el ZIP de revisión de feature/kz-web-003.
#
# Exporta el CÓDIGO VERSIONADO (git archive), así que node_modules,
# test-results y los archivos sin versionar quedan fuera por construcción.
# Además excluye explícitamente perfil.jpeg (foto personal versionada).
#
# Uso: pwsh -File herramientas/empaquetar-entrega.ps1
# ═══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 no trae cargado el ensamblado de ZIP.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$RAIZ    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BASE    = 'C:\KZ-EVIDENCIA\entrega-kz-web-003'
$STAGE   = Join-Path $BASE 'KZ-WEB-003-KZ-ID-001'
$ZIP     = Join-Path $BASE 'KZ-WEB-003-KZ-ID-001-revision.zip'
$TMPZIP  = Join-Path $BASE '_codigo.zip'

Write-Host "=== EMPAQUETANDO ENTREGA ===" -ForegroundColor Cyan

# ── Limpieza ───────────────────────────────────────────────────────────
if (Test-Path $STAGE) { Remove-Item $STAGE -Recurse -Force }
if (Test-Path $ZIP)    { Remove-Item $ZIP -Force }
if (Test-Path $TMPZIP) { Remove-Item $TMPZIP -Force }
New-Item -ItemType Directory -Force -Path $STAGE | Out-Null

$irs = @('01-INFORMES','02-CAPTURAS','03-LOGOTIPOS','04-CODIGO')
foreach ($d in $irs) { New-Item -ItemType Directory -Force -Path (Join-Path $STAGE $d) | Out-Null }

# ── 00 · Documentos de entrada ─────────────────────────────────────────
Copy-Item (Join-Path $BASE 'LEEME-PRIMERO.md')   (Join-Path $STAGE 'LEEME-PRIMERO.md')
Copy-Item (Join-Path $BASE 'auditoria-p0.md')    (Join-Path $STAGE '01-INFORMES\auditoria-p0.md')
Copy-Item (Join-Path $BASE 'resultados-pruebas.txt') (Join-Path $STAGE '01-INFORMES\resultados-pruebas.txt')
Write-Host "  documentos base copiados"

# ── 01 · Historial, diff y parche ──────────────────────────────────────
Push-Location $RAIZ
try {
    $sha  = git rev-parse HEAD
    $rama = git rev-parse --abbrev-ref HEAD
    $mainSha = git rev-parse main

    # Ojo: los comandos de git devuelven ARRAYS. Si se meten tal cual en un
    # -join, PowerShell los convierte a "System.Object[]" en vez de unirlos.
    $logTxt  = (git log --format='%h  %ad  %s' --date=short main..HEAD) -join "`n"
    $statTxt = (git diff --stat main..HEAD) -join "`n"

    $cab = @(
        "KONFIO ZINC - Historial de la rama para revision",
        "",
        "Rama            : $rama",
        "HEAD            : $sha",
        "main            : $mainSha",
        "Fecha del corte : $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        "",
        "=== COMMITS SOBRE main ===",
        $logTxt,
        "",
        "=== FICHEROS TOCADOS ===",
        $statTxt
    ) -join "`n"
    $cab | Set-Content -Path (Join-Path $STAGE '01-INFORMES\git-historial.txt') -Encoding UTF8

    git diff --stat main..HEAD   | Set-Content -Path (Join-Path $STAGE '01-INFORMES\git-diff-stat.txt') -Encoding UTF8
    git diff main..HEAD          | Set-Content -Path (Join-Path $STAGE '01-INFORMES\cambios-completos.patch') -Encoding UTF8
    Write-Host "  historial, diff-stat y parche generados"

    # ── 04 · Código: exportar solo lo versionado ───────────────────────
    git archive --format=zip -o $TMPZIP HEAD
    [System.IO.Compression.ZipFile]::ExtractToDirectory($TMPZIP, (Join-Path $STAGE '04-CODIGO'))
    Remove-Item $TMPZIP -Force
    Write-Host "  codigo versionado exportado"
}
finally { Pop-Location }

# ── Exclusión explícita de la foto personal ────────────────────────────
$perfil = Join-Path $STAGE '04-CODIGO\perfil.jpeg'
if (Test-Path $perfil) { Remove-Item $perfil -Force; Write-Host "  excluido perfil.jpeg (foto personal)" }

# ── 03 · Logotipos ─────────────────────────────────────────────────────
$fuentes = Join-Path $STAGE '03-LOGOTIPOS\fuente-original'
$gen     = Join-Path $STAGE '03-LOGOTIPOS\generados'
New-Item -ItemType Directory -Force -Path $fuentes, $gen | Out-Null

$origenFuente = Join-Path $STAGE '04-CODIGO\assets\img\marca\fuente'
if (Test-Path $origenFuente) {
    Copy-Item (Join-Path $origenFuente '*') $fuentes
    Write-Host "  logotipos originales del propietario copiados"
}

$rutasGen = @(
    'assets\img\marca\logo-oficial.png',
    'assets\img\marca\marca-oficial.png',
    'assets\img\marca\capas-kz.svg',
    'assets\img\og\og-1200x630.png',
    'assets\img\og\og-1200x630.svg',
    'assets\img\icons\icon-192.png',
    'assets\img\icons\icon-512.png',
    'assets\img\icons\icon-maskable-192.png',
    'assets\img\icons\icon-maskable-512.png',
    'assets\img\icons\apple-touch-icon.png',
    'assets\img\logos\favicon-32.png',
    'assets\img\logos\favicon-64.png'
)
foreach ($r in $rutasGen) {
    $src = Join-Path $STAGE "04-CODIGO\$r"
    if (Test-Path $src) { Copy-Item $src (Join-Path $gen (Split-Path $r -Leaf)) }
}
Write-Host "  activos generados copiados"

# ── 02 · Capturas finales ──────────────────────────────────────────────
$capOrigen = 'C:\KZ-EVIDENCIA\kz-id-001\final'
$capDest   = Join-Path $STAGE '02-CAPTURAS'
if (Test-Path $capOrigen) {
    Get-ChildItem $capOrigen -File -Filter '*.png' |
        Where-Object { $_.Name -notmatch '^robot-' } |
        ForEach-Object { Copy-Item $_.FullName (Join-Path $capDest $_.Name) }
    Write-Host "  capturas finales copiadas"
}

# ── Inventario interno del ZIP ─────────────────────────────────────────
$inventario = Get-ChildItem $STAGE -Recurse -File |
    ForEach-Object {
        [PSCustomObject]@{
            Ruta = $_.FullName.Substring($STAGE.Length + 1)
            KB   = [math]::Round($_.Length/1KB, 1)
        }
    } | Sort-Object Ruta
$inventario | Format-Table -AutoSize | Out-String -Width 200 |
    Set-Content -Path (Join-Path $STAGE 'INVENTARIO.txt') -Encoding UTF8

# ── Comprobación de secretos antes de comprimir ────────────────────────
Write-Host "`n=== COMPROBACION DE SEGURIDAD ===" -ForegroundColor Cyan
$sospechosos = Get-ChildItem $STAGE -Recurse -File |
    Where-Object { $_.Name -match '^\.env$|service.?account|\.pem$|\.key$|AGENTE_IA|PROGRAMA_ALIADOS|perfil\.jpeg' }
if ($sospechosos) {
    Write-Host "  ATENCION: se encontraron archivos que no deberian viajar:" -ForegroundColor Red
    $sospechosos | ForEach-Object { Write-Host ("    " + $_.FullName) }
} else {
    Write-Host "  sin archivos sensibles ni personales"
}

$claves = Get-ChildItem $STAGE -Recurse -File -Include *.js,*.md,*.json,*.txt,*.ps1,*.yml |
    Select-String -Pattern '-----BEGIN [A-Z ]*PRIVATE KEY-----','sk_live_','ghp_','"private_key"' -ErrorAction SilentlyContinue
if ($claves) {
    Write-Host "  ATENCION: posibles claves en texto:" -ForegroundColor Red
    $claves | Select-Object -First 5 | ForEach-Object { Write-Host ("    " + $_.Path + ":" + $_.LineNumber) }
} else {
    Write-Host "  sin claves privadas ni tokens en texto"
}

Write-Host "`n=== COMPRIMIENDO ===" -ForegroundColor Cyan
[System.IO.Compression.ZipFile]::CreateFromDirectory($STAGE, $ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $true)

$info = Get-Item $ZIP
$nArchivos = (Get-ChildItem $STAGE -Recurse -File | Measure-Object).Count
Write-Host ("  ZIP  : " + $ZIP)
Write-Host ("  peso : " + [math]::Round($info.Length/1MB, 1) + " MB")
Write-Host ("  files: " + $nArchivos)
Write-Host "`n=== CONTENIDO POR CARPETA ===" -ForegroundColor Cyan
foreach ($d in $irs) {
    $c = (Get-ChildItem (Join-Path $STAGE $d) -Recurse -File | Measure-Object)
    $mb = [math]::Round((Get-ChildItem (Join-Path $STAGE $d) -Recurse -File | Measure-Object -Property Length -Sum).Sum/1MB, 1)
    Write-Host ("  " + $d.PadRight(16) + $c.Count.ToString().PadLeft(4) + " archivos   " + $mb + " MB")
}
