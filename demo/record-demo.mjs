// Graba un video de demo del sistema (Edge + Playwright) con subtítulos. Datos: backend/scripts/demo-seed.ts.
// Preparar (ver demo/README.md):  backend :3043 (+ mock APISPeru :3999), vite :5183 con VITE_TENANT_ID=demo_renzo_wonka.
// Uso:  bun demo/record-demo.mjs            → demo/salida/demo-wonka.webm
import { chromium } from '../fronted/node_modules/playwright-core/index.mjs'
import { mkdirSync, renameSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'salida'); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
const BASE = process.env.DEMO_URL ?? 'http://localhost:5183'
const SLOW = Number(process.env.DEMO_SLOW ?? 450)   // ms entre acciones: ritmo de lectura para el cliente
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// Narración: duraciones generadas por generar-voz.py. Cada escena espera a que termine su línea de voz.
const durFile = path.join(here, 'audio', 'duraciones.json')
const DUR = existsSync(durFile) ? JSON.parse(readFileSync(durFile, 'utf8')) : {}
const timeline = []
let T0 = 0

const browser = await chromium.launch({ channel: 'msedge', slowMo: SLOW, args: ['--disable-web-security', '--window-size=1366,768'] })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: out, size: { width: 1366, height: 768 } }, acceptDownloads: true, locale: 'es-PE' })
T0 = Date.now()
const p = await ctx.newPage()
p.on('pageerror', (e) => console.error('pageerror:', e.message))

