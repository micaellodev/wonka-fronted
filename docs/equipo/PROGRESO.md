# PROGRESO — punto de retomo


## UI kit (C1)
Imports (`@/components/ui/*`, `@/lib/*`):
- `Dialog, DialogTrigger, DialogContent size="sm|md|lg|xl" (showCloseButton), DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose` from `ui/dialog` (Base UI: Esc, focus trap, aria-modal, scroll lock). Controlled: `<Dialog open onOpenChange={(o)=>...}>`. Scrim = `bg-scrim`; modals z-50, toasts z-[60].
- `Label` (`ui/label`), `Select` (native, `ui/select`), `Textarea` (`ui/textarea`), `Input`: all token-styled; error = `aria-invalid`.
- `toast.success|error|info(msg)` + `<Toaster/>` from `ui/toast` (3s, aria-live). Mount `<Toaster/>` once in App.tsx (agent D).
- `apiErrorMessage(e, fallback?)` from `lib/api-error` (Eden `e.value.message|error`, then Error.message, then fallback).
- `formatPEN(n)` = "S/ 1,234.50"; also `formatCurrency`, `formatDate`, `formatTime`, `formatDateTime` from `lib/format`. Delete local copies.
- Tokens new: `--scrim`/`bg-scrim`. Existing soft: `success-soft warning-soft danger-soft info-soft`. No `.dark` block exists in index.css yet.
- No Radix installed; Dialog uses `@base-ui/react` (already a dep).

Plan: `PLAN-MEJORAS.md`. Presupuesto de la tanda: 950k tokens (contador de la sesión al iniciar: 15.000.000 → parar en ≤14.050.000). Al agotarse: terminar la tarea en curso, actualizar este archivo y parar.

## Cómo retomar (cuando se reinicien los tokens)
1. Leer este archivo y `PLAN-MEJORAS.md`.
2. Entorno: arrancar Postgres si no corre — `C:\Users\val\pgsql-wonka\pgsql\bin\pg_ctl.exe start -D C:\Users\val\pgsql-wonka\data -o "-p 54329"`. Si la base está vacía: `cd backend && set -a && . ./.env.test && set +a && bunx prisma db push && bun prisma/seed.ts`.
3. Seguir con la primera casilla sin marcar de la ola actual. Lanzar agentes `general-purpose` con la fila de propiedad correspondiente.
4. Nunca re-hacer lo marcado. Verificar con typecheck + `bun test tests/` antes de seguir.

## Ya hecho (sesión anterior)
- [x] Caja única cajero↔admin (`cashStatusStore`, `/cash/summary`), bloqueo de ventas sin caja abierta, candado advisory venta↔cierre, test de carrera. 243 tests verdes.
- [x] Python 3.12 + graphify; hooks globales corregidos a `C:\Users\val`.

## Ola 1
- [x] A seguridad
- [x] B datos/perf
- [x] C1 primitivas UI
- [x] E tooling

## Ola 2
- [x] C2 pantallas caja/admin
- [x] D pantallas POS/zona/personal

## Ola 3 (tope ~100k tokens restantes de la tanda)
- [x] F pulido: ui/card.tsx a tokens; PlayZone inputs a ui/input; Employees alert() de credenciales -> dialog
- [x] QA + controles.md (graphify update NO corrido)

## Gasto de la tanda 1
~800k de 950k tokens (suma de informes de subagentes A,B,C1,C2,D,E + auditorías). Ola 1 y 2 completas; tests backend 255 verdes al cierre de B. TANDA 1 CERRADA: olas 1-3 completas. 266 tests backend verdes, tsc backend+frontend limpios, vite build OK. Total real ~1.0M tokens entre agentes.

