# Upload .next only and restart pm2 (run build-local.ps1 first)
param(
  [string]$Server = "47.106.215.66",
  [string]$User = "root",
  [string]$RemoteDir = "/opt/scm-academy",
  [string]$KeyFile = "$env:USERPROFILE\.ssh\scm_academy_deploy",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot "build-local.ps1")
}

if (-not (Test-Path ".next\BUILD_ID")) {
  throw "missing .next; run .\deploy\build-local.ps1"
}

$archive = Join-Path $root "scm-academy-next.tar.gz"
if (Test-Path $archive) { Remove-Item $archive -Force }
Write-Host "==> pack .next"
tar -czf $archive .next
$item = Get-Item $archive
Write-Host "==> $($item.Name) ($([math]::Round($item.Length / 1MB, 2)) MB)"

$sshArgs = @("-o", "StrictHostKeyChecking=accept-new")
if (Test-Path $KeyFile) {
  $sshArgs += @("-i", $KeyFile)
}
$remote = "${User}@${Server}"

Write-Host "==> scp to ${remote}:/root/scm-academy-next.tar.gz"
& scp @sshArgs $archive "${remote}:/root/scm-academy-next.tar.gz"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$remoteCmd = "set -euo pipefail; cd '$RemoteDir'; rm -rf .next; tar -xzf /root/scm-academy-next.tar.gz -C '$RemoteDir'; bash deploy/diagnose-and-start.sh"

Write-Host "==> replace remote .next and restart pm2"
& ssh @sshArgs $remote $remoteCmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "==> open http://${Server}:3000"
