import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/** Released-knob spin decays exponentially — light inertia, high friction. */
const COAST_TAU = 0.14; // s
const COAST_MIN_OMEGA = 0.6; // rad/s
const COAST_MAX_OMEGA = 18; // rad/s
const WHEEL_RAD_PER_PX = 0.0025;
const KEY_STEP = 0.06;
const KEY_STEP_FINE = 0.015;

interface KnobProps {
  axis: 'x' | 'y';
  className?: string;
  ariaLabel: string;
  /** Signed knob rotation in radians; positive = clockwise. */
  onTurn: (deltaRad: number) => void;
}

export interface KnobHandle {
  /** Rotate the knob visual without emitting onTurn — the mechanism running
      in reverse, when the stylus is driven directly on the glass. */
  spin: (deltaRad: number) => void;
}

export const Knob = forwardRef<KnobHandle, KnobProps>(function Knob(
  { axis, className = '', ariaLabel, onTurn },
  ref,
) {
  const knobRef = useRef<HTMLDivElement>(null);
  const fluteRef = useRef<HTMLDivElement>(null);
  const rot = useRef(0);
  const drag = useRef<{ id: number; cx: number; cy: number; angle: number } | null>(null);
  const samples = useRef<{ t: number; d: number }[]>([]);
  const coastRaf = useRef(0);
  const turnRef = useRef(onTurn);
  turnRef.current = onTurn;

  const rotate = (d: number) => {
    rot.current += d;
    if (fluteRef.current) {
      fluteRef.current.style.transform = `rotate(${rot.current}rad)`;
    }
  };

  useImperativeHandle(ref, () => ({ spin: rotate }), []);

  const apply = (d: number) => {
    rotate(d);
    turnRef.current(d);
  };

  const stopCoast = () => cancelAnimationFrame(coastRaf.current);

  const startCoast = (omega0: number) => {
    let omega = Math.max(-COAST_MAX_OMEGA, Math.min(COAST_MAX_OMEGA, omega0));
    if (Math.abs(omega) < 1.2) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      apply(omega * dt);
      omega *= Math.exp(-dt / COAST_TAU);
      if (Math.abs(omega) > COAST_MIN_OMEGA) {
        coastRaf.current = requestAnimationFrame(tick);
      }
    };
    coastRaf.current = requestAnimationFrame(tick);
  };

  const pointerAngle = (e: { clientX: number; clientY: number }) => {
    const d = drag.current!;
    return Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); // a knob grab is not a frame grab
    stopCoast();
    const rect = knobRef.current!.getBoundingClientRect();
    drag.current = {
      id: e.pointerId,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      angle: 0,
    };
    drag.current.angle = pointerAngle(e);
    samples.current = [];
    try {
      knobRef.current!.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers can't be captured; drag still works via bubbling */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const a = pointerAngle(e);
    let delta = a - d.angle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    d.angle = a;

    const now = performance.now();
    samples.current.push({ t: now, d: delta });
    while (samples.current.length && now - samples.current[0].t > 100) {
      samples.current.shift();
    }
    apply(delta);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const s = samples.current;
    if (s.length >= 2) {
      const dt = (performance.now() - s[0].t) / 1000;
      const sum = s.reduce((acc, v) => acc + v.d, 0);
      if (dt > 0.016) startCoast(sum / dt);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? KEY_STEP_FINE : KEY_STEP;
    let d = 0;
    if (axis === 'x') {
      if (e.key === 'ArrowRight') d = step;
      else if (e.key === 'ArrowLeft') d = -step;
    } else {
      if (e.key === 'ArrowUp') d = step;
      else if (e.key === 'ArrowDown') d = -step;
    }
    if (d) {
      e.preventDefault();
      apply(d);
    }
  };

  useEffect(() => {
    const el = knobRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopCoast();
      apply(-e.deltaY * WHEEL_RAD_PER_PX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      stopCoast();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`eas-knobwrap ${className}`}>
      <div
        ref={knobRef}
        className="eas-knob"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-roledescription="knob"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div ref={fluteRef} className="eas-flutes" />
        <div className="eas-knoblight" />
        <div className="eas-cap" />
      </div>
    </div>
  );
});
