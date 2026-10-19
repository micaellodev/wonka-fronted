// Roles finos en navegador: GERENTE (PIN 33333) y COCINA (PIN 44444) del tenant desechable (scripts/qa-int-tenant.ts).
// Mismo entorno que integration.spec.ts. Cada rol entra con su PIN en una página nueva.
import { test, expect, type Page } from '@playwright/test'

async function enter(page: Page, pin: string) {
  await page.goto('/')
  for (const d of pin) await page.getByRole('button', { name: `Dígito ${d}`, exact: true }).click()
  if (pin.length < 6) await page.getByRole('button', { name: 'Entrar' }).click() // 6 dígitos envían solos
  const opening = page.locator('input[type=number]')
  const blocked = page.getByRole('button', { name: 'Panel admin' }) // caja ya cerrada hoy (otro spec del mismo tenant)
  await Promise.race([page.waitForURL(/\/(admin|pos)/), opening.waitFor(), blocked.waitFor()])
  if (await opening.isVisible().catch(() => false)) {
    await opening.fill('100')
    await page.getByRole('button', { name: 'Confirmar apertura' }).click()
  } else if (await blocked.isVisible().catch(() => false)) {
    await blocked.click()
  }
  await page.waitForURL(/\/admin/)
}
const go = (page: Page, path: string) => page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')) }, path)
const navLink = (page: Page, name: string) => page.getByRole('link', { name, exact: true })

test('GERENTE: ve inventario, empleados y aprobaciones, pero no Empresa; no crea empleados', async ({ page }) => {
  await enter(page, '33333')
  for (const n of ['Inventario', 'Empleados', 'Aprobaciones']) await expect(navLink(page, n)).toBeVisible()
  await expect(navLink(page, 'Empresa')).toHaveCount(0)
  await go(page, '/admin/company')
  await expect(page).toHaveURL(/\/admin$/) // sin permiso: vuelve al panel
  await go(page, '/admin/employees')
  await expect(page.getByRole('columnheader', { name: 'Rol' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Nuevo Empleado/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
})

test('COCINA: solo inventario en modo lectura; sin empleados, empresa ni aprobaciones', async ({ page }) => {
  await enter(page, '44444')
  await expect(navLink(page, 'Inventario')).toBeVisible()
  for (const n of ['Empleados', 'Empresa', 'Aprobaciones', 'Reportes']) await expect(navLink(page, n)).toHaveCount(0)
  await go(page, '/admin/employees')
  await expect(page).toHaveURL(/\/admin$/)
  await go(page, '/admin/inventory')
  await expect(page.getByTestId('tab-productos')).toBeVisible()
  await expect(page.getByTestId('product-new')).toHaveCount(0)
  await expect(page.getByTestId('product-edit')).toHaveCount(0)
})
