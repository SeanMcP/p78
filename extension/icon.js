import { GLYPH_HEIGHT, forEachPixel, textWidth } from './pixel-font.js';

// PRT brand colors.
const NAVY = '#012f3c';
const GOLD = '#f3b500';

export const DEFAULT_NEAR_MINUTES = 10;

export const LEVELS = {
  none: { background: NAVY, text: '#7f97a0' },
  scheduled: { background: '#d5dee1', text: NAVY },
  far: { background: NAVY, text: GOLD },
  near: { background: GOLD, text: NAVY, flash: { background: NAVY, text: GOLD } },
};

const FLASH_MS = 500;

// Paints the level's colors now and, for flashing levels, alternates them. Returns a function that stops it.
export function animateIcon(level, paint) {
  paint(level);
  if (!level.flash) return () => {};
  let lit = false;
  const timer = setInterval(() => {
    lit = !lit;
    paint(lit ? level.flash : level);
  }, FLASH_MS);
  return () => clearInterval(timer);
}

export function paintIcon(ctx, size, label, { background, text }) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.25);
  ctx.fill();

  // Scale the font by whole pixels so it stays crisp, keeping some padding around it.
  const roomX = size - Math.round(size * 0.1) * 2;
  const roomY = size - Math.round(size * 0.15) * 2;
  const glyphWidth = textWidth(label);
  const scale = Math.max(1, Math.min(Math.floor(roomX / glyphWidth), Math.floor(roomY / GLYPH_HEIGHT)));

  // Text can only be exactly centered when the leftover space is even. For two-character labels,
  // widening the gap by one pixel gets there.
  const extraPixel = label.length === 2 && (size - glyphWidth * scale) % 2 === 1 ? 1 : 0;
  const gap = 1 + extraPixel / scale;
  const width = glyphWidth * scale + extraPixel;
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - GLYPH_HEIGHT * scale) / 2);

  ctx.fillStyle = text;
  forEachPixel(label, (x, y) => ctx.fillRect(left + Math.round(x * scale), top + y * scale, scale, scale), gap);
}
