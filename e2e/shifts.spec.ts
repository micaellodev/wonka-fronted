// Varios turnos de caja en un día: abrir → cerrar y aprobar → abrir turno nuevo (misma lógica, sin esperar al día siguiente).
// Mismo entorno que integration.spec.ts (tenant desechable; admin de 6 dígitos 246813 = también código de aprobación).
import { test, expect, type Page } from '@playwright/test'

const PIN = '246813'
const pin = async (page: Page, code: string) => { for (const d of code) await page.getByRole('button', { name: `Dígito ${d}`, exact: true }).click() }
const go = (page: Page, path: string) => page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')) }, path)
const kpi = (page: Page, label: string) => page.locator('div[role=link]').filter({ has: page.getByText(label, { exact: true }) }).first()

async function login(page: Page) {
  await page.goto('/')
  await pin(page, PIN)
}
async function openShift(page: Page, amount: string) {
  // tenant nuevo: pide la apertura; si el día ya tuvo un turno cerrado (otro spec): botón "Abrir turno nuevo"
  const input = page.locator('input[type=number]')
  const again = page.getByRole('button', { name: 'Abrir turno nuevo' })
  await Promise.race([input.waitFor(), again.waitFor()])
  if (await again.isVisible().catch(() => false)) await again.click()
  await input.fill(amount)
  await page.getByRole('button', { name: 'Confirmar apertura' }).click()
  await page.waitForURL(/\/admin/)
}

test('turno 1 → cierre aprobado → turno 2 con su propia apertura', async ({ page }) => {
  await login(page)
  await openShift(page, '100')
  await expect(kpi(page, 'Apertura')).toContainText('100.00')

  // cierra el turno 1 y lo aprueba (la app cierra la sesión sola)
  await go(page, '/cash-close')
  await page.getByRole('button', { name: 'Cerrar Caja' }).click()
  await pin(page, PIN)
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 })

  // nuevo login: la caja está cerrada pero se puede abrir un turno nuevo
  await login(page)
  await expect(page.getByText('Para seguir vendiendo abre un turno nuevo.')).toBeVisible()
  await openShift(page, '50')

  await expect(kpi(page, 'Caja')).toContainText('Abierta')
  await expect(kpi(page, 'Apertura')).toContainText('50.00') // apertura del turno 2, no la del turno 1
  await expect(kpi(page, 'Saldo esperado')).toContainText('50.00')

  // el historial de cierres conserva el turno 1
  await go(page, '/admin/cashier')
  await expect(page.getByText(/[1-9]\d* cierres registrados/)).toBeVisible()
})
