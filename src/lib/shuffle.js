/** Option shuffling for quizzes.
 *
 *  Authored banks are heavily position-biased: at the time this was written,
 *  94% of correct answers across every bank and inline quiz sat at index 1 —
 *  the middle of three options. A learner who always picked the middle would
 *  clear the 80% module-quiz threshold without reading anything, which makes
 *  the assessment worthless. Rather than hand-rebalance ~106 authored items
 *  and hope future contributors keep them balanced, the position is randomised
 *  at display time, which is robust to whatever order anyone writes.
 */

/** Fisher–Yates over a copy of the index range. */
function permutation(n) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** Reorders one item's options and reports where the correct one landed.
 *  Returns a new object; the caller's item is never mutated. */
export function shuffleOptions(options, answer) {
  const order = permutation(options.length);
  return {
    options: order.map((i) => options[i]),
    answer: order.indexOf(answer),
  };
}

/** Draws n items at random AND shuffles each item's options. */
export function drawAndShuffle(items, n) {
  const order = permutation(items.length);
  return order.slice(0, n).map((i) => {
    const it = items[i];
    return { ...it, ...shuffleOptions(it.options, it.answer) };
  });
}
