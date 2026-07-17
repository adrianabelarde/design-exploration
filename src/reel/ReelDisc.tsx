import { useId } from 'react';
import type { ReelAlbum } from './reelGeometry';

interface ReelDiscProps {
  album: ReelAlbum;
  /** Cumulative rotation in degrees; the disc indexes with the lens view. */
  angle: number;
}

/** The disc silhouette, drawn in Paper (app.paper.design, Jul 15 2026). */
const DISC_PATH =
  'M 758.053 58.991 C 770.936 53.182 823.721 42.654 838.497 39.837 C 995.697 9.753 1157.84 18.049 1311.14 64.02 C 1563.13 138.817 1775.52 309.838 1902.34 540.065 C 2028.26 773.104 2056.94 1046.47 1982.12 1300.57 C 1979.53 1310.22 1968.98 1344.03 1964.67 1352.54 C 1961.85 1363.9 1954.5 1381.11 1949.86 1392.47 C 1931.21 1438.14 1909.16 1482.34 1883.87 1524.69 C 1874.77 1539.91 1861.98 1557.71 1853.76 1572.29 C 1850.21 1577.84 1847.72 1581.9 1843.46 1586.95 C 1829.56 1609.74 1798.39 1648.16 1780.68 1668.39 C 1690.38 1772.25 1579.78 1856.52 1455.69 1916.02 C 1405.64 1940.39 1353.35 1958.86 1299.84 1974.13 C 797.773 2117.44 264.792 1846.52 87.66 1351.93 C 10.082 1135.19 9.999 898.266 87.424 681.473 C 104.611 633.053 125.794 586.147 150.754 541.237 C 212.844 426.342 297.009 324.837 398.42 242.546 C 418.749 225.943 465.497 190.137 488.12 179.147 C 501.759 180.324 513.826 185.022 529.572 186.163 C 536.716 170.554 536.338 164.216 540.955 148.244 C 560.648 130.468 670.947 84.256 697.618 77.432 C 747.451 93.753 727.372 109.713 758.053 58.991 z';

/**
 * The reel, stripped to its silhouette for now: the hand-drawn Paper
 * outline carrying an orb-style radial gradient — deep at the center,
 * glowing bright at the rim. Chips, slots and hub print return later.
 */
export function ReelDisc({ album, angle }: ReelDiscProps) {
  const gid = useId();
  return (
    <svg className="vm-disc" viewBox="-46 -46 92 92" role="img" aria-label={`Reel: ${album.title}`}>
      <defs>
        <radialGradient id={`${gid}card`} cx="50%" cy="48%" r="54%">
          <stop offset="0" stopColor="#9c9a94" />
          <stop offset="0.42" stopColor="#a6a49e" />
          <stop offset="0.7" stopColor="#c3c1bb" />
          <stop offset="0.88" stopColor="#e2e0da" />
          <stop offset="1" stopColor="#f6f4ee" />
        </radialGradient>
      </defs>
      <g
        className="vm-disc-rot"
        style={{
          transform: `rotate(${angle}deg)`,
          transformBox: 'view-box',
          transformOrigin: '50% 50%',
        }}
      >
        <g transform="scale(0.0429) translate(-1033.47 -1067.75)">
          <path className="vm-disc-card" fill={`url(#${gid}card)`} d={DISC_PATH} />
        </g>
      </g>
    </svg>
  );
}
