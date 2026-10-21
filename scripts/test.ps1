# tsc backend + tsc frontend + bun test contra un backend propio en puerto libre (.env.test, BD local).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location "$root\backend"; bunx tsc --noEmit; if ($LASTEXITCODE) { exit 1 }
Set-Location "$root\fronted"; bunx tsc -b; if ($LASTEXITCODE) { exit 1 }
Set-Location "$root\backend"
$l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $l.Start(); $port = $l.LocalEndpoint.Port; $l.Stop()
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; Set-Item "env:$k" ($v.Trim('"')) }
$env:PORT = "$port"
$mock = Start-Process bun -ArgumentList 'scripts/mock-apisperu.ts' -PassThru -WindowStyle Hidden
$api = Start-Process bun -ArgumentList 'src/index.ts' -PassThru -WindowStyle Hidden
try {
  Start-Sleep 5
  $env:BASE_URL = "http://localhost:$port"
  bun test tests/
  $code = $LASTEXITCODE
} finally { Stop-Process -Id $api.Id, $mock.Id -Force -ErrorAction SilentlyContinue }
exit $code
