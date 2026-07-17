/**
 * Derive PBR maps from a flat "scanned print" albedo.
 *
 * The engraving convention: dark ink = recessed (a foil-stamped die pushes
 * the artwork INTO the card). So height is simply luminance. A small blur
 * first keeps the Sobel gradients from ringing on hard text edges, then
 * normal = normalize(-dh/du, -dh/dv, 1) per texel.
 *
 * Never ask an image model for a normal map; the vectors are decorative
 * nonsense. Deriving here means regenerated art rebuilds automatically.
 */

interface DerivedMaps {
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

export interface DeriveOptions {
  /** Normal strength: how steep the engraving walls read. */
  strength?: number;
  /** Pre-blur in px; softens print edges into debossed grooves. */
  blur?: number;
  /** Roughness of the polished foil field (bright areas). */
  roughMin?: number;
  /** Roughness of inked recesses (dark areas). */
  roughMax?: number;
}

export function deriveMaps(albedo: HTMLCanvasElement, opts: DeriveOptions = {}): DerivedMaps {
  const { strength = 1.6, blur = 1.4, roughMin = 0.35, roughMax = 0.95 } = opts;
  const w = albedo.width;
  const h = albedo.height;

  // Height = blurred luminance (native canvas blur, fast and good enough).
  const [, bctx] = makeCanvas(w, h);
  bctx.filter = `blur(${blur}px)`;
  bctx.drawImage(albedo, 0, 0);
  bctx.filter = 'none';
  const src = bctx.getImageData(0, 0, w, h).data;

  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    height[i] = (0.2126 * src[o] + 0.7152 * src[o + 1] + 0.0722 * src[o + 2]) / 255;
  }

  const [normal, nctx] = makeCanvas(w, h);
  const [rough, rctx] = makeCanvas(w, h);
  const nData = nctx.createImageData(w, h);
  const rData = rctx.createImageData(w, h);
  const np = nData.data;
  const rp = rData.data;

  const at = (x: number, y: number) =>
    height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel gradients over the height field.
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      // Canvas y points down; OpenGL-style normal maps want +G = uv-up.
      let nx = -dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;

      const o = (y * w + x) * 4;
      np[o] = Math.round((nx * 0.5 + 0.5) * 255);
      np[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      np[o + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      np[o + 3] = 255;

      // Recessed ink is matte; the raised foil field flashes.
      const r255 = Math.round((roughMin + (1 - height[y * w + x]) * (roughMax - roughMin)) * 255);
      rp[o] = r255;
      rp[o + 1] = r255; // three.js reads the green channel
      rp[o + 2] = r255;
      rp[o + 3] = 255;
    }
  }

  nctx.putImageData(nData, 0, 0);
  rctx.putImageData(rData, 0, 0);
  return { normal, roughness: rough };
}
