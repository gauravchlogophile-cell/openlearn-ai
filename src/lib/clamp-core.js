/** The arithmetic behind useViewportClamp, kept pure so CI can test it.
 *
 *  CI has no browser, so the DOM half of the fix cannot be tested there. The
 *  part that actually decides whether a panel is reachable is this
 *  calculation, and it can be checked without one.
 */

/** How far to move a popover horizontally so it sits inside the viewport.
 *
 *  @param {{left: number, right: number, width: number}} rect
 *  @param {number} viewportWidth
 *  @param {number} margin  breathing room at each edge
 *  @returns {number} pixels to translate; 0 when it already fits
 */
export function clampShift(rect, viewportWidth, margin = 8) {
  const { left, right, width } = rect;

  /* Wider than the viewport itself. Shifting cannot make it fit, so pin it to
     the left margin and let the element's own max-width do the rest. Checked
     first: such a panel is off BOTH edges, and the tests below would otherwise
     disagree about which one to fix. */
  if (width > viewportWidth - margin * 2) return margin - left;

  if (left < margin) return margin - left;              // off the left edge
  if (right > viewportWidth - margin) return viewportWidth - margin - right;
  return 0;                                             // already fits
}
