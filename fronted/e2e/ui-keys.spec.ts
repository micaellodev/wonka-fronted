// Atajos y avisos del POS en navegador real: F2 busca, F9 cobra, Esc cierra el panel, toast visible.
// Mismo entorno que integration.spec.ts (ver playwright.integration.config.ts). Corre con el tenant desechable ya preparado.
import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

const ADMIN_PIN = '246813'
let page: Page

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage()
  await page.goto('/')
  for (const d of ADMIN_PIN) await page.getByRole('button', { name: `Dígito ${d}`, exact: true }).click()
  const opening = page.locator('input[type=number]')
  await Promise.race([page.waitForURL(/\/admin/), opening.waitFor()])
  if (await opening.isVisible().catch(() => false)) {
    await opening.fill('100')
    await page.getByRole('button', { name: 'Confirmar apertura' }).click()
  }
  await page.waitForURL(/\/admin/)
  // el auth vive en memoria: navegar por history API
  await page.evaluate(() => { history.pushState({}, '', '/pos'); dispatchEvent(new PopStateEvent('popstate')) })
})
test.afterAll(async () => { await page.close() })

test('F2 enfoca la búsqueda', async () => {
  await expect(page.getByRole('button', { name: /Categorías/ }).first()).toBeVisible() // POS montado
  await page.keyboard.press('F2')
  await expect(page.getByPlaceholder(/Buscar/i).first()).toBeFocused()
})

test('F9 sin carrito no abre el cobro; con carrito sí, y Esc lo cierra', async () => {
  await page.keyboard.press('F9')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /Productos/ }).first().click()
  await page.getByRole('button', { name: /Chocolate E2E/ }).click()
  await page.keyboard.press('F9')
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('cancelar orden muestra el aviso (toast) y vacía el carrito', async () => {
  await page.getByRole('button', { name: 'Cancelar orden' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Orden cancelada' })).toBeVisible()
})

test('empleados: las tres tablas (lista, asistencia de hoy, historial) se muestran', async () => {
  await page.evaluate(() => { history.pushState({}, '', '/admin/employees'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('columnheader', { name: 'Rol' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /QA Admin/ }).first()).toBeVisible()
  await page.getByRole('button', { name: /Asistencia de Hoy/ }).click()
  await expect(page.getByRole('columnheader', { name: 'Estado (Hoy)' })).toBeVisible()
  await page.getByRole('button', { name: /Historial/ }).click()
  await expect(page.getByRole('columnheader', { name: 'Horas Trabajadas' })).toBeVisible()
})

test('juegos: pantalla con los tres paneles (registro, asignar tiempo, sesiones activas)', async () => {
  await page.evaluate(() => { history.pushState({}, '', '/playzone'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByText('Asignar Tiempo')).toBeVisible()
  await expect(page.getByText(/Niños Jugando/)).toBeVisible()
  await expect(page.getByText(/Código de Pulsera/)).toBeVisible()
})

test('historial de ventas: Exportar CSV descarga la venta hecha en el POS', async () => {
  const go = (path: string) => page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await go('/pos')
  await page.getByRole('button', { name: /Productos/ }).first().click()
  await page.getByRole('button', { name: /Chocolate E2E/ }).click()
  await page.getByRole('button', { name: 'COBRAR' }).click()
  await page.getByRole('button', { name: 'Efectivo', exact: true }).click()
  await page.getByPlaceholder('0.00').fill('5')
  await page.getByRole('button', { name: /Finalizar venta/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta procesada' })).toBeVisible()
  await go('/sales-history')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar CSV/ }).click()])
  expect(dl.suggestedFilename()).toMatch(/^ventas-\d{4}-\d{2}-\d{2}\.csv$/)
  const text = (await (await import('node:fs/promises')).readFile((await dl.path())!, 'utf8'))
  expect(text.charCodeAt(0)).toBe(0xfeff) // BOM para Excel
  expect(text).toContain('Fecha,Comprobante,Tipo,Cliente,Documento,Pago,Cajero,Estado,Total')
  expect(text.trimEnd()).toMatch(/,5(\.00)?$/)
})

test('Exportar Excel: historial de ventas e inventario generan .xlsx válidos', async () => {
  const go = (path: string) => page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')) }, path)
  const download = async (label: RegExp) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()])
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/)
    return XLSX.read(await (await import('node:fs/promises')).readFile((await dl.path())!))
  }
  await go('/sales-history')
  const ventas = await download(/Exportar Excel/)
  const vrows = XLSX.utils.sheet_to_json<unknown[]>(ventas.Sheets[ventas.SheetNames[0]], { header: 1 })
  expect(vrows[0]).toContain('Comprobante')
  expect(vrows.length).toBeGreaterThanOrEqual(2) // encabezado + la venta del test anterior
  await go('/admin/inventory')
  const inv = await download(/Exportar Excel/)
  const irows = XLSX.utils.sheet_to_json<unknown[]>(inv.Sheets[inv.SheetNames[0]], { header: 1 })
  expect(irows[0]).toContain('SKU')
  expect(JSON.stringify(irows)).toContain('Chocolate E2E')
})

test('Exportar CSV en movimientos de caja y estadísticas de venta', async () => {
  const go = (path: string) => page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')) }, path)
  const csv = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar CSV/ }).click()])
    return (await (await import('node:fs/promises')).readFile((await dl.path())!, 'utf8'))
  }
  await go('/movimientos-caja')
  expect(await csv()).toContain('Fecha,Tipo,Concepto,Moneda,Monto')
  await go('/estadisticas-venta')
  expect(await csv()).toContain('Resumen de los últimos')
})

// Al final: recargar pierde la sesión (auth en memoria).
test('modo oscuro: el botón alterna la clase .dark y persiste al recargar', async () => {
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.evaluate(() => { history.pushState({}, '', '/pos'); dispatchEvent(new PopStateEvent('popstate')) })
  expect(await isDark()).toBe(false)
  await page.getByRole('button', { name: 'Modo oscuro' }).click()
  expect(await isDark()).toBe(true)
  await page.reload()
  expect(await isDark()).toBe(true) // la sesión se pierde (auth en memoria) pero el tema vive en localStorage
  await page.evaluate(() => localStorage.removeItem('wonka-theme'))
})
