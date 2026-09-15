# ═══════════════════════════════════════════════════════════════════
# verificar-sitio.ps1 · KONFÍO ZINC
# Comprueba la integridad del sitio multipágina antes de publicar:
#   - Enlaces y recursos internos (href/src) que apunten a archivos inexistentes
#   - Enlaces entre páginas HTML con verificación de rutas relativas
#   - Presencia de <title>, meta description, canonical y data-base
#   - Longitud de títulos (≤60) y metadescripciones (≤155)
#   - Bloques JSON-LD válidos (parseo de JSON)
#   - Un solo <h1> por página
#   - Imágenes sin atributo alt
#   - URLs del sitemap.xml que correspondan a archivos existentes
#
# Uso:
#   pwsh -File .\herramientas\verificar-sitio.ps1
# ═══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repo 'index.html'))) { $repo = $PSScriptRoot }

$errores   = New-Object System.Collections.Generic.List[string]
$avisos    = New-Object System.Collections.Generic.List[string]
$stats     = [ordered]@{}

function Rel([string]$p) { $p.Replace("$repo\", '') }

$htmlFiles = Get-ChildItem -Path $repo -Recurse -Filter *.html -File |
  Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'index-old.html' -and $_.FullName -notmatch 'KIT_COMERCIAL' }

Write-Host "`n=== VERIFICACIÓN DEL SITIO KONFÍO ZINC ===" -ForegroundColor Cyan
Write-Host "Archivos HTML analizados: $($htmlFiles.Count)`n"

foreach ($f in $htmlFiles) {
  $rel  = Rel $f.FullName
  $base = $f.DirectoryName
  $raw  = Get-Content $f.FullName -Raw -Encoding UTF8

  # ── 1. Enlaces y recursos internos ────────────────────────────────
  foreach ($m in [regex]::Matches($raw, '(?:href|src)="(?!#|https?:|mailto:|tel:|data:|javascript:)([^"]+)"')) {
    $target = $m.Groups[1].Value.Split('#')[0].Split('?')[0]
    if ([string]::IsNullOrWhiteSpace($target)) { continue }
    $path = Join-Path $base $target
    if (-not (Test-Path $path)) { $errores.Add("ENLACE ROTO · $rel  ->  $target") }
  }

  # ── 2. Metadatos obligatorios ─────────────────────────────────────
  if ($raw -notmatch '<title>([^<]+)</title>') {
    $errores.Add("SIN <title> · $rel")
  } else {
    $title = $Matches[1]
    if ($title.Length -gt 60) { $avisos.Add("TITLE LARGO ($($title.Length)) · $rel") }
  }

  if ($raw -notmatch '<meta name="description" content="([^"]+)"') {
    $errores.Add("SIN meta description · $rel")
  } else {
    $desc = $Matches[1]
    if ($desc.Length -gt 155) { $avisos.Add("DESCRIPCIÓN LARGA ($($desc.Length)) · $rel") }
  }

  if ($raw -notmatch 'rel="canonical"') { $errores.Add("SIN canonical · $rel") }
  if ($raw -notmatch 'data-base="\.\.?"') { $errores.Add("SIN data-base en <html> · $rel") }
  if ($raw -notmatch 'name="google-site-verification"') { $avisos.Add("SIN meta de Search Console · $rel") }
  if ($raw -notmatch 'og:title') { $avisos.Add("SIN Open Graph · $rel") }
  if ($raw -notmatch 'twitter:card') { $avisos.Add("SIN Twitter Card · $rel") }
  if ($raw -notmatch 'assets/js/main\.js') { $errores.Add("NO CARGA main.js · $rel") }
  if ($raw -notmatch 'assets/css/styles\.css') { $errores.Add("NO CARGA styles.css · $rel") }

  # Canonical coherente con la ubicación real (excepto 404/gracias que igual llevan la suya)
  if ($raw -match 'rel="canonical" href="([^"]+)"') {
    $canonical = $Matches[1]
    $esperado = 'https://konfiozinc.github.io/card/' + ($rel -replace '\\', '/')
    if ($rel -eq 'index.html') { $esperado = 'https://konfiozinc.github.io/card/' }
    if ($canonical -ne $esperado -and $rel -notin @('404.html')) {
      $avisos.Add("CANONICAL DISTINTO · $rel -> $canonical")
    }
  }

  # ── 3. JSON-LD válido ─────────────────────────────────────────────
  foreach ($m in [regex]::Matches($raw, '(?s)<script type="application/ld\+json">(.*?)</script>')) {
    try { $null = $m.Groups[1].Value | ConvertFrom-Json }
    catch { $errores.Add("JSON-LD INVÁLIDO · $rel -> $($_.Exception.Message.Split([char]10)[0])") }
  }

  # ── 4. Un solo H1 ─────────────────────────────────────────────────
  $h1 = ([regex]::Matches($raw, '<h1[\s>]')).Count
  if ($h1 -eq 0) { $errores.Add("SIN <h1> · $rel") }
  elseif ($h1 -gt 1) { $errores.Add("VARIOS <h1> ($h1) · $rel") }

  # ── 5. Imágenes sin alt ───────────────────────────────────────────
  foreach ($m in [regex]::Matches($raw, '<img\b[^>]*>')) {
    if ($m.Value -notmatch '\balt=') { $errores.Add("IMG SIN alt · $rel -> $($m.Value.Substring(0, [Math]::Min(70, $m.Value.Length)))") }
  }
  $stats[$rel] = [pscustomobject]@{
    H1     = $h1
    Imgs   = ([regex]::Matches($raw, '<img\b')).Count
    KB     = [Math]::Round($f.Length / 1KB, 1)
    JSONLD = ([regex]::Matches($raw, 'application/ld\+json')).Count
  }
}

# ── 6. Sitemap: que cada <loc> exista como archivo ──────────────────
$sitemap = Join-Path $repo 'sitemap.xml'
if (Test-Path $sitemap) {
  $xml = Get-Content $sitemap -Raw -Encoding UTF8
  $urls = [regex]::Matches($xml, '<loc>([^<]+)</loc>') | ForEach-Object { $_.Groups[1].Value }
  foreach ($u in $urls) {
    $relPath = $u -replace '^https://konfiozinc\.github\.io/card/', ''
    if ($relPath -eq '') { $relPath = 'index.html' }
    if (-not (Test-Path (Join-Path $repo $relPath))) { $errores.Add("SITEMAP apunta a archivo inexistente · $u") }
  }
  Write-Host "URLs en sitemap.xml: $($urls.Count)"
} else { $errores.Add('NO EXISTE sitemap.xml') }

if (-not (Test-Path (Join-Path $repo 'robots.txt'))) { $errores.Add('NO EXISTE robots.txt') }

# ── 7. Reporte ──────────────────────────────────────────────────────
Write-Host "`n--- RESUMEN POR PÁGINA ---" -ForegroundColor Cyan
$stats.GetEnumerator() | ForEach-Object {
  Write-Host ("{0,-46} H1:{1}  imgs:{2,-3} jsonld:{3}  {4} KB" -f $_.Key, $_.Value.H1, $_.Value.Imgs, $_.Value.JSONLD, $_.Value.KB)
}

Write-Host "`n--- AVISOS ($($avisos.Count)) ---" -ForegroundColor Yellow
$avisos | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }

Write-Host "`n--- ERRORES ($($errores.Count)) ---" -ForegroundColor Red
$errores | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }

if ($errores.Count -eq 0) { Write-Host "`n✅ Sin errores: el sitio está listo para publicar.`n" -ForegroundColor Green }
else { Write-Host "`n❌ Corrige los $($errores.Count) errores antes de publicar.`n" -ForegroundColor Red; exit 1 }
