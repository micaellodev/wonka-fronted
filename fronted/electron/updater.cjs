// Auto-actualización estilo Discord: al abrir la app, una pantalla de carga con progreso descarga e instala la versión
// nueva y reabre sola (startup). Con la app ya en uso, revisa cada 30 min, descarga en segundo plano y avisa; se instala
// al reiniciar (o al cerrar). En uso nunca reinicia solo: una venta en curso no se interrumpe.
// Solo actúa en la app instalada y compilada con URL de actualizaciones (scripts/release.mjs → resources/app-update.yml).
const { app, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

// Cada minuto: latest.yml pesa ~600 bytes y R2 no cobra descargas, así el aviso aparece casi al publicar la versión.
const CHECK_EVERY_MS = 60 * 1000

// releaseNotes viene de latest.yml (texto) o, según el proveedor, como lista de { note }
const notesOf = (i) => (Array.isArray(i?.releaseNotes) ? i.releaseNotes.map((n) => n.note).join('\n') : i?.releaseNotes) || undefined
// Peso del paquete completo (latest.yml: packages.x64.size en nsis-web). La descarga real puede ser menor: electron-updater baja solo los bloques que cambiaron.
const sizeOf = (i) => i?.packages?.x64?.size ?? i?.files?.[0]?.size ?? undefined

function setupUpdater(getWindow, openSplash) {
  const log = (msg) => {
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), `${new Date().toISOString()} ${msg}\n`) } catch { /* sin log */ }
  }
  // lastStatus: el renderer lo pide al montar (si recargó, se perdió el aviso 'ready' y el botón no aparecía o quedaba viejo)
  let lastStatus = null
  const send = (payload) => {
    lastStatus = payload
    const w = getWindow()
    if (w && !w.isDestroyed()) w.webContents.send('update:status', payload)
  }

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:get-status', () => lastStatus)
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    log('updater desactivado (no empaquetado o sin app-update.yml)')
    return { startup: async () => false }
  }

  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // con una revisión por minuto, el registro no guarda las que no encuentran nada
  autoUpdater.logger = { info: (m) => { if (!/Checking for update|is not available/.test(String(m))) log(m) }, warn: log, error: log, debug: () => {} }

  // busy: hay una descarga en curso o una versión ya lista; no revisar de nuevo hasta que falle
  let busy = false
  let pendingVersion, pendingNotes, pendingSize, downloaded = false
  autoUpdater.on('update-available', (i) => { busy = true; pendingVersion = i.version; pendingNotes = notesOf(i); pendingSize = sizeOf(i); log(`disponible ${i.version}`); send({ state: 'downloading', version: i.version, notes: pendingNotes }) })
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent), version: pendingVersion, notes: pendingNotes }))
  autoUpdater.on('update-downloaded', (i) => { downloaded = true; log(`descargada ${i.version}`); send({ state: 'ready', version: i.version, notes: notesOf(i) ?? pendingNotes }) })
  // sin 'error' en el estado, el botón quedaba visible aunque la descarga hubiera fallado
  autoUpdater.on('error', (e) => { busy = false; log(`error: ${e?.message ?? e}`); if (!downloaded) send({ state: 'error' }) })

  // Botón "Actualización pendiente": oculta la app, muestra la ventana de progreso (espera la descarga si aún corre) e instala.
  // (true, true): instalación invisible y la app se vuelve a abrir sola; sin esto salía el instalador de Electron y no reabría
  let installingNow = false
  ipcMain.on('update:install', async () => {
    if (installingNow) return
    installingNow = true
    const { splash, onProgress } = await openSplash()
    getWindow()?.hide()
    const alProgreso = (p) =>
      onProgress({ stage: 'download', percent: Math.round(p.percent), transferred: p.transferred, total: p.total, speed: p.bytesPerSecond, version: pendingVersion, notes: pendingNotes, size: pendingSize })
    autoUpdater.on('download-progress', alProgreso)
    try {
      onProgress({ stage: 'download', percent: downloaded ? 100 : 0, version: pendingVersion, notes: pendingNotes, size: pendingSize })
      if (!downloaded) {
        const waiting = new Promise((resolve, reject) => {
          autoUpdater.once('update-downloaded', resolve)
          autoUpdater.once('error', reject)
        })
        waiting.catch(() => {})
        // Sin descarga en curso (falló antes) esperar colgaba la app oculta para siempre: se vuelve a buscar
        if (!busy) {
          const r = await autoUpdater.checkForUpdates()
          if (!r?.isUpdateAvailable) throw new Error('no hay actualización disponible')
        }
        await waiting
      }
      onProgress({ stage: 'install', version: pendingVersion, notes: pendingNotes, size: pendingSize })
      await new Promise((r) => setTimeout(r, 1200)) // que se vea el 100% antes de cerrar
      log('instalando desde el botón')
      autoUpdater.quitAndInstall(true, true)
    } catch (e) {
      log(`instalar falló: ${e?.message ?? e}`)
      autoUpdater.removeListener('download-progress', alProgreso)
      installingNow = false
      if (!downloaded) send({ state: 'error' })
      if (!splash.isDestroyed()) splash.close()
      getWindow()?.show()
    }
  })

  const check = () => busy ? undefined : autoUpdater.checkForUpdates().catch((e) => log(`check falló: ${e?.message ?? e}`))

  // true = se está instalando (la app se cierra y reabre sola). Sin red o sin feed, a los 10 s sigue normal.
  const startup = async (onProgress) => {
    // Este oyente escribe en la ventana de carga: hay que quitarlo al terminar, o una descarga posterior en segundo plano
    // lo dispara con esa ventana ya cerrada ("Object has been destroyed") y la descarga se queda pegada en 100%.
    const alProgreso = (p) =>
      onProgress({ stage: 'download', percent: Math.round(p.percent), transferred: p.transferred, total: p.total, speed: p.bytesPerSecond, version: pendingVersion, notes: pendingNotes, size: pendingSize })
    autoUpdater.on('download-progress', alProgreso)
    onProgress({ stage: 'check' })
    try {
      const res = await Promise.race([autoUpdater.checkForUpdates(), new Promise((r) => setTimeout(r, 10000))])
      if (res?.isUpdateAvailable) {
        const notes = notesOf(res.updateInfo), size = sizeOf(res.updateInfo)
        onProgress({ stage: 'download', percent: 0, version: res.updateInfo.version, notes, size })
        await res.downloadPromise
        onProgress({ stage: 'install', version: res.updateInfo.version, notes, size })
        await new Promise((r) => setTimeout(r, 1200)) // que se vea el 100% antes de cerrar
        log('instalando al arrancar')
        autoUpdater.quitAndInstall(true, true)
        return true
      }
    } catch (e) { log(`startup falló: ${e?.message ?? e}`) }
    autoUpdater.removeListener('download-progress', alProgreso)
    setInterval(check, CHECK_EVERY_MS)
    return false
  }
  return { startup }
}

module.exports = { setupUpdater }
