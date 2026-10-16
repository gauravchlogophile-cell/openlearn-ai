import { useCallback, useEffect, useRef, useState } from 'react';

/** Lets a person move Sky's button anywhere on the page, and remembers where.
 *
 *  Dragging is the obvious way and the worst only way: someone using a keyboard,
 *  a switch or a screen magnifier cannot drag. So the same movement is also on
 *  the keyboard (Shift plus an arrow key while the button has focus) and in Sky's
 *  settings (four corner buttons and "put Sky back"), which is what WCAG 2.5.7
 *  asks for.
 *
 *  The position is stored as a fraction of the free space, not as pixels, so it
 *  stays sensible when the window is resized or the same learner opens the site
 *  on a phone. */
export type Pos = { x: number; y: number } | null;

const STEP = 24;           // px a keyboard nudge moves
const DRAG_START = 8;      // px of movement before a press becomes a drag

export function useDrag(
  boxRef: React.RefObject<HTMLElement | null>,
  initial: Pos,
  onCommit: (p: Pos) => void,
) {
  const [pos, setPos] = useState<Pos>(initial);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => { setPos(initial); }, [initial?.x, initial?.y]);     // eslint-disable-line react-hooks/exhaustive-deps

  /** Convert a fraction to pixels given the box and the window, and back. */
  const space = () => {
    const el = boxRef.current;
    const w = el?.offsetWidth ?? 56, h = el?.offsetHeight ?? 56;
    return { w, h, fx: Math.max(1, window.innerWidth - w), fy: Math.max(1, window.innerHeight - h) };
  };
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    start.current = { px: e.clientX, py: e.clientY, ox: r.left, oy: r.top };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [boxRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = start.current; if (!s) return;
    const dx = e.clientX - s.px, dy = e.clientY - s.py;
    if (!moved.current && Math.hypot(dx, dy) < DRAG_START) return;
    moved.current = true; setDragging(true);
    const { fx, fy } = space();
    setPos({ x: clamp((s.ox + dx) / fx), y: clamp((s.oy + dy) / fy) });
  }, []);                                                          // eslint-disable-line react-hooks/exhaustive-deps

  const end = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    start.current = null;
    if (moved.current) { setDragging(false); setPos((p) => { onCommit(p); return p; }); }
  }, [onCommit]);

  /** True once, right after a drag, so the click that follows a drag is ignored
   *  instead of opening the panel. */
  const justDragged = useCallback(() => {
    const m = moved.current; moved.current = false; return m;
  }, []);

  const nudge = useCallback((dx: number, dy: number) => {
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const { fx, fy } = space();
    const p = { x: clamp((r.left + dx) / fx), y: clamp((r.top + dy) / fy) };
    setPos(p); onCommit(p);
  }, [boxRef, onCommit]);                                           // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!e.shiftKey) return;
    const m: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    const d = m[e.key]; if (!d) return;
    e.preventDefault(); nudge(d[0], d[1]);
  }, [nudge]);

  const toCorner = useCallback((c: 'tl' | 'tr' | 'bl' | 'br') => {
    const p = { x: c.endsWith('l') ? 0.02 : 0.98, y: c.startsWith('t') ? 0.12 : 0.98 };
    setPos(p); onCommit(p);
  }, [onCommit]);

  const reset = useCallback(() => { setPos(null); onCommit(null); }, [onCommit]);

  // Keep Sky on screen if the window shrinks after it was placed.
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

  return { pos, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onKeyDown }, justDragged, toCorner, reset, style };
}