// ── Subtítulos sobre la app ─────────────────────────────────────────
async function cap(title, sub = '', ms = 2200, say = '') {
  await p.evaluate(([t, s]) => {
    let el = document.getElementById('demo-cap')
    if (!el) {
      el = document.createElement('div'); el.id = 'demo-cap'
      el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;max-width:82%;padding:14px 26px;border-radius:14px;background:rgba(17,17,20,.92);color:#fff;font:600 22px/1.3 Manrope,system-ui,sans-serif;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.35);pointer-events:none;transition:opacity .25s'
      document.body.appendChild(el)
    }
    el.innerHTML = `<div>${t}</div>` + (s ? `<div style="font-weight:500;font-size:16px;opacity:.8;margin-top:4px">${s}</div>` : '')
    el.style.opacity = '1'
  }, [title, sub])
  if (say && DUR[say]) { timeline.push({ id: say, at: Date.now() - T0 }); ms = Math.max(ms, DUR[say] * 1000 + 450) }
  await wait(ms)
}
const hideCap = () => p.evaluate(() => { const e = document.getElementById('demo-cap'); if (e) e.style.opacity = '0' })
const go = async (path_) => { await p.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')) }, path_); await wait(900) }
const digits = async (code) => { for (const d of code) await p.getByRole('button', { name: `Dígito ${d}`, exact: true }).click() }
async function toCategories() {
  const back = p.getByRole('button', { name: /Volver a categorías/ })
  if (await back.isVisible().catch(() => false)) await back.click()
}
async function login(pin) {
  await digits(pin)
  if (pin.length < 6) await p.getByRole('button', { name: 'Entrar' }).click()
}
async function openShift(amount) {
  const input = p.locator('input[type=number]'), again = p.getByRole('button', { name: 'Abrir turno nuevo' })
  await Promise.race([input.waitFor(), again.waitFor()])
  if (await again.isVisible().catch(() => false)) { await cap('La caja anterior está cerrada: se abre un turno nuevo', 'Varios turnos por día, cada uno cuadra solo lo suyo'); await again.click() }
  await input.fill(String(amount))
  await p.getByRole('button', { name: 'Confirmar apertura' }).click()
}

// ═════════ 1. Inicio ═════════
await p.goto(BASE + '/')
await p.waitForSelector('button[aria-label^="Dígito"], button:has-text("Dígito")', { timeout: 20000 }).catch(() => undefined)
await cap('Renzo Wonka POS', 'Ventas, caja, zona de juegos e inventario en un solo sistema', 3200, 'intro')
await cap('Cada trabajador entra con su PIN', 'Cajero: Luis Paredes', 1800, 'login')
await login('22222')
await cap('Apertura de caja', 'Antes de vender se registra el efectivo inicial', 1500, 'apertura')
await openShift(150)
await p.waitForURL(/\/pos/, { timeout: 15000 })

// ═════════ 2. Venta rápida ═════════
await cap('Punto de venta', 'Catálogo por categorías, búsqueda y favoritos', 2200, 'pos')
await p.getByRole('button', { name: /Snacks/ }).click()
await p.getByRole('button', { name: /Papas fritas/ }).click()
await p.getByRole('button', { name: /Papas fritas/ }).click()
await p.getByRole('button', { name: /Pop corn/ }).click()
await p.getByRole('button', { name: /Volver a categorías/ }).click()
await p.getByRole('button', { name: /Bebidas/ }).click()
await p.getByRole('button', { name: /Gaseosa personal/ }).click()
await p.getByRole('button', { name: /Gaseosa personal/ }).click()
await cap('El ticket se arma con un toque por producto', 'Controla el stock en tiempo real', 2400, 'ticket')
await p.getByRole('button', { name: 'COBRAR' }).click()
await cap('Cobro en efectivo, Yape o tarjeta', 'Calcula el vuelto automáticamente', 1800, 'cobro')
await p.getByRole('button', { name: 'Efectivo', exact: true }).click()
await p.getByPlaceholder('0.00').fill('50')
await wait(1200)
await p.getByRole('button', { name: /Finalizar venta/ }).click()
await cap('Venta registrada', 'Se descuenta el stock y se imprime el recibo', 2200, 'venta_ok')

// Segunda venta: boleta electrónica con Yape
await toCategories()
await p.getByRole('button', { name: /Comida/ }).click()
await p.getByRole('button', { name: /Hot dog/ }).click()
await p.getByRole('button', { name: /Nuggets/ }).click()
await p.getByRole('button', { name: 'COBRAR' }).click()
await p.getByRole('button', { name: 'Yape', exact: true }).click()
await p.getByRole('button', { name: 'Boleta', exact: true }).click()
await cap('Boleta electrónica con envío a SUNAT', 'También factura con consulta de RUC y DNI', 2600, 'boleta')
await p.getByRole('button', { name: /Finalizar venta/ }).click()
await cap('Comprobante emitido', '', 2200)

// ═════════ 3. Zona de juegos ═════════
await p.getByRole('button', { name: 'Tiempos', exact: true }).click()
await cap('Zona de juegos', 'Control de tiempo por niño, con pulsera numerada', 2400, 'juegos')
await p.getByPlaceholder('DNI apoderado').fill('45871236')
await p.getByPlaceholder('DNI apoderado').press('Enter')
await cap('Se busca al apoderado por DNI y aparecen sus hijos', '', 2200, 'dni')
await p.getByRole('button', { name: /Mateo Salazar/ }).click()
await p.getByRole('button', { name: /1 Hora/ }).click()
await cap('Se elige la tarifa y se inicia el juego', 'Las tarifas son configurables', 2000, 'tarifa')
await p.getByRole('button', { name: /INICIAR JUEGO/i }).click()
await cap('Se genera el código de pulsera', 'El cobro del tiempo pasa solo al ticket de caja', 2800)
await p.getByRole('button', { name: 'Caja', exact: true }).click()
await cap('El tiempo de juego ya está en el ticket', 'Se cobra junto con cualquier otro producto', 2400, 'juego_caja')
await p.getByRole('button', { name: 'COBRAR' }).click()
await p.getByRole('button', { name: 'Yape', exact: true }).click()
await p.getByRole('button', { name: /Finalizar venta/ }).click()
await cap('Venta de juego registrada', '', 2000)

// ═════════ 4. Movimientos de caja ═════════
await p.getByRole('button', { name: 'Movimientos de caja', exact: true }).click()
await cap('Movimientos de caja', 'Ingresos y salidas de efectivo con motivo', 2000, 'movs')
await p.getByRole('button', { name: /Salida de dinero/ }).click()
await p.getByPlaceholder('0.00').fill('20')
await p.getByPlaceholder(/Pago a proveedor/).fill('Compra de bolsas y servilletas')
await p.getByRole('button', { name: /Guardar Salida/ }).click()
await cap('Cada movimiento queda registrado y afecta el efectivo esperado', '', 2600)

// ═════════ 5. Administrador ═════════
await p.getByTitle('Cerrar sesión').click()
await cap('Panel de administración', 'Mónica Rojas — rol Administrador', 1800)
await login('246813')
await p.waitForURL(/\/admin/, { timeout: 15000 })
await cap('Resumen del día en tiempo real', 'Ventas, anuladas, apertura y saldo esperado de caja', 3200, 'admin')
await p.getByRole('link', { name: 'Inventario', exact: true }).click()
await cap('Inventario', 'Stock, mínimos, movimientos, importación desde Excel', 3000, 'inventario')
await p.getByRole('link', { name: 'Historial de ventas', exact: true }).click()
await cap('Historial de ventas', 'Filtros, anulaciones con aprobación y notas de crédito', 2600, 'historial')
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Exportar Excel/ }).click()])
await cap('Exporta a Excel o CSV con un clic', dl.suggestedFilename(), 2600)
await go('/estadisticas-venta')
await cap('Estadísticas de venta', 'Totales por método de pago y ticket promedio', 3000, 'stats')
await go('/admin/employees')
await cap('Empleados, roles y asistencia', 'Cada rol ve solo lo que le corresponde', 3000, 'empleados')

