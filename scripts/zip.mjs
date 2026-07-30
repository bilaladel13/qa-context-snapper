import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')
const RELEASE_DIR = resolve(ROOT, 'release')

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const target = resolve(RELEASE_DIR, `${pkg.name}-${pkg.version}.zip`)

mkdirSync(RELEASE_DIR, { recursive: true })
rmSync(target, { force: true })

if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${DIST}\\*' -DestinationPath '${target}'`],
    { stdio: 'inherit' },
  )
} else {
  execFileSync('zip', ['-r', target, '.'], { cwd: DIST, stdio: 'inherit' })
}

console.log(`packaged ${target}`)
