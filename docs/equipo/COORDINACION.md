# Coordinación del equipo — Wonka POS

Líder/integrador: sesión principal. Baseline previo a cambios: `C:/Users/Valery/.claude/jobs/bd1eb2d1/tmp/baseline/` (usar `diff -ru` contra él; el repo no tiene commits).

## Entorno de pruebas (OBLIGATORIO)
- **Nunca** usar `backend/.env` (apunta a Railway = producción). Siempre `bun --env-file=.env.test ...` desde `backend/`.
- DB local: `postgresql://wonka:wonka@localhost:54329/wonka_dev` (Postgres embebido ya corriendo). Datos sembrados con `bun --env-file=.env.test prisma/seed.ts`.
- Tenant: `wonka_main_store_001`. PINs: Admin Demo `12345`, Cajero Demo `11111`, Admin Revisión `060904` (también su código de aprobación). Solo dev/test.
- Cada agente levanta su propio backend: `PORT=<tu puerto> bun --env-file=.env.test run src/index.ts` (la var de shell gana sobre el archivo). Puertos: pos-zona 3011, caja 3012, facturacion 3013, seguridad 3014, db-inventario 3015, qa 3016. 3001 = instancia del líder.
- APISPeru: solo mock (`APISPERU_URL` en .env.test → `http://localhost:3999/api/v1`). Jamás token real ni emisión real.
- Prohibido: `prisma migrate reset`, `db push --accept-data-loss`, `--force-reset`, tocar Railway.

## Propiedad de archivos (uno edita a la vez; si necesitas un archivo ajeno, pide el cambio al dueño vía SendMessage o anótalo abajo)
| Agente | Backend | Frontend |
|---|---|---|
| pos-zona | modules/pos/*, modules/playzone/*, modules/birthday/*, types/schemas.ts (secciones POS/PlayZone) | POSScreen, RightCheckoutDrawer, PlayZoneScreen, RegisterClientScreen, store/cartStore, store/playzoneTicketStore |
| caja | modules/cash/*, modules/dashboard/* | CashCloseScreen, CashMovementsScreen, CashCloseHistoryScreen, ReportsScreen, SalesStatisticsScreen, SalesHistoryScreen, AdminDashboardScreen, ApprovalsScreen, CashOpeningModal, CashDrawerGuard, store/cashDrawerStore, store/cashMovementStore, store/paymentLedgerStore |
| facturacion | modules/apisperu/*, modules/billing/*, scripts/mock-apisperu.ts | BillingNotesScreen, CreateBillingNoteModal, CompanySettingsScreen |
| seguridad | modules/hr/*, lib/rateLimiter.ts, lib/auth.ts (nuevo), src/index.ts (guard global) | LoginScreen, PinPad, AdminGatekeeper, AttendanceModal, EmployeesScreen, store/authStore, store/adminStore, lib/api.ts, App.tsx, TerminalShell, Splash; app `asistencia/` |
| db-inventario | prisma/schema.prisma, prisma/seed.ts, modules/inventory/*, modules/upload/*, lib/storage.ts, lib/prisma.ts | InventoryScreen |
| qa | backend/tests/* (nuevo), `controles.md` (raíz) | — (solo lee/ejecuta; reporta a dueños) |

Componentes UI compartidos (`components/ui/*`, `lib/utils`): pedir al líder.

## Direcciones SendMessage (campo `to`)
NOTA: los agentes NO pueden mensajearse directamente. Envía a `to: "main"` (líder) indicando destinatario y yo reenvío; además anota aquí en "Bloqueos".
pos-zona `a0a2c1c63dbf6aed0` · caja `a4bb5f961a1541b65` · facturacion `a79cb9fdf6560be34` · seguridad `a45ee458531693cb5` · db-inventario `aced4a556909acc50` · qa `ac68903890453d33a`

## Contratos acordados (el líder decide; cambios se anotan aquí)
1. **Auth (seguridad)**: `POST /hr/verify-pin` devuelve además `token` (HMAC firmado: workerId, tenantId, role, exp). `lib/api.ts` envía `Authorization: Bearer <token>`. Guard global en `index.ts` rechaza (401) rutas sin token salvo públicas (`/health`, `/swagger*`, `/hr/verify-pin`, `/hr/attendance`), y 403 si `tenantId` de query/body ≠ tenant del token. Rutas admin (lista en `lib/auth.ts`) requieren rol ADMIN/ADMINISTRADOR en el token. Los `adminPin` existentes en body se mantienen como 2º factor donde ya existen.
2. **PIN**: login acepta 5 o 6 dígitos. PinPad: botón "Entrar" + auto-envío al llegar a 6. Código de aprobación = 6 dígitos (sin cambios). Solo hash en DB; nada de PIN en frontend.
3. **Zona de juegos → venta (pos-zona)**: precio de tiempo configurado en backend (tenant), no confiado del cliente. Cada cargo es una línea virtual (`isVirtual=true`, `virtualSku` `pz-base-<sessionId>`/`pz-extra-<sessionId>`, `virtualLabel`), nunca Product ni stock. Aparece una sola vez en total, comprobante, cierre (caja) y reportes. Anulación de venta: restaura stock solo de líneas con `productId` real y `trackStock`.
4. **Cambios de schema**: solo db-inventario edita `schema.prisma` y corre `bunx --bun prisma db push` (no destructivo) + `prisma generate`. Pide cambios por SendMessage a db-inventario o anótalos en "Solicitudes de schema".

## Solicitudes de schema
(formato: `- [ ] agente: modelo.campo tipo — motivo`)
- [x] pos-zona: Tenant.playzoneRates Json? — tarifas zona de juegos por tenant `{durations:[{minutes,price,label}], extraPerMinute, freePerMinute}`; hasta entonces el backend usa defaults en código.
- [x] facturacion: BillingNote.sunatStatus String? (default quitado a pedido de facturacion), sunatResponse Json?, sunatXmlUrl String?, sunatCdrUrl String? — aplicado en DB local + generate (db-inventario)
- [x] db-inventario→pos-zona: PlaySession unique ahora parcial `(tenantId, wristbandCode) WHERE status='ACTIVE'` (antes impedía 2 sesiones COMPLETED con el mismo código). Sin cambios de código necesarios. SQL prod en docs/equipo/db-inventario.md
- [x] facturacion: BillingNote.sunatStatus String? @default("PENDING_SUNAT") — estado SUNAT de notas (ACEPTADA/RECHAZADA/PENDING_SUNAT) y recuperación de pendientes
- [x] facturacion: BillingNote.sunatResponse Json? — respuesta APISPeru/SUNAT de la nota
- [x] facturacion: BillingNote.sunatXmlUrl String? / BillingNote.sunatCdrUrl String? — xml/cdr de la nota

## Bloqueos / avisos entre agentes
(formato: `- agente → agente: mensaje corto`)
- pos-zona → seguridad: agregar `PUT /playzone/rates` a rutas admin en lib/auth.ts.
- pos-zona → caja/facturacion: líneas pz ahora llegan como SaleItem `isVirtual=true`, `qty=1`, `unitPrice`=monto, `virtualSku` = `pz-base-<id>`/`pz-extra-<id>`/`pz-free-<id>`, `virtualLabel` legible. Venta libre: `virtualSku` `free-sale-<ts>` y `virtualLabel` = nombre ingresado. Agrupar reportes por `virtualSku` prefijo `pz-`.
