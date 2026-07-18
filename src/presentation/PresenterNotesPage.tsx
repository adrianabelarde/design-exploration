import { useEffect, useMemo, useState } from 'react';
import { emergencyCuts, talkCheckpoints, talkNotes } from './talkNotes';
import './presenter-notes.css';

type NotesMode = 'script' | 'cheat';

function NotesNav({ mode }: { mode: NotesMode }) {
  return (
    <nav className="presenter-nav" aria-label="Presentation resources">
      <a href="#/talk/1">Deck</a>
      <a className={mode === 'script' ? 'is-current' : ''} href="#/talk-script">Script</a>
      <a className={mode === 'cheat' ? 'is-current' : ''} href="#/talk-cheat-sheet">Cheat sheet</a>
    </nav>
  );
}

function JumpGrid() {
  const jumpTo = (slide: number) => {
    document.getElementById(`note-slide-${slide}`)?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="presenter-jumps" aria-label="Jump to slide">
      {talkNotes.map(({ slide }) => (
        <button key={slide} type="button" onClick={() => jumpTo(slide)}>
          {slide}
        </button>
      ))}
    </div>
  );
}

function UtilityBar({ fontScale, setFontScale }: { fontScale: number; setFontScale: (scale: number) => void }) {
  return (
    <div className="presenter-utilities">
      <span>Text size</span>
      <button
        type="button"
        aria-label="Decrease script text size"
        onClick={() => setFontScale(Math.max(0.9, Number((fontScale - 0.1).toFixed(1))))}
      >
        A−
      </button>
      <button
        type="button"
        aria-label="Increase script text size"
        onClick={() => setFontScale(Math.min(1.4, Number((fontScale + 0.1).toFixed(1))))}
      >
        A+
      </button>
      <button type="button" onClick={() => window.print()}>Print</button>
    </div>
  );
}

export default function PresenterNotesPage({ mode }: { mode: NotesMode }) {
  const [fontScale, setFontScale] = useState(1);
  const isScript = mode === 'script';
  const title = isScript ? 'Full presentation script' : 'Presentation cheat sheet';
  const subtitle = isScript
    ? '31 slides · about 29 minutes at a relaxed pace · stage directions are separated from spoken lines'
    : 'One glance per slide · use the bold line to recover if you lose your place';
  const pageStyle = useMemo(
    () => ({ '--presenter-font-scale': fontScale } as React.CSSProperties),
    [fontScale],
  );

  useEffect(() => {
    document.title = `${title} · Steering AI With Design Taste`;
  }, [title]);

  return (
    <main className={`presenter-page is-${mode}`} style={pageStyle}>
      <div className="presenter-shell">
        <header className="presenter-header">
          <NotesNav mode={mode} />
          <div className="presenter-heading-row">
            <div>
              <p className="presenter-kicker">Steering AI With Design Taste</p>
              <h1>{title}</h1>
              <p className="presenter-meta">{subtitle}</p>
            </div>
            <UtilityBar fontScale={fontScale} setFontScale={setFontScale} />
          </div>
          <JumpGrid />
        </header>

        <section className="presenter-cards" aria-label={title}>
          {talkNotes.map((note) => (
            <article className="presenter-card" id={`note-slide-${note.slide}`} key={note.slide}>
              <header className="presenter-card-header">
                <a
                  className="presenter-slide-number"
                  href={`#/talk/${note.slide}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open slide ${note.slide}`}
                >
                  {String(note.slide).padStart(2, '0')}
                </a>
                <div>
                  <h2>{note.title}</h2>
                  <time>{note.time}</time>
                </div>
              </header>

              {isScript ? (
                <>
                  <p className="presenter-direction"><span>Do</span>{note.cue}</p>
                  <div className="presenter-script-copy">
                    {note.script.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                  <blockquote>{note.anchor}</blockquote>
                </>
              ) : (
                <>
                  <p className="presenter-cheat-line">{note.cheat}</p>
                  <blockquote>{note.anchor}</blockquote>
                  <p className="presenter-direction"><span>Do</span>{note.cue}</p>
                </>
              )}
            </article>
          ))}
        </section>

        <section className="presenter-backup-grid">
          <article>
            <h2>Clock checkpoints</h2>
            <ul>{talkCheckpoints.map((checkpoint) => <li key={checkpoint}>{checkpoint}</li>)}</ul>
          </article>
          <article>
            <h2>Emergency cuts</h2>
            <ol>{emergencyCuts.map((cut) => <li key={cut}>{cut}</li>)}</ol>
          </article>
          <article className="presenter-lost-card">
            <h2>If you lose your place</h2>
            <p><strong>Feature makes it useful. Feeling makes it memorable. Distribution gives it a chance to matter.</strong></p>
            <p>Jump to the next demo divider on slides 12, 16, or 21, then continue from there.</p>
          </article>
        </section>

        <footer className="presenter-footer">
          <a href="#/talk/1">Open the deck</a>
          <span>Adrian Abelarde · Codex talk</span>
        </footer>
      </div>
    </main>
  );
}
