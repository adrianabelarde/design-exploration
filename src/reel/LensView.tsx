import { ADVANCE, type ReelAlbum } from './reelGeometry';

interface LensViewProps {
  album: ReelAlbum;
  /** Cumulative pull count; the ring's rotation is index × 51.429°. */
  index: number;
  /** True while the disc is ejecting — the view leaves with it. */
  out: boolean;
  /** True while the next disc is being fed in — the view rides down with it. */
  entering: boolean;
}

/**
 * The view through the lens: a magnified frame. The seven slides live on a
 * ring pivoting around the (scaled, off-screen) disc center, so an advance
 * sweeps the old photo out along the reel's real arc and the white cardboard
 * between chips flashes through — the most view-master thing a screen can do.
 * Pivot distance: a chip subtends FRAME_H/FRAME_R rad of the disc, so the
 * pivot sits 31.75/10 slide-widths above center → origin at 50% −315%.
 */
export function LensView({ album, index, out, entering }: LensViewProps) {
  return (
    <div className="vm-lens">
      <div className={`vm-feed${out ? ' is-out' : ''}${entering ? ' is-entering' : ''}`}>
        <div className="vm-ring" style={{ transform: `rotate(${index * ADVANCE}deg)` }}>
          {album.photos.map((photo, i) => (
            <div
              key={photo.caption}
              className="vm-photo"
              style={{ transform: `rotate(${-i * ADVANCE}deg)` }}
            >
              <div
                className="vm-slide"
                style={{
                  background: `linear-gradient(160deg, ${photo.tint[0]} 0%, ${photo.tint[1]} 100%)`,
                }}
              >
                <span className="vm-slide-no">{i + 1}</span>
                <span className="vm-slide-caption">{photo.caption}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
