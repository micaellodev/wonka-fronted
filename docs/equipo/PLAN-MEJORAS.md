# Plan de mejoras — Wonka POS

Origen: 3 auditorías de solo lectura (backend, frontend, producto/tooling) del 2026-10-17. Estado vivo en `PROGRESO.md`. Reglas de entorno y propiedad de archivos: `COORDINACION.md` (siguen vigentes).

## Reglas para todo agente
- Voz caveman: reportes ≤150 palabras, sin relleno. Código y comandos exactos.
- Ponytail: cambio mínimo que resuelve completo. Sin features no pedidas.
- Entorno: Postgres local `localhost:54329` (ya sembrado). Backend propio: `cd backend && set -a && . ./.env.test && set +a && PORT=<puerto> bun src/index.ts`. Mock APISPeru :3999 (`bun scripts/mock-apisperu.ts`). Tests: `BASE_URL=http://localhost:<puerto> bun test tests/`. NUNCA `backend/.env`. Prohibido `migrate reset`, `--accept-data-loss`, tocar producción.
- Typecheck: backend `bunx tsc --noEmit`; frontend (en `fronted/`) `bunx tsc -b`. Deben quedar limpios.
- Solo editar archivos de tu propiedad. Necesitas otro → anótalo en `PROGRESO.md` > Bloqueos.
- Al terminar (o al llegar a tu tope de tokens): marca casillas en `PROGRESO.md`, deja nota de dónde quedaste. Nada de datos inventados.

## Olas y propiedad

### Ola 1 (en paralelo, archivos disjuntos)
| ID | Alcance | Propiedad |
|---|---|---|
| A seguridad | Tenant check siempre (billing y rutas por `:id` sin `tenantId`); guard comprueba `Worker.isActive`; `limit`/fechas validados en hr; tipar `dataToUpdate`; confianza en `X-Forwarded-For` por env | `lib/auth.ts`, `lib/rateLimiter.ts`, `modules/billing/*`, `modules/hr/*`, `modules/apisperu/*`, `src/index.ts` |
| B datos/perf | Índices (Sale `(tenantId,status,sunatStatus,createdAt)`, SaleItem `saleId`/`virtualSku`, Attendance `(tenantId,checkIn)`, PlaySession `(tenantId,startTime)`); aprobar cierre y borrar movimiento con `updateMany` condicional; tope/paginación en listas (birthday, movimientos, ventas, dashboard); history sin N+1; unique de apertura por día; reintento P2002 en pulsera; mover `cash.e2e.ts` a tests | `prisma/*`, `modules/cash/*`, `modules/pos/*`, `modules/dashboard/*`, `modules/birthday/*`, `modules/playzone/*`, `modules/inventory/*`, `modules/upload/*`, `lib/prisma.ts`, `lib/storage.ts` |
| C1 primitivas UI | `ui/dialog` (Radix, Esc, focus trap, role=dialog), `ui/label`, `ui/select`, `ui/textarea`, toast único, `lib/api-error.ts`, uso único de `lib/format` (quitar `formatPEN`/`money` duplicados al migrar), tokens faltantes | `fronted/src/components/ui/*`, `fronted/src/lib/*`, `index.css` |
| E tooling | README raíz, script `dev` que levanta todo, CI raíz (`tsc`, `bun test` con mock), `.gitignore` (`graphify-out/`, `pgsql*`), quitar `boleta.html` o plantilla desde settings, `.env.example` completos | raíz, `.github/`, `scripts/` |

### Ola 2 (tras C1)
| ID | Alcance | Propiedad |
|---|---|---|
| C2 pantallas caja/admin | Migrar a tokens (sin grises/hex crudos), `Dialog`, `api-error`, `format`; quitar filas "S/ 0.00" falsas; dividir archivos >600 líneas | `CashCloseScreen`, `CashMovementsScreen`, `CashCloseHistoryScreen`, `ReportsScreen`, `SalesStatisticsScreen`, `SalesHistoryScreen`, `AdminDashboardScreen`, `ApprovalsScreen`, `CashOpeningModal`, `CashDrawerGuard`, `AdminLayout` |
| D pantallas POS/zona/personal | Igual para POS (tarjetas como `<button>`, foco en búsqueda, atajos de teclado), checkout, PlayZone (sidebar colapsable), Employees, CompanySettings, BillingNotes, Login; anchos fijos → responsive | `POSScreen`, `RightCheckoutDrawer`, `PlayZoneScreen`, `RegisterClientScreen`, `EmployeesScreen`, `CompanySettingsScreen`, `BillingNotesScreen`, `CreateBillingNoteModal`, `LoginScreen`, `PinPad`, `AdminGatekeeper`, `AttendanceModal`, `TerminalShell`, `App.tsx`, `store/*` |

### Ola 3
| ID | Alcance |
|---|---|
| QA | Tests nuevos: cross-tenant por `:id`, doble aprobación concurrente, topes de paginación, anulación/restauración de stock, upload/birthday; actualizar `controles.md`; correr suites + typechecks; `graphify update .` |

### Fuera de alcance (anotar, no hacer sin pedido)
ESC/POS y cajón físico, modo offline con IndexedDB, backups programados, roles finos (cajero/cocina/gerente), prueba contra sandbox real de APISPeru, elegir Electron vs Tauri. Son proyectos grandes; quedan en `PROGRESO.md` > Backlog.

## Criterio de hecho
Suites backend verdes, ambos typechecks limpios, nada de cifras inventadas en pantallas, un solo sistema de modales/toasts/formatters, caja consistente cajero↔admin (ya hecho).
