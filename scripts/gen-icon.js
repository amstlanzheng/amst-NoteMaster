/**
 * AmNote AM 图标生成器
 * 生成蓝色圆角矩形背景 + 白色 AM 文字的图标
 * 用于 Electron 应用主图标和任务栏图标
 */
const { createWriteStream, mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')
const zlib = require('zlib')

const SIZE = 512
const MARGIN = Math.floor(SIZE * 0.04)  // 4% 边距
const CORNER_R = Math.floor(SIZE * 0.2)  // 20% 圆角

// 高饱和度蓝色
const BG_R = 24, BG_G = 100, BG_B = 220
const WHITE = 255

const pixels = Buffer.alloc(SIZE * SIZE * 4, 0)

// 绘制圆角矩形背景
function isInRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  // 检查四个角
  const corners = [
    [x0 + r, y0 + r],
    [x1 - r, y0 + r],
    [x0 + r, y1 - r],
    [x1 - r, y1 - r]
  ]
  for (const [cx, cy] of corners) {
    const inCornerZone = (x < x0 + r && y < y0 + r) || (x > x1 - r && y < y0 + r) ||
                         (x < x0 + r && y > y1 - r) || (x > x1 - r && y > y1 - r)
    if (inCornerZone) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy > r * r) return false
    }
  }
  return true
}

// 绘制 AM 字母（像素级）
function drawAM(pixels, size) {
  const scale = size / 512
  const white = [255, 255, 255, 255]

  function setPixel(x, y) {
    x = Math.round(x * scale)
    y = Math.round(y * scale)
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const i = (y * size + x) * 4
      pixels[i] = white[0]; pixels[i + 1] = white[1]; pixels[i + 2] = white[2]; pixels[i + 3] = white[3]
    }
  }

  // A 字母 - 粗体几何风格
  const aLeft = 100, aRight = 230, aTop = 140, aBottom = 380
  const aStroke = Math.round(38 * scale)
  const aMidY = 280  // 横杠位置

  // A 左竖
  for (let y = aTop; y <= aBottom; y++) {
    for (let dx = 0; dx < aStroke; dx++) {
      setPixel(aLeft + dx, y)
    }
  }
  // A 右竖
  for (let y = aTop; y <= aBottom; y++) {
    for (let dx = 0; dx < aStroke; dx++) {
      setPixel(aRight - aStroke + dx, y)
    }
  }
  // A 顶部横杠
  for (let x = aLeft; x <= aRight; x++) {
    for (let dy = 0; dy < aStroke; dy++) {
      setPixel(x, aTop + dy)
    }
  }
  // A 中间横杠
  for (let x = aLeft; x <= aRight; x++) {
    for (let dy = 0; dy < Math.round(28 * scale); dy++) {
      setPixel(x, aMidY + dy)
    }
  }

  // M 字母 - 粗体几何风格
  const mLeft = 270, mRight = 410, mTop = 140, mBottom = 380
  const mStroke = aStroke

  // M 左竖
  for (let y = mTop; y <= mBottom; y++) {
    for (let dx = 0; dx < mStroke; dx++) {
      setPixel(mLeft + dx, y)
    }
  }
  // M 右竖
  for (let y = mTop; y <= mBottom; y++) {
    for (let dx = 0; dx < mStroke; dx++) {
      setPixel(mRight - mStroke + dx, y)
    }
  }
  // M 左斜线（从左上到中间底部）
  const mMidX = (mLeft + mRight) / 2
  const mVBottom = mBottom - Math.round(30 * scale)
  for (let t = 0; t <= 1; t += 0.005) {
    const x1 = mLeft + t * (mMidX - mLeft)
    const y1 = mTop + t * (mVBottom - mTop)
    const x2 = mLeft + t * (mMidX - mLeft)
    const y2 = mTop + t * (mVBottom - mTop)
    for (let dx = 0; dx < mStroke; dx++) {
      for (let dy = 0; dy < mStroke; dy++) {
        setPixel(Math.round(x1 + dx), Math.round(y1 + dy))
      }
    }
  }
  // M 右斜线（从中间底部到右上）
  for (let t = 0; t <= 1; t += 0.005) {
    const x1 = mMidX + t * (mRight - mMidX)
    const y1 = mVBottom + t * (mTop - mVBottom)
    for (let dx = 0; dx < mStroke; dx++) {
      for (let dy = 0; dy < mStroke; dy++) {
        setPixel(Math.round(x1 + dx), Math.round(y1 + dy))
      }
    }
  }
}

// 填充圆角矩形背景
const x0 = MARGIN, y0 = MARGIN
const x1 = SIZE - MARGIN - 1, y1 = SIZE - MARGIN - 1

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (isInRoundedRect(x, y, x0, y0, x1, y1, CORNER_R)) {
      const i = (y * SIZE + x) * 4
      pixels[i] = BG_R; pixels[i + 1] = BG_G; pixels[i + 2] = BG_B; pixels[i + 3] = 255
    }
  }
}

// 绘制 AM 文字
drawAM(pixels, SIZE)

// PNG 编码工具函数
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

// 生成 PNG（注意 PNG 行序是从上到下，不需要翻转）
const scanlines = Buffer.alloc(SIZE * SIZE * 4 + SIZE, 0)
let pos = 0
for (let y = 0; y < SIZE; y++) {
  scanlines[pos++] = 0  // filter byte
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    scanlines[pos++] = pixels[i]      // R
    scanlines[pos++] = pixels[i + 1]  // G
    scanlines[pos++] = pixels[i + 2]  // B
    scanlines[pos++] = pixels[i + 3]  // A
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9)  // 8-bit RGBA
ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12)

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const trailer = Buffer.from('0000000049454E44AE426082', 'hex')

const deflated = zlib.deflateSync(scanlines, { level: 9 })
const png = Buffer.concat([sig, mkChunk('IHDR', ihdr), mkChunk('IDAT', deflated), trailer])

const dest = join(__dirname, '..', 'resources', 'icon.png')
mkdirSync(join(__dirname, '..', 'resources'), { recursive: true })
writeFileSync(dest, png)

console.log('AM Icon generated: ' + dest + ' (' + png.length + ' bytes)')
