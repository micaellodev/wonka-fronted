// Recorrido completo entre módulos con un tenant desechable (ver playwright.integration.config.ts):
//   TID=$(BASE_URL=http://localhost:3043 bun --env-file=.env.test run scripts/qa-int-tenant.ts)   (desde backend/)
//   VITE_API_URL=http://localhost:3043 VITE_TENANT_ID=$TID bunx vite --port 5183 --strictPort     (desde fronted/)
//   TID=$TID bunx playwright test -c playwright.integration.config.ts
import { test, expect, type Page } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:3043'
const TID = process.env.TID ?? ''
const ADMIN_PIN = '246813' // admin de 6 dígitos: también es su código de aprobación
const money = (n: number) => `S/ ${n.toFixed(2)}`

let token = ''
async function api(path: string, query: Record<string, string> = {}) {
  const u = new URL(path, API)
  for (const [k, v] of Object.entries({ tenantId: TID, ...query })) u.searchParams.set(k, v)
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary API JSON in test assertions
  const j: any = await r.json()
  return j.data ?? j
}
const summary = () => api('/cash/summary')

/** El auth vive en memoria: navegar por history API para no perder la sesión. */
const go = (page: Page, path: string) =>
  page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path)
const pin = async (page: Page, code: string) => { for (const d of code) await page.getByRole('button', { name: `Dígito ${d}`, exact: true }).click() }
const kpi = (page: Page, label: string) => page.locator('div[role=link]').filter({ has: page.getByText(label, { exact: true }) }).first()

async function relogin() {
  const pad = page.getByRole('button', { name: 'Dígito 1', exact: true })
  if (await pad.isVisible().catch(() => false)) { await pin(page, ADMIN_PIN); await page.waitForURL((u) => u.pathname !== '/') }
}

test.describe.configure({ mode: 'serial' })
let page: Page
test.beforeAll(async ({ browser }) => {
  expect(TID, 'definir TID (tenant desechable)').not.toBe('')
  const r = await fetch(new URL('/hr/verify-pin', API), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: TID, pin: ADMIN_PIN }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary API JSON in test assertions
  const j: any = await r.json()
  token = j.token ?? j.data?.token ?? j.meta?.token
  page = await (await browser.newContext()).newPage()
  page.on('pageerror', (e) => { throw new Error('pageerror: ' + e.message) })
})
test.afterAll(async () => { await page.close() })

test('login y apertura de caja (estado Abierta en panel)', async () => {
  await page.goto('/')
  await pin(page, ADMIN_PIN)
  await page.waitForURL(/cash-guard/)
  await page.locator('input[type=number]').fill('100')
  await page.getByRole('button', { name: 'Confirmar apertura' }).click()
  await page.waitForURL(/\/admin/)
  await expect(kpi(page, 'Caja')).toContainText('Abierta')
  await expect(kpi(page, 'Saldo esperado')).toContainText(money(100))
  await expect(kpi(page, 'Ventas hoy')).toContainText(money(0))
  expect((await summary()).cashStatus).toBe('ABIERTA')
})

test('vender producto en POS (2 × 5, efectivo): stock baja a 8', async () => {
  await go(page, '/pos')
  await page.getByRole('button', { name: /QA Cat/ }).click()
  await page.getByRole('button', { name: /Chocolate E2E/ }).click()
  await page.getByRole('button', { name: /Chocolate E2E/ }).click()
  await expect(page.getByText(money(10)).first()).toBeVisible()
  await page.getByRole('button', { name: 'COBRAR' }).click()
  await page.getByRole('button', { name: 'Efectivo', exact: true }).click()
  await page.getByPlaceholder('0.00').fill('10')
  await page.getByRole('button', { name: /Finalizar venta/ }).click()
  await expect.poll(async () => (await summary()).sales.count).toBe(1)
  const s = await summary()
  expect(s.sales.total).toBe(10)
  expect(s.sales.byKind.productos).toBe(10)
})

