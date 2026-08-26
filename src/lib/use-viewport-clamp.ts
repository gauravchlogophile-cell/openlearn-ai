import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { clampShift } from './clamp-core.js';

/** Keeps an anchored popover inside the viewport.
 *
 *  Both header popovers are `position: absolute; inset-inline-end: 0`, which
 *  right-aligns them to their trigger. That is correct when the trigger sits
 *  near the right edge — and wrong the moment the nav wraps and the trigger
 *  ends up left of centre, because the panel then extends leftward from the
 *  trigger's right edge and runs off the screen.
 *
 *  Measured on a real 390px iPhone viewport, the accessibility panel sat at
 *  left: -213px. Its entire contents were unreachable, on the one control
 *  whose whole purpose is making the site usable for people who need it.
 *
 *  This clamps by measurement rather than by breakpoint. A media query would
 *  need us to guess the width at which the nav stops wrapping, which depends
 *  on font size, text scaling and translated link labels — all of which vary
 *  per user. Measuring the actual rectangle is correct at every size, on every
 *  device, including ones that did not exist when this was written.
 *
 *  Uses transform rather than adjusting left/right so the shift cannot feed
 *  back into layout and cause a measure/apply loop.
 */

/* useLayoutEffect runs before paint, so the panel never appears in the wrong
   place first. It warns during SSR, where it would be a no-op anyway — these
   panels only exist once open, which is client-only. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useViewportClamp(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  margin = 8,
) {
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;

    const place = () => {
      // Measure unshifted, or each pass would compound the previous one.
      el.style.transform = '';
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;

      const shift = clampShift(
        { left: r.left, right: r.right, width: r.width }, vw, margin);

      if (shift) el.style.transform = `translateX(${Math.round(shift)}px)`;
    };

    place();
    // Rotating a phone changes the viewport without remounting anything.
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('orientationchange', place);
      el.style.transform = '';
    };
  }, [open, ref, margin]);
}
