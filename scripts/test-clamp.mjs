/** Tests for src/lib/clamp-core.js — keeping header popovers on screen.
 *
 *  The bug this guards was reported from real devices: on an iPhone the
 *  accessibility panel opened off the left edge of the screen, and on Android
 *  the account menu did. Both are right-aligned to their trigger, which is
 *  correct until the nav wraps and the trigger is no longer near the right
 *  edge — then the panel extends leftward into nothing.
 *
 *  Measured before the fix: the accessibility panel sat at left -213px in a
 *  390px viewport. Its entire contents were unreachable, on the one control
 *  whose purpose is making the site usable for people who need it.
 *
 *  CI has no browser, so these test the arithmetic rather than the DOM.
 */
import assert from 'node:assert/strict';
import { clampShift } from '../src/lib/clamp-core.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok ' + name); };

/** Convenience: build a rect from a left edge and a width. */
const at = (left, width) => ({ left, right: left + width, width });

test('a panel already inside the viewport is not moved', () => {
  assert.equal(clampShift(at(100, 200), 390), 0);
});

test('the reported iPhone case is brought back on screen', () => {
  // The real measurement: 358px wide, left -213, in a 390px viewport.
  const shift = clampShift(at(-213, 358), 390);
  assert.equal(shift, 221);                       // 8 - (-213)
  const left = -213 + shift;
  assert.equal(left, 8, 'lands on the margin');
  assert.ok(left + 358 <= 390, 'and its right edge still fits');
});

test('a panel off the right edge is pulled left', () => {
  const shift = clampShift(at(300, 200), 390);    // right = 500
  assert.equal(shift, -118);                      // 390 - 8 - 500
  assert.equal(300 + shift + 200, 382);           // sits on the right margin
});

test('a panel wider than the viewport pins to the left margin', () => {
  // Shifting cannot make it fit; its own max-width has to. Pinning left at
  // least makes the start of it reachable rather than the middle.
  const shift = clampShift(at(-50, 500), 390);
  assert.equal(-50 + shift, 8);
});

test('the oversize rule wins over the off-right rule', () => {
  // Off BOTH edges at once. Without ordering this deliberately, the two rules
  // disagree about which edge to honour.
  const shift = clampShift(at(-100, 600), 390);
  assert.equal(-100 + shift, 8, 'left edge is the one that matters');
});

test('exactly touching a margin counts as fitting', () => {
  assert.equal(clampShift(at(8, 374), 390), 0);   // right = 382 = 390 - 8
});

test('margin is configurable', () => {
  assert.equal(clampShift(at(0, 100), 390, 20), 20);
  assert.equal(clampShift(at(-5, 100), 390, 0), 5);
});

test('works at every device width the site claims to support', () => {
  // 320 small phone, 390 iPhone, 412 Android, 768 tablet, 1024 iPad landscape,
  // 1440 laptop, 2560 large display. A panel anchored off the left edge must
  // come back on screen at all of them.
  for (const vw of [320, 390, 412, 768, 1024, 1440, 2560]) {
    const width = Math.min(358, vw - 16);
    const shift = clampShift(at(-200, width), vw);
    const left = -200 + shift;
    assert.ok(left >= 0, `vw ${vw}: left edge ${left} is on screen`);
    assert.ok(left + width <= vw, `vw ${vw}: right edge fits`);
  }
});

test('a zero-width rect does not produce NaN', () => {
  const shift = clampShift({ left: 0, right: 0, width: 0 }, 390);
  assert.ok(Number.isFinite(shift));
});

console.log(`\nclamp-core: ${n} tests passed`);
