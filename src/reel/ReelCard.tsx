import type { CSSProperties } from 'react';
import { ReelDisc } from './ReelDisc';
import type { ReelAlbum } from './reelGeometry';

interface ReelCardProps {
  album: ReelAlbum;
  /** Wall position — drives the entrance stagger and the resting tilt. */
  index: number;
  onSelect: () => void;
}

/**
 * Apple-gift-card treatment: matte white card with the euro slot die-cut
 * through the top (a real hole — the wall shows through), one line of copy,
 * and the reel itself as the colorful mark.
 */
export function ReelCard({ album, index, onSelect }: ReelCardProps) {
  return (
    <button
      type="button"
      className="vm-hanger"
      style={{ '--i': index } as CSSProperties}
      onClick={onSelect}
      aria-label={`Open the ${album.title} reel`}
    >
      <span className="vm-card">
        <span className="vm-card-edge" aria-hidden="true" />
        <span className="vm-card-face" aria-hidden="true" />
        <span className="vm-card-qty">7 slides</span>
        <span className="vm-card-tag">{album.tagline}</span>
        <span className="vm-card-mark">
          <ReelDisc album={album} angle={0} />
        </span>
      </span>
    </button>
  );
}