## Estado por agente (nota de dónde quedó)
(cada agente anota aquí: id, qué terminó, qué falta, archivos tocados)
- B datos/perf: hecho 1-7. Índices aplicados en DB local (SQL prod en db-inventario.md); apertura bajo advisory lock; approve/delete con updateMany (409 en carrera); topes: movs sin fecha 500, ventas hoy 2000, cumpleaños 1000, rango 366d; history sin N+1; retry P2002 pulsera.
  Tests: tests/data-concurrency.test.ts (255 verdes, tsc back+front limpios). cash.e2e.ts borrado (redundante). "already approved" ahora 409 (antes 422).
- A seguridad: guard rechaza worker inactivo (cache 30s, invalida en PATCH worker), clientIp usa XFF solo con TRUSTED_PROXY=true, hr limit 1-200/fechas 400/workers take 500/dataToUpdate tipado.
  Billing/hr/apisperu ya scopean por tenantId (body/query, guard 403 si ajeno); servicios billing son internos (sin ruta por :id). Tests: tests/sec-tenant-active.test.ts. 248 verdes.
  Tocado: lib/auth.ts, hr.controller/service, .env.example (TRUSTED_PROXY). tsc mío limpio; errores en cash.service (agente B, en curso).
- C1: dialog/label/select/textarea/toast, lib/api-error, formatPEN+formatDateTime, --scrim, input restyled to tokens. tsc -b limpio. Falta: migrar pantallas (C2/D); no probado en navegador.

- E tooling: README raíz, scripts/dev.ps1+test.ps1 (sintaxis ok, no ejecutados), .github/workflows/ci.yml, .gitignore (graphify-out destrackeado, sin commit), boleta.html borrado (sin refs), .env.example completos.
  release.yml sigue en fronted/.github (inerte; no copiado: rutas sin ajustar). Falta: probar ci.yml en GitHub.
- C2: 8 pantallas + CashOpeningModal/CashDrawerGuard/AdminLayout migradas a tokens, ui/dialog, api-error, format, ui/toast. Split en pages/{cash-close,reports,sales-history}/. Filas S/0.00 falsas, columna Descuento y tarjeta USD ventas eliminadas; USD real = movimientos. tsc -b y vite build OK; no probado en navegador.
- C2: Reports/CashMovements ya no piden /cash/summary: usan cashStatusStore. Falta: <Toaster/> en App.tsx (D) o los toasts de C2 no se ven. ui/card aun usa gray-* (C1).
- D: Toaster montado en App.tsx; tokens en POS/PlayZone/Settings/Drawer/modales; Dialog en Employees/Settings/POS void/BillingNote/Attendance/Gatekeeper; POS atajos F2/F9/Ctrl+Enter + toast único; splits en pages/{pos,playzone,employees}, components/checkout. tsc -b y vite build OK (CashOpeningModal de C2 tenía errores transitorios).
- D pendiente: PlayZoneScreen aún 741 líneas y Employees ~630 (lógica con mucho estado); inputs crudos de PlayZone no migrados a ui/input; pie de recibo ("Aquí creamos sonrisas") sigue literal; alert() de credenciales en Employees; no probado en navegador.

## Bloqueos
- A → B: rutas por :id sin tenantId en query/body, el guard no las aísla; scopear con auth.tenantId (getAuth(request)): pos `GET /sales/:id`, `POST /sales/:id/void`, `POST /void/:id/resolve` (pos.service ~754 findUniqueOrThrow por id), `POST /sales/:id/email`; cash `POST /close/:id/approve`, `DELETE /movements/:id` (cash.service ~328 delete por id); inventory `/categories/:id`, `/products/:id`, `/products/:id/stock` (inventory.service ~292 update por id); playzone `/guardians/:id/children`, `/sessions/:id/complete` (~425); birthday `/:id`, `/:id/guests/:guestId`.
(formato: `- agente → dueño: pedido`)
- C1 → D: montar <Toaster/> (ui/toast) en App.tsx.

