/**
 * Word of the day, punched conductor-style.
 *
 * In the film the punched tickets read BELIEVE, LEAD, LEARN and
 * DEPEND ON / RELY ON / COUNT ON. Ours rotates a small list of words in
 * that spirit, keyed to the date.
 */

export interface DailyWord {
  word: string;
  pos: string;
  phonetic: string;
  definition: string;
}

/** Index = daysSinceEpoch % length, ordered so launch day lands on BELIEVE. */
export const WORDS: DailyWord[] = [
  { word: 'WONDER', pos: 'noun', phonetic: 'WUN-der', definition: 'a feeling of amazement mixed with admiration.' },
  { word: 'LEAD', pos: 'verb', phonetic: 'LEED', definition: 'to show the way by going first.' },
  { word: 'COURAGE', pos: 'noun', phonetic: 'KUR-ij', definition: 'the ability to do the thing that frightens you.' },
  { word: 'IMAGINE', pos: 'verb', phonetic: 'ih-MAJ-in', definition: 'to picture what does not yet exist.' },
  { word: 'LEARN', pos: 'verb', phonetic: 'LURN', definition: 'to come to know what you did not know before.' },
  { word: 'HOPE', pos: 'noun', phonetic: 'HOHP', definition: 'the feeling that what is wanted will happen.' },
  { word: 'CREATE', pos: 'verb', phonetic: 'kree-AYT', definition: 'to bring something into existence.' },
  { word: 'BELIEVE', pos: 'verb', phonetic: 'bih-LEEV', definition: 'to accept that something is true, especially without proof.' },
  { word: 'TRUST', pos: 'noun', phonetic: 'TRUHST', definition: 'firm belief in the reliability of someone or something.' },
  { word: 'BEGIN', pos: 'verb', phonetic: 'bih-GIN', definition: 'to take the first step of something new.' },
];

export function wordOfTheDay(date = new Date()): DailyWord {
  // Local-midnight day index, so the word flips at the reader's midnight.
  const days = Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
  return WORDS[((days % WORDS.length) + WORDS.length) % WORDS.length];
}

/**
 * Compact 5x5 punch capitals: five rows per glyph, five bits per row, most
 * significant bit = leftmost column. Fewer, larger holes than a 5x7 matrix;
 * with the die sized past the grid pitch, neighboring holes overlap into
 * perforated strokes, which is exactly how the film's tickets read.
 */
const GLYPHS: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b11111, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b11110, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b11110, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000],
  G: [0b01111, 0b10000, 0b10011, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b11111, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b11110, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b11110, 0b10100, 0b10010],
  S: [0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
};

const ROWS = 5;

export interface PunchHole {
  /** Ticket UV, u right, v up. */
  u: number;
  v: number;
  /** This hole's radius as a fraction of ticket width. */
  r: number;
}

export interface WordLayout {
  holes: PunchHole[];
  /** Nominal hole radius as a fraction of ticket WIDTH. */
  holeR: number;
}

const LETTER_COLS = 5;
const LETTER_GAP_COLS = 1;
const SPACE_COLS = 2.5;
/** Widest the punched word may span, as a fraction of ticket width. */
const MAX_SPAN_U = 0.88;
/** Tallest a letter may stand, as a fraction of ticket height. */
const MAX_LETTER_V = 0.58;
/**
 * A conductor rapid-firing by hand does not hit a perfect grid. Each hole
 * gets a bell-curve registration error (sum of two uniforms) of up to this
 * fraction of the hole pitch, and the die bites a few percent differently
 * depending on how square the jaws meet the card.
 */
const JITTER = 0.22;

const scatter = () => (Math.random() + Math.random() - 1) * JITTER;

/**
 * Lay a word out as punch-hole centers on the ticket, centered at (0.5, cv).
 * Pitch is isotropic in world space: `aspect` = ticket width / height.
 */
export function layoutWord(word: string, aspect: number, cv = 0.48): WordLayout {
  const chars = word.toUpperCase().split('');
  let cols = 0;
  for (let i = 0; i < chars.length; i++) {
    cols += chars[i] === ' ' ? SPACE_COLS : LETTER_COLS;
    if (i < chars.length - 1) cols += LETTER_GAP_COLS;
  }

  // Hole pitch (fraction of width), limited by span and by letter height.
  const pitch = Math.min(
    MAX_SPAN_U / Math.max(cols - 1, 1),
    MAX_LETTER_V / ((ROWS - 1) * aspect),
  );

  // Past 0.5 the die overlaps the grid: adjacent holes fuse into strokes.
  const holeR = pitch * 0.54;

  // Punched in haste, not typeset: the whole word runs uphill a few degrees
  // (like the BELIEVE frame in the film), and each letter bounces slightly
  // off the shared baseline. Rotation happens in isotropic width-fraction
  // space so the tilt is true in world units, not stretched by the aspect.
  const tilt = 0.07 + Math.random() * 0.05;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const holes: PunchHole[] = [];
  let colCursor = -(cols - 1) / 2;
  for (const ch of chars) {
    if (ch === ' ') {
      colCursor += SPACE_COLS + LETTER_GAP_COLS;
      continue;
    }
    const glyph = GLYPHS[ch];
    if (glyph) {
      const bounce = (Math.random() + Math.random() - 1) * 0.4;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row] & (1 << (4 - col))) {
            const x = (colCursor + col + scatter()) * pitch;
            // Row 0 is the letter's top; y runs up.
            const y = ((ROWS - 1) / 2 - row + bounce + scatter()) * pitch;
            holes.push({
              u: 0.5 + x * cosT - y * sinT,
              v: cv + (x * sinT + y * cosT) * aspect,
              r: holeR * (0.9 + Math.random() * 0.18),
            });
          }
        }
      }
    }
    colCursor += LETTER_COLS + LETTER_GAP_COLS;
  }

  return { holes, holeR };
}
