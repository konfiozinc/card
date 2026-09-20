Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = 'C:\Users\PC\Documents\KONFIO_ZINC\0-Agencia y Recursos\Agencia_Konfio_Zinc'
$logoPath = Join-Path $root 'assets\img\logos\logo.jpeg'
$outDir = Join-Path $root 'assets\img\og'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# ── Definiciones de imágenes ──────────────────────────────────────────
$defs = @(
  @{ f='og-home.png';                t='Soluciones digitales para negocios';   s='Tarjetas digitales, menús, catálogos y más' },
  @{ f='og-tarjetas-digitales.png';  t='Tarjetas Digitales Star, Pro y Elite';  s='Tu tarjeta de presentación inteligente' },
  @{ f='og-catalogos-digitales.png'; t='Catálogos Digitales';                   s='Muestra tu producto sin imprimir' },
  @{ f='og-menus-digitales.png';     t='Menús Digitales';                       s='Para restaurantes y cafeterías' },
  @{ f='og-landing-pages.png';       t='Landing Pages que convierten';          s='Diseño web enfocado en resultados' },
  @{ f='og-codigos-qr.png';          t='Códigos QR personalizados';             s='Conecta el mundo físico con el digital' },
  @{ f='og-agentes-ia.png';          t='Agentes IA 24/7';                       s='Atención automatizada para tu negocio' },
  @{ f='og-servicios.png';           t='Nuestros 6 servicios';                  s='Todo lo que tu negocio necesita' },
  @{ f='og-portafolio.png';          t='Casos de éxito reales';                 s='Marcas que ya confían en KONFÍO ZINC' },
  @{ f='og-blog.png';                t='Recursos y estrategias';                s='Aprende a hacer crecer tu negocio' },
  @{ f='og-contacto.png';            t='Hablemos de tu proyecto';               s='Agenda tu diagnóstico gratis' },
  @{ f='og-nosotros.png';            t='Conoce KONFÍO ZINC';                    s='Quiénes somos y qué nos mueve' },
  @{ f='og-aliados.png';             t='Aliados estratégicos';                  s='Juntos llegamos más lejos' },
  @{ f='og-blog-star-pro-elite.png'; t='Tarjetas Digitales: Star vs Pro vs Elite'; s='Cómo elegir el plan ideal para ti' },
  @{ f='og-blog-catalogos-menus.png';t='Catálogos y menús digitales';           s='Vende más sin imprimir' },
  @{ f='og-blog-agentes-ia.png';     t='Agentes IA para atención 24/7';         s='Responde sin contratar más personal' },
  @{ f='og-blog-medicos.png';        t='Tarjeta digital para médicos';          s='Agiliza tu agenda y capta pacientes' },
  @{ f='og-blog-restaurantes.png';   t='Menú digital para restaurantes';        s='Pedidos por WhatsApp con código QR' }
)

# ── Constantes de diseño ──────────────────────────────────────────────
$W = 1200; $H = 630
$gold = [System.Drawing.Color]::FromArgb(240,180,41)
$orange = [System.Drawing.Color]::FromArgb(249,115,22)
$cyan = [System.Drawing.Color]::FromArgb(0,229,255)
$white = [System.Drawing.Color]::FromArgb(245,245,240)
$muted = [System.Drawing.Color]::FromArgb(175,180,185)
$dark = [System.Drawing.Color]::FromArgb(10,10,10)
$black = [System.Drawing.Color]::Black

$titleFont = New-Object System.Drawing.Font 'Impact', 72, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$subFont = New-Object System.Drawing.Font 'Bahnschrift', 34, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$brandFont = New-Object System.Drawing.Font 'Bahnschrift', 30, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$urlFont = New-Object System.Drawing.Font 'Bahnschrift', 20, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)

$random = New-Object System.Random 20260922

