const { createWriteStream } = require('fs')
const { join } = require('path')
const zlib = require('zlib')

const SIZE = 256
const cx = SIZE / 2, cy = SIZE / 2
const outerR = 78, innerR = 20
const pixels = Buffer.alloc(SIZE * SIZE * 4, 0)

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const dx = x - cx, dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < outerR && dist > innerR) {
      pixels[i] = 0x00; pixels[i + 1] = 0x78; pixels[i + 2] = 0xd4; pixels[i + 3] = 255
      const ix = Math.abs(dx), iy = Math.abs(dy)
      if (ix < 45 && iy < 25 && !(dx < -6 && dy < -2 && dy > -25) && !(dx > 8 && dy > 12) && !(dy > 10 && dy < 28 && ix < 45)) {
        pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255
      }
    }
  }
}

function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c }
  let crc = 0xFFFFFFFF >>> 0
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function mkChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, c])
}

const scanlines = Buffer.alloc(SIZE * SIZE * 4 + SIZE, 0)
let pos = 0
for (let y = SIZE - 1; y >= 0; y--) {
  scanlines[pos++] = 0
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    scanlines[pos++] = pixels[i + 2]
    scanlines[pos++] = pixels[i + 1]
    scanlines[pos++] = pixels[i]
    scanlines[pos++] = pixels[i + 3]
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9)
ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12)

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const trailer = Buffer.from('0000000049454E44AE426082', 'hex')

const deflated = zlib.deflateSync(scanlines, { level: 9 })
const png = Buffer.concat([sig, mkChunk('IHDR', ihdr), mkChunk('IDAT', deflated), trailer])

const dest = join(__dirname, '..', 'resources', 'icon.png')
require('fs').mkdirSync(join(__dirname, '..', 'resources'), { recursive: true })
require('fs').writeFileSync(dest, png)

console.log('Icon generated: ' + dest + ' (' + png.length + ' bytes)')
