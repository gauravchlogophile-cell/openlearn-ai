/** Who may use Sky under each rollout mode.
 *
 *  This existed nowhere. /api/sky checked `SKY_MODE === 'off'` and nothing
 *  else, and Base.astro rendered the dock whenever the mode was not 'off' — so
 *  setting the mode to 'staff', which is the FIRST step of the documented
 *  rollout, would have opened Sky to every anonymous visitor on the site. The
 *  mode whose entire purpose is "staff and volunteers only" admitted everyone.
 *
 *  Plain JavaScript, like sky-guard.js and progress-core.js, so the exact code
 *  the Worker runs is the code the test suite exercises. A gate that can only
 *  be tested through a deployed Worker is a gate that stops being tested.
 */

/** Deterministic 32-bit hash. Not for security — only to put an account in a
 *  stable bucket so a learner in the slice stays in it.
 *
 *  10g's requirement is "sticky per account, so nobody flickers in and out".
 *  Random assignment per request would give a learner Sky on one page and not
 *  the next, which is worse than not having it: they would report a bug that
 *  nobody could reproduce. */
export function bucketOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

/**
 * May this viewer use Sky?
 *
 * @param {'off'|'staff'|'slice'|'everyone'} mode
 * @param {{ userId?: string|null, isStaff?: boolean }} viewer
 * @param {number} slicePercent  0–100, how much of the signed-in population
 *                               the 'slice' stage admits.
 * @returns {{ allowed: boolean, reason: string }}
 *
 * Fails closed on every unknown input. An unrecognised mode is treated as
 * 'off' rather than as permission — a typo in a config value must not be the
 * thing that opens an assistant to children.
 */
export function skyAudience(mode, viewer = {}, slicePercent = 0) {
  const userId = viewer.userId ?? null;
  const isStaff = viewer.isStaff === true;

  if (mode === 'off') return { allowed: false, reason: 'off' };

  if (mode === 'staff') {
    /* Anonymous is never staff. The role is the whole condition — being signed
       in is not enough, because most signed-in people are learners. */
    return isStaff
      ? { allowed: true, reason: 'staff' }
      : { allowed: false, reason: 'not_staff' };
  }

  if (mode === 'slice') {
    // Staff are always inside the slice; they are the ones watching it.
    if (isStaff) return { allowed: true, reason: 'staff' };
    /* Anonymous visitors cannot be in a sticky slice — there is nothing to be
       sticky about, and admitting them would make the percentage meaningless
       because every visit would re-roll. */
    if (!userId) return { allowed: false, reason: 'anonymous' };
    const pct = Number.isFinite(slicePercent) ? slicePercent : 0;
    return bucketOf(userId) < pct
      ? { allowed: true, reason: 'in_slice' }
      : { allowed: false, reason: 'outside_slice' };
  }

  if (mode === 'everyone') {
    /* Anonymous included, deliberately. Learning on Lrnon needs no account,
       and an assistant that required one would be a paywall wearing a
       different hat. */
    return { allowed: true, reason: 'everyone' };
  }

  return { allowed: false, reason: 'unknown_mode' };
}
