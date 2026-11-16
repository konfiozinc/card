# KZ-UNIFICACION-002 · Prueba de reglas de crm_prospectos en el emulador.
# Se detiene ante cualquier fallo y muestra PASS/FAIL. No usa datos reales.
$ErrorActionPreference = 'Stop'
Write-Host '== Requisitos =='
foreach ($c in @('node','npx','java')) {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Write-Host "FAIL: falta $c"; exit 1 }
  Write-Host "  OK $c"
}
if (-not (Test-Path 'node_modules\@firebase\rules-unit-testing')) {
  Write-Host 'Instalando dependencia de pruebas en el proyecto (no global)...'
  npm install --no-save @firebase/rules-unit-testing firebase > $null
}
Write-Host '== Reglas + emulador (datos ficticios) =='
$proyectoDemo = 'demo-kz-crm-prospectos'
if ($proyectoDemo -notlike 'demo-*') { Write-Host 'FAIL: el proyecto de pruebas debe ser demo-*'; exit 1 }
$env:GCLOUD_PROJECT = $proyectoDemo
npx --yes firebase-tools emulators:exec --only firestore --project $proyectoDemo "node pruebas/probar-reglas-crm-prospectos.mjs"
if ($LASTEXITCODE -ne 0) { Write-Host 'FAIL: las reglas NO superaron las pruebas. No se publica.'; exit 1 }
Write-Host 'PASS: reglas verificadas. Todavia NO publicadas.'
Write-Host 'Publicar solo tras revisar el PASS:'
Write-Host '  npx firebase-tools deploy --only firestore:rules --project konfio-zinc'
