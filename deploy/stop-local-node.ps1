# Stop Node processes that lock Prisma query_engine (dev server, etc.)
$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Host "==> stopping node processes for $root"
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmd -and $cmd -like "*$root*") {
      Write-Host "kill PID $($_.Id)"
      Stop-Process -Id $_.Id -Force
    }
  } catch {}
}
Start-Sleep -Seconds 2
Write-Host "==> done. retry .\deploy\push-next.ps1"
