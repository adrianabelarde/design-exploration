import { useCallback, useEffect, useRef } from 'react';
import { ticketAudio } from './audio';

interface Hole {
  x: number;
  y: number;
  r: number;
}

/**
 * Makes an element hole-punchable: every click chews a real see-through hole
 * out of it. The holes live in a canvas alpha mask applied to the element,
 * so text, borders, buttons — everything — gets punched through, exactly
 * like the paper the card is pretending to be. Each punch drops a chad.
 */
export function usePunchable<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const holes: Hole[] = [];
    const canvas = document.createElement('canvas');

    const redraw = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out';
      for (const hole of holes) {
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
        ctx.fill();
      }
      const url = `url(${canvas.toDataURL()})`;
      el.style.setProperty('mask-image', url);
      el.style.setProperty('-webkit-mask-image', url);
    };

    el.style.setProperty('mask-size', '100% 100%');
    el.style.setProperty('-webkit-mask-size', '100% 100%');
    el.style.setProperty('mask-repeat', 'no-repeat');
    el.style.setProperty('-webkit-mask-repeat', 'no-repeat');

    // A punched chad falls off the card. It is a true 1:1 cutout: a clone of
    // the card clipped to the die circle, shifted so the bite point sits at
    // its center — whatever was under the die (text, chip edge, avatar) is
    // ON the falling disc. Must be built BEFORE redraw() adds the new hole,
    // so the disc carries every previous hole but not the one being cut.
    const dropChad = (cx: number, cy: number, r: number) => {
      const chad = document.createElement('div');
      chad.className = 'rsvp-chad';
      chad.style.left = `${cx}px`;
      chad.style.top = `${cy}px`;
      chad.style.width = chad.style.height = `${r * 2}px`;

      const rect = el.getBoundingClientRect();
      const clone = el.cloneNode(true) as HTMLElement;
      // Inline styles so no class rule can reposition or re-animate the
      // snapshot (e.g. the Done button's translateX centering, bottom
      // anchoring, and rise-in animation would all corrupt the alignment).
      clone.style.position = 'absolute';
      clone.style.margin = '0';
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.left = `${rect.left - (cx - r)}px`;
      clone.style.top = `${rect.top - (cy - r)}px`;
      clone.style.right = 'auto';
      clone.style.bottom = 'auto';
      clone.style.transform = 'none';
      clone.style.animation = 'none';
      clone.style.transition = 'none';
      chad.appendChild(clone);
      document.body.appendChild(chad);

      // No fade: it drops clean out of the viewport under constant gravity
      // (y ∝ t², the quadratic bezier), with a little drift and spin.
      const fall = window.innerHeight - cy + r * 2 + 48;
      const dur = Math.sqrt((2 * fall) / 2400) * 1000;
      const dx = (Math.random() - 0.5) * 80;
      const rot = (Math.random() - 0.5) * 420;
      chad
        .animate(
          [
            { transform: 'translate(-50%, -50%) translate(0px, 0px) rotate(0deg)' },
            {
              transform: `translate(-50%, -50%) translate(${dx}px, ${fall}px) rotate(${rot}deg)`,
            },
          ],
          { duration: dur, easing: 'cubic-bezier(0.33, 0, 0.67, 0.33)', fill: 'forwards' },
        )
        .addEventListener('finish', () => chad.remove());
    };

    // Press-and-hold: the die bites on pointerdown (press sound, jaws stay
    // shut) and the hole only appears when the jaws let go — punched at the
    // bite point, however far the tool has wandered since.
    let held: { cx: number; cy: number } | null = null;

    const onDown = (e: PointerEvent) => {
      // Links keep their jobs (they navigate away). Buttons get punched AND
      // still fire their click — the die goes through whatever's under it.
      if ((e.target as HTMLElement).closest('a')) return;
      ticketAudio.unlock();
      ticketAudio.press(0.9, 1.15);
      held = { cx: e.clientX, cy: e.clientY };
    };

    const onUp = () => {
      if (!held) return;
      const { cx, cy } = held;
      held = null;
      const rect = el.getBoundingClientRect();
      const r = 9 * (0.92 + Math.random() * 0.16);
      dropChad(cx, cy, r); // clone the card before the mask gains this hole
      holes.push({ x: cx - rect.left, y: cy - rect.top, r });
      redraw();
      ticketAudio.release(1, 1.15);
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // Keep hole positions glued to the card if it reflows.
    const ro = new ResizeObserver(() => {
      if (holes.length) redraw();
    });
    ro.observe(el);

    // A fresh sheet: forget every hole (used when the receipt re-prints).
    resetRef.current = () => {
      holes.length = 0;
      el.style.removeProperty('mask-image');
      el.style.removeProperty('-webkit-mask-image');
    };

    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      ro.disconnect();
      resetRef.current = () => {};
      el.style.removeProperty('mask-image');
      el.style.removeProperty('-webkit-mask-image');
      el.style.removeProperty('mask-size');
      el.style.removeProperty('-webkit-mask-size');
      el.style.removeProperty('mask-repeat');
      el.style.removeProperty('-webkit-mask-repeat');
    };
  }, []);

  const reset = useCallback(() => resetRef.current(), []);
  return { ref, reset };
}
