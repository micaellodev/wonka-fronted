// Ponle el ícono de Wonka al .exe de la app. electron-builder lo haría con signAndEditExecutable, pero ese modo falla en
// Windows sin permiso de enlaces simbólicos (no puede extraer winCodeSign), así que se llama a rcedit directamente.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

exports.default = async (ctx) => {
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache', 'winCodeSign')
  const rcedit = fs.existsSync(cache) ? fs.readdirSync(cache).map((d) => path.join(cache, d, 'rcedit-x64.exe')).find(fs.existsSync) : null
  if (!rcedit) {
    console.warn('  • rcedit-x64.exe no está en la caché de electron-builder: el .exe de la app queda con el ícono de Electron')
    return
  }
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`)
  execFileSync(rcedit, [exe, '--set-icon', path.resolve('icon.ico')])
  console.log('  • ícono de Wonka aplicado a', path.basename(exe))
}
