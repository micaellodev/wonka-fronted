// Gestor de impresión: impresora y papel elegidos por equipo (userData/printer.json). Imprime directo, sin diálogo
// ni "guardar como PDF". Sin impresora elegida usa la predeterminada de Windows (como antes).
const { app, ipcMain, BrowserWindow } = require('electron')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

// css: ancho imprimible. 80 mm ≈ 72 mm útiles y 58 mm ≈ 48 mm (203 dpi); en hoja el ticket va centrado.
const PAPERS = {
  A4: { page: 'A4', css: 'body{width:150mm!important;margin:12mm auto!important;padding:0!important}' },
  A5: { page: 'A5', css: 'body{width:110mm!important;margin:8mm auto!important;padding:0!important}' },
  '80mm': { width: 80, css: 'body{width:72mm!important;margin:0 auto!important;padding:0!important}img{max-width:100%!important}' },
  '58mm': { width: 58, css: 'body{width:48mm!important;margin:0 auto!important;padding:0!important}img{max-width:100%!important}' },
}
const DEFAULT = { printer: '', paper: '80mm' }

// Bits de PRINTER_INFO.Status de Windows
const OFFLINE = 0x80 | 0x1000
const PROBLEMS = [[0x1, 'En pausa'], [0x2, 'Con error'], [0x8, 'Papel atascado'], [0x10, 'Sin papel'], [0x40, 'Problema de papel'], [0x400000, 'Tapa abierta']]

const configFile = () => path.join(app.getPath('userData'), 'printer.json')
const readConfig = () => {
  try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) } } catch { return { ...DEFAULT } }
}

// Electron no ve "usar impresora sin conexión" (USB desenchufada, red caída): se pregunta a Windows.
const windowsOffline = () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve({})
  const cmd = 'Get-CimInstance Win32_Printer | Select-Object Name,WorkOffline,PrinterStatus | ConvertTo-Json -Compress'
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 8000, windowsHide: true }, (err, out) => {
    if (err) return resolve({})
    try {
      const j = JSON.parse(out)
      resolve(Object.fromEntries((Array.isArray(j) ? j : [j]).map((p) => [p.Name, p.WorkOffline === true || p.PrinterStatus === 7])))
    } catch { resolve({}) }
  })
})

function setupPrinting(getWindow) {
  const anyWindow = () => getWindow() ?? BrowserWindow.getAllWindows()[0]

  async function listPrinters() {
    const w = anyWindow()
    if (!w) return []
    const [list, off] = await Promise.all([w.webContents.getPrintersAsync(), windowsOffline()])
    return list.map((p) => {
      const s = p.status | 0
      return {
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: !!p.isDefault,
        online: !((s & OFFLINE) || off[p.name]),
        problem: PROBLEMS.find(([bit]) => s & bit)?.[1] ?? null,
      }
    })
  }

  // null = se puede imprimir; texto = motivo
  async function printerProblem(cfg) {
    if (!cfg.printer) return null
    const p = (await listPrinters()).find((x) => x.name === cfg.printer)
    if (!p) return `La impresora "${cfg.printer}" no está instalada en este equipo.`
    if (!p.online) return `La impresora "${p.name}" está sin conexión.`
    return null
  }

  async function printHtml(html) {
    const cfg = readConfig()
    const problem = await printerProblem(cfg)
    if (problem) return { ok: false, error: problem }
    const paper = PAPERS[cfg.paper] ?? PAPERS['80mm']
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await win.webContents.insertCSS(`@page{margin:0}${paper.css}`)
      // Rollo: el alto se ajusta al contenido (1 px CSS = 264,583 µm) para que la impresora corte donde termina el ticket
      let pageSize = paper.page
      if (paper.width) {
        const px = await win.webContents.executeJavaScript('document.documentElement.scrollHeight')
        pageSize = { width: paper.width * 1000, height: Math.ceil(px * 264.583) + 4000 }
      }
      return await new Promise((resolve) => {
        win.webContents.print(
          { silent: true, printBackground: true, deviceName: cfg.printer, margins: { marginType: 'none' }, pageSize },
          (ok, reason) => resolve(ok ? { ok: true } : { ok: false, error: `No se pudo imprimir (${reason || 'error desconocido'}).` }),
        )
      })
    } catch (e) {
      return { ok: false, error: `No se pudo imprimir: ${e?.message ?? e}` }
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  const testHtml = (cfg, printerName) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;color:#000;margin:0;padding:10px;width:80mm}
    h1{font-size:14px;text-align:center;margin:0 0 6px}p{margin:2px 0}.box{border:1px solid #000;padding:4px;margin:8px 0;text-align:center}
    .rule{overflow:hidden;white-space:nowrap}
  </style></head><body>
    <h1>PRUEBA DE IMPRESIÓN</h1>
    <p>Impresora: ${printerName.replace(/[<>&]/g, '')}</p>
    <p>Papel: ${cfg.paper}</p>
    <p>Fecha: ${new Date().toLocaleString('es-PE')}</p>
    <div class="box">Los bordes de este recuadro deben verse completos</div>
    <div class="rule">1234567890123456789012345678901234567890</div>
    <p style="text-align:center;margin-top:8px">Si lees esto completo, la impresora está lista.</p>
  </body></html>`

  ipcMain.handle('printer:list', () => listPrinters().catch(() => []))
  ipcMain.handle('printer:get-config', () => readConfig())
  ipcMain.handle('printer:set-config', (_e, next) => {
    const cfg = {
      printer: typeof next?.printer === 'string' ? next.printer : '',
      paper: PAPERS[next?.paper] ? next.paper : DEFAULT.paper,
    }
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2))
    return cfg
  })
  ipcMain.handle('print:silent', (_e, html) => printHtml(String(html)))
  ipcMain.handle('print:test', async () => {
    const cfg = readConfig()
    const name = cfg.printer || (await listPrinters()).find((p) => p.isDefault)?.name || 'Predeterminada'
    return printHtml(testHtml(cfg, name))
  })
}

module.exports = { setupPrinting }
