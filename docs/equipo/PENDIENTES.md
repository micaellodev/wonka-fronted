# Pendientes — Wonka POS (corte 2026-10-18, noche)

Estado: backend 281 tests verdes (con mock APISPeru :3999), 32 pruebas de navegador (Edge/Playwright: `integration` 10, `inventory` 10, `ui-keys` 9, `roles` 2, `shifts` 1), `tsc` back y front limpios, `vite build` OK. Contexto: `PROGRESO.md`, `PLAN-MEJORAS.md`, `controles.md`.

## Hecho en este corte (para no repetir)
- **Escritorio = Electron (decidido)** con **auto-actualización estilo Discord** (`electron-updater`): `fronted/ACTUALIZACIONES.md`. Probado en local de punta a punta (detecta y descarga). Se quitó todo Tauri (`@tauri-apps/*`, script, `Splash.tsx`, `release.yml`). Electron pasó a `.cjs` (el proyecto es `"type": "module"`).
- **Roles finos**: `backend/src/lib/permissions.ts` (mapa rol→permiso por nombre: ADMIN/ADMINISTRADOR todo; GERENTE = reportes, inventario ver/editar, aprobaciones, notas C/D, movimientos de caja, ver empleados, tarifas; sin empresa ni gestión de empleados; COCINA = solo ver inventario; resto = cajero). El guard lo hace cumplir (403) y `verify-pin` devuelve `permissions`. Frontend: `lib/permissions.ts` (`useCan`), menú/panel/rutas filtrados, inventario y empleados en solo-lectura sin permiso. Tests: `tests/roles-permissions.test.ts`, `e2e/roles.spec.ts`.
- **Exportar CSV y Excel (.xlsx)**: componente `ExportButtons` en Historial de ventas, Movimientos de caja, Estadísticas de venta, Cierres de caja (admin), Reporte de cierre de turno, Inventario (todos los productos filtrados) y Movimientos de inventario. Excel carga SheetJS bajo demanda; CSV neutraliza fórmulas.
- Modo oscuro, pie de recibo configurable, backup `pg_dump`, SQL de producción consolidado (detalle en `PROGRESO.md`).

- **Varios turnos de caja por día** (sin cambiar la lógica de un turno): un turno = apertura → cierre; tras aprobar el cierre se abre otro el mismo día (`openCashDrawer`/`currentShift` en `backend/src/modules/cash`). El resumen trae `shift` (cifras del turno) además de `sales`/`voided` (del día, para el panel). Con una sola apertura todo es idéntico a antes. Tests: `tests/cash-shifts.test.ts`, `e2e/shifts.spec.ts`. **Requiere en producción** `DROP INDEX "cash_closes_tenantId_closedDate_workerId_key"` (ya en `produccion-pendiente.sql`).

## Necesitan una persona
- [ ] **Elegir dónde alojar las actualizaciones** y publicar la primera versión: define `WONKA_UPDATE_URL` (carpeta HTTPS: R2/S3/Supabase Storage/GitHub Releases) y corre `bun run electron:release`; instalar esa primera versión a mano en cada caja (las 1.0.0 ya instaladas no traen el actualizador). Ver `fronted/ACTUALIZACIONES.md`.
- [ ] **Firma de código del instalador** (certificado): recomendado en producción; hoy va sin firmar. No probado: reinicio+instalación real (`quitAndInstall`) ni descarga diferencial.
- [ ] **Aplicar SQL en producción**: `docs/equipo/produccion-pendiente.sql` (probado en BD local: sintaxis, idempotencia y `db push` en sync). Con backup previo y ANTES de desplegar el backend nuevo. Incluye `receiptFooter`. No se aplicó: sin credenciales de producción.
- [ ] **Asignar roles reales**: crear en Empleados los roles `GERENTE` / `COCINA` (nombre en mayúsculas exacto) y asignarlos; revisar que el reparto de permisos es el que quieres (se edita en `backend/src/lib/permissions.ts`).
- [ ] **Programar el respaldo** (`scripts/backup.ps1`, guía en `docs/equipo/backups.md`) y copiarlo fuera del equipo.
- [ ] **Revisión visual humana**: modo oscuro en pantallas no capturadas (cierres, reportes, notas, modales), responsive de PlayZone, Ctrl+Enter, impresión real del recibo, el instalador empaquetado.
- [ ] **Llave de Tauri**: ya no aplica (Tauri eliminado; la contraseña nunca salió de este equipo ni llegó a un remoto). Opcional: borrar de la historia local el commit `1de7dd7` que la contiene.
- [ ] **Codex no arranca**: permisos de `C:\Users\val\.codex\sessions` y `thread_history_1.sqlite` (admin: `takeown` + `icacls`).
- [ ] Probar `.github/workflows/ci.yml` en GitHub (no hay remoto configurado).

## Diferidos con motivo
- [ ] **Dividir más PlayZone/Employees** (ya 599 y 500 líneas): extraer hooks de estado y formularios (muchas props). Hacerlo con las pruebas de navegador como red.
- [ ] Revisar referencias de línea de `controles.md` (archivos movidos) y sumar filas de roles, exportar y modo oscuro.
- [ ] Roles por negocio editables desde la UI (hoy mapa fijo en código por nombre de rol): mover a una tabla `RolePermission`.
- [ ] Las rutas de trabajador (POS, caja, juegos) siguen abiertas a cualquier rol; los roles finos solo gobiernan back-office.

## Backlog de producto (necesita hardware, credenciales o diseño)
- [ ] ESC/POS + apertura de cajón físico (necesita impresora/cajón para verificar).
- [ ] Modo offline (cola de ventas): riesgo con la numeración SUNAT; requiere diseño.
- [ ] Smoke test contra sandbox real de APISPeru (requiere token).
- [ ] Subida de imágenes sin Supabase devuelve 503 (bloqueado en pruebas).

## Cómo retomar
1. Postgres: `C:\Users\val\pgsql-wonka\pgsql\bin\pg_ctl.exe start -D C:\Users\val\pgsql-wonka\data -o "-p 54329"` (no usar `-w`: cuelga el shell).
2. Backend de pruebas: `cd backend && set -a && . ./.env.test && set +a && PORT=3016 bun src/index.ts`; mock: `bun scripts/mock-apisperu.ts`.
3. Tests: `BASE_URL=http://localhost:3016 bun test tests/`. Sin el mock fallan 6 de `seg-fact` en `beforeAll` (no son bugs).
4. Navegador: cabecera de `fronted/playwright.integration.config.ts` (tenant desechable con `backend/scripts/qa-int-tenant.ts`, incluye PIN 33333 GERENTE y 44444 COCINA). Si no hay Chromium de Playwright, usar `channel: 'msedge'`. Al reiniciar Vite, mata el anterior por puerto (`netstat -ano | findstr :5183`).
5. Typecheck: `cd backend && bunx tsc --noEmit`; `cd fronted && bunx tsc -b`.
6. Tras cambiar código: `graphify update .`.
