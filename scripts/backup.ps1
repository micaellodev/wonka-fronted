# Respaldo de Postgres con pg_dump (formato custom) + retención. Uso:
#   $env:DATABASE_URL = '<url de produccion>'; .\scripts\backup.ps1 [-Dir D:\respaldos\wonka] [-Keep 14]
# Local: .\scripts\backup.ps1 -Local   (usa el Postgres portable de pgsql-wonka, puerto 54329)
param([string]$Dir = (Join-Path $env:USERPROFILE 'respaldos-wonka'), [int]$Keep = 14, [switch]$Local)
$ErrorActionPreference = 'Stop'
$pgdump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgdump) { $pgdump = Join-Path $env:USERPROFILE 'pgsql-wonka\pgsql\bin\pg_dump.exe' }
if (-not (Test-Path $pgdump)) { throw 'pg_dump no encontrado (instala PostgreSQL client o usa pgsql-wonka).' }
if ($Local) { $url = ((Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env.test') | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', '').Trim('"') } else { $url = $env:DATABASE_URL }
if (-not $url) { throw 'Define $env:DATABASE_URL (o usa -Local).' }
$url = $url -replace '\?schema=\w+', ''   # pg_dump no entiende ?schema= de Prisma
New-Item -ItemType Directory -Force $Dir | Out-Null
$file = Join-Path $Dir ("wonka-{0:yyyyMMdd-HHmmss}.dump" -f (Get-Date))
& $pgdump --no-password --format=custom --no-owner --file $file $url
if ($LASTEXITCODE -ne 0) { Remove-Item $file -ErrorAction SilentlyContinue; throw "pg_dump falló ($LASTEXITCODE)" }
if ((Get-Item $file).Length -lt 1KB) { Remove-Item $file; throw 'Respaldo vacío; descartado.' }
Get-ChildItem $Dir -Filter 'wonka-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item
Write-Host "OK $file ($([math]::Round((Get-Item $file).Length/1KB)) KB). Conservados: $Keep."
