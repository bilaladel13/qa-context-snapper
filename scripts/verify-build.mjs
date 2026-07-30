import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')

const failures = []

function read(relative) {
  return readFileSync(resolve(DIST, relative), 'utf8')
}

function chunkReferencedBy(source) {
  const match = source.match(/assets\/[\w.\-]+\.js/)
  if (!match) {
    throw new Error('Could not find an asset reference in the loader.')
  }
  return match[0]
}

// Strips every brace-delimited body so only module top level remains.
function topLevelOf(source) {
  let depth = 0
  let top = ''

  for (const character of source) {
    if (character === '{') depth += 1
    if (depth === 0) top += character
    if (character === '}') depth = Math.max(0, depth - 1)
  }

  return top
}

const manifest = JSON.parse(read('manifest.json'))

const workerChunk = chunkReferencedBy(read('service-worker-loader.js'))
const workerSource = read(workerChunk)

const contentLoader = manifest.content_scripts?.[0]?.js?.[0]
if (!contentLoader) {
  failures.push('the manifest declares no content script')
}

const contentChunk = contentLoader ? chunkReferencedBy(read(contentLoader)) : null
const contentSource = contentChunk ? read(contentChunk) : ''

if (contentChunk && workerChunk === contentChunk) {
  failures.push(
    `the service worker and the content script both load ${workerChunk}; give the entry files distinct basenames`,
  )
}

// The worker chunk must be the background, identified by APIs only it uses.
for (const marker of ['storage.session', 'onInstalled', 'executeScript']) {
  if (!workerSource.includes(marker)) {
    failures.push(`the service worker chunk (${workerChunk}) is missing "${marker}"`)
  }
}

// The content chunk must be the content script.
for (const marker of ['addEventListener', 'composedPath']) {
  if (contentChunk && !contentSource.includes(marker)) {
    failures.push(`the content script chunk (${contentChunk}) is missing "${marker}"`)
  }
}

const workerTopLevel = topLevelOf(workerSource)
for (const global of ['window', 'document', 'localStorage']) {
  if (workerTopLevel.includes(global)) {
    failures.push(
      `the service worker chunk evaluates "${global}" at module top level, which throws in MV3`,
    )
  }
}

if (read('service-worker-loader.js').includes('localhost')) {
  failures.push('dist contains a dev-server build; run npm run build before loading it in Chrome')
}

const report = process.stdout.write.bind(process.stdout)

if (failures.length > 0) {
  report('build verification FAILED\n')
  for (const failure of failures) {
    report(`  - ${failure}\n`)
  }
  process.exit(1)
}

report(`build verified\n`)
report(`  service worker: ${workerChunk}\n`)
report(`  content script: ${contentChunk}\n`)
