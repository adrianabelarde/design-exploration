import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import puncherOpen from '../assets/puncher-open.png';
import puncherClosed from '../assets/puncher-closed.png';

/**
 * The conductor's punch, riding along with the cursor as a DOM overlay above
 * the WebGL canvas. It trails on a fast spring and tips into its direction
 * of travel; during the word sequence it takes over and races between holes.
 * Two photo frames (jaws open / squeezed shut) share one hinge-aligned
 * canvas, so the punch action is a hard frame swap — like a real tool, the
 * bite is instantaneous. The die mouth is the hotspot: it sits on the pointer.
 */
export interface PunchCursorHandle {
  setAutoTarget(pt: { x: number; y: number } | null): void;
  snap(): void;
}

export const PunchCursor = forwardRef<PunchCursorHandle>(
  function PunchCursor(_props, ref) {
    const root = useRef<HTMLDivElement>(null);
    const state = useRef({
      mx: -400,
      my: -400,
      inside: false,
      seeded: false,
      auto: null as { x: number; y: number } | null,
      x: -400,
      y: -400,
      prevX: -400,
    });
    const snapTimer = useRef<number | null>(null);

    const snapNow = useCallback(() => {
      const el = root.current;
      if (!el) return;
      el.classList.remove('is-punching');
      // Force a reflow so back-to-back snaps restart the jaw animation.
      void el.offsetWidth;
      el.classList.add('is-punching');
      if (snapTimer.current !== null) window.clearTimeout(snapTimer.current);
      snapTimer.current = window.setTimeout(
        () => el.classList.remove('is-punching'),
        110,
      );
    }, []);

    useImperativeHandle(ref, () => ({
      setAutoTarget(pt) {
        state.current.auto = pt;
      },
      snap: snapNow,
    }));

    useEffect(() => {
      const s = state.current;

      // The punch IS the cursor for the whole page: on wherever the pointer
      // is, off only when it leaves the window.
      const onMove = (e: PointerEvent) => {
        s.mx = e.clientX;
        s.my = e.clientY;
        // First sighting of the pointer: appear AT it (the opacity
        // transition fades the tool in) instead of spring-chasing across
        // the screen from the parked off-screen position.
        if (!s.seeded) {
          s.seeded = true;
          s.x = e.clientX;
          s.y = e.clientY;
          s.prevX = e.clientX;
        }
        s.inside = true;
      };
      const onLeave = () => {
        s.inside = false;
      };
      // Manual punching is press-and-hold: jaws bite on pointerdown and stay
      // shut until release. The auto sequence keeps its timed snap().
      const onDown = () => {
        if (s.inside && !s.auto) root.current?.classList.add('is-punching');
      };
      const onUp = () => {
        if (!s.auto) root.current?.classList.remove('is-punching');
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      document.documentElement.addEventListener('mouseleave', onLeave);

      let raf = 0;
      let prev = performance.now();
      const loop = (now: number) => {
        const dt = Math.min((now - prev) / 1000, 0.05);
        prev = now;
        const tx = s.auto ? s.auto.x : s.mx;
        const ty = s.auto ? s.auto.y : s.my;
        // Faster chase during the auto sequence: conductor hands blur.
        const k = s.auto ? 30 : 17;
        s.x += (tx - s.x) * Math.min(1, dt * k);
        s.y += (ty - s.y) * Math.min(1, dt * k);
        const vx = (s.x - s.prevX) / Math.max(dt, 1e-4);
        s.prevX = s.x;

        const el = root.current;
        if (el) {
          el.classList.toggle('is-on', s.inside || !!s.auto);
          const tilt = Math.max(-9, Math.min(9, vx * 0.006));
          el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${tilt}deg)`;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.documentElement.removeEventListener('mouseleave', onLeave);
        cancelAnimationFrame(raf);
      };
    }, [snapNow]);

    return (
      <div ref={root} className="pc" aria-hidden="true">
        <div className="pc-tool">
          <img className="pc-frame pc-open" src={puncherOpen} alt="" draggable={false} />
          <img className="pc-frame pc-closed" src={puncherClosed} alt="" draggable={false} />
        </div>
      </div>
    );
  },
);
