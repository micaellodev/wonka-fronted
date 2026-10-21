# Levanta TODO el entorno local en una sola ventana: Postgres portable + mock APISPeru + backend + frontend.
# Uso:  .\scripts\dev.ps1        (Ctrl+C detiene todo; Postgres queda encendido)
# Logs: .dev-logs\mock.log, backend.log, frontend.log
# BD local (backend\.env.test), NUNCA backend\.env (producción).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$logs = Join-Path $root '.dev-logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$bun = (Get-Command bun -ErrorAction Stop).Source

# ── Postgres portable ───────────────────────────────────────────────
$pg = Join-Path $env:USERPROFILE 'pgsql-wonka'
$pgctl = Join-Path $pg 'pgsql\bin\pg_ctl.exe'
if (-not (Test-Path $pgctl)) {
  throw "Falta Postgres portable en $pg. Extrae los binarios de Postgres 16 en $pg\pgsql, initdb en $pg\data (puerto 54329, usuario wonka, BD wonka_dev) y luego: cd backend; bunx prisma db push; bun prisma/seed.ts (con .env.test)."
}
$pgdata = Join-Path $pg 'data'
$pgisready = Join-Path $pg 'pgsql\bin\pg_isready.exe'
& $pgisready -p 54329 *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Iniciando Postgres...'
  # Start-Process y no "& pg_ctl ... | Out-Null": el postgres hijo hereda la tubería y el script se quedaría esperando para siempre.
  Start-Process -FilePath $pgctl -ArgumentList "start -D `"$pgdata`" -l `"$(Join-Path $pg 'pg.log')`" -o `"-p 54329`"" -WindowStyle Hidden
  $up = $false
  foreach ($i in 1..60) { Start-Sleep -Milliseconds 500; & $pgisready -p 54329 *> $null; if ($LASTEXITCODE -eq 0) { $up = $true; break } }
  if (-not $up) { throw "Postgres no arrancó. Revisa $pg\pg.log." }
}

# ── Puertos libres ──────────────────────────────────────────────────
foreach ($port in 3999, 3001, 5173) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto $port ya está en uso. Cierra lo que lo ocupa (o una ejecución anterior de este script) e intenta de nuevo."
  }
}

# ── Variables del backend desde .env.test (comillas fuera) ──────────
$envVars = @{}
Get-Content (Join-Path $root 'backend\.env.test') | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  $envVars[$k.Trim()] = $v.Trim().Trim('"').Trim("'")
}
if ($envVars['DATABASE_URL'] -notmatch 'localhost|127\.0\.0\.1') {
  throw "DATABASE_URL de .env.test no es local. NUNCA arranques con la BD de producción."
}
$envVars['PORT'] = '3001'

$procs = @()
function Start-Svc($name, $dir, $arguments) {
  $p = Start-Process -FilePath $bun -ArgumentList $arguments -WorkingDirectory (Join-Path $root $dir) -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name.err.log")
  Write-Host ("  {0,-9} pid {1}" -f $name, $p.Id)
  return $p
}

try {
  Write-Host 'Iniciando servicios...'
  $procs += Start-Svc 'mock' 'backend' @('scripts/mock-apisperu.ts')

  # El backend hereda .env.test; se limpia justo después para que el frontend no lo vea.
  foreach ($k in $envVars.Keys) { Set-Item -Path "env:$k" -Value $envVars[$k] }
  $procs += Start-Svc 'backend' 'backend' @('src/index.ts')
  foreach ($k in $envVars.Keys) { Remove-Item -Path "env:$k" -ErrorAction SilentlyContinue }

  $env:VITE_API_URL = 'http://localhost:3001'
  $procs += Start-Svc 'frontend' 'fronted' @('run', 'dev', '--', '--port', '5173', '--strictPort')

  # ── Espera a que el backend responda ──────────────────────────────
  $ok = $false
  # Hasta 90 s (en equipos con poca memoria el primer arranque de bun/vite tarda); exige backend Y frontend.
  foreach ($i in 1..180) {
    Start-Sleep -Milliseconds 500
    if ($procs | Where-Object { $_.HasExited }) { break }
    try {
      # 127.0.0.1 y no localhost: el backend escucha solo en IPv4 y PowerShell 5.1 prueba primero ::1 y agota el tiempo.
      $health = (Invoke-RestMethod 'http://127.0.0.1:3001/health' -TimeoutSec 2).status -eq 'ok'
      $front = (Invoke-WebRequest 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200
      if ($health -and $front) { $ok = $true; break }
    } catch { }
  }
  if (-not $ok) {
    $why = if ($procs | Where-Object { $_.HasExited }) { 'Un servicio terminó al arrancar' } else { 'Los servicios no respondieron en 90 s' }
    Write-Host "`n$why. Últimas líneas de los logs:" -ForegroundColor Red
    foreach ($f in 'backend', 'mock', 'frontend') {
      foreach ($suffix in '.log', '.err.log') {
        $path = Join-Path $logs "$f$suffix"
        if ((Test-Path $path) -and (Get-Item $path).Length -gt 0) { Write-Host "--- $f$suffix"; Get-Content $path -Tail 8 }
      }
    }
    return
  }

  Write-Host ''
  Write-Host 'Listo.' -ForegroundColor Green
  Write-Host '  App:      http://localhost:5173   (PIN admin del seed: 060904)'
  Write-Host '  Backend:  http://localhost:3001   (swagger en /swagger)'
  Write-Host '  Mock SUNAT/APISPeru: http://localhost:3999'
  Write-Host '  Logs en .dev-logs\   |   Ctrl+C para detener todo'

  # Se queda esperando; si un servicio muere, avisa y detiene el resto.
  while (-not ($procs | Where-Object { $_.HasExited })) { Start-Sleep -Seconds 1 }
  $dead = $procs | Where-Object { $_.HasExited } | Select-Object -First 1
  Write-Host "Un servicio terminó (pid $($dead.Id), código $($dead.ExitCode)). Revisa .dev-logs\. Deteniendo el resto..." -ForegroundColor Yellow
}
finally {
  foreach ($p in $procs) { if (-not $p.HasExited) { & taskkill /PID $p.Id /T /F *> $null } }
  Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
}
