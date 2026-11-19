// A tiny bitmap font. Each glyph is 5 rows tall; '#' is a lit pixel.
const GLYPHS = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  h: ['#..', '#..', '###', '#.#', '#.#'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '–': ['...', '...', '###', '...', '...'],
  '?': ['###', '..#', '.##', '...', '.#.'],
  '!': ['#', '#', '#', '.', '#'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  ' ': ['.', '.', '.', '.', '.'],
};

export const GLYPH_HEIGHT = 5;

export function textWidth(text) {
  return [...text].reduce((width, char) => width + GLYPHS[char][0].length, 0) + text.length - 1;
}

// Calls fillPixel(x, y) for every lit pixel, in font units.
export function forEachPixel(text, fillPixel) {
  let offset = 0;
  for (const char of text) {
    const rows = GLYPHS[char];
    rows.forEach((row, y) => [...row].forEach((pixel, x) => pixel === '#' && fillPixel(offset + x, y)));
    offset += rows[0].length + 1;
  }
}
