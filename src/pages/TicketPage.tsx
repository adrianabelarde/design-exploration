import { useCallback, useEffect, useRef, useState } from 'react';
import avatarUrl from '../assets/avatar.jpg';
import { buildTicketArt, type TicketArt } from '../ticket/art';
import { ticketAudio } from '../ticket/audio';
import { PunchCursor, type PunchCursorHandle } from '../ticket/PunchCursor';
import type { TicketHandle } from '../ticket/Ticket';
import { TicketScene } from '../ticket/TicketScene';
import { usePunchable } from '../ticket/usePunchable';
import '../ticket/ticket.css';

/** What the conductor punches into your ticket when you register. */
const RSVP_WORD = 'GOING';

function LocationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 10c0 5-5.35 9.12-7.18 10.37a1.45 1.45 0 0 1-1.64 0C9.35 19.12 4 15 4 10a8 8 0 1 1 16 0Z"
        stroke="#6e6e73"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.5" stroke="#6e6e73" strokeWidth="1.8" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg className="rsvp-ext" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 12 12 4M6 4h6v6" stroke="#a1a1a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Own component so usePunchable binds when the button actually mounts. */
function DoneButton({ onClick }: { onClick: () => void }) {
  const { ref } = usePunchable<HTMLButtonElement>();
  return (
    <button type="button" className="rsvp-done" ref={ref} onClick={onClick}>
      Done
    </button>
  );
}

export default function TicketPage() {
  const [art, setArt] = useState<TicketArt | null>(null);
  const [open, setOpen] = useState(false);
  /** Receipt dropped off-stage so the golden ticket can enter. */
  const [leaving, setLeaving] = useState(false);
  const [going, setGoing] = useState(false);
  const openTimer = useRef<number | null>(null);
  const ticketRef = useRef<TicketHandle>(null);
  const cursorRef = useRef<PunchCursorHandle>(null);
  // The invite itself is paper: clicks punch real holes through the card.
  const { ref: cardRef, reset: resetCard } = usePunchable<HTMLElement>();

  useEffect(() => {
    document.title = 'The Polar Express · RSVP';
    // Decode + onset-analyze the punch recording before the first punch.
    ticketAudio.preload();
    let alive = true;
    void buildTicketArt().then((a) => {
      if (alive) setArt(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Register: the click is also the audio-unlock gesture, so the whole
  // slide-in and punch sequence plays with sound. Choreography: the receipt
  // drops off the bottom first (instant feedback), the overlay fades in
  // partway through its fall, then the ticket slides down into the vacancy.
  const register = useCallback(() => {
    if (leaving) return;
    ticketAudio.unlock();
    setLeaving(true);
    openTimer.current = window.setTimeout(() => setOpen(true), 300);
  }, [leaving]);

  const close = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    setOpen(false);
    setLeaving(false);
    // The receipt re-prints from the top, same as the page-load entry (it
    // left via the bottom, so it comes back the way receipts do: fed down).
    // Both positions are off-screen, so the teleport up is invisible — and
    // a re-printed receipt is a FRESH sheet: every punched hole is gone.
    resetCard();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cardRef.current?.animate(
        [
          { transform: 'translateY(calc(-100vh - 100%))' },
          { transform: 'translateY(0)' },
        ],
        { duration: 700, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
      );
    }
  }, [cardRef, resetCard]);

  // The conductor punches once the ticket has slid in and settled.
  useEffect(() => {
    if (!open || !art) return;
    const t = window.setTimeout(() => {
      void ticketRef.current?.punchWord(RSVP_WORD);
    }, 1900);
    return () => window.clearTimeout(t);
  }, [open, art]);

  // Scroll lock + Escape while the ticket overlay is up.
  useEffect(() => {
    if (!open) return;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbar}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const onHoleScreen = useCallback((pt: { x: number; y: number } | null) => {
    cursorRef.current?.setAutoTarget(pt);
    if (pt) cursorRef.current?.snap();
  }, []);

  const onWordDone = useCallback(() => setGoing(true), []);

  return (
    <main className="stage rsvp-stage">
      <article className={`rsvp${leaving ? ' is-departing' : ''}`} ref={cardRef}>
        <p className="rsvp-kicker">You&rsquo;re invited</p>
        <h1>The Polar Express</h1>
        <p className="rsvp-sub">Christmas Eve departure · Round trip</p>
        <p className="rsvp-host">Hosted by The Conductor</p>

        <div className="rsvp-row">
          <div className="rsvp-chip rsvp-cal">
            <span>Dec</span>
            <strong>24</strong>
          </div>
          <div className="rsvp-rowtext">
            <strong>Thursday, December 24</strong>
            <span>Boarding at 11:55 PM sharp</span>
          </div>
        </div>

        <a
          className="rsvp-row rsvp-loc"
          href="https://www.google.com/maps/place/North+Pole"
          target="_blank"
          rel="noreferrer"
        >
          <div className="rsvp-chip">
            <LocationIcon />
          </div>
          <div className="rsvp-rowtext">
            <strong>
              Platform 7
              <ArrowUpRightIcon />
            </strong>
            <span>Right outside your window</span>
          </div>
        </a>

        <section className="rsvp-reg">
          <header>Registration</header>
          <div className="rsvp-reg-body">
            <p>Welcome, Adrian! To board the train, please register below.</p>
            <div className="rsvp-user">
              <img className="rsvp-avatar" src={avatarUrl} alt="" />
              <div>
                <strong>Adrian Abelarde</strong>
                <span>abelardeadrianangelo@gmail.com</span>
              </div>
            </div>
            <button
              type="button"
              className={`rsvp-btn${going ? ' is-going' : ''}`}
              onClick={register}
            >
              {going ? 'You’re going ✓' : 'Register'}
            </button>
          </div>
        </section>

        <p className="rsvp-fine">Seats are limited to those who can hear the bell.</p>
      </article>

      {open && art && (
        <div className="rsvp-overlay">
          <p className="rsvp-note">We had a feeling you&rsquo;d say yes.</p>
          <div className="rsvp-scene">
            <TicketScene
              art={art}
              ticketRef={ticketRef}
              onHoleScreen={onHoleScreen}
              onWordDone={onWordDone}
            />
          </div>
          {going && <DoneButton onClick={close} />}
        </div>
      )}

      <PunchCursor ref={cursorRef} />
    </main>
  );
}
