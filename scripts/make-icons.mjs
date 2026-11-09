// Generates the app icons (PNG) with no dependencies: a chat bubble with a notification dot.
// Run: npm run icons   -> public/pwa-192.png, public/pwa-512.png, public/apple-touch-icon.png
// Keep the artwork in the middle ~60% so it also survives "maskable" cropping on Android.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

// ---- artwork, in unit coordinates (0..1) ----
const PURPLE = [0x6c, 0x5c, 0xe7]
const VIOLET = [0x8e, 0x7c, 0xff]
const WHITE = [255, 255, 255]
const ORANGE = [0xff, 0x9f, 0x43]

const inRoundRect = (u, v, x0, y0, x1, y1, r) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const dx = Math.max(Math.abs(u - cx) - ((x1 - x0) / 2 - r), 0)
  const dy = Math.max(Math.abs(v - cy) - ((y1 - y0) / 2 - r), 0)
  return Math.hypot(dx, dy) <= r
}
const inTri = (u, v, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = d(u, v, ax, ay, bx, by), d2 = d(u, v, bx, by, cx, cy), d3 = d(u, v, cx, cy, ax, ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
const inCircle = (u, v, cx, cy, r) => Math.hypot(u - cx, v - cy) <= r

function colorAt(u, v) {
  let c = [
    PURPLE[0] + (VIOLET[0] - PURPLE[0]) * (u + v) / 2, // soft diagonal gradient background
    PURPLE[1] + (VIOLET[1] - PURPLE[1]) * (u + v) / 2,
    PURPLE[2] + (VIOLET[2] - PURPLE[2]) * (u + v) / 2,
  ]
  const bubble = inRoundRect(u, v, 0.2, 0.26, 0.8, 0.64, 0.13) || inTri(u, v, [0.28, 0.6], [0.28, 0.78], [0.46, 0.6])
  if (bubble) c = WHITE
  if (bubble && [0.36, 0.5, 0.64].some((x) => inCircle(u, v, x, 0.45, 0.04))) c = PURPLE // typing dots
  if (inCircle(u, v, 0.77, 0.27, 0.105)) c = WHITE // white ring around the badge
  if (inCircle(u, v, 0.77, 0.27, 0.078)) c = ORANGE // notification dot
  return c
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const SS = 3 // 3x3 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
          r += c[0]; g += c[1]; b += c[2]
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = Math.round(r / (SS * SS)); raw[o + 1] = Math.round(g / (SS * SS)); raw[o + 2] = Math.round(b / (SS * SS))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/apple-touch-icon.png', png(180))
console.log('icons written')
