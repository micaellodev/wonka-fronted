// Gestor de impresión: impresora y papel elegidos por equipo (userData/printer.json). Imprime directo, sin diálogo
// ni "guardar como PDF". Sin impresora elegida usa la predeterminada de Windows (como antes).
const { app, ipcMain, BrowserWindow, nativeImage } = require('electron')
const { toEscPosBands, rawSendMany, diagnosticBytes } = require('./escpos.cjs')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

// css: ancho imprimible. 80 mm ≈ 72 mm útiles y 58 mm ≈ 48 mm (203 dpi); en hoja el ticket va centrado.
const PAPERS = {
  A4: { page: 'A4', css: 'body{width:150mm!important;margin:12mm auto!important;padding:0!important}' },
  A5: { page: 'A5', css: 'body{width:110mm!important;margin:8mm auto!important;padding:0!important}' },
  '80mm': { width: 80, print: 72, css: 'body{width:72mm!important;margin:0 auto!important;padding:0!important}img{max-width:100%!important}' },
  '58mm': { width: 58, print: 48, css: 'body{width:48mm!important;margin:0 auto!important;padding:0!important}img{max-width:100%!important}' },
}
const DEFAULT = { printer: '', paper: '80mm', mode: 'image', logo: 'normal' }

// Bits de PRINTER_INFO.Status de Windows
const OFFLINE = 0x80 | 0x1000
const PROBLEMS = [[0x1, 'En pausa'], [0x2, 'Con error'], [0x8, 'Papel atascado'], [0x10, 'Sin papel'], [0x40, 'Problema de papel'], [0x400000, 'Tapa abierta']]