test('vender tiempo de niño (30 min, S/ 17.50) desde zona de juegos: sin stock, una sola vez', async () => {
  await go(page, '/playzone')
  await page.getByRole('button', { name: 'NUEVO NIÑO' }).click()
  await page.getByPlaceholder('Nombre completo *').nth(0).fill('Niño E2E')
  await page.getByPlaceholder('Edad').fill('6')
  await page.getByPlaceholder('DNI Apoderado *').fill('70123456')
  await page.getByPlaceholder('Nombre completo *').nth(1).fill('Apoderado E2E')
  await page.getByRole('button', { name: 'GUARDAR Y SELECCIONAR' }).click()
  await page.getByRole('button', { name: /Niño E2E/ }).first().click()
  await page.getByRole('button', { name: /30 min/i }).click()
  await page.getByRole('button', { name: 'INICIAR JUEGO' }).click()
  await expect(page.getByText(/Agregado a caja/)).toBeVisible()
  await go(page, '/pos')
  await expect(page.getByText(money(17.5)).first()).toBeVisible()
  await page.getByRole('button', { name: 'COBRAR' }).click()
  await page.getByRole('button', { name: 'Yape', exact: true }).click()
  await page.getByRole('button', { name: /Finalizar venta/ }).click()
  await expect.poll(async () => (await summary()).sales.count).toBe(2)
  const s = await summary()
  expect(s.sales.total).toBe(27.5)
  expect(s.sales.byKind).toMatchObject({ productos: 10, zonaJuegos: 17.5, ventaLibre: 0 })
  expect(s.sales.byMethod).toMatchObject({ efectivo: 10, yape: 17.5, tarjeta: 0 })
})

test('movimientos de caja: ingreso 20 y salida 5 (no son ventas)', async () => {
  await go(page, '/movimientos-caja')
  await page.getByRole('button', { name: 'Ingreso de dinero' }).click()
  await page.getByPlaceholder('0.00').fill('20')
  await page.locator('textarea').fill('Sencillo e2e')
  await page.getByRole('button', { name: 'Guardar Ingreso' }).click()
  await expect(page.getByText('Sencillo e2e')).toBeVisible()
  await page.getByRole('button', { name: 'Salida de dinero' }).click()
  await page.getByPlaceholder('0.00').fill('5')
  await page.locator('textarea').fill('Compra e2e')
  await page.getByRole('button', { name: /Guardar Salida/ }).click()
  await expect(page.getByText('Compra e2e')).toBeVisible()
  const s = await summary()
  expect(s.movements).toMatchObject({ in: 20, out: 5, count: 2 })
  expect(s.sales.count).toBe(2)
  expect(s.expectedCash).toBe(125)
})

test('venta libre desde POS (9, tarjeta): una sola vez, sin tocar stock', async () => {
  await go(page, '/pos')
  await page.getByRole('button', { name: 'Venta libre' }).click()
  await page.getByPlaceholder('Ej: Servicio de limpieza').fill('Limpieza E2E')
  await page.getByPlaceholder('0.00').first().fill('9')
  await page.getByRole('button', { name: 'Agregar al ticket' }).click()
  await page.getByRole('button', { name: 'COBRAR' }).click()
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click()
  await page.getByRole('button', { name: /Finalizar venta/ }).click()
  await expect.poll(async () => (await summary()).sales.count).toBe(3)
  const s = await summary()
  expect(s.sales).toMatchObject({ total: 36.5 })
  expect(s.sales.byKind).toMatchObject({ productos: 10, zonaJuegos: 17.5, ventaLibre: 9 })
  expect(s.sales.byMethod).toMatchObject({ efectivo: 10, yape: 17.5, tarjeta: 9 })
  expect(s.expectedCash).toBe(125) // tarjeta no entra al efectivo
  await go(page, '/sales-history')
  await expect(page.getByRole('row').filter({ hasText: money(9) })).toHaveCount(1)
  await expect(page.getByRole('row')).toHaveCount(4)
  await go(page, '/admin')
  await expect(kpi(page, 'Ventas hoy')).toContainText(money(36.5))
  await expect(kpi(page, 'Ventas hoy')).toContainText('3 ventas')
})

test('ajuste de stock desde Inventario (+5): no cambia cifras de caja', async () => {
  const before = await summary()
  await go(page, '/admin/inventory')
  const row = page.locator('[data-testid="product-row"][data-sku="QA-1"]')
  await expect(row.getByTestId('stock-value')).toHaveText('8')
  await row.getByTestId('product-adjust').click()
  await page.getByTestId('stock-type-ENTRADA').click()
  await page.getByTestId('stock-qty').fill('5')
  await page.getByTestId('stock-reason').fill('Reposición e2e')
  await page.getByTestId('stock-save').click()
  await expect(row.getByTestId('stock-value')).toHaveText('13')
  const after = await summary()
  expect(after.sales).toEqual(before.sales)
  expect(after.expectedCash).toBe(before.expectedCash)
  expect(after.movements).toEqual(before.movements)
})