- C2 → D: montar <Toaster/> en App.tsx.
- C2 → C1: ui/card.tsx usa gray-200/white/gray-900 (pasar a tokens).
## Backlog (fuera de alcance)
- ESC/POS + apertura de cajón físico (CashCloseScreen "shortcut")
- Modo offline (cola de ventas en IndexedDB)
- Backup programado `pg_dump` + doc de restauración
- Roles finos (cajero/cocina/gerente) con mapa rol→permiso
- Smoke test contra sandbox APISPeru real
- Decidir Electron vs Tauri (hay scripts de ambos, falta `src-tauri`)
- Exportar reportes (CSV/Excel); confirmar acceso a cumpleaños desde el menú
- `Codex` no arranca: permisos de `C:\Users\val\.codex\sessions` y `thread_history_1.sqlite` (requiere admin: `takeown` + `icacls`)

## QA (ola 3)
Estado: bun test 266 pass/0 fail (16 archivos, nuevos: sec-cross-tenant-id, data-void-stock); tsc back y front limpios; vite build OK. Sin fugas cross-tenant en pos/inventory/cash/playzone.
Falta: birthday/:id y approve con id real; doble aprobación concurrente ya en data-concurrency; upload sin Supabase.
Bloqueos QA -> D: RESUELTO (verificado 2026-10-18): `<Toaster/>` montado en App.tsx:92; Esc lo da Sheet (RightCheckoutDrawer) y ui/dialog (anulación), sin handler propio necesario. Falta solo prueba en navegador.

## Próxima tanda (al reiniciar tokens)
- [ ] Probar la app en navegador/Tauri: dialogs, toasts, atajos POS (F2/F9/Esc), responsive PlayZone, aspecto de inputs tras migrar a ui/Input
- [ ] Revisar refs de línea de controles.md (archivos divididos)
- [ ] PlayZone 741 y Employees 633 líneas: seguir dividiendo
- [x] Cubrir birthday /:id y aprobar cierre (con id real) en tests cross-tenant (sec-cross-tenant-id.test.ts; 268 tests verdes, tsc back y front limpios)
- [ ] Pie de recibo "Aquí creamos sonrisas" fijo: moverlo a ajustes del tenant
- [ ] Bloque .dark en index.css (no existe)
- [ ] Aplicar SQL de índices en producción (docs/equipo/db-inventario.md) — requiere decisión del dueño
- [ ] Backlog de arriba (ESC/POS, offline, backups, roles, sandbox APISPeru, Electron vs Tauri)

## Corte 2026-10-18
Lista viva de lo que falta: `PENDIENTES.md` (reemplaza "Próxima tanda" y "Bloqueos" de arriba, ya obsoletos). Hecho en este corte: tests cross-tenant (birthday, approve), Toaster/Esc verificados, `graphify update`, contraseña de firma quitada de ACTUALIZACIONES.md.

Corte 2 (2026-10-18): prueba en navegador real (Edge/Playwright) halló y corrigió 2 bugs: (1) LoginScreen navegaba a /cash-guard 800 ms después del login aunque ya se había redirigido (te devolvía a /cash-guard→/admin); (2) el panel admin mostraba cifras viejas hasta 15 s tras aprobar una anulación (ahora refresca al entrar). También: botón "Cancelar orden" sin nombre accesible, specs desactualizados (`inventory`, `integration`), nuevo `e2e/ui-keys.spec.ts`. 25 pruebas de navegador + 269 de backend verdes.

Corte 3 (2026-10-18): modo oscuro con toggle; export CSV del historial de ventas; SQL de producción consolidado en `produccion-pendiente.sql` (no aplicado); 27 pruebas de navegador (integration 10, inventory 10, ui-keys 7) + 269 backend verdes. Fuera de alcance por decisión/hardware: ESC/POS, offline, roles finos, sandbox APISPeru.

Corte 4 (2026-10-18 noche): Electron + auto-actualización (electron-updater), roles finos (permissions.ts), export CSV/Excel en 7 pantallas, Tauri eliminado. Detalle en PENDIENTES.md.
