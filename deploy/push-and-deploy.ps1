# 上传压缩包并在服务器执行 setup（首次）+ deploy
# 用法: 在 PowerShell 里 cd 到项目根目录后执行: .\deploy\push-and-deploy.ps1
param(
  [string]$Server = "47.106.215.66",
  [string]$User = "root",
  [string]$RemoteDir = "/opt/scm-academy",
  [string]$KeyFile = "$env:USERPROFILE\.ssh\scm_academy_deploy"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path (Join-Path $root ".next\BUILD_ID"))) {
  & (Join-Path $PSScriptRoot "build-local.ps1")
}

$archive = Join-Path $root "scm-academy-deploy.tar.gz"
& (Join-Path $PSScriptRoot "pack.ps1")

$sshArgs = @("-o", "StrictHostKeyChecking=accept-new")
if (Test-Path $KeyFile) {
  $sshArgs += @("-i", $KeyFile)
}

$remote = "${User}@${Server}"
Write-Host "==> 上传到 ${remote}:/root/scm-academy-deploy.tar.gz"
$scpResult = & scp @sshArgs $archive "${remote}:/root/scm-academy-deploy.tar.gz" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "scp 失败: $scpResult"
  exit $LASTEXITCODE
}

$remoteCmd = "set -euo pipefail; mkdir -p $RemoteDir; tar -xzf /root/scm-academy-deploy.tar.gz -C $RemoteDir; cd $RemoteDir; if ! command -v node >/dev/null 2>&1; then bash deploy/setup-server.sh; fi; bash deploy/deploy.sh"

Write-Host "==> 远程部署 $RemoteDir"
& ssh @sshArgs $remote $remoteCmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "==> 完成。浏览器打开: http://${Server}:3000"
