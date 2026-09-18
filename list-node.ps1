Get-CimInstance Win32_Process -Filter "name='node.exe'" | ForEach-Object {
  "{0}`t{1}" -f $_.ProcessId, $_.CommandLine
}
