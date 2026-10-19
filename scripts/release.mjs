// Genera el instalador con auto-actualización. Uso (PowerShell):
//   $env:WONKA_UPDATE_URL = 'https://tu-host/wonka-updates'; bun run electron:release
// Salida en release/: instalador .exe + .blockmap + latest.yml → subir los TRES a esa URL (el .exe nuevo siempre con versión mayor en package.json).
import { spawnSync } from 'node:child_process'

try { process.loadEnvFile('.env') } catch { /* sin .env: solo variables de entorno */ }
const url = process.env.WONKA_UPDATE_URL
if (!url || !/^https?:\/\//.test(url)) {
  console.error('Define WONKA_UPDATE_URL (carpeta pública donde subirás latest.yml y el instalador), p. ej. https://updates.midominio.com/wonka')
  process.exit(1)
}
// VITE_API_URL queda grabada en el instalador: una URL local dejaría las cajas sin servidor.
if (/localhost|127\.0\.0\.1/.test(process.env.VITE_API_URL ?? 'localhost')) {
  console.error('VITE_API_URL apunta a localhost. Pon la URL pública del backend: $env:VITE_API_URL = "https://xxx.up.railway.app"')
  process.exit(1)
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run('bunx', ['vite', 'build'])
run('bunx', ['electron-builder', '--win', '--publish', 'never', '-c.publish.provider=generic', `-c.publish.url=${url}`])
console.log('\nListo. Sube release/latest.yml, release/*.exe y release/*.blockmap a', url)
