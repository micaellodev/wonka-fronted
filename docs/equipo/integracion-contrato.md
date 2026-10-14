# Integración entre módulos — contrato (líder)

Entorno: base local `postgresql://wonka:wonka@localhost:54329/wonka_dev` vía `bun --env-file=.env.test`. NUNCA `backend/.env` (producción). APISPeru solo mock (`bun run scripts/mock-apisperu.ts`, :3999). Tenant `wonka_main_store_001`; PIN admin `060904` (también código de aprobación), cajero `11111`. Puertos propios por agente (abajo). No editar `schema.prisma`: pedir al líder (SendMessage to "main").

## Principio
**Una sola fuente de verdad: el backend.** El frontend no calcula totales, saldos ni conteos a partir de estado local. Se eliminan como fuente de cifras los stores persistidos en localStorage `paymentLedgerStore` (`wonka-payment-ledger`) y `cashMovementStore` (`wonka-cash-movements`); `cashDrawerStore` queda solo como caché de UI del estado que devuelve el backend.

## Definiciones canónicas (implementadas UNA vez en `backend/src/modules/cash/summary.ts`, reutilizadas por cash, dashboard y reportes)
- **Periodo**: día Lima (`limaYmd`) o turno (desde la apertura del día hasta el cierre).
- **Venta activa**: `Sale.status != CANCELLED` (`ACTIVE` o `PENDING_SUNAT`, que es una venta válida con comprobante por enviar). **Anulada**: `CANCELLED` (cuenta solo en `voided`, nunca en ventas).
- **Líneas**: producto real (`productId` y no virtual), zona de juegos (`isVirtual && virtualSku` empieza con `pz-`), venta libre (`free-sale-`). Cada línea suma una sola vez.
- **Movimiento de caja** (`CashMovement` IN/OUT): afecta el saldo esperado; **nunca** cuenta como venta.
- **Saldo esperado** = apertura + ventas activas en efectivo + entradas − salidas.
- **Estado de caja** (exactamente uno): `NO_ABIERTA` (sin apertura hoy) · `ABIERTA` (apertura sin cierre) · `PENDIENTE` (cierre `PENDING_APPROVAL`) · `CERRADA` (cierre `APPROVED`). Etiquetas UI: "No abierta", "Abierta", "Pendiente", "Cerrada".

## Respuesta canónica `DaySummary` (`GET /cash/summary?tenantId&date?`)
```
{ date, cashStatus, opening: { amount, at, workerName } | null,
  close: { id, status, countedCash, difference, at } | null,
  sales: { count, total, byMethod: { efectivo, yape, tarjeta }, byKind: { productos, zonaJuegos, ventaLibre } },
  voided: { count, total },
  movements: { in, out, count },
  expectedCash,
  pending: { voids, closes },
  stock: { lowStock, outOfStock } }
```
`/dashboard/metrics`, `/dashboard/sales-report`, reporte de turno, historial de cierres (cifras del cierre se congelan al cerrar con estos mismos valores) y aprobaciones usan esta función. Montos en soles con 2 decimales (redondeo en backend).

## Panel admin
Cada indicador viene de `DaySummary`/`/inventory/stats` y enlaza con filtro: ventas de hoy → `/sales-history?date=hoy`; anuladas → `/sales-history?status=CANCELLED`; solicitudes pendientes → `/admin/approvals`; estado de caja → `/admin/cash-history` (o `/cash-close`); stock bajo/agotado → `/admin/inventory?stock=low|out`. Las pantallas destino leen ese query param y aplican el filtro.

## Propiedad de archivos (uno edita a la vez)
| Agente (puerto) | Backend | Frontend |
|---|---|---|
| caja (3040) — agregados y reportes | `modules/cash/*` (incl. nuevo `summary.ts`), `modules/dashboard/*` | AdminDashboardScreen, CashCloseScreen, CashMovementsScreen, CashCloseHistoryScreen, ReportsScreen, SalesStatisticsScreen, ApprovalsScreen, CashOpeningModal, CashDrawerGuard, TerminalShell, stores cashDrawer/cashMovement/paymentLedger |
| ventas (3041) — transacciones | `modules/pos/*`, `modules/playzone/*`, `modules/birthday/*` | POSScreen, RightCheckoutDrawer, SalesHistoryScreen, PlayZoneScreen, RegisterClientScreen, cartStore, playzoneTicketStore |
| seguridad-bh (3042) | `lib/auth.ts`, `modules/hr/*`, `modules/billing/*`, `modules/apisperu/*`, `modules/inventory/*` (solo bugs) | EmployeesScreen, CompanySettingsScreen, BillingNotesScreen, CreateBillingNoteModal, LoginScreen, PinPad, AdminGatekeeper, AttendanceModal, App.tsx, AdminLayout, `pages/inventory/*` (solo bugs) |
| qa-int (3043, vite 5183) | `backend/tests/integration.test.ts` | `fronted/e2e/integration.spec.ts`, `controles.md` (sección "Integración") |
Fallos en archivos ajenos: SendMessage to "main" con archivo:línea, repro, esperado vs real.

## Checklist de reglas (qa-int la mantiene en `controles.md` § Integración, con columnas UI / API-DB / Bloqueo)
1. Venta con producto: 1 vez en historial, estadísticas, ventas de hoy, reporte de turno y caja; stock baja solo si `trackStock`.
2. Zona de juegos: tarifa configurada; 1 vez en cobro, venta, caja, historial, estadísticas y reporte; sin stock.
3. Apertura/cierre: montos y estado iguales en caja, historial, aprobaciones, reporte y panel.
4. Movimientos de caja: en historial; afectan esperado y cierre; no son ventas.
5. Anulación: aparece en aprobaciones; al aprobar deja de contar, restaura solo stock descontado, se refleja 1 vez; nota de crédito si la venta estaba ACEPTADA.
6. Panel: cifras del backend, enlaces con filtro.
