import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  loadCream,
  loadTicks,
  playTick,
  playTickUnthrottled,
  playTonePreview,
  resumeAudio,
} from './tonepadAudio';
import './tonepad.css';

/*
 * 1:1 port of keeby's TonePadGrid (Sources/Keeb/Views/TonePadGrid.swift),
 * staged so each layer of the interaction can be shown on its own:
 *
 *   Stage 1 — the body: 220px pad, 13×13 dot lattice, center neutral ring,
 *             knob resting at (0.5, 0.5), active row/column highlight.
 *   Stage 2 — dragging: pointer capture, knob follows the cursor, taps glide,
 *             release snaps to the 13-step grid.
 *   Stage 3 — motion: dots bloom around the knob (proximity radius 4 cells,
 *             +18px size, +0.25 opacity), knob/halo bloom 2.8×, and the knob
 *             spring-chases the cursor. macOS gets this "for free" from
 *             SwiftUI's implicit `.animation(.spring(response: 0.25,
 *             dampingFraction: 0.7))` on the position — it keeps animating
 *             *during* the drag, which is the whole smoothed-lerp feel. Here
 *             the same spring is integrated per-frame in rAF; dots track a
 *             second, slower spring (response 0.45 / damping 0.75) exactly
 *             like the ToneDot animation in Swift, so the bloom trails the
 *             knob the way it does on macOS.
 *   Stage 4 — sound + haptics: a round-robin tick per grid-cell crossing
 *             (TickPlayer.swift) and a tone-shaped three-press preview of the
 *             selected switch on release (AudioEngine.swift shaping). macOS
 *             pairs every tick with NSHapticFeedbackManager `.generic`; the
 *             closest web stand-in is navigator.vibrate, used where available.
 *   Stage 5 — no sound threshold: the same finished interaction intentionally
 *             plays a tick on every raw pointer update so the feedback stacks
 *             into noise and demonstrates why the 40ms/cell gate matters.
 */

export type TonePadStage = 1 | 2 | 3 | 4 | 5;

const BASE_PAD_SIZE = 220;
const BASE_KNOB_SIZE = 18;
const GRID_COUNT = 13;
const BASE_DOT_SIZE = 3.5;
const BASE_PADDING = 14;
const PROXIMITY_RADIUS = 4;
const TONE_STEP = 1 / (GRID_COUNT - 1);
const CENTER_IDX = (GRID_COUNT - 1) / 2;

// SwiftUI spring(response: R, dampingFraction: ζ) → ω = 2π/R, k = ω², c = 2ζω.
const KNOB_K = 631.65; // response 0.25, damping 0.7 — the knob's cursor chase
const KNOB_C = 35.19;
const BLOOM_K = 194.96; // response 0.45, damping 0.75 — the dot bloom's trail
const BLOOM_C = 20.94;

const SPRING_BEZIER = 'cubic-bezier(.34,1.4,.64,1)';

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function snapTone(value: number) {
  return Math.round(value / TONE_STEP) * TONE_STEP;
}

