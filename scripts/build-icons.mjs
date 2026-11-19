// Builds the extension's static logo PNGs: a pixel-art bus in gold on black.
// Usage: node scripts/build-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Front view.
const BUS = [
  '..########..',
  '.##########.',
  '.#........#.',
  '##........##',
  '.#........#.',
  '.#........#.',
  '.##########.',
  '.#.######.#.',
  '.##########.',
  '.##########.',
  '..##....##..',
];
const BACKGROUND = [0, 0, 0, 255];
const BUS_COLOR = [0xf3, 0xb5, 0x00, 255];

function render(size) {
  const pixels = new Uint8Array(size * size * 4);
  const radius = size * 0.25;
  const set = (x, y, color) => pixels.set(color, (y * size + x) * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x - 0.5, x + 0.5 - (size - radius), 0);
      const dy = Math.max(radius - y - 0.5, y + 0.5 - (size - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) set(x, y, BACKGROUND);
    }
  }

  // Scale by whole pixels so the bus stays crisp: 1x at 16px, 3x at 48px, 8x at 128px.
  const padding = Math.round(size * 0.1);
  const width = BUS[0].length;
  const scale = Math.max(1, Math.floor((size - padding * 2) / width));
  const left = Math.floor((size - width * scale) / 2);
  // Center the bus without its bottom row. The wheels are light, so a truly centered bus looks too high.
  const top = Math.floor((size - (BUS.length - 1) * scale) / 2);
  BUS.forEach((row, gy) => {
    [...row].forEach((pixel, gx) => {
      if (pixel !== '#') return;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) set(left + gx * scale + x, top + gy * scale + y, BUS_COLOR);
      }
    });
  });
  return pixels;
}

function png(size, pixels) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(import.meta.dirname, '../extension/icons');
fs.mkdirSync(dir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(dir, `${size}.png`), png(size, render(size)));
}
console.log(`Wrote icons to ${dir}`);
