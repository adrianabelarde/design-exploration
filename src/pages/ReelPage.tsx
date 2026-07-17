import { useEffect } from 'react';
import { ALBUMS } from '../reel/albums';
import { ReelCard } from '../reel/ReelCard';
import '../reel/reel.css';

/**
 * Card-only for now: the gift-card treatment is being dialed in, so the
 * view-master viewer (dock, lens, lever) is parked until the card is right.
 */
export default function ReelPage() {
  useEffect(() => {
    document.title = 'Albums · Reel Viewer';
  }, []);

  return (
    <main className="stage vm-stage">
      <div className="vm-wrap">
        <div className="vm-cards">
          <ReelCard album={ALBUMS[0]} index={0} onSelect={() => {}} />
        </div>
      </div>
    </main>
  );
}