export default function TonePad({
  stage,
  size = BASE_PAD_SIZE,
}: {
  stage: TonePadStage;
  size?: number;
}) {
  const scale = size / BASE_PAD_SIZE;
  const knobSize = BASE_KNOB_SIZE * scale;
  const dotSize = BASE_DOT_SIZE * scale;
  const padding = BASE_PADDING * scale;
  const usable = size - padding * 2;
  const padRef = useRef<HTMLDivElement>(null);
  const knobWrapRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const knobBodyRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const tone = useRef({ x: 0.5, y: 0.5 });
  const drag = useRef({
    active: false,
    moved: false,
    downX: 0,
    downY: 0,
    x: 0.5,
    y: 0.5,
    lastCol: -1,
    lastRow: -1,
  });
  const springs = useRef({
    kx: 0.5, ky: 0.5, kvx: 0, kvy: 0, // knob position spring
    bx: 0.5, by: 0.5, bvx: 0, bvy: 0, // dot-bloom position spring (slower)
    gate: 0, gateVel: 0, // 0→1 bloom intensity, springs open on grab
  });
  const gateTarget = useRef(0);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const graceTimerRef = useRef(0);

  const paint = useCallback(
    (
      thumbX: number,
      thumbY: number,
      bloomX: number,
      bloomY: number,
      gate: number,
      activeCol: number,
      activeRow: number,
    ) => {
      const knobX = padding + thumbX * usable;
      const knobY = padding + (1 - thumbY) * usable;
      if (knobWrapRef.current) {
        knobWrapRef.current.style.transform = `translate3d(${knobX}px, ${knobY}px, 0)`;
      }
      const dots = dotRefs.current;
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        if (!dot) continue;
        const col = i % GRID_COUNT;
        const row = Math.floor(i / GRID_COUNT);
        let proximity = 0;
        if (gate > 0.001) {
          const dx = col - bloomX * (GRID_COUNT - 1);
          const dy = row - (1 - bloomY) * (GRID_COUNT - 1);
          const dist = Math.sqrt(dx * dx + dy * dy);
          proximity = gate * Math.max(0, 1 - dist / PROXIMITY_RADIUS);
        }
        if (col === CENTER_IDX && row === CENTER_IDX) {
          const ringSize = dotSize * 2.6 + proximity * 10 * scale;
          dot.style.width = `${ringSize}px`;
          dot.style.height = `${ringSize}px`;
          dot.style.borderColor = `rgba(255,255,255,${0.38 + proximity * 0.25})`;
        } else {
          const onAxis = col === activeCol || row === activeRow;
          const onBoth = col === activeCol && row === activeRow;
          const renderedSize = dotSize + proximity * 18 * scale;
          const opacity = onBoth ? 0.5 : onAxis ? 0.4 : 0.1 + proximity * 0.25;
          dot.style.width = `${renderedSize}px`;
          dot.style.height = `${renderedSize}px`;
          dot.style.background = `rgba(255,255,255,${opacity})`;
        }
      }
    },
    [dotSize, padding, scale, usable],
  );

  const stepRef = useRef<(t: number) => void>(() => {});
  stepRef.current = (t: number) => {
    rafRef.current = 0;
    const dt = Math.min(0.032, (t - lastTRef.current) / 1000);
    lastTRef.current = t;
    const s = springs.current;
    const target = drag.current.active ? drag.current : tone.current;

    s.kvx += (KNOB_K * (target.x - s.kx) - KNOB_C * s.kvx) * dt;
    s.kvy += (KNOB_K * (target.y - s.ky) - KNOB_C * s.kvy) * dt;
    s.kx += s.kvx * dt;
    s.ky += s.kvy * dt;

    s.bvx += (BLOOM_K * (target.x - s.bx) - BLOOM_C * s.bvx) * dt;
    s.bvy += (BLOOM_K * (target.y - s.by) - BLOOM_C * s.bvy) * dt;
    s.bx += s.bvx * dt;
    s.by += s.bvy * dt;

    const gt = gateTarget.current;
    s.gateVel += (BLOOM_K * (gt - s.gate) - BLOOM_C * s.gateVel) * dt;
    s.gate += s.gateVel * dt;

    const activeCol = Math.round(target.x * (GRID_COUNT - 1));
    const activeRow = Math.round((1 - target.y) * (GRID_COUNT - 1));
    paint(s.kx, s.ky, s.bx, s.by, Math.max(0, s.gate), activeCol, activeRow);

    const settled =
      !drag.current.active &&
      Math.abs(target.x - s.kx) < 0.0005 &&
      Math.abs(target.y - s.ky) < 0.0005 &&
      Math.abs(s.kvx) < 0.01 &&
      Math.abs(s.kvy) < 0.01 &&
      Math.abs(target.x - s.bx) < 0.0005 &&
      Math.abs(target.y - s.by) < 0.0005 &&
      Math.abs(gt - s.gate) < 0.002 &&
      Math.abs(s.gateVel) < 0.02;
    if (settled) {
      s.kx = target.x;
      s.ky = target.y;
      s.bx = target.x;
      s.by = target.y;
      s.kvx = s.kvy = s.bvx = s.bvy = 0;
      s.gate = gt;
      s.gateVel = 0;
      paint(s.kx, s.ky, s.bx, s.by, s.gate, activeCol, activeRow);
      return;
    }
    rafRef.current = requestAnimationFrame((tt) => stepRef.current(tt));
  };

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return;
    lastTRef.current = performance.now();
    rafRef.current = requestAnimationFrame((tt) => stepRef.current(tt));
  }, []);

  // Initial paint + reset whenever the stage swaps (the page remounts the pad
  // per stage, but a hot-reload can reuse the instance).
  useLayoutEffect(() => {
    const s = springs.current;
    tone.current = { x: 0.5, y: 0.5 };
    s.kx = s.bx = 0.5;
    s.ky = s.by = 0.5;
    s.kvx = s.kvy = s.bvx = s.bvy = 0;
    s.gate = 0;
    s.gateVel = 0;
    gateTarget.current = 0;
    paint(0.5, 0.5, 0.5, 0.5, 0, CENTER_IDX, CENTER_IDX);
  }, [stage, paint]);

  // Warm the samples as soon as the sound stage mounts so the first drag
  // already has real ticks.
  useEffect(() => {
    if (stage >= 4) {
      loadTicks();
      loadCream();
    }
  }, [stage]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (graceTimerRef.current) window.clearTimeout(graceTimerRef.current);
    },
    [],
  );

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = clamp01((clientX - rect.left - padding) / usable);
    const ny = clamp01(1 - (clientY - rect.top - padding) / usable);
    drag.current.x = nx;
    drag.current.y = ny;
    const col = Math.round(nx * (GRID_COUNT - 1));
    const row = Math.round((1 - ny) * (GRID_COUNT - 1));
    if (col !== drag.current.lastCol || row !== drag.current.lastRow) {
      drag.current.lastCol = col;
      drag.current.lastRow = row;
      if (stage >= 4) {
        navigator.vibrate?.(5);
        if (stage === 4) playTick(1);
      }
    }
    if (stage === 5) playTickUnthrottled(1);
    if (stage === 2) {
      paint(nx, ny, nx, ny, 0, col, row);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stage < 2) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (stage >= 4) resumeAudio();
    if (graceTimerRef.current) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = 0;
    }
    drag.current.active = true;
    drag.current.moved = false;
    drag.current.downX = e.clientX;
    drag.current.downY = e.clientY;
    if (padRef.current) padRef.current.style.cursor = 'grabbing';
    if (stage >= 3) {
      gateTarget.current = 1;
      // Knob + halo bloom 2.8× — CSS springs the scale, rAF drives position.
      if (haloRef.current) {
        haloRef.current.style.transform = 'scale(2.8)';
        haloRef.current.style.background = 'rgba(255,255,255,0.12)';
      }
      if (knobBodyRef.current) {
        knobBodyRef.current.style.transform = 'scale(2.8)';
        knobBodyRef.current.style.boxShadow = '0 0 10px rgba(255,255,255,0.5)';
      }
      ensureLoop();
    } else if (knobWrapRef.current) {
      // Stage 2: keep the springy CSS transition on press so a tap glides to
      // the click point; it's killed once the pointer really moves.
      knobWrapRef.current.style.transition = `transform 380ms ${SPRING_BEZIER}`;
    }
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    if (!drag.current.moved) {
      const dx = e.clientX - drag.current.downX;
      const dy = e.clientY - drag.current.downY;
      if (dx * dx + dy * dy > 16) {
        drag.current.moved = true;
        if (stage === 2 && knobWrapRef.current) {
          knobWrapRef.current.style.transition = 'transform 0s';
        }
      }
    }
    updateFromPointer(e.clientX, e.clientY);
  };

  const endDrag = () => {
    if (!drag.current.active) return;
    const snappedX = snapTone(drag.current.x);
    const snappedY = snapTone(drag.current.y);
    drag.current.active = false;
    drag.current.lastCol = -1;
    drag.current.lastRow = -1;
    tone.current = { x: snappedX, y: snappedY };
    if (padRef.current) padRef.current.style.cursor = 'grab';
    if (stage >= 4) {
      navigator.vibrate?.(10);
      playTonePreview({ toneX: snappedX, toneY: snappedY });
    }
    const col = Math.round(snappedX * (GRID_COUNT - 1));
    const row = Math.round((1 - snappedY) * (GRID_COUNT - 1));
    if (stage === 2) {
      if (knobWrapRef.current) {
        knobWrapRef.current.style.transition = `transform 380ms ${SPRING_BEZIER}`;
      }
      paint(snappedX, snappedY, snappedX, snappedY, 0, col, row);
      return;
    }
    // Stage ≥3: the spring carries the knob to the snapped intersection, and
    // the bloom holds for the same 150ms grace the macOS gesture keeps
    // isDragging alive before deflating.
    ensureLoop();
    graceTimerRef.current = window.setTimeout(() => {
      graceTimerRef.current = 0;
      gateTarget.current = 0;
      if (haloRef.current) {
        haloRef.current.style.transform = 'scale(1)';
        haloRef.current.style.background = 'rgba(255,255,255,0)';
      }
      if (knobBodyRef.current) {
        knobBodyRef.current.style.transform = 'scale(1)';
        knobBodyRef.current.style.boxShadow = '0 0 4px rgba(255,255,255,0.15)';
      }
      ensureLoop();
    }, 150);
  };

  const dots = [];
  for (let row = 0; row < GRID_COUNT; row++) {
    for (let col = 0; col < GRID_COUNT; col++) {
      dots.push({ col, row });
    }
  }

  const interactive = stage >= 2;

  return (
    <div className="tonepad-card">
      <div className="tonepad-axis-labels" style={{ width: size }}>
        <span>Warm</span>
        <span>Bright</span>
      </div>

      <div
        ref={padRef}
        className="tonepad-pad"
        style={{
          width: size,
          height: size,
          borderRadius: 16 * scale,
          cursor: interactive ? 'grab' : 'default',
          touchAction: 'none',
        }}
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? endDrag : undefined}
        onPointerCancel={interactive ? endDrag : undefined}
        onLostPointerCapture={interactive ? endDrag : undefined}
      >
        {dots.map(({ col, row }, idx) => {
          const cx = padding + (usable * col) / (GRID_COUNT - 1);
          const cy = padding + (usable * row) / (GRID_COUNT - 1);
          const isCenter = col === CENTER_IDX && row === CENTER_IDX;
          return (
            <div
              key={idx}
              className="tonepad-dot-anchor"
              style={{ left: cx, top: cy }}
            >
              <div
                ref={(r) => {
                  dotRefs.current[idx] = r;
                }}
                style={
                  isCenter
                    ? {
                        width: dotSize * 2.6,
                        height: dotSize * 2.6,
                        borderRadius: '50%',
                        border: '1px solid rgba(255,255,255,0.38)',
                        transition: 'border-color 150ms ease-out',
                      }
                    : {
                        width: dotSize,
                        height: dotSize,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        transition: 'background-color 150ms ease-out',
                      }
                }
              />
            </div>
          );
        })}

        {/* Knob — the wrapper carries position (rAF spring in stage ≥3, CSS
            transition in stage 2), the halo/body carry the bloom scale. */}
        <div
          ref={knobWrapRef}
          className="tonepad-knob-wrap"
          style={{
            transform: `translate3d(${padding + 0.5 * usable}px, ${padding + 0.5 * usable}px, 0)`,
            transition: stage === 2 ? `transform 380ms ${SPRING_BEZIER}` : 'transform 0s',
          }}
        >
          <div
            ref={haloRef}
            style={{
              position: 'absolute',
              width: knobSize * 2,
              height: knobSize * 2,
              marginLeft: -knobSize,
              marginTop: -knobSize,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0)',
              filter: 'blur(6px)',
              transform: 'scale(1)',
              transition: `transform 380ms ${SPRING_BEZIER}, background-color 220ms ease-out`,
            }}
          />
          <div
            ref={knobBodyRef}
            style={{
              position: 'absolute',
              width: knobSize,
              height: knobSize,
              marginLeft: -knobSize / 2,
              marginTop: -knobSize / 2,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.9)',
              boxShadow: '0 0 4px rgba(255,255,255,0.15)',
              transform: 'scale(1)',
              transition: `transform 380ms ${SPRING_BEZIER}, box-shadow 240ms ease-out`,
            }}
          />
        </div>
      </div>

      <div className="tonepad-axis-labels" style={{ width: size }}>
        <span>Thock</span>
        <span>Clack</span>
      </div>
    </div>
  );
}
