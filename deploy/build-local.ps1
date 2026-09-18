# Local production build (server does not run next build)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> local build (webpack)"
$env:NODE_OPTIONS = "--max-old-space-size=4096"
npm run build:local
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "build failed. If you see EPERM on query_engine-windows.dll.node:"
  Write-Host "  1) stop npm run dev / close Cursor terminal running the app"
  Write-Host "  2) run: .\deploy\stop-local-node.ps1"
  Write-Host "  3) retry: .\deploy\build-local.ps1"
  exit $LASTEXITCODE
}
if (-not (Test-Path ".next\BUILD_ID")) {
  throw "missing .next\BUILD_ID (build did not finish)"
}
Write-Host "==> done. next: .\deploy\push-next.ps1"
