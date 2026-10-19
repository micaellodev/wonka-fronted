import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

const RUN = Date.now().toString(36).toUpperCase()
const SKU = `E2E-${RUN}`
const NAME = `Producto E2E ${RUN}`
const CAT = `Cat E2E ${RUN}`
const CAT2 = `Cat E2E ed ${RUN}`

async function login(page: Page) {
  await page.goto('/')
  for (const d of '060904') await page.getByRole('button', { name: `Dígito ${d}` }).click()
  // admin: /cash-guard (con modal de apertura si la caja del día no está abierta) → /admin
  const opening = page.locator('input[type=number]')
  await Promise.race([page.waitForURL(/\/admin/), opening.waitFor()])
  if (await opening.isVisible().catch(() => false)) {
    await opening.fill('100')
    await page.getByRole('button', { name: 'Confirmar apertura' }).click()
  }
  await page.waitForURL(/\/admin/)
  await page.getByText("Inventario", { exact: true }).first().click()
  await expect(page.getByTestId('tab-productos')).toBeVisible()
}
const row = (page: Page, sku: string) => page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)
const search = async (page: Page, q: string) => { await page.getByTestId('filter-search').fill(q) }
const num = async (page: Page, id: string) => Number(await page.getByTestId(id).innerText())

test.describe.configure({ mode: 'serial' })
let page: Page

test.beforeAll(async ({ browser }) => { page = await (await browser.newContext({ acceptDownloads: true })).newPage(); await login(page) })
test.afterAll(async () => { await page.close() })

test('categorías: crear, editar, eliminar', async () => {
  await page.getByTestId('tab-categorias').click()
  await page.getByTestId('category-new').click()
  await page.getByTestId('category-name').fill(CAT)
  await page.getByTestId('category-save').click()
  const card = page.getByTestId('category-card').filter({ hasText: CAT })
  await expect(card).toBeVisible()
  await card.hover()
  await card.getByTestId('category-edit').click({ force: true })
  await page.getByTestId('category-name').fill(CAT2)
  await page.getByTestId('category-save').click()
  const card2 = page.getByTestId('category-card').filter({ hasText: CAT2 })
  await expect(card2).toBeVisible()
  await card2.hover()
  await card2.getByTestId('category-edit').click({ force: true })
  await page.getByTestId('category-delete').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('category-card').filter({ hasText: CAT2 })).toHaveCount(0)
  // dejar una categoría para los productos
  await page.getByTestId('category-new').click()
  await page.getByTestId('category-name').fill(CAT)
  await page.getByTestId('category-save').click()
  await expect(page.getByTestId('category-card').filter({ hasText: CAT })).toBeVisible()
})

test('crear producto con stock inicial y mínimo', async () => {
  await page.getByTestId('tab-productos').click()
  await page.getByTestId('product-new').click()
  await page.getByTestId('product-name').fill(NAME)
  await page.getByTestId('product-sku').fill(SKU)
  await page.getByTestId('product-category').selectOption({ label: CAT })
  await page.getByTestId('product-price').fill('4.5')
  await page.getByTestId('product-stock').fill('10')
  await page.getByTestId('product-minstock').fill('3')
  await page.getByTestId('product-save').click()
  await search(page, SKU)
  await expect(row(page, SKU)).toHaveCount(1)
  await expect(row(page, SKU).getByTestId('stock-value')).toHaveText('10')
})

test('indicadores clicables filtran', async () => {
  const active = await num(page, 'stat-active-value')
  expect(active).toBeGreaterThan(0)
  await page.getByTestId('stat-low').click()
  await expect(page.getByTestId('filter-stock')).toHaveValue('low')
  await page.getByTestId('stat-out').click()
  await expect(page.getByTestId('filter-stock')).toHaveValue('out')
  await page.getByTestId('stat-active').click()
  await expect(page.getByTestId('filter-stock')).toHaveValue('all')
})

test('búsqueda y filtros', async () => {
  await search(page, SKU.toLowerCase())
  await expect(row(page, SKU)).toHaveCount(1)
  await search(page, 'zzz-no-existe-' + RUN)
  await expect(page.getByTestId('products-empty')).toBeVisible()
  await search(page, SKU)
  await page.getByTestId('filter-category').selectOption({ label: CAT })
  await expect(row(page, SKU)).toHaveCount(1)
  await page.getByTestId('filter-stock').selectOption('low')
  await expect(row(page, SKU)).toHaveCount(0)
  await page.getByTestId('filter-stock').selectOption('all')
  await page.getByTestId('filter-status').selectOption('inactive')
  await expect(row(page, SKU)).toHaveCount(0)
  await page.getByTestId('filter-status').selectOption('active')
  await expect(row(page, SKU)).toHaveCount(1)
  await page.getByTestId('filter-category').selectOption({ index: 0 })
})

