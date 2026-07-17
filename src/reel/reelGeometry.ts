/**
 * Real View-Master reel geometry, measured off the 1939 Sawyer's disc.
 * Everything on screen — the disc print, the advance angle, the arc the
 * photos travel through the lens — derives from these numbers.
 */

/** Disc radius: the reel is a Ø90 mm cardboard sandwich. */
export const DISC_R = 45;

/**
 * Frame-center radius. Never published, but the viewer forces it: both eyes
 * look through frames 180° apart, and the lens axes sit one interocular
 * distance apart. 2r = 63.5 mm → r = 31.75 mm.
 */
export const FRAME_R = 31.75;

/** 14 film chips: 7 scenes × 2 eyes. */
export const N_POS = 14;

/** Angle between adjacent frames. */
export const PITCH = 360 / N_POS; // 25.714°

/** One lever pull skips 2 positions (next scene, correct eye): 1/7 turn. */
export const ADVANCE = PITCH * 2; // 51.429°

/** Frame aperture, measured off real reels. Width runs radially. */
export const FRAME_W = 11.5;
export const FRAME_H = 10;

/**
 * Scene s (1-based) sits at position 2(s−1); its other-eye twin at +7,
 * diametrically opposite. Walking the rim reads 1,5,2,6,3,7,4,… — scenes
 * interleave because each pull skips two positions.
 */
export function sceneAtPosition(p: number): number {
  return p % 2 === 0 ? p / 2 + 1 : ((p + 7) % N_POS) / 2 + 1;
}

export interface ReelPhoto {
  caption: string;
  /** Placeholder slide gradient until real photos drop in: [light, deep]. */
  tint: [string, string];
}

export interface ReelAlbum {
  id: string;
  title: string;
  sub: string;
  /** The card's one line of copy, gift-card style: "The reel for …". */
  tagline: string;
  photos: ReelPhoto[]; // exactly 7
}
