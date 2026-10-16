/** Sky's reactions: glow, a brief flash and a chime, and the rules that keep them
 *  safe to offer.
 *
 *  On 16 October 2026 the owner asked for Sky to be able to react with flashes,
 *  glow and sound, after asking the day before that it work for people who are
 *  sensitive to light and movement. Both are true at once if the reactions are
 *  something a person CHOOSES, with limits that hold whatever they choose:
 *
 *    calm     nothing moves or lights up. The default for anyone whose device or
 *             Lrnon is set to reduce motion, whatever they picked here.
 *    gentle   a soft glow on Sky's button for a moment. No flash. The default.
 *    lively   the glow plus one or two brief, soft flashes of Sky's button.
 *
 *  Sound is a separate switch, off by default, because it is about ears and not
 *  eyes and someone may want one without the other.
 *
 *  The limits below are not preferences. WCAG 2.3.1 forbids more than three
 *  flashes in any second; Sky stays at roughly one, and the flash covers a small
 *  button, never the page, never red, and at no more than half strength. These
 *  are checked by scripts/test-sky-buddy.mjs against the stylesheet.
 */

export const FX_LEVELS = ['calm', 'gentle', 'lively'];
export const FX_DEFAULT = 'gentle';

/** Hard limits. Changing one is a safety decision, not a tweak. */
export const FX_LIMITS = Object.freeze({
  flashesPerCheer: 2,       // at most two flashes in one reaction
  flashMs: 1100,            // each takes over a second, so well under three a second
  maxFlashOpacity: 0.5,     // never at full strength
  chimeMs: 1200,            // a chime is over in about a second
  chimeVolume: 0.1,         // quiet; the system volume still applies on top
});

/** What level actually applies right now. Reduced motion beats every setting.
 *  @param {string} pref  the saved choice
 *  @param {{reduceMotion:boolean}} env */
export function effectiveFx(pref, env) {
  if (env?.reduceMotion) return 'calm';
  return FX_LEVELS.includes(pref) ? pref : FX_DEFAULT;
}

/** What one reaction does, given the level and the sound switch. Pure, so it can
 *  be tested without a browser.
 *  @param {'lesson'|'level'|'badge'|'streak'|'cards'|'quiz'|'star'} kind
 *  @param {string} level  an effective level
 *  @param {boolean} sound */
export function cheerPlan(kind, level, sound) {
  const big = kind === 'level' || kind === 'badge' || kind === 'streak';
  return {
    glow: level === 'gentle' || level === 'lively',
    flashes: level === 'lively' ? (big ? FX_LIMITS.flashesPerCheer : 1) : 0,
    chime: Boolean(sound),
    kind,
  };
}

/** The words that go with a reaction. Plain and short; no exclamation marks, in
 *  keeping with the brand's calm voice, and no claim beyond what happened. */
export const CHEERS = {
  lesson: ['Lesson done. Nicely finished.', 'That is another one finished.', 'Done. That one is yours now.'],
  quiz: ['Quiz finished. Well done for sticking with it.', 'That is a good round.'],
  cards: ['Cards reviewed. Going back over things is what makes them stay.'],
  level: ['You reached a new level.'],
  badge: ['You earned a badge.'],
  streak: ['Your streak just grew.'],
  star: ['You caught a star.'],
  open: ['Good to see you. Small steps count.', 'A few minutes is enough.', 'Ready when you are.'],
};

export const pickCheer = (kind, seed = 0) => {
  const list = CHEERS[kind] ?? CHEERS.open;
  return list[Math.abs(seed) % list.length];
};

/** A short synthesised chime: two soft sine notes, rising for good news. Made
 *  with the Web Audio API so there is no file to download and nothing to license.
 *  Returns false when the browser will not play it (no gesture yet, no support);
 *  Sky then simply stays quiet. */
let ctx;
export function playChime(kind = 'lesson') {
  try {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const notes = kind === 'level' || kind === 'badge' ? [523.25, 659.25, 783.99] : [587.33, 783.99];
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const start = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(FX_LIMITS.chimeVolume, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 0.6);
    });
    return true;
  } catch { return false; }
}

/** Whether decorative motion may run at all, from the page and the device.
 *  @param {HTMLElement} root @param {(q:string)=>{matches:boolean}} mm */
export function motionAllowed(root, mm) {
  if (root?.getAttribute?.('data-motion') === 'reduce') return false;
  return !mm('(prefers-reduced-motion: reduce)').matches;
}

/** Which file Sky's clip should use. A WebM with transparency plays in every
 *  engine except Safari and the browsers on iPhone, which draw it on a black
 *  box. They get an animated WebP instead, which keeps the transparency and
 *  plays in every browser Apple ships. Anything unsure gets the WebP: it is the
 *  larger file and the safer failure.
 *  @param {string} ua */
export function clipKind(ua) {
  const apple = /iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/.test(ua));
  const unknown = !/Chrome|Chromium|Edg|Firefox|Android|Safari/.test(ua);
  return apple || unknown ? 'webp' : 'webm';
}
