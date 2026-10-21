// Genera release/nsis-web/instalador.json (versión, hashes, nº de archivos) y compila el instalador propio
// "Instalar Wonka Park.exe" con el csc.exe que trae Windows (.NET Framework 4). Lo llama release.mjs;
// también sirve solo (tras un release): WONKA_UPDATE_URL=... node scripts/build-installer.mjs
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

const countFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1), 0)

export function buildInstaller(url) {
  const out = 'release/nsis-web'
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const yml = readFileSync(join(out, 'latest.yml'), 'utf8')
  const pick = (re, what) => {
    const m = yml.match(re)
    if (!m) throw new Error(`latest.yml sin ${what}`)
    return m
  }
  const setupName = pick(/^path: (.+)$/m, 'path')[1].trim()
  const setupSha = pick(/^sha512: (.+)$/m, 'sha512')[1].trim()
  const [, pkgSize, pkgSha, pkgName] = pick(/packages:\s*\n\s*x64:\s*\n\s*size: (\d+)\s*\n\s*sha512: (\S+)[\s\S]*?path: (\S+)/, 'packages.x64')

  const manifest = {
    version: pkg.version,
    setup: { name: setupName, sha512: setupSha, size: statSync(join(out, setupName)).size },
    package: { name: pkgName, sha512: pkgSha, size: Number(pkgSize) },
    // win-unpacked es lo que el .7z extrae; +1 por el desinstalador que crea el instalador
    files: countFiles('release/win-unpacked') + 1,
    installDir: pkg.name,
    exe: `${pkg.build.productName}.exe`,
  }
  writeFileSync(join(out, 'instalador.json'), JSON.stringify(manifest, null, 2))

  writeFileSync('release/Config.g.cs', `static class Config { public const string Url = ${JSON.stringify(url)}; }\n`)
  if (!existsSync(CSC)) throw new Error(`No existe ${CSC}`)
  const exe = join(out, 'Instalar Wonka Park.exe')
  const r = spawnSync(CSC, [
    '/nologo', '/target:winexe', '/optimize+', `/out:${exe}`, '/win32icon:icon.ico', '/win32manifest:installer\\app.manifest',
    '/resource:installer\\logo.png,logo.png',
    '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll',
    'installer\\Instalador.cs', 'release\\Config.g.cs',
  ], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('Falló la compilación del instalador')
  console.log(`Instalador propio: ${exe} (${manifest.files} archivos, v${manifest.version})`)
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  try { process.loadEnvFile('.env') } catch { /* sin .env */ }
  if (!process.env.WONKA_UPDATE_URL) { console.error('Define WONKA_UPDATE_URL'); process.exit(1) }
  buildInstaller(process.env.WONKA_UPDATE_URL.replace(/\/+$/, ''))
}
