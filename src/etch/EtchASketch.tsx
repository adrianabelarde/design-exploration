import { useEffect, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { Knob, type KnobHandle } from './Knob';
import { PowderScreen } from './powder';
import { etchAudio } from './audio';
import {
  Backlash,
  SCREEN_H_MM,
  SCREEN_W_MM,
  SPOOL_RADIUS_MM,
  STYLUS_TIP_MM,
  clamp,
} from './physics';
import logoUrl from '../assets/etch-logo.svg';
import './etch.css';

const FRAME_W = 390;
const FRAME_H = 356;
const SCREEN_W = 260;
const SCREEN_H = Math.round(SCREEN_W * (SCREEN_H_MM / SCREEN_W_MM)); // true aspect

/** Δpx = r_spool · Δθ, scaled from the real machine. ≈15.5 px/rad here. */
const PX_PER_RAD = SCREEN_W * (SPOOL_RADIUS_MM / SCREEN_W_MM);
const LINE_W = SCREEN_W * (STYLUS_TIP_MM / SCREEN_W_MM);

const SHAKE_SPEED = 450; // px/s pointer speed that counts as a shake stroke
const SHAKE_COOLDOWN_MS = 90;

/** perfect-freehand options for glass doodling (knobs stay constant-width). */
const FREEHAND = {
  size: LINE_W * 2.2,
  thinning: 0.55,
  smoothing: 0.6,
  streamline: 0.45,
};

interface EtchASketchProps {
  /** Called with each drawn segment's length in px (knobs or glass). */
  onDraw?: (distancePx: number) => void;
  /** Called whenever powder redeposits (any shake). */
  onErase?: () => void;
}

export function EtchASketch({ onDraw, onErase }: EtchASketchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const powderRef = useRef<PowderScreen | null>(null);
  const knobX = useRef<KnobHandle>(null);
  const knobY = useRef<KnobHandle>(null);
  const glassDrag = useRef<number | null>(null);
  const strokePts = useRef<[number, number, number][]>([]);
  const strokeSim = useRef(true); // simulate pressure unless a real pen

  const pos = useRef({ x: SCREEN_W / 2, y: SCREEN_H / 2 });
  const lastMoveT = useRef(0);
  const backlash = useRef({ x: new Backlash(), y: new Backlash() });

  const grab = useRef<{
    id: number;
    sx: number;
    sy: number;
    lx: number;
    ly: number;
    lt: number;
    vx: number; // smoothed, for the tilt
    vy: number;
    exX: number; // last turnaround point of the shake oscillation
    exY: number;
    exT: number;
    dirX: number; // direction of the current sweep
    dirY: number;
  } | null>(null);
  const lastShakeT = useRef(0);
  const shaking = useRef(false);
  const [muted, setMuted] = useState(false);

  const toyRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [zoomTf, setZoomTf] = useState('');
  const elevateTimer = useRef(0);

  useEffect(() => {
    powderRef.current = new PowderScreen(canvasRef.current!, SCREEN_W, SCREEN_H, LINE_W);
  }, []);

  /** FLIP zoom: measure the toy's resting rect, then translate + scale it
      to the viewport center. Measured with transform cleared inside the
      same frame, so no flash. */
  const computeZoom = () => {
    const el = toyRef.current!;
    const prev = el.style.transform;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = prev;
    const s = Math.min(
      1.35,
      (window.innerWidth * 0.9) / r.width,
      (window.innerHeight * 0.82) / r.height,
    );
    const dx = window.innerWidth / 2 - (r.left + r.width / 2);
    const dy = window.innerHeight / 2 - (r.top + r.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  };

  const openZoom = () => {
    window.clearTimeout(elevateTimer.current);
    setElevated(true);
    setZoomTf(computeZoom());
    setFocused(true);
  };

  const closeZoom = () => {
    setFocused(false);
    setZoomTf('');
    // keep the toy above the fading backdrop until it lands
    elevateTimer.current = window.setTimeout(() => setElevated(false), 500);
  };

  const onFrameDoubleClick = (e: React.MouseEvent) => {
    const t = e.target as Element;
    if (t.closest('.eas-knob') || t.closest('.eas-screen')) return;
    if (focused) closeZoom();
    else openZoom();
  };

  useEffect(() => {
    if (!focused) return;
    // lock scroll without layout shift: reserve the scrollbar's width
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeZoom();
    };
    const onResize = () => setZoomTf(computeZoom());
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const moveStylus = (dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    const p = pos.current;
    const nx = clamp(p.x + dx, LINE_W, SCREEN_W - LINE_W);
    const ny = clamp(p.y + dy, LINE_W, SCREEN_H - LINE_W);
    if (nx === p.x && ny === p.y) return;

    powderRef.current?.line(p.x, p.y, nx, ny);

    const now = performance.now();
    const dt = Math.max(1, now - lastMoveT.current);
    const dist = Math.hypot(nx - p.x, ny - p.y);
    etchAudio.scratch(Math.min(3000, (dist / dt) * 1000));
    lastMoveT.current = now;
    pos.current = { x: nx, y: ny };
    onDraw?.(dist);
  };

  /** Reposition the stylus without carving: the pen-lift the real toy never
      had. The knobs still spin (the carriage has to travel), and the stylus
      leaves its resting dot where it lands. */
  const liftStylusTo = (x: number, y: number) => {
    const p = pos.current;
    const nx = clamp(x, LINE_W, SCREEN_W - LINE_W);
    const ny = clamp(y, LINE_W, SCREEN_H - LINE_W);
    const dx = nx - p.x;
    const dy = ny - p.y;
    if (dx === 0 && dy === 0) return;
    knobX.current?.spin(dx / PX_PER_RAD);
    knobY.current?.spin(-dy / PX_PER_RAD);
    pos.current = { x: nx, y: ny };
    powderRef.current?.dot(nx, ny);
  };

  /** Pointer → stylus space, correct under any zoom/scale transform. */
  const glassPoint = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (SCREEN_W / r.width),
      y: (e.clientY - r.top) * (SCREEN_H / r.height),
    };
  };

  const liveOutline = () =>
    getStroke(strokePts.current, {
      ...FREEHAND,
      simulatePressure: strokeSim.current,
    });

  const onGlassDown = (e: React.PointerEvent) => {
    e.stopPropagation(); // drawing, not a frame grab
    glassDrag.current = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers can't be captured */
    }
    const pt = glassPoint(e);
    liftStylusTo(pt.x, pt.y); // each press starts a fresh stroke
    strokeSim.current = e.pointerType !== 'pen';
    strokePts.current = [[pos.current.x, pos.current.y, e.pressure || 0.5]];
  };

  /** Glass doodling runs through perfect-freehand: points accumulate while
      the pointer is down, the outline previews live, and the finished
      stroke is carved from the powder on release. The knobs still spin. */
  const onGlassMove = (e: React.PointerEvent) => {
    if (glassDrag.current !== e.pointerId) return;
    const pt = glassPoint(e);
    const p = pos.current;
    const nx = clamp(pt.x, LINE_W, SCREEN_W - LINE_W);
    const ny = clamp(pt.y, LINE_W, SCREEN_H - LINE_W);
    const dx = nx - p.x;
    const dy = ny - p.y;
    if (dx === 0 && dy === 0) return;

    knobX.current?.spin(dx / PX_PER_RAD);
    knobY.current?.spin(-dy / PX_PER_RAD);
    pos.current = { x: nx, y: ny };

    const now = performance.now();
    const dt = Math.max(1, now - lastMoveT.current);
    const dist = Math.hypot(dx, dy);
    etchAudio.scratch(Math.min(3000, (dist / dt) * 1000));
    lastMoveT.current = now;
    onDraw?.(dist);

    strokePts.current.push([nx, ny, e.pressure || 0.5]);
    powderRef.current?.previewStroke(liveOutline());
  };

  const onGlassUp = (e: React.PointerEvent) => {
    if (glassDrag.current !== e.pointerId) return;
    glassDrag.current = null;
    powderRef.current?.commitStroke(liveOutline());
    strokePts.current = [];
  };

  // Left knob: clockwise → right. Right knob: clockwise → up. Like the toy.
  const turnX = (d: number) =>
    moveStylus(backlash.current.x.apply(d) * PX_PER_RAD, 0);
  const turnY = (d: number) =>
    moveStylus(0, -backlash.current.y.apply(d) * PX_PER_RAD);

  const shakeHit = (energy: number) => {
    const now = performance.now();
    if (now - lastShakeT.current < SHAKE_COOLDOWN_MS) return;
    lastShakeT.current = now;
    powderRef.current?.deposit(0.35 + 0.55 * energy);
    etchAudio.rattle(energy);
    onErase?.();
  };

  const onFrameDown = (e: React.PointerEvent) => {
    if (shaking.current) return;
    const f = frameRef.current!;
    grab.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      lt: performance.now(),
      vx: 0,
      vy: 0,
      exX: e.clientX,
      exY: e.clientY,
      exT: performance.now(),
      dirX: 0,
      dirY: 0,
    };
    try {
      f.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers can't be captured; drag still works via bubbling */
    }
    f.classList.remove('eas-settling');
    f.classList.add('eas-lifted');
  };

  const onFrameMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || e.pointerId !== g.id) return;
    const now = performance.now();
    const dt = Math.max(1, now - g.lt) / 1000;
    const dxm = e.clientX - g.lx;
    const dym = e.clientY - g.ly;
    g.vx = 0.5 * g.vx + 0.5 * (dxm / dt);
    g.vy = 0.5 * g.vy + 0.5 * (dym / dt);
    g.lx = e.clientX;
    g.ly = e.clientY;
    g.lt = now;

    // Shake detection per SWEEP: high-rate pointer events always pass
    // through ~zero velocity at each turnaround, so instantaneous checks
    // never fire. Instead, when the motion direction flips, score the
    // whole sweep since the last turnaround by amplitude and speed.
    if (g.dirX === 0 && g.dirY === 0) {
      if (Math.hypot(dxm, dym) > 3) {
        g.dirX = dxm;
        g.dirY = dym;
      }
    } else if (dxm * g.dirX + dym * g.dirY < 0 && Math.hypot(dxm, dym) > 2) {
      const swing = Math.hypot(e.clientX - g.exX, e.clientY - g.exY);
      const dur = Math.max(16, now - g.exT);
      const speed = (swing / dur) * 1000;
      if (swing > 30 && speed > SHAKE_SPEED) {
        shakeHit(Math.min(1, speed / 2200));
      }
      g.exX = e.clientX;
      g.exY = e.clientY;
      g.exT = now;
      g.dirX = dxm;
      g.dirY = dym;
    }

    const ox = clamp((e.clientX - g.sx) * 0.45, -48, 48);
    const oy = clamp((e.clientY - g.sy) * 0.45, -48, 48);
    const tilt = clamp(g.vx * 0.003, -3.5, 3.5);
    frameRef.current!.style.transform = `translate(${ox}px, ${oy}px) rotate(${tilt}deg)`;
  };

  const onFrameUp = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || e.pointerId !== g.id) return;
    grab.current = null;
    const f = frameRef.current!;
    f.classList.add('eas-settling');
    f.classList.remove('eas-lifted');
    f.style.transform = '';
    window.setTimeout(() => f.classList.remove('eas-settling'), 600);
  };

  /** Accessible stand-in for physically shaking it. */
  const autoShake = () => {
    if (shaking.current) return;
    shaking.current = true;
    etchAudio.unlock();
    onErase?.();
    const f = frameRef.current!;
    f.classList.add('eas-autoshake');
    [0.6, 0.6, 0.7, 0.8, 1].forEach((energy, i) => {
      window.setTimeout(() => {
        powderRef.current?.deposit(energy);
        etchAudio.rattle(0.4 + 0.5 * energy);
      }, 90 + i * 150);
    });
    window.setTimeout(() => {
      f.classList.remove('eas-autoshake');
      shaking.current = false;
    }, 950);
  };

  const onSheenMove = (e: React.MouseEvent) => {
    if (!sheenRef.current) return;
    const dx = (e.clientX / window.innerWidth - 0.5) * 10;
    const dy = (e.clientY / window.innerHeight - 0.5) * 6;
    sheenRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  return (
    <div
      className="eas-root"
      onPointerDownCapture={() => etchAudio.unlock()}
      onMouseMove={onSheenMove}
    >
      <div
        className={`eas-backdrop${focused ? ' eas-on' : ''}`}
        onClick={closeZoom}
        aria-hidden="true"
      />
      <div
        ref={toyRef}
        className={`eas-toy${elevated ? ' eas-elevated' : ''}`}
        style={zoomTf ? { transform: zoomTf } : undefined}
      >
        <div
          ref={frameRef}
          className="eas-frame"
          style={{ width: FRAME_W, height: FRAME_H }}
          onPointerDown={onFrameDown}
          onPointerMove={onFrameMove}
          onPointerUp={onFrameUp}
          onPointerCancel={onFrameUp}
          onDoubleClick={onFrameDoubleClick}
        >
          <div className="eas-grain" />
          <div className="eas-bezel">
            <div
              className="eas-screen"
              style={{ width: SCREEN_W, height: SCREEN_H }}
              onPointerDown={onGlassDown}
              onPointerMove={onGlassMove}
              onPointerUp={onGlassUp}
              onPointerCancel={onGlassUp}
            >
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Etch A Sketch drawing surface"
              />
              <div className="eas-shade" />
              <div ref={sheenRef} className="eas-sheen" />
            </div>
          </div>
          <svg className="eas-hint eas-hint-l" viewBox="0 0 34 16" aria-hidden="true">
            <path d="M15 0 L15 16 L0 8 Z" />
            <path d="M19 0 L19 16 L34 8 Z" />
          </svg>
          <svg className="eas-hint eas-hint-r" viewBox="0 0 16 34" aria-hidden="true">
            <path d="M0 15 L16 15 L8 0 Z" />
            <path d="M0 19 L16 19 L8 34 Z" />
          </svg>
          <img className="eas-logo" src={logoUrl} alt="Etch A Sketch" draggable={false} />
          <Knob ref={knobX} axis="x" className="eas-knob-l" ariaLabel="Horizontal (left knob)" onTurn={turnX} />
          <Knob ref={knobY} axis="y" className="eas-knob-r" ariaLabel="Vertical (right knob)" onTurn={turnY} />
        </div>
      </div>

      <div className="eas-caption">
        <span>Draw on the glass</span>
        <span className="eas-dot">·</span>
        <span>or turn the knobs</span>
        <span className="eas-dot">·</span>
        <button type="button" onClick={autoShake}>Shake to erase</button>
        <span className="eas-dot">·</span>
        <button
          type="button"
          className="eas-sound"
          onClick={() => {
            etchAudio.unlock();
            etchAudio.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>
    </div>
  );
}
