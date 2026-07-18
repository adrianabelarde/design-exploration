import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import TonePad, { type TonePadStage } from '../tonepad/TonePad';
import { buildTicketArt, type TicketArt } from '../ticket/art';
import {
  type TicketHandle,
  type TicketPresentationStage,
} from '../ticket/Ticket';
import { TicketScene } from '../ticket/TicketScene';
import goldenTicketMotionDiagram from '../assets/golden-ticket-motion-diagram.png';
import goldenTicketImage from '../assets/polar-ticket.png';
import etchASketchPost from '../assets/x-etch-a-sketch-post.png';
import keebyHeroImage from '../assets/keeby-web-hero.png';
import keebyNotchFigmaImage from '../assets/keeby-notch-figma-svg.png';
import keebyTopPaidImage from '../assets/keeby-top-paid.png';
import steeringAiQr from '../assets/steering-ai-qr.svg';
import iphoneScrollClip from '../../youtube-vN4U5FqrOdQ-16m40s-17m00s.mp4';
import secondKeynoteClip from '../../youtube-jGztGfRujSE-1m52s-2m09s.mp4';
import plainGameClip from '../../youtube-JowzyZgIKrM-18s-27s.mp4';
import betterAnimationsClip from '../../better-animations-26s.mp4';
import tonePadDemoClip from '../../tone-pad-demo.mov';
import goldenTicketDemoClip from '../../golden-ticket-demo.mov';
import etchASketchDemoClip from '../../etch-a-sketch-demo.mov';
import reactGrabDemoClip from '../../react-grab-demo.mov';
import keebyDemoClip from '../../keeby-demo.mp4';
import './talk.css';

const MIN_COPY_WIDTH = 260;
const MAX_COPY_WIDTH = 860;
const SLIDE_COUNT = 31;
const LIVE_DECK_URL = 'https://steering-ai-with-design-taste.vercel.app';
const REPOSITORY_URL = 'https://github.com/adrianabelarde/design-exploration';

let cachedTicketArt: TicketArt | null = null;
let ticketArtRequest: Promise<TicketArt> | null = null;

function loadTicketArt() {
  if (cachedTicketArt) return Promise.resolve(cachedTicketArt);
  ticketArtRequest ??= buildTicketArt().then((art) => {
    cachedTicketArt = art;
    return art;
  });
  return ticketArtRequest;
}

const DESCRIPTION_WORDS = [
  ['how', 'How'],
  ['i', 'I'],
  ['use', 'use'],
  ['ai', 'AI'],
  ['to', 'to'],
  ['turn', 'turn'],
  ['design', 'design'],
  ['ideas', 'ideas'],
  ['into', 'into'],
  ['interfaces', 'interfaces'],
  ['experiments', 'experiments'],
  ['and', 'and'],
  ['products', 'products'],
  ['people', 'people'],
  ['remember', 'remember.'],
] as const;

type CoverSeparatorId = 'interfaces-experiments' | 'experiments-and';

function UnslopSeparator({
  id,
  isUnslopped,
  onUnslop,
}: {
  id: CoverSeparatorId;
  isUnslopped: boolean;
  onUnslop: (id: CoverSeparatorId) => void;
}) {
  if (isUnslopped) {
    return <span className="talk-copy-separator">, </span>;
  }

  return (
    <span className="talk-unslop-trigger">
      <span className="talk-copy-separator"> — </span>
      <button
        type="button"
        className="talk-copy-tooltip"
        onClick={() => onUnslop(id)}
      >
        Unslop
      </button>
    </span>
  );
}

