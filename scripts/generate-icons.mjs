import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const SIZES = [16, 32, 48, 128]
const BACKGROUND = [37, 99, 235, 255]
const FOREGROUND = [255, 255, 255, 255]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function coverage(x, y, size, radius) {
  const samples = 4
  let hits = 0

  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const px = x + (sx + 0.5) / samples
      const py = y + (sy + 0.5) / samples
      const cx = Math.min(Math.max(px, radius), size - radius)
      const cy = Math.min(Math.max(py, radius), size - radius)
      const dx = px - cx
      const dy = py - cy
      if (dx * dx + dy * dy <= radius * radius) {
        hits += 1
      }
    }
  }

  return hits / (samples * samples)
}

function inBracket(x, y, size) {
  const thickness = Math.max(1, Math.round(size * 0.085))
  const inset = Math.round(size * 0.24)
  const arm = Math.round(size * 0.2)
  const far = size - inset

  const nearH = x >= inset && x < inset + arm
  const farH = x > far - arm && x <= far
  const nearV = y >= inset && y < inset + arm
  const farV = y > far - arm && y <= far

  const onTop = y >= inset && y < inset + thickness
  const onBottom = y > far - thickness && y <= far
  const onLeft = x >= inset && x < inset + thickness
  const onRight = x > far - thickness && x <= far

  const horizontal = (onTop || onBottom) && (nearH || farH)
  const vertical = (onLeft || onRight) && (nearV || farV)

  return horizontal || vertical
}

function renderIcon(size) {
  const radius = size * 0.22
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const alpha = coverage(x, y, size, radius)
      const color = inBracket(x, y, size) ? FOREGROUND : BACKGROUND

      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
      pixels[offset + 3] = Math.round(color[3] * alpha)
    }
  }

  return encodePng(size, pixels)
}

mkdirSync(OUT_DIR, { recursive: true })

for (const size of SIZES) {
  const target = resolve(OUT_DIR, `icon${size}.png`)
  writeFileSync(target, renderIcon(size))
  console.log(`wrote ${target}`)
}