function Wrap-Text([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [int]$maxW) {
  $words = $text -split ' '
  $lines = @(); $cur = ''
  foreach ($w in $words) {
    $test = if ($cur) { "$cur $w" } else { $w }
    $sz = $g.MeasureString($test, $font)
    if ($sz.Width -gt $maxW -and $cur) { $lines += $cur; $cur = $w } else { $cur = $test }
  }
  if ($cur) { $lines += $cur }
  return $lines
}

function New-OgImage($def) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  # Fondo degradado negro → gris muy oscuro
  $rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $black, $dark, 90)
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()

  # Resplandor suave en las esquinas (sin puntitos dispersos)
  function Add-Glow($gr, $color, $cx, $cy, $r, $alpha) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddEllipse(($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
    $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $gp
    $pgb.CenterColor = [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B)
    $pgb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
    $gr.FillEllipse($pgb, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
    $pgb.Dispose(); $gp.Dispose()
  }
  Add-Glow $g $gold 1080 120 280 44
  Add-Glow $g $cyan 90 560 320 40

  # Logo circular arriba a la izquierda
  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $side = 76
  $lx = 70; $ly = 56
  # Logo arriba a la izquierda (sin clip para evitar sobrecarga ambigua de SetClip)
  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $side = 76
  $lx = 70; $ly = 56
  $circ = New-Object System.Drawing.Rectangle $lx, $ly, $side, $side
  $g.DrawImage($logo, $circ)
  $logo.Dispose()
  $borde = New-Object System.Drawing.Pen $gold, 2
  $g.DrawRectangle($borde, $lx, $ly, $side, $side)
  $borde.Dispose()

  # Marca
  $tb = New-Object System.Drawing.SolidBrush $gold
  $g.DrawString('KONFÍO ZINC', $brandFont, $tb, ($lx + $side + 18), ($ly + 18))
  $tb.Dispose()

  # Título (con wrap)
  $maxTitleW = $W - 140
  $lines = Wrap-Text $g $def.t $titleFont $maxTitleW
  $lineH = [int]($titleFont.Height * 1.06)
  $y = 210
  $titleBrush = New-Object System.Drawing.SolidBrush $gold
  foreach ($ln in $lines) {
    $g.DrawString($ln, $titleFont, $titleBrush, 70, $y)
    $y += $lineH
  }
  $titleBrush.Dispose()

  # Subrayado degradado (dorado → naranja) bajo el título
  $ub = New-Object System.Drawing.Rectangle 72, ($y + 6), 300, 5
  $ubrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($ub, $gold, $orange, 0)
  $g.FillRectangle($ubrush, $ub)
  $ubrush.Dispose()

  # Subtítulo
  $subY = $y + 28
  $subBrush = New-Object System.Drawing.SolidBrush $white
  $g.DrawString($def.s, $subFont, $subBrush, 70, $subY)
  $subBrush.Dispose()

  # Barra inferior dorada
  $barBrush = New-Object System.Drawing.SolidBrush $gold
  $g.FillRectangle($barBrush, 0, ($H - 4), $W, 4)
  $barBrush.Dispose()

  # URL inferior derecha
  $url = 'konfiozinc.github.io/card'
  $urlSize = $g.MeasureString($url, $urlFont)
  $urlBrush = New-Object System.Drawing.SolidBrush $muted
  $g.DrawString($url, $urlFont, $urlBrush, ($W - $urlSize.Width - 34), ($H - 44))
  $urlBrush.Dispose()

  # Guardar
  $out = Join-Path $outDir $def.f
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()

  $kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
  return "$($def.f)  $kb KB"
}

foreach ($d in $defs) {
  try { New-OgImage $d } catch { "ERROR en $($d.f): $($_.Exception.Message)" }
}

# Liberar fuentes
$titleFont.Dispose(); $subFont.Dispose(); $brandFont.Dispose(); $urlFont.Dispose()
Write-Output "`nListo. $($defs.Count) imagenes generadas en assets/img/og/"