function slideFromHash() {
  const match = window.location.hash.match(/^#\/talk\/(\d+)$/);
  if (!match) return 0;
  return Math.min(SLIDE_COUNT - 1, Math.max(0, Number(match[1]) - 1));
}

function DemoDivider() {
  return (
    <section className="talk-slide talk-demo-divider">
      <h2>Demo</h2>
    </section>
  );
}

function DemoTitle({ title, label }: { title: string; label: string }) {
  return (
    <section className="talk-slide talk-demo-title">
      <p className="talk-eyebrow">{label}</p>
      <h2>{title}</h2>
    </section>
  );
}

function VideoSlide({
  src,
  fitViewport = false,
}: {
  src: string;
  fitViewport?: boolean;
}) {
  return (
    <section className={`talk-slide talk-inline-video-slide${fitViewport ? ' is-fit-viewport' : ''}`}>
      <video autoPlay controls loop playsInline muted preload="metadata">
        <source src={src} />
      </video>
    </section>
  );
}

function ComparisonVideoSlide() {
  const checklist = ['character', 'keyboard navigation', 'physics', 'platforms'];

  return (
    <section className="talk-slide talk-video-comparison">
      <h2>Same features. Different feel.</h2>
      <div className="talk-comparison-grid">
        {[plainGameClip, betterAnimationsClip].map((src) => (
          <article key={src}>
            <video autoPlay controls loop playsInline muted preload="metadata">
              <source src={src} />
            </video>
            <ul>
              {checklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function FeelCapsule({
  children,
}: {
  children: ReactNode;
}) {
  return <span className="talk-feel-capsule">{children}</span>;
}

function EtchPostSlide() {
  return (
    <section className="talk-slide talk-etch-post-slide">
      <img
        src={etchASketchPost}
        alt="Public Etch A Sketch e-signature post with 895.3K views"
      />
    </section>
  );
}

function KeebySvgWorkflowSlide() {
  return (
    <section className="talk-slide talk-keeby-svg-slide">
      <header>
        <h2>SVG is an explicit visual prompt.</h2>
        <p>I designed the Keeby Notch overlay in Figma, copied the frame as SVG, and gave it to AI. The geometry stopped being open to interpretation.</p>
      </header>
      <div className="talk-keeby-svg-flow">
        <figure className="talk-keeby-vector-card">
          <figcaption>Figma geometry</figcaption>
          <img
            src={keebyNotchFigmaImage}
            alt="Figma context menu copying the Keeby Notch frame as SVG"
          />
          <code>Copy as SVG</code>
        </figure>
        <div className="talk-keeby-svg-transfer" aria-hidden="true">
          <strong>SVG</strong>
          <span>→</span>
        </div>
        <figure className="talk-keeby-result-card">
          <figcaption>Implemented in Keeby</figcaption>
          <img src={keebyHeroImage} alt="Keeby website showing the app and its Notch overlay" />
        </figure>
      </div>
    </section>
  );
}

function ReactGrabSlide() {
  return (
    <section className="talk-slide talk-react-grab-slide">
      <header>
        <h2>Grab the exact element, then give it to AI.</h2>
        <p>React Grab by Aidan Bai copies the component and its context directly from the browser. Precise edits stop requiring long descriptions.</p>
      </header>
      <video autoPlay controls loop playsInline muted preload="metadata">
        <source src={reactGrabDemoClip} />
      </video>
    </section>
  );
}

function OpenWorkflowSlide() {
  const skills = [
    'emil-design-eng',
    'apple-design',
    'review-animations',
    'improve-animations',
    'find-animation-opportunities',
    'animation-vocabulary',
  ];

  return (
    <section className="talk-slide talk-open-workflow-slide">
      <div className="talk-open-workflow-copy">
        <h2>The system behind this talk is public.</h2>
        <p>These design and motion skills shaped the details. The repository is public, and the presentation is deployed on Vercel.</p>
        <ul>
          {skills.map((skill) => <li key={skill}>{skill}</li>)}
        </ul>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">github.com/adrianabelarde/design-exploration</a>
      </div>
      <figure className="talk-open-workflow-qr">
        <img src={steeringAiQr} alt="QR code for the live Steering AI With Design Taste presentation" />
        <figcaption>
          <strong>Open the live deck</strong>
          <a href={LIVE_DECK_URL} target="_blank" rel="noreferrer">steering-ai-with-design-taste.vercel.app</a>
        </figcaption>
      </figure>
    </section>
  );
}

function KeebyOutcomeSlide() {
  return (
    <section className="talk-slide talk-keeby-outcome-slide">
      <div className="talk-keeby-outcome-copy">
        <h2>Building in public became organic distribution.</h2>
        <p>That momentum helped Keeby reach:</p>
        <dl>
          <div>
            <dt>$6K+ USD</dt>
            <dd>in a single month</dd>
          </div>
          <div>
            <dt>1K+</dt>
            <dd>users</dd>
          </div>
        </dl>
      </div>
      <figure className="talk-keeby-outcome-proof">
        <img src={keebyTopPaidImage} alt="Keeby ranked number one in Top Paid Apps" />
        <figcaption>#1 Top Paid App</figcaption>
      </figure>
    </section>
  );
}

function TonePadStagesSlide() {
  const stages = [
    {
      stage: 1,
      title: 'Body',
      description: 'Layout only. No interaction yet.',
    },
    {
      stage: 2,
      title: 'Interaction',
      description: 'Direct X and Y movement with grid snapping.',
    },
    {
      stage: 3,
      title: 'Feel',
      description: 'Circle bloom, press scale, and smooth following.',
    },
    {
      stage: 4,
      title: 'Feedback',
      description: 'Haptics and carefully gated ticking sounds.',
    },
    {
      stage: 5,
      title: "Don't do",
      description: 'Design engineering is not just good design and smooth animation. Feedback also needs thresholds and restraint, or it becomes overwhelming.',
    },
  ] satisfies Array<{ stage: TonePadStage; title: string; description: string }>;

  return (
    <section className="talk-slide talk-tonepad-stages">
      <h2>Build the interaction in layers.</h2>
      <div className="talk-tonepad-stage-grid">
        {stages.map(({ stage, title, description }) => (
          <article key={stage} className={stage === 5 ? 'is-dont' : ''}>
            <TonePad stage={stage} size={158} />
            <div className="talk-tonepad-stage-caption">
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TicketMapPreview({
  source,
  label,
}: {
  source: HTMLCanvasElement;
  label: string;
}) {
  const drawPreview = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
  }, [source]);

  return (
    <figure>
      <canvas ref={drawPreview} aria-label={`${label} texture map`} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function GoldenTicketStageSlide({
  step,
  title,
  description,
  showMotionReference = false,
}: {
  step: 'image' | TicketPresentationStage;
  title?: string;
  description?: string;
  showMotionReference?: boolean;
}) {
  const [art, setArt] = useState<TicketArt | null>(() => cachedTicketArt);
  const ticketRef = useRef<TicketHandle>(null);

  useEffect(() => {
    if (step === 'image') return;
    let active = true;
    void loadTicketArt().then((nextArt) => {
      if (active) setArt(nextArt);
    });
    return () => {
      active = false;
    };
  }, [step]);

  if (step === 'material') {
    return (
      <section className="talk-slide talk-golden-material-slide">
        <div className="talk-golden-material-comparison">
          <article>
            <div className="talk-golden-material-media">
              <img src={goldenTicketImage} alt="Plain golden ticket image" />
            </div>
            <strong>Plain image</strong>
          </article>

          <article>
            <div className="talk-golden-material-media" aria-busy={!art}>
              {art ? (
                <TicketScene
                  art={art}
                  ticketRef={ticketRef}
                  cameraZ={4.7}
                  movingLight
                  presentationStage="material"
                  punchable={false}
                />
              ) : (
                <img className="is-loading" src={goldenTicketImage} alt="" />
              )}
            </div>
            <strong>Physical gold</strong>
          </article>
        </div>

        {art && (
          <div className="talk-golden-material-maps">
            <TicketMapPreview
              source={art.front.map.image as HTMLCanvasElement}
              label="Albedo"
            />
            <TicketMapPreview
              source={art.front.normalMap.image as HTMLCanvasElement}
              label="Normal"
            />
            <TicketMapPreview
              source={art.front.roughnessMap.image as HTMLCanvasElement}
              label="Roughness"
            />
            <figure>
              <div className="talk-golden-metalness-map">1.0</div>
              <figcaption>Metalness</figcaption>
            </figure>
          </div>
        )}

        {title && (
          <div className="talk-golden-ticket-caption">
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`talk-slide talk-golden-ticket-stage${step === 'image' ? ' is-source' : ''}`}>
      <div className="talk-golden-ticket-visual" aria-busy={step !== 'image' && !art}>
        {step === 'image' ? (
          <img
            className="talk-golden-ticket-source"
            src={goldenTicketImage}
            alt="AI-generated Polar Express golden ticket"
          />
        ) : art ? (
          <TicketScene
            art={art}
            ticketRef={ticketRef}
            cameraZ={9}
            presentationStage={step}
            loopEntry={step === 'bend'}
            punchable={false}
          />
        ) : (
          <img
            className="talk-golden-ticket-source is-loading"
            src={goldenTicketImage}
            alt=""
          />
        )}

        {showMotionReference && (
          <figure className="talk-golden-ticket-reference">
            <img
              src={goldenTicketMotionDiagram}
              alt="Figma side-view diagram showing the ticket curving forward as it falls"
            />
          </figure>
        )}
      </div>

      {title && (
        <div className="talk-golden-ticket-caption">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      )}
    </section>
  );
}

function GoldenTicketProgressSlide() {
  const [art, setArt] = useState<TicketArt | null>(() => cachedTicketArt);
  const dropRef = useRef<TicketHandle>(null);
  const interactiveRef = useRef<TicketHandle>(null);
  const bendRef = useRef<TicketHandle>(null);

  useEffect(() => {
    let active = true;
    void loadTicketArt().then((nextArt) => {
      if (active) setArt(nextArt);
    });
    return () => {
      active = false;
    };
  }, []);

  const stages = [
    {
      stage: 'drop',
      title: 'Straight drop',
      description: 'Start with one clear downward motion.',
      ticketRef: dropRef,
    },
    {
      stage: 'interactive',
      title: 'Cursor response',
      description: 'Movement shifts the ticket and its reflections.',
      ticketRef: interactiveRef,
    },
    {
      stage: 'bend',
      title: 'Curved fall',
      description: 'The Figma side view gives the fall a physical path.',
      ticketRef: bendRef,
    },
  ] satisfies Array<{
    stage: TicketPresentationStage;
    title: string;
    description: string;
    ticketRef: RefObject<TicketHandle | null>;
  }>;

  return (
    <section className="talk-slide talk-golden-progress">
      <div className="talk-golden-progress-grid" aria-busy={!art}>
        <FigmaMotionReference />
        {stages.map(({ stage, title, description, ticketRef }) => (
          <article key={stage}>
            <div className="talk-golden-progress-scene">
              {art ? (
                <TicketScene
                  art={art}
                  ticketRef={ticketRef}
                  cameraZ={11.5}
                  presentationStage={stage}
                  loopEntry
                  punchable={false}
                />
              ) : (
                <img src={goldenTicketImage} alt="" />
              )}
            </div>
            <div className="talk-golden-progress-caption">
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

function FigmaMotionReference() {
  const [open, setOpen] = useState(false);

  const transitionTo = useCallback((nextOpen: boolean) => {
    const update = () => flushSync(() => setOpen(nextOpen));
    const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
    if (startViewTransition) {
      startViewTransition.call(document, update);
    } else {
      update();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') transitionTo(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, transitionTo]);

  if (open) {
    return createPortal(
      <div
        className="talk-figma-zoom-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Figma motion reference"
        onClick={() => transitionTo(false)}
      >
        <button
          type="button"
          className="talk-figma-zoom-close"
          onClick={(event) => {
            event.stopPropagation();
            transitionTo(false);
          }}
        >
          Close
        </button>
        <div className="talk-figma-zoom-card" onClick={(event) => event.stopPropagation()}>
          <img
            className="talk-figma-reference-art"
            src={goldenTicketMotionDiagram}
            alt="Figma side-view diagram for the curved ticket fall"
          />
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <aside className="talk-golden-progress-figma">
      <button
        type="button"
        onClick={() => transitionTo(true)}
        aria-label="Zoom in on the Figma motion reference"
      >
        <img
          className="talk-figma-reference-art"
          src={goldenTicketMotionDiagram}
          alt="Figma side-view diagram for the curved ticket fall"
        />
      </button>
      <p>I copied this frame as SVG and pasted it into my AI so it understood the exact slide-down animation I wanted.</p>
    </aside>
  );
}

function CoverSlide() {
  const [copyWidth, setCopyWidth] = useState(770);
  const [isResizing, setIsResizing] = useState(false);
  const [unsloppedSeparators, setUnsloppedSeparators] = useState<ReadonlySet<CoverSeparatorId>>(
    () => new Set(),
  );
  const resizeState = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    maxWidth: number;
  } | null>(null);
  const copyBox = useRef<HTMLDivElement>(null);
  const copyTokenRefs = useRef(new Map<string, HTMLSpanElement>());
  const previousDocumentStyles = useRef<{ cursor: string; userSelect: string } | null>(null);

  const clampWidth = (width: number) =>
    Math.min(MAX_COPY_WIDTH, Math.max(MIN_COPY_WIDTH, width));

  const restoreDocumentStyles = () => {
    if (!previousDocumentStyles.current) return;
    document.body.style.cursor = previousDocumentStyles.current.cursor;
    document.body.style.userSelect = previousDocumentStyles.current.userSelect;
    previousDocumentStyles.current = null;
  };

  const finishResize = (pointerId: number) => {
    if (resizeState.current?.pointerId !== pointerId) return;
    resizeState.current = null;
    setIsResizing(false);
    restoreDocumentStyles();
  };

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeState.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const renderedWidth = copyBox.current?.getBoundingClientRect().width ?? copyWidth;
    const availableWidth =
      copyBox.current?.parentElement?.getBoundingClientRect().width ?? MAX_COPY_WIDTH;
    resizeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: renderedWidth,
      maxWidth: Math.min(MAX_COPY_WIDTH, availableWidth),
    };
    previousDocumentStyles.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    setIsResizing(true);
  };

  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeResize = resizeState.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) return;
    setCopyWidth(Math.min(
      activeResize.maxWidth,
      Math.max(MIN_COPY_WIDTH, activeResize.startWidth + event.clientX - activeResize.startX),
    ));
  };

  const onResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setCopyWidth((width) => clampWidth(width - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setCopyWidth((width) => clampWidth(width + step));
    }
  };

  const unslopSeparator = (separatorId: CoverSeparatorId) => {
    if (unsloppedSeparators.has(separatorId)) return;

    const before = new Map(
      [...copyTokenRefs.current].map(([id, element]) => [id, element.getBoundingClientRect()]),
    );

    flushSync(() => {
      setUnsloppedSeparators((current) => new Set(current).add(separatorId));
    });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    copyTokenRefs.current.forEach((element, id) => {
      const previousRect = before.get(id);
      if (!previousRect) return;
      const nextRect = element.getBoundingClientRect();
      const x = previousRect.left - nextRect.left;
      const y = previousRect.top - nextRect.top;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;

      element.animate(
        [
          { transform: `translate(${x}px, ${y}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 280,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        },
      );
    });
  };

  useEffect(() => () => restoreDocumentStyles(), []);

  return (
    <section className="talk-slide talk-cover" aria-labelledby="presentation-title">
      <div className="talk-cover-copy">
        <h1 id="presentation-title">Steering AI With Design Taste</h1>
        <div
          ref={copyBox}
          className={`talk-copy-resizable${isResizing ? ' is-resizing' : ''}`}
          style={{ width: copyWidth }}
        >
          <p>
            {DESCRIPTION_WORDS.map(([id, word], index) => {
              const followsSeparator = id === 'experiments' || id === 'and';
              return (
                <Fragment key={id}>
                  {index > 0 && !followsSeparator && ' '}
                  <span
                    ref={(element) => {
                      if (element) copyTokenRefs.current.set(id, element);
                      else copyTokenRefs.current.delete(id);
                    }}
                    className="talk-copy-token"
                    data-copy-token={id}
                  >
                    {word}
                  </span>
                  {id === 'interfaces' && (
                    <UnslopSeparator
                      id="interfaces-experiments"
                      isUnslopped={unsloppedSeparators.has('interfaces-experiments')}
                      onUnslop={unslopSeparator}
                    />
                  )}
                  {id === 'experiments' && (
                    <UnslopSeparator
                      id="experiments-and"
                      isUnslopped={unsloppedSeparators.has('experiments-and')}
                      onUnslop={unslopSeparator}
                    />
                  )}
                </Fragment>
              );
            })}
          </p>
          <div
            className="talk-copy-resize-handle"
            role="slider"
            tabIndex={0}
            aria-label="Adjust description width"
            aria-valuemin={MIN_COPY_WIDTH}
            aria-valuemax={MAX_COPY_WIDTH}
            aria-valuenow={Math.round(copyWidth)}
            aria-orientation="horizontal"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            onLostPointerCapture={(event) => finishResize(event.pointerId)}
            onKeyDown={onResizeKeyDown}
          >
            <span>{Math.round(copyWidth)} px</span>
          </div>
        </div>
        <div className="talk-cover-person">
          <strong>Adrian Abelarde</strong>
          <span>Full-Stack Developer With Design Engineering Taste</span>
        </div>
      </div>
    </section>
  );
}

const slides = [
  <CoverSlide key="cover" />,
  <section key="game-feel" className="talk-slide talk-demo-divider"><h2>Game feel</h2></section>,
  <VideoSlide key="plain-game" src={plainGameClip} />,
  <VideoSlide key="polished-game" src={betterAnimationsClip} />,
  <ComparisonVideoSlide key="same-features" />,
  <section key="definition" className="talk-slide talk-definition-quote">
    <p><FeelCapsule>Interaction feel</FeelCapsule> is the application of <FeelCapsule>game feel</FeelCapsule> principles to everyday product UIs.</p>
  </section>,
  <section key="definition-alive" className="talk-slide talk-definition-alive">
    <p><FeelCapsule>Interaction feel</FeelCapsule> makes digital interactions more responsive, expressive, and emotionally satisfying.</p>
    <p><FeelCapsule>Interaction feel</FeelCapsule> makes an app feel alive.</p>
  </section>,
  <section key="not-new" className="talk-slide talk-not-new"><h2>Not new</h2></section>,
  <VideoSlide key="iphone" src={iphoneScrollClip} />,
  <VideoSlide key="second-keynote" src={secondKeynoteClip} />,
  <section key="sum" className="talk-slide talk-sum-statement">
    <p><FeelCapsule>Interaction feel</FeelCapsule> is not just beautiful design, good motion, or precise engineering.</p>
    <p>It’s the sum of all of them in a way that creates an engaging result.</p>
  </section>,

  <DemoDivider key="demo-keeby" />,
  <DemoTitle key="tone-title" label="Keeby" title="A tone control, but playable." />,
  <VideoSlide key="tone-video" src={tonePadDemoClip} />,
  <TonePadStagesSlide key="tone-stages" />,

  <DemoDivider key="demo-ticket" />,
  <DemoTitle key="ticket-title" label="Public experiment" title="RSVP but Golden Ticket" />,
  <VideoSlide key="ticket-video" src={goldenTicketDemoClip} fitViewport />,
  <GoldenTicketStageSlide
    key="ticket-material"
    step="material"
  />,
  <GoldenTicketProgressSlide key="ticket-progress" />,

  <DemoDivider key="demo-etch" />,
  <DemoTitle key="etch-title" label="Public experiment" title="E-signature but Etch A Sketch" />,
  <VideoSlide key="etch-video" src={etchASketchDemoClip} fitViewport />,
  <EtchPostSlide key="etch-post" />,
  <KeebySvgWorkflowSlide key="keeby-svg-workflow" />,
  <ReactGrabSlide key="react-grab" />,
  <OpenWorkflowSlide key="open-workflow" />,
  <KeebyOutcomeSlide key="keeby-outcome" />,
  <section key="distribution" className="talk-slide talk-distribution-message">
    <h2>Share the process.<br />The process is the marketing.</h2>
    <p>People do not share ads. They share process.</p>
  </section>,
  <VideoSlide key="keeby-demo" src={keebyDemoClip} fitViewport />,
  <section key="closing" className="talk-slide talk-distribution-close">
    <h2>Shipping is only<br />half the job.</h2>
    <p>Distribution makes sure the work you are proud of gets a chance.</p>
  </section>,
];

export default function TalkPage() {
  const [slideIndex, setSlideIndex] = useState(slideFromHash);

  const goToSlide = useCallback((nextIndex: number) => {
    const clamped = Math.min(SLIDE_COUNT - 1, Math.max(0, nextIndex));
    setSlideIndex(clamped);
    window.history.replaceState(null, '', `#/talk/${clamped + 1}`);
  }, []);

  useEffect(() => {
    document.title = `${slideIndex + 1} / ${SLIDE_COUNT} · Steering AI With Design Taste`;
  }, [slideIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, [role="slider"]')) return;

      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        goToSlide(slideIndex + 1);
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        goToSlide(slideIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToSlide(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToSlide(SLIDE_COUNT - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToSlide, slideIndex]);

  return (
    <main className="talk-shell">
      <div className="talk-slide-stage" key={slideIndex} aria-live="polite">
        {slides[slideIndex]}
      </div>
      <footer className="talk-deck-footer" aria-label={`Slide ${slideIndex + 1} of ${SLIDE_COUNT}`}>
        <span>{String(slideIndex + 1).padStart(2, '0')} / {SLIDE_COUNT}</span>
      </footer>
    </main>
  );
}
