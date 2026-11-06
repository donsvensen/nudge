// Generates simple PNG icons (purple square + white ring) with no dependencies.
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
function png(size) {
  const bg = [0x6c, 0x5c, 0xe7], fg = [255, 255, 255]
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const cx = size / 2, rOuter = size * 0.22, rInner = size * 0.15, dot = size * 0.06
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cx)
      const on = (d <= rOuter && d >= rInner) || d <= dot
      const c = on ? fg : bg
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]
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
