// Sube la versión: `bun run version:bump [patch|minor|major]`.
// Sin argumento elige el nivel según el tamaño de los cambios desde la versión anterior (así un cambio grande no pasa de 1.0.27 a 1.0.28).
// Edita package.json y package-lock.json, escribe release-notes.txt (resumen que verán las cajas al actualizar),
// hace el commit "Versión X.Y.Z" y la etiqueta vX.Y.Z. No hace push ni release.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Umbrales (líneas cambiadas): menos de MINOR = patch, menos de MAJOR = minor, más = major. "BREAKING" en un commit fuerza major.
const MINOR = 300
const MAJOR = 3000

const arg = process.argv[2]
if (arg && !['patch', 'minor', 'major'].includes(arg)) {
  console.error('Uso: bun run version:bump [patch|minor|major]')
  process.exit(1)
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim()
if (git('status', '--porcelain', '--', '.')) {
  console.error('Hay cambios sin commitear en fronted/. Haz commit primero para que la versión quede en su propio commit.')
  process.exit(1)
}

// Base = último commit de versión (mensaje "Versión X.Y.Z" o "... (vX.Y.Z)"); sin base se usan los últimos 30 commits
const base = git('log', '-1', '--format=%H', '-E', '--grep=^Versión [0-9]|\\(v[0-9]+\\.[0-9]+\\.[0-9]+\\)') || 'HEAD~30'
const subjects = git('log', '--format=%s', `${base}..HEAD`).split('\n').filter(Boolean)
const breaking = /BREAKING/.test(git('log', '--format=%B', `${base}..HEAD`))
let add = 0, del = 0, files = 0
const stat = git('diff', '--numstat', base, 'HEAD', '--', ':/', ':(exclude,glob)**/*lock*', ':(exclude,glob)**/*.png')
for (const l of stat.split('\n').filter(Boolean)) {
  const [a, d] = l.split('\t')
  files++; add += Number(a) || 0; del += Number(d) || 0
}
const lines = add + del
const level = breaking || lines >= MAJOR ? 'major' : lines >= MINOR ? 'minor' : 'patch'
const kind = arg ?? level
const size = { major: 'Cambio muy grande', minor: 'Cambio mediano', patch: 'Cambio pequeño' }[level]

const edit = (file, fn) => {
  const j = JSON.parse(readFileSync(file, 'utf8'))
  fn(j)
  writeFileSync(file, JSON.stringify(j, null, 2) + '\n')
}
let next = ''
edit('package.json', (j) => {
  let [a, b, c] = j.version.split('.').map(Number)
  if (kind === 'major') { a++; b = 0; c = 0 } else if (kind === 'minor') { b++; c = 0 } else c++
  next = `${a}.${b}.${c}`
  j.version = next
})
edit('package-lock.json', (j) => { j.version = next; if (j.packages?.['']) j.packages[''].version = next })

const clean = (s) => s.replace(/\s*\(v[0-9.]+\)\s*$/, '')
const notes = [
  `${size} · ${files} archivos, ${lines} líneas, ${subjects.length} cambios`,
  ...subjects.slice(0, 15).map((s) => `- ${clean(s)}`),
  ...(subjects.length > 15 ? [`- y ${subjects.length - 15} más`] : []),
].join('\n')
writeFileSync('release-notes.txt', notes + '\n')

git('add', 'package.json', 'package-lock.json', 'release-notes.txt')
git('commit', '-m', `Versión ${next}`)
git('tag', `v${next}`)
console.log(`${notes}\n\nVersión ${next} (${kind}${arg ? '' : ', automático'}). Siguiente: git push --follow-tags, y bun run electron:release.`)