test('historial, estadísticas, reporte de turno y panel muestran las mismas cifras', async () => {
  await go(page, '/sales-history')
  await expect(page.getByText(money(36.5)).first()).toBeVisible() // total del periodo
  await expect(page.getByRole('row')).toHaveCount(4) // cabecera + 3 ventas, sin duplicados
  await go(page, '/estadisticas-venta')
  await expect(page.getByText(money(36.5)).first()).toBeVisible()
  await expect(page.getByText(money(17.5)).first()).toBeVisible()
  await go(page, '/cash-close')
  await expect(page.getByText(money(125)).first()).toBeVisible() // esperado en efectivo
  await go(page, '/admin')
  await expect(kpi(page, 'Ventas hoy')).toContainText(money(36.5))
  await expect(kpi(page, 'Ventas hoy')).toContainText('3 ventas')
  await expect(kpi(page, 'Saldo esperado')).toContainText(money(125))
  await expect(kpi(page, 'Anuladas')).toContainText('0')
})

test('panel: enlaces con filtro llevan a pantallas que lo aplican', async () => {
  await kpi(page, 'Ventas hoy').click()
  await expect(page).toHaveURL(/\/sales-history\?date=hoy/)
  await expect(page.getByRole('row')).toHaveCount(4)
  await go(page, '/admin')
  await kpi(page, 'Anuladas').click()
  await expect(page).toHaveURL(/\/sales-history\?status=CANCELLED/)
  await expect(page.getByText('Sin ventas registradas')).toBeVisible()
  await go(page, '/admin')
  await kpi(page, 'Solicitudes').click()
  await expect(page).toHaveURL(/\/admin\/approvals/)
})

test('solicitar anulación de la venta de producto y aprobarla en Aprobaciones', async () => {
  await go(page, '/sales-history')
  await page.getByRole('row').filter({ hasText: money(10) }).getByTitle('Anular o emitir nota de crédito').click()
  await page.locator('textarea').fill('Error e2e')
  await page.getByRole('button', { name: 'Confirmar Anulación' }).click()
  await expect.poll(async () => (await summary()).pending.voids).toBe(1)
  await go(page, '/admin')
  await expect(kpi(page, 'Solicitudes')).toContainText('1')
  await go(page, '/admin/approvals')
  await expect(page.getByText(/Error e2e/)).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar' }).click()
  await pin(page, ADMIN_PIN)
  await expect.poll(async () => (await summary()).voided.count).toBe(1)
  const s = await summary()
  expect(s.sales).toMatchObject({ count: 2, total: 26.5 })
  expect(s.voided).toMatchObject({ count: 1, total: 10 })
  expect(s.pending.voids).toBe(0)
  expect(s.expectedCash).toBe(115) // 100 + 0 efectivo + 20 − 5
  await go(page, '/admin')
  await expect(kpi(page, 'Ventas hoy')).toContainText(money(26.5))
  await expect(kpi(page, 'Anuladas')).toContainText(money(10))
  await expect(kpi(page, 'Solicitudes')).toContainText('0')
  await expect(kpi(page, 'Saldo esperado')).toContainText(money(115))
  await go(page, '/sales-history')
  await expect(page.getByText(/Anulad/i).first()).toBeVisible()
})

test('cierre de caja y aprobación: Cerrada en panel e historial de cierres', async () => {
  await go(page, '/cash-close')
  const counted = page.locator('input[placeholder="0.00"]')
  await counted.nth(0).fill('115')
  await counted.nth(1).fill('17.5')
  await counted.nth(2).fill('9')
  await page.getByRole('button', { name: 'Cerrar Caja' }).click()
  await pin(page, ADMIN_PIN)
  await expect.poll(async () => (await summary()).cashStatus).toBe('CERRADA')
  const s = await summary()
  expect(s.close).toMatchObject({ status: 'APPROVED', difference: 0 })
  await relogin() // tras cerrar, la app puede cerrar la sesión
  await relogin(); await go(page, '/admin')
  await expect(kpi(page, 'Caja')).toContainText('Cerrada')
  await expect(kpi(page, 'Ventas hoy')).toContainText(money(26.5)) // cifras idénticas tras el cierre
  await relogin(); await go(page, '/cash-close')
  await expect(page.getByText('Caja Abierta')).toHaveCount(0) // la pantalla de cierre debe coincidir con el panel
  await expect(page.getByText('Cierre del turno aprobado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar Caja' })).toBeDisabled()
  await relogin(); await go(page, '/reporte-cierre-turno')
  await expect(page.getByText('Sin cierres de turno')).toHaveCount(0)
  await expect(page.getByText(money(141.5)).first()).toBeVisible() // efectivo 115 + yape 17.50 + tarjeta 9 contados
  await relogin(); await go(page, '/admin')
  await kpi(page, 'Caja').click()
  await expect(page).toHaveURL(/admin\/cashier/)
  await expect(page.getByText(money(100)).first()).toBeVisible() // apertura congelada
  await expect(page.getByRole('row').filter({ hasText: '141.50' }).last()).toBeVisible() // fila del cierre
  await expect(page.getByRole('button', { name: /Pendiente/ })).toHaveCount(0) // aprobado: sin botón de aprobar
})
