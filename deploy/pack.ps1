# 本地打包（PowerShell，无需 Git Bash）
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$out = "scm-academy-deploy.tar.gz"
if (Test-Path $out) { Remove-Item $out -Force }
# 若本地已 npm run build，会带上 .next，服务器可跳过构建
tar -czf $out `
  --exclude=node_modules `
  --exclude=.git `
  --exclude="*.log" `
  --exclude="*.err" `
  --exclude=.devserver* `
  --exclude=tsconfig.tsbuildinfo `
  --exclude=scm-academy-deploy.tar.gz `
  .
$item = Get-Item $out
Write-Host "==> 已打包: $($item.FullName) ($([math]::Round($item.Length / 1MB, 2)) MB)"
if (-not (Test-Path ".next\BUILD_ID")) {
  Write-Warning "未包含 .next，服务器将无法启动。请先运行 .\deploy\build-local.ps1"
}
Write-Host "==> 全量上传: .\deploy\push-and-deploy.ps1"
Write-Host "==> 仅传 .next: .\deploy\push-next.ps1"