test('editar producto', async () => {
  await row(page, SKU).getByTestId('product-edit').click()
  await expect(page.getByTestId('product-sku')).toBeDisabled()
  await page.getByTestId('product-name').fill(NAME + ' ed')
  await page.getByTestId('product-minstock').fill('12')
  await page.getByTestId('product-save').click()
  await expect(row(page, SKU).getByTestId('product-name-cell')).toHaveText(NAME + ' ed')
  // stock 10 <= mínimo 12 => aparece en stock bajo
  await page.getByTestId('filter-stock').selectOption('low')
  await expect(row(page, SKU)).toHaveCount(1)
  await page.getByTestId('filter-stock').selectOption('all')
})

test('desactivar y activar', async () => {
  await row(page, SKU).getByTestId('product-toggle').click()
  await page.getByTestId('confirm-ok').click()
  await expect(row(page, SKU)).toHaveCount(0) // filtro por defecto: activos
  await page.getByTestId('filter-status').selectOption('inactive')
  await expect(row(page, SKU).getByTestId('product-status')).toHaveText('Inactivo')
  await row(page, SKU).getByTestId('product-toggle').click()
  await page.getByTestId('confirm-ok').click()
  await expect(row(page, SKU)).toHaveCount(0)
  await page.getByTestId('filter-status').selectOption('active')
  await expect(row(page, SKU).getByTestId('product-status')).toHaveText('Activo')
})

test('ajustar stock: entrada, salida inválida, corrección', async () => {
  const open = () => row(page, SKU).getByTestId('product-adjust').click()
  await open()
  await page.getByTestId('stock-type-ENTRADA').click()
  await page.getByTestId('stock-qty').fill('5')
  await page.getByTestId('stock-reason').fill('compra e2e')
  await expect(page.getByTestId('stock-result')).toHaveText('15')
  await page.getByTestId('stock-save').click()
  await expect(row(page, SKU).getByTestId('stock-value')).toHaveText('15')

  await open()
  await page.getByTestId('stock-type-SALIDA').click()
  await page.getByTestId('stock-qty').fill('999')
  await page.getByTestId('stock-reason').fill('salida inválida')
  await expect(page.getByTestId('stock-save')).toBeDisabled()
  await expect(page.getByTestId('stock-modal')).toContainText('no puede superar el stock actual')
  await page.getByTestId('stock-cancel').click()
  await expect(row(page, SKU).getByTestId('stock-value')).toHaveText('15')

  await open()
  await page.getByTestId('stock-type-CORRECCION').click()
  await page.getByTestId('stock-qty').fill('7')
  await page.getByTestId('stock-reason').fill('conteo e2e')
  await page.getByTestId('stock-save').click()
  await expect(row(page, SKU).getByTestId('stock-value')).toHaveText('7')
})

test('movimientos muestran los registros', async () => {
  await page.getByTestId('tab-movimientos').click()
  const sel = page.getByTestId('mov-filter-product')
  const v = await sel.locator('option', { hasText: SKU }).first().getAttribute('value')
  await sel.selectOption(v!)
  await expect(page.getByTestId('movement-row')).toHaveCount(3)
  await expect(page.locator('[data-testid="movement-row"][data-type="CORRECCION"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="movement-row"][data-type="ENTRADA"]').getByTestId('movement-stock')).toContainText('10 → 15')
  await page.getByTestId('mov-filter-type').selectOption('ENTRADA')
  await expect(page.getByTestId('movement-row')).toHaveCount(1)
})

test('importar Excel: plantilla, vista previa, confirmar, resumen', async () => {
  await page.getByTestId('tab-productos').click()
  await page.getByTestId('import-open').click()
  const dl = page.waitForEvent('download')
  await page.getByTestId('import-template').click()
  expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/)

  const ws = XLSX.utils.json_to_sheet([
    { sku: `${SKU}-I1`, nombre: 'Imp uno', categoria: CAT, precio: 2, stock: 6, stock_minimo: 2 },
    { sku: `${SKU}-I2`, nombre: 'Imp dos', categoria: CAT, precio: 3, stock: 0 },
    { sku: `${SKU} BAD`, nombre: 'Malo espacio', categoria: CAT, precio: 3 },
    { sku: `${SKU}-I4`, nombre: '', categoria: CAT, precio: 3 },
  ])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos')
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
  await page.getByTestId("import-file").setInputFiles({ name: "import.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer })
  await expect(page.getByTestId('import-row')).toHaveCount(4)
  await expect(page.locator('[data-testid="import-row"].text-destructive')).toHaveCount(2)
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('import-summary')).toContainText('2')
  await page.getByTestId('import-cancel').click()
  await search(page, `${SKU}-I`)
  await expect(page.getByTestId('product-row')).toHaveCount(2)
  await expect(row(page, `${SKU}-I1`).getByTestId('stock-value')).toHaveText('6')
})

test('indicador stock bajo: el número coincide con el filtro', async () => {
  const low = await num(page, 'stat-low-value')
  await page.getByTestId('stat-low').click()
  await expect(page.getByTestId('filter-stock')).toHaveValue('low')
  await expect(page.getByTestId('pager-total')).toContainText(String(low))
})
