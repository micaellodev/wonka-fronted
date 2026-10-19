// Auto-actualización estilo Discord: al abrir la app, una pantalla de carga con progreso descarga e instala la versión
// nueva y reabre sola (startup). Con la app ya en uso, revisa cada 30 min, descarga en segundo plano y avisa; se instala
// al reiniciar (o al cerrar). En uso nunca reinicia solo: una venta en curso no se interrumpe.
// Solo actúa en la app instalada y compilada con URL de actualizaciones (scripts/release.mjs → resources/app-update.yml).
const { app, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const CHECK_EVERY_MS = 30 * 60 * 1000

function setupUpdater(getWindow) {
  const log = (msg) => {
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), `${new Date().toISOString()} ${msg}\n`) } catch { /* sin log */ }
  }
  const send = (payload) => getWindow()?.webContents.send('update:status', payload)

  ipcMain.handle('app:version', () => app.getVersion())
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    log('updater desactivado (no empaquetado o sin app-update.yml)')
    return { startup: async () => false }
  }

  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} }

  autoUpdater.on('update-available', (i) => { log(`disponible ${i.version}`); send({ state: 'downloading', version: i.version }) })
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => { log(`descargada ${i.version}`); send({ state: 'ready', version: i.version }) })
  autoUpdater.on('error', (e) => log(`error: ${e?.message ?? e}`))

  ipcMain.on('update:install', () => autoUpdater.quitAndInstall())

  const check = () => autoUpdater.checkForUpdates().catch((e) => log(`check falló: ${e?.message ?? e}`))

  // true = se está instalando (la app se cierra y reabre sola). Sin red o sin feed, a los 10 s sigue normal.
  const startup = async (onProgress) => {
    autoUpdater.on('download-progress', (p) => onProgress(Math.round(p.percent)))
    try {
      const res = await Promise.race([autoUpdater.checkForUpdates(), new Promise((r) => setTimeout(r, 10000))])
      if (res?.isUpdateAvailable) {
        onProgress(0, res.updateInfo.version)
        await res.downloadPromise
        log('instalando al arrancar')
        autoUpdater.quitAndInstall(true, true)
        return true
      }
    } catch (e) { log(`startup falló: ${e?.message ?? e}`) }
    setInterval(check, CHECK_EVERY_MS)
    return false
  }
  return { startup }
}

module.exports = { setupUpdater }