const configFile = () => path.join(app.getPath('userData'), 'printer.json')
const log = (m) => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'printer.log'), `${new Date().toISOString()} ${m}
`) } catch { /* sin log */ } }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DATA = (html) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`

// Modo imagen (rollos): el ticket se dibuja a 203 dpi (la resolución de las térmicas) y se imprime como imagen del ancho exacto;
// los drivers térmicos la procesan mejor que texto vectorial. Devuelve un data URL PNG.
async function rasterize(html, paper, info = {}) {
  const zoom = 203 / 96 // 1 px CSS = 1 punto de la impresora a 203 dpi
  const w = Math.round((paper.print * 203) / 25.4)
  const win = new BrowserWindow({ show: false, width: w, height: 200, useContentSize: true, webPreferences: { offscreen: true } })
  try {
    await win.loadURL(DATA(html))
    // ancho exacto en px CSS (si no, sobra una fracción de punto: aparece barra de desplazamiento y se corta el borde)
    await win.webContents.insertCSS(`@page{margin:0}${paper.css}html{overflow:hidden!important}body{width:${w / zoom}px!important}`)
    win.webContents.setZoomFactor(zoom)
    await sleep(150)
    const cssH = await win.webContents.executeJavaScript('document.body.scrollHeight')
    win.setContentSize(w, Math.ceil(cssH * zoom) + 8)
    await sleep(400) // que se pinte con el nuevo tamaño
    // Posición del logo (px CSS) para poder tramarlo en el modo directo
    info.logo = await win.webContents.executeJavaScript("(() => { const e = document.querySelector('.logo-container img'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height, innerW: window.innerWidth } })()")
    return (await win.webContents.capturePage()).toDataURL()
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

// Logo del ticket: 'none' lo quita; 'light' lo achica (la trama se aplica en el modo directo)
function applyLogoMode(html, mode) {
  // Todo el ticket en negrita y con contorno, para que el texto salga tan oscuro como el QR
  const BOLD = '<style>body,body *{font-weight:700!important;-webkit-text-stroke:.4px #000}</style></head>'
  html = html.replace('</head>', BOLD)
  if (mode === 'none') return html.replace(/<div class="logo-container">[\s\S]*?<\/div>/, '')
  if (mode === 'light') return html.replace('</head>', '<style>.logo-container img{max-width:44mm!important}</style></head>')
  return html
}

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
    // Modo directo: ESC/POS crudo a la cola de la impresora (sin el driver de Windows). Solo rollos de 58/80 mm.
    if (cfg.mode === 'raw' && paper.width) {
      try {
        const name = cfg.printer || (await listPrinters()).find((p) => p.isDefault)?.name
        if (!name) return { ok: false, error: 'No hay impresora elegida ni predeterminada.' }
        const dots = Math.round((paper.print * 203) / 25.4 / 8) * 8 // ancho imprimible en puntos (576 en 80 mm, 384 en 58 mm)
        const info = {}
        const img = nativeImage.createFromDataURL(await rasterize(applyLogoMode(html, cfg.logo), paper, info)).resize({ width: dots, quality: 'best' })
        const { width, height } = img.getSize()
        // Logo liviano: trama de puntitos en la zona del logo (la mancha negra sólida es lo que hace fallar a algunas térmicas)
        const k = info.logo ? dots / info.logo.innerW : 0
        const dither = cfg.logo === 'light' && info.logo ? { x: Math.floor(info.logo.x * k), y: Math.floor(info.logo.y * k), w: Math.ceil(info.logo.w * k), h: Math.ceil(info.logo.h * k) } : null
        const bands = toEscPosBands(img.toBitmap(), width, height, { dither, lighten: 40, threshold: 200 })
        const res = await rawSendMany(name, bands)
        log(`imprimir ${cfg.paper}/raw ${width}x${height} ${bands.length} bandas logo=${cfg.logo} → ${res.ok ? 'ok' : res.error}`)
        return res
      } catch (e) {
        return { ok: false, error: `No se pudo imprimir: ${e?.message ?? e}` }
      }
    }
    const asImage = paper.width && cfg.mode !== 'text'
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    try {
      if (asImage) {
        const png = await rasterize(applyLogoMode(html, cfg.logo), paper)
        await win.loadURL(DATA(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{margin:0}html,body{margin:0;padding:0}img{display:block;width:${paper.print}mm}</style></head><body><img src="${png}"></body></html>`))
      } else {
        await win.loadURL(DATA(html))
        await win.webContents.insertCSS(`@page{margin:0}${paper.css}`)
      }
      // Rollo: página del ANCHO IMPRIMIBLE (48 mm en 58 mm, 72 mm en 80 mm: es el ancho de las formas del driver, p. ej. "Printer 58 (48mmx...)")
      // y alto = el del ticket. Sin tamaño, Chromium manda A4 y el driver encoge la página al ancho del rollo (sale una línea diminuta).
      let size = paper.page
      if (paper.width) {
        const h = await win.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)')
        size = { width: paper.print * 1000, height: Math.max(20000, Math.ceil(h * 264.583) + 5000) } // µm; 1 px CSS = 264,583 µm
      }
      const opts = { silent: true, printBackground: true, deviceName: cfg.printer, pageSize: size, margins: { marginType: 'none' } }
      return await new Promise((resolve) => {
        win.webContents.print(opts, (ok, reason) => {
          log(`imprimir ${cfg.paper}/${cfg.mode} ${JSON.stringify(size)} → ${ok ? 'ok' : reason}`)
          resolve(ok ? { ok: true } : { ok: false, error: `No se pudo imprimir (${reason || 'error desconocido'}).` })
        })
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
      mode: next?.mode === 'text' ? 'text' : next?.mode === 'raw' ? 'raw' : 'image',
      logo: next?.logo === 'none' ? 'none' : next?.logo === 'light' ? 'light' : 'normal',
    }
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2))
    return cfg
  })
  ipcMain.handle('print:silent', (_e, html) => printHtml(String(html)))
  // Diagnóstico: manda comandos ESC/POS de distintos tipos con letreros, directo a la cola (sin driver gráfico)
  ipcMain.handle('print:diagnostic', async () => {
    const cfg = readConfig()
    const problem = await printerProblem(cfg)
    if (problem) return { ok: false, error: problem }
    const name = cfg.printer || (await listPrinters()).find((p) => p.isDefault)?.name
    if (!name) return { ok: false, error: 'No hay impresora elegida ni predeterminada.' }
    const res = await rawSend(name, diagnosticBytes())
    log(`diagnostico ${name} → ${res.ok ? 'ok' : res.error}`)
    return res
  })
  ipcMain.handle('print:test', async () => {
    const cfg = readConfig()
    const name = cfg.printer || (await listPrinters()).find((p) => p.isDefault)?.name || 'Predeterminada'
    return printHtml(testHtml(cfg, name))
  })
}

module.exports = { setupPrinting, rasterize, PAPERS }
