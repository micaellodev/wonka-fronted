const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { setupUpdater } = require('./updater.cjs')
const { setupPrinting } = require('./printing.cjs')

const isDev = !app.isPackaged

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'icon.png'),
    width: 1920,
    height: 1080,
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    show: false, // se muestra al terminar la pantalla de carga (whenReady) o en ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Con escala de Windows alta (150-200%) el viewport en px CSS queda diminuto y la UI se recorta.
  // Se reduce el zoom para que siempre quepan al menos 1280x720 px CSS; nunca se agranda (tope 1).
  const fitZoom = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [w, h] = mainWindow.getContentSize()
    // Minimizada la ventana mide 0: un zoom de 0 lanza "zoomFactor must be greater than 0"
    if (w <= 0 || h <= 0 || mainWindow.isMinimized()) return
    mainWindow.webContents.setZoomFactor(Math.max(0.25, Math.min(1, w / 1280, h / 720)))
  }
  mainWindow.webContents.on('did-finish-load', fitZoom)
  mainWindow.on('resize', fitZoom)

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

setupPrinting(() => mainWindow)

// Ventana de progreso de actualización (arranque y botón "Actualización pendiente")
async function openSplash() {
  const splash = new BrowserWindow({ width: 500, height: 300, frame: false, resizable: false, transparent: true, hasShadow: false, icon: path.join(__dirname, 'icon.png'), webPreferences: { contextIsolation: true } })
  await splash.loadFile(path.join(__dirname, 'splash.html'))
  const onProgress = (state) => {
    if (splash.isDestroyed()) return
    splash.webContents.executeJavaScript(`set(${JSON.stringify(state)})`).catch(() => {})
  }
  return { splash, onProgress }
}

const MIN_SPLASH_MS = 3500

app.whenReady().then(async () => {
  const t0 = Date.now()
  const { splash, onProgress } = await openSplash()
  const updater = setupUpdater(() => mainWindow, openSplash)
  const installing = await updater.startup(onProgress)
  if (installing) return
  onProgress({ stage: 'load' })
  createWindow()
  // La pantalla de carga dura al menos MIN_SPLASH_MS y hasta que la app esté pintada (tope 15 s por si algo se cuelga)
  const ready = new Promise((r) => { mainWindow.once('ready-to-show', r); setTimeout(r, 15000) })
  const minimo = new Promise((r) => setTimeout(r, Math.max(0, MIN_SPLASH_MS - (Date.now() - t0))))
  await Promise.all([ready, minimo])
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  if (!splash.isDestroyed()) splash.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    mainWindow.once('ready-to-show', () => mainWindow.show())
  }
})
