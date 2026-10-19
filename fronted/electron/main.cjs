const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { setupUpdater } = require('./updater.cjs')

const isDev = !app.isPackaged

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})

ipcMain.on('print:silent', (event, htmlContent) => {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
  printWindow.webContents.on('did-finish-load', () => {
    printWindow.webContents.print({ silent: true, printBackground: true }, () => {
      printWindow.close()
    })
  })
})

const SPLASH_HTML = `<body style="margin:0;background:#111;color:#eee;font:14px system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;-webkit-app-region:drag">
<h3 style="margin:0 0 14px">Renzo Wonka POS</h3><div id="t">Buscando actualizaciones…</div>
<div style="width:240px;height:6px;background:#333;border-radius:3px;margin-top:12px"><div id="b" style="width:0;height:100%;background:#f5a623;border-radius:3px;transition:width .2s"></div></div></body>`

app.whenReady().then(async () => {
  const splash = new BrowserWindow({ width: 340, height: 180, frame: false, resizable: false, backgroundColor: '#111' })
  await splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`)
  const updater = setupUpdater(() => mainWindow)
  const installing = await updater.startup((pct, version) => {
    const text = version ? `Descargando ${version}…` : `Descargando actualización ${pct}%`
    splash.webContents.executeJavaScript(`t.textContent=${JSON.stringify(text)};b.style.width='${pct}%'`).catch(() => {})
  })
  if (installing) return
  createWindow()
  splash.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
