import { useCallback, useEffect, useRef, useState } from 'react';

/** Lets a person move Sky's button anywhere on the page, and remembers where.
 *
 *  Dragging is the obvious way and the worst only way: someone using a keyboard,
 *  a switch or a screen magnifier cannot drag. So the same movement is also on
 *  the keyboard (Shift plus an arrow key while the button has focus) and in Sky's
 *  settings (four corner buttons and "put Sky back"), which is what WCAG 2.5.7
 *  asks for.
 *
 *  How the drag is wired, and why. The first version used React's pointer
 *  handlers plus pointer capture. It worked in Chrome and failed for the owner on
 *  a phone, and Safari is where pointer capture on a button is least dependable.
 *  So this one listens on the window while a press is down (nothing depends on
 *  capture) and uses real touch events for fingers, with a non-passive touchmove
 *  so the page does not scroll under the finger. Mouse and pen use pointer events.
 *  A press that moves less than a few pixels is still a tap.
 *
 *  The position is stored as a fraction of the free space, not as pixels, so it
 *  stays sensible when the window is resized or the same learner opens the site
 *  on a phone. */
export type Pos = { x: number; y: number } | null;

const STEP = 24;           // px a keyboard nudge moves
const DRAG_START = 6;      // px of movement before a press becomes a drag
const CLICK_QUIET_MS = 350; // a click this soon after a drag is the drag's own echo

export function useDrag(
  boxRef: React.RefObject<HTMLElement | null>,
  fabRef: React.RefObject<HTMLElement | null>,
  initial: Pos,
  onCommit: (p: Pos) => void,
  enabled = true,
) {
  const [pos, setPos] = useState<Pos>(initial);
  const [dragging, setDragging] = useState(false);
  const latest = useRef<Pos>(initial);
  const droppedAt = useRef(0);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => { latest.current = initial; setPos(initial); }, [initial?.x, initial?.y]);     // eslint-disable-line react-hooks/exhaustive-deps

  /** Convert a fraction to pixels given the box and the window, and back. */
  const space = useCallback(() => {
    const el = boxRef.current;
    const w = el?.offsetWidth ?? 56, h = el?.offsetHeight ?? 56;
    return { w, h, fx: Math.max(1, window.innerWidth - w), fy: Math.max(1, window.innerHeight - h) };
  }, [boxRef]);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const put = useCallback((p: Pos) => { latest.current = p; setPos(p); }, []);

  /* ---- the drag itself: native listeners, attached to the button ---- */
  useEffect(() => {
    const el = fabRef.current;
    if (!enabled || !el) return;

    let s: { px: number; py: number; ox: number; oy: number } | null = null;
    let moved = false;

    const begin = (x: number, y: number) => {
      const box = boxRef.current; if (!box) return;
      const r = box.getBoundingClientRect();
      s = { px: x, py: y, ox: r.left, oy: r.top };
      moved = false;
    };
    const move = (x: number, y: number) => {
      if (!s) return false;
      const dx = x - s.px, dy = y - s.py;
      if (!moved && Math.hypot(dx, dy) < DRAG_START) return false;
      if (!moved) { moved = true; setDragging(true); }
      const { fx, fy } = space();
      put({ x: clamp((s.ox + dx) / fx), y: clamp((s.oy + dy) / fy) });
      return true;
    };
    const finish = () => {
      if (!s) return;
      s = null;
      if (moved) { droppedAt.current = Date.now(); setDragging(false); commit.current(latest.current); }
      moved = false;
    };

    /* mouse and pen */
    const onPointerMove = (e: PointerEvent) => { if (e.pointerType !== 'touch') move(e.clientX, e.clientY); };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      finish();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      begin(e.clientX, e.clientY);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    /* fingers */
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY); else { s = null; } };
    const onTouchMove = (e: TouchEvent) => {
      if (!s || e.touches.length !== 1) return;
      if (move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => finish();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [enabled, boxRef, fabRef, space, put]);

  /** True for a moment right after a drag, so the click that follows it is
   *  ignored instead of opening the panel. Time-based, not a flag that waits for
   *  a click: some browsers send no click after a drag, and a flag left set would
   *  swallow the next real tap. */
  const justDragged = useCallback(() => Date.now() - droppedAt.current < CLICK_QUIET_MS, []);

  const nudge = useCallback((dx: number, dy: number) => {
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const { fx, fy } = space();
    const p = { x: clamp((r.left + dx) / fx), y: clamp((r.top + dy) / fy) };
    put(p); commit.current(p);
  }, [boxRef, space, put]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!e.shiftKey) return;
    const m: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    const d = m[e.key]; if (!d) return;
    e.preventDefault(); nudge(d[0], d[1]);
  }, [nudge]);

  const toCorner = useCallback((c: 'tl' | 'tr' | 'bl' | 'br') => {
    const p = { x: c.endsWith('l') ? 0.02 : 0.98, y: c.startsWith('t') ? 0.12 : 0.98 };
    put(p); commit.current(p);
  }, [put]);

  const reset = useCallback(() => { put(null); commit.current(null); }, [put]);

  // Keep Sky on screen if the window shrinks or turns after it was placed.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? { x: clamp(p.x), y: clamp(p.y) } : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Where the box goes, as inline style; null means "use the stylesheet's
   *  default corner". */
  const style = (): React.CSSProperties | undefined => {
    if (!pos) return undefined;
    const { fx, fy } = space();
    return { left: pos.x * fx, top: pos.y * fy, right: 'auto', bottom: 'auto' };
  };

  return { pos, dragging, handlers: { onKeyDown }, justDragged, toCorner, reset, style };
}
