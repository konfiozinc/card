# Inserta <script src=".../assets/js/push.js" defer></script> antes de </body>
# en todas las paginas publicas del sitio, con la ruta relativa correcta.
# No toca el panel admin (ya tiene su propio boton de push).
$raiz = "C:\Users\usuario29\Documents\KONFIO_ZINC\6-LANDING-PAGES\Konfio-Zinc-Web"
$etiquetaBase = '<script src="{0}assets/js/push.js" defer></script>'

$archivos = Get-ChildItem $raiz -Recurse -File -Filter *.html |
  Where-Object { $_.FullName -notmatch '\\admin\\|\\node_modules\\|\\\.git\\' }

$utf8Estricto = New-Object System.Text.UTF8Encoding($false, $true)   # lanza error si no es UTF-8 valido
$cp1252 = [System.Text.Encoding]::GetEncoding(1252)

$tocados = 0; $saltados = 0
foreach ($f in $archivos) {
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  $esUtf8 = $true
  try { $txt = $utf8Estricto.GetString($bytes) }
  catch { $txt = $cp1252.GetString($bytes); $esUtf8 = $false }

  if ($txt -match 'push\.js') { $saltados++; continue }
  if ($txt -notmatch '(?i)</body>') { $saltados++; continue }

  # profundidad relativa a la raiz del sitio
  $rel = $f.FullName.Substring($raiz.Length).TrimStart('\')
  $partes = $rel -split '\\'
  $prefijo = ''
  for ($i = 1; $i -lt $partes.Count; $i++) { $prefijo += '../' }

  $etiqueta = $etiquetaBase -f $prefijo
  # insertar antes del ULTIMO </body>
  $idx = $txt.LastIndexOf('</body>')
  $nuevo = $txt.Substring(0, $idx) + $etiqueta + "`r`n" + $txt.Substring($idx)

  if ($esUtf8) {
    [System.IO.File]::WriteAllText($f.FullName, $nuevo, (New-Object System.Text.UTF8Encoding($false)))
  } else {
    [System.IO.File]::WriteAllText($f.FullName, $nuevo, $cp1252)
  }
  "  + {0}  ({1})" -f $rel, $(if ($esUtf8) { 'utf8' } else { 'cp1252' })
  $tocados++
}
"`n{tocados} paginas conectadas · {saltados} saltadas (ya tenian el modulo o no son HTML completo)" -f $tocados, $saltados
