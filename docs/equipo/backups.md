# Respaldos y restauración (Postgres)

## Respaldar
`scripts/backup.ps1` hace `pg_dump` en formato custom, descarta respaldos vacíos y conserva los últimos 14.
```powershell
$env:DATABASE_URL = '<url de producción>'
.\scripts\backup.ps1 -Dir D:\respaldos\wonka -Keep 14
.\scripts\backup.ps1 -Local        # BD local (backend\.env.test)
```
Necesita `pg_dump` en el PATH (cliente de PostgreSQL, misma versión mayor que el servidor) o el Postgres portable en `%USERPROFILE%\pgsql-wonka`.

## Programarlo (diario 02:00, Windows)
```powershell
$a = New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -File C:\Users\val\Desktop\Wonka\scripts\backup.ps1 -Dir D:\respaldos\wonka'
Register-ScheduledTask -TaskName 'WonkaBackup' -Action $a -Trigger (New-ScheduledTaskTrigger -Daily -At 2am)
```
`DATABASE_URL` debe estar como variable de entorno del usuario (no la pongas en el script ni en git). Copia la carpeta de respaldos fuera de este equipo.

## Restaurar (siempre primero en una BD vacía de prueba)
```powershell
createdb -h localhost -p 54329 -U wonka wonka_restore
pg_restore --no-owner --clean --if-exists -d "postgresql://wonka:<clave>@localhost:54329/wonka_restore" D:\respaldos\wonka\wonka-YYYYMMDD-HHMMSS.dump
```
Verifica conteos (`Sale`, `CashClose`, `Product`) antes de apuntar nada de producción a la copia. Restaurar sobre producción sobrescribe datos: hazlo solo con la app detenida y un respaldo fresco previo.
