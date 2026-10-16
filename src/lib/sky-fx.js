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
 *  Sound is a separate switch because it is about ears and not eyes and someone
 *  may want one without the other. It was off by default until 16 October 2026,
 *  when the owner found it silent and asked for Sky to have sound and a voice: it
 *  is now on, quiet, short, one switch away from off (a speaker button in Sky's
 *  header, and a setting), and it stays off for anyone who turns it off.
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
  chimeVolume: 0.2,         // soft but audible on a phone speaker; the system volume applies on top
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

/* ---- the one audio context, and getting it past the browser's autoplay rule ----
 *
 *  Why the chime was silent. A browser will not start sound until the person has
 *  touched the page, and Safari is strictest: the context must be resumed INSIDE
 *  the tap, not afterwards. Sky's reactions happen afterwards (a lesson finishes, a
 *  badge arrives), so the context was created too late, stayed "suspended", and the
 *  chime was quietly dropped. The fix is to make the context on the first tap or key
 *  press, anywhere on the page, and resume it there, so it is already running when a
 *  reaction wants it. */
let ctx;
let unlockHooked = false;

function context() {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = ctx ?? new AC();
  return ctx;
}

/** Call once on page load. Safe to call again; does nothing without a window. */
export function unlockAudio() {
  if (unlockHooked || typeof window === 'undefined') return;
  unlockHooked = true;
  const events = ['pointerdown', 'touchend', 'keydown', 'click'];
  const go = () => {
    try {
      const c = context();
      if (c) {
        if (c.state === 'suspended') c.resume();
        // A one-sample silent buffer: some browsers only count the context as unlocked once something has played.
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
      }
    } catch { /* stays quiet */ }
    events.forEach((e) => window.removeEventListener(e, go, true));
  };
  events.forEach((e) => window.addEventListener(e, go, { capture: true, passive: true }));
}

/** Play notes through the shared context, waiting for it to be running.
 *  @param {number[]} notes @param {OscillatorType} wave @param {number} gap seconds between notes
 *  @param {number} len seconds each note sounds */
function play(notes, wave, gap, len, volume) {
  const c = context();
  if (!c) return false;
  const run = () => {
    const t0 = c.currentTime + 0.02;
    notes.forEach((f, i) => {
      const start = t0 + i * gap;
      // A soft fundamental plus a quieter octave above it, so it carries on a phone speaker.
      [[1, volume], [2, volume * 0.28]].forEach(([mult, vol]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = wave;
        o.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(vol, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + len);
        o.connect(g).connect(c.destination);
        o.start(start);
        o.stop(start + len + 0.05);
      });
    });
  };
  if (c.state === 'running') { run(); return true; }
  // Suspended: resume, and play when it is ready instead of giving up.
  try { c.resume().then(run).catch(() => {}); return true; } catch { return false; }
}

/** A short synthesised chime: soft notes, rising for good news. Made with the Web
 *  Audio API, so there is no file to download and nothing to license. Returns false
 *  only when the browser has no audio at all. */
export function playChime(kind = 'lesson') {
  try {
    const notes = kind === 'level' || kind === 'badge' ? [523.25, 659.25, 783.99] : [587.33, 783.99];
    return play(notes, 'sine', 0.16, 0.55, FX_LIMITS.chimeVolume);
  } catch { return false; }
}

/** Sky's signature: a quick two-note chirp, a little like a small bird, played
 *  before Sky speaks so that Sky's voice is recognisable whichever voice the device
 *  lends it. Under half a second. */
export function skyChirp() {
  try { return play([880, 1318.5], 'triangle', 0.11, 0.22, FX_LIMITS.chimeVolume); } catch { return false; }
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