// Modo oscuro
await p.getByRole('button', { name: 'Modo oscuro' }).click()
await cap('Modo oscuro', 'Para trabajar cómodo de noche', 2400, 'oscuro')
await p.getByRole('button', { name: 'Modo claro' }).click()

// Roles: gerente
await p.getByRole('button', { name: /Salir/ }).click()
await cap('Roles con permisos distintos', 'Gerente: reportes e inventario, sin acceso a la configuración de la empresa', 2600, 'roles')
await login('33333')
await p.waitForURL(/\/admin/, { timeout: 15000 })
await cap('El Gerente no ve "Empresa" ni la gestión de empleados', '', 3000)
await p.getByRole('button', { name: /Salir/ }).click()

// ═════════ 6. Cierre de caja y nuevo turno ═════════
await cap('Cierre de caja', 'El efectivo se cuenta y el administrador aprueba el cierre', 2400)
await login('246813')
await p.waitForURL(/\/admin/, { timeout: 15000 })
await go('/cash-close')
await cap('El sistema calcula lo esperado por método de pago', 'Solo se ingresa lo que se contó físicamente', 3000, 'cierre')
await p.getByRole('button', { name: 'Cerrar Caja' }).click()
await cap('Cierre con aprobación del administrador', 'Código de 6 dígitos', 1800, 'aprobacion')
await digits('246813')
await cap('Turno cerrado y aprobado', '', 2500)
await p.waitForURL((u) => u.pathname === '/', { timeout: 20000 })
await cap('¿Otro turno el mismo día?', 'Se abre uno nuevo, con su propia apertura y su propio cuadre', 2600, 'turno2')
await login('246813')
await openShift(100)
await p.waitForURL(/\/admin/, { timeout: 15000 })
await cap('Turno 2 abierto', 'Las cifras del turno parten de cero; el día acumula', 3200)

await cap('Renzo Wonka POS', 'Ventas · Caja · Juegos · Inventario · Reportes', 3500, 'outro')
await hideCap()
const video = p.video()
await ctx.close()            // el video se finaliza al cerrar el contexto
await browser.close()
const dest = path.join(out, 'demo-wonka.webm')
renameSync(await video.path(), dest)
writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ duracionMs: Date.now() - T0, voz: timeline }, null, 1))
console.log('Video:', dest, '| voces en timeline:', timeline.length)
