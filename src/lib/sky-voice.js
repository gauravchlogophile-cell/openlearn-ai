/** Sky's voice.
 *
 *  The owner asked on 16 October 2026 for Sky to have a voice of its own, after
 *  hearing it read aloud in the same device voice as everything else.
 *
 *  What "its own" can honestly mean today, in three layers, best first:
 *
 *   1. A RECORDED voice. If /sky/voice/index.json lists a recording for a line,
 *      Sky plays that: one real, identical voice on every phone and laptop. Nobody
 *      has recorded it yet, so the list is empty; docs/handbook/sky-voice.md has the
 *      script (about forty short lines) for whoever does.
 *   2. A CHOSEN device voice. The reader may pick which of their device's voices Sky
 *      borrows, and hear it before choosing.
 *   3. A CHARACTER voice. When nothing is chosen, Sky does not take the device's
 *      first voice, as read-aloud does. It takes the brightest natural English voice
 *      on the device, lifts it a little in pitch and pace, and opens every line with
 *      its own two-note chirp, so Sky sounds like Sky and not like the screen
 *      reader's neighbour.
 *
 *  What is not claimed: a device voice is still the device's. Sky's character comes
 *  from the choice, the pitch, the pace and the chirp, and a device that ignores
 *  pitch (some network voices do) will sound closer to its normal self.
 *
 *  Plain JavaScript over plain objects so the choice can be tested with made-up
 *  voices. The browser calls are in speakAsSky below and touch nothing else.
 */
import { quality, defaultVoice } from './voices.js';

/** How Sky's character is set. A little brighter and quicker than neutral. */
export const SKY_VOICE = Object.freeze({ pitch: 1.18, rate: 1.04, volume: 1 });

/** Names that tend to be bright, friendly, mid-register English voices. Matched
 *  loosely, in this order, and only ever a preference: no voice is required. */
const BRIGHT = [/neerja/i, /aria/i, /jenny/i, /sonia/i, /samantha/i, /karen/i, /moira/i, /tessa/i, /google uk english female/i, /google us english/i, /zira/i];

/** Which of the device's voices Sky should use.
 *  @param {{name:string,lang:string}[]} voices
 *  @param {string} chosen  the name the reader picked, or ''
 *  @param {string} pageLang  e.g. 'en' */
export function pickSkyVoice(voices, chosen = '', pageLang = 'en') {
  const list = voices ?? [];
  if (!list.length) return null;
  if (chosen) {
    const mine = list.find((v) => v.name === chosen);
    if (mine) return mine;                      // a voice that has since gone falls through
  }
  const want = String(pageLang).toLowerCase().slice(0, 2);
  const inLang = list.filter((v) => String(v.lang).toLowerCase().startsWith(want));
  const pool = inLang.length ? inLang : list;
  // Natural voices first; within them, the first name on the bright list.
  const natural = pool.filter((v) => quality(v) >= 3);
  const rank = (v) => { const i = BRIGHT.findIndex((re) => re.test(v.name)); return i < 0 ? 99 : i; };
  const best = [...(natural.length ? natural : pool)].sort((a, b) => rank(a) - rank(b) || quality(b) - quality(a))[0];
  return best ?? defaultVoice(list, pageLang);
}

/** The line Sky says to introduce itself, when the reader tries a voice. */
export const SKY_SAMPLE = 'Hello, I am Sky, your study buddy. This is how I will sound.';

/* ---------------------------------------------------------------- recordings */
let recordings;
async function recordedList() {
  if (recordings) return recordings;
  try {
    const r = await fetch('/sky/voice/index.json');
    recordings = r.ok ? await r.json() : {};
  } catch { recordings = {}; }
  return recordings;
}

/** @param {string} id a line id such as "lesson" or "streak" @returns {Promise<string|null>} */
export async function recordedLine(id) {
  const list = await recordedList();
  return typeof list?.[id] === 'string' ? list[id] : null;
}

/* ------------------------------------------------------------------ speaking */
let audioEl;

/** Stop anything Sky is saying. */
export function stopSky() {
  try { globalThis.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
  try { audioEl?.pause(); } catch { /* nothing to stop */ }
}

/** Say something in Sky's voice. Returns false if nothing could be said (no speech
 *  support, or the reader is already hearing a lesson read aloud: Sky never talks
 *  over it).
 *  @param {string} text
 *  @param {{voices?:SpeechSynthesisVoice[], chosen?:string, lang?:string, id?:string, force?:boolean, chirp?:()=>void, onend?:()=>void}} opts */
export async function speakAsSky(text, opts = {}) {
  const synth = globalThis.speechSynthesis;
  const done = () => opts.onend?.();

  // 1. a recording, if there is one for this line
  if (opts.id) {
    const src = await recordedLine(opts.id);
    if (src) {
      try {
        audioEl = audioEl ?? new Audio();
        audioEl.src = src;
        audioEl.onended = done;
        await audioEl.play();
        return true;
      } catch { /* fall through to a voice */ }
    }
  }

  if (!synth) return false;
  // A lesson being read aloud always wins. Only an explicit request (the speaker button) may replace what is playing.
  if (synth.speaking && !opts.force) return false;
  try { opts.chirp?.(); } catch { /* the chirp is a flourish */ }

  const u = new SpeechSynthesisUtterance(text);
  const v = pickSkyVoice(opts.voices ?? synth.getVoices(), opts.chosen ?? '', opts.lang ?? 'en');
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = opts.lang ?? 'en'; }
  u.pitch = SKY_VOICE.pitch; u.rate = SKY_VOICE.rate; u.volume = SKY_VOICE.volume;
  u.onend = done; u.onerror = done;
  synth.cancel();
  synth.speak(u);
  return true;
}
