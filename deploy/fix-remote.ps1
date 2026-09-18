# Site down but SSH works: upload diagnose script and start app
param(
  [string]$Server = "47.106.215.66",
  [string]$User = "root",
  [string]$RemoteDir = "/opt/scm-academy",
  [string]$KeyFile = "$env:USERPROFILE\.ssh\scm_academy_deploy"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$sshArgs = @("-o", "StrictHostKeyChecking=accept-new")
if (Test-Path $KeyFile) { $sshArgs += @("-i", $KeyFile) }
$remote = "${User}@${Server}"

& scp @sshArgs (Join-Path $PSScriptRoot "diagnose-and-start.sh") "${remote}:${RemoteDir}/deploy/diagnose-and-start.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& ssh @sshArgs $remote "chmod +x '${RemoteDir}/deploy/diagnose-and-start.sh' && bash '${RemoteDir}/deploy/diagnose-and-start.sh'"
exit $LASTEXITCODE
