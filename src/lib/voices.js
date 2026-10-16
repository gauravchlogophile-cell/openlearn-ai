/** Read-aloud voices: finding the good ones on a device, and grouping them as the
 *  owner asked on 16 October 2026: Indian voices and global voices.
 *
 *  What these are, plainly. They are the voices the person's own device already
 *  has. Lrnon does not record, generate or ship any voice, and nothing is
 *  downloaded or sent anywhere to speak. Modern devices ship some good ones (the
 *  "Natural", "Neural" or "Online" voices on Windows and Edge, the "Enhanced" and
 *  "Premium" voices on Apple devices, Google's voices on Android and Chrome), and
 *  this ranks those first so the best is the default instead of the first one the
 *  browser happens to list.
 *
 *  Recorded narration by people is a separate thing and is supported the other
 *  way round: if /narration/index.json lists a recording for a lesson, the player
 *  offers it (see ReadAloud.tsx). Nobody has been commissioned to record one yet,
 *  so today the list is empty; docs/handbook/narration.md says how to add one.
 *
 *  Pure functions over plain objects, so they can be tested with made-up voices. */

/** Languages spoken in India, by their BCP-47 primary tag. English is judged by
 *  its region (en-IN), not its language. */
const INDIAN_PRIMARY = new Set(['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'or', 'as', 'ne', 'sa']);

export const LANGUAGE_NAMES = {
  'en-IN': 'English (India)', 'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'mr-IN': 'Marathi',
  'gu-IN': 'Gujarati', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam', 'pa-IN': 'Punjabi', 'ur-IN': 'Urdu',
  'en-GB': 'English (UK)', 'en-US': 'English (US)', 'en-AU': 'English (Australia)', 'en-CA': 'English (Canada)', 'en-ZA': 'English (South Africa)',
  'es-ES': 'Spanish (Spain)', 'es-MX': 'Spanish (Mexico)', 'fr-FR': 'French', 'de-DE': 'German', 'pt-BR': 'Portuguese (Brazil)',
  'ja-JP': 'Japanese', 'zh-CN': 'Chinese (Mandarin)', 'ar-SA': 'Arabic', 'sw-KE': 'Swahili', 'id-ID': 'Indonesian',
};

/** @param {{lang:string}} v */
export function isIndian(v) {
  const lang = String(v.lang ?? '').replace('_', '-');
  const [primary, region] = lang.toLowerCase().split('-');
  if (primary === 'en') return region === 'in';
  return INDIAN_PRIMARY.has(primary) || region === 'in';
}

/** How good a voice is likely to sound, from what its name admits. Higher is
 *  better; the point is only to put the natural ones first. */
export function quality(v) {
  const n = `${v.name ?? ''}`.toLowerCase();
  let q = 0;
  if (/neural|natural|online/.test(n)) q += 4;
  if (/premium|enhanced|siri/.test(n)) q += 3;
  if (/google/.test(n)) q += 2;
  if (v.localService === false) q += 1;            // network voices are usually the better ones
  if (/espeak|compact|robot|novelty|bells|bubbles|whisper|zarvox|trinoids|cellos|boing|bahh|albert|fred|junior|kathy|ralph|organ|hysterical|deranged/.test(n)) q -= 6;
  return q;
}

/** Human label: "Neerja (English, India)". */
export function labelFor(v) {
  const lang = String(v.lang ?? '').replace('_', '-');
  const nice = LANGUAGE_NAMES[lang] ?? LANGUAGE_NAMES[lang.slice(0, 2) + '-IN'] ?? lang;
  const name = String(v.name ?? 'Voice').replace(/^(Microsoft|Google)\s+/i, '').replace(/\s*-\s*[A-Za-z ()]+$/, '').replace(/\s+Online \(Natural\)/i, ' (natural)');
  return `${name} · ${nice}`;
}

/** Group and rank the device's voices.
 *  Indian voices first (en-IN and Hindi ahead of the rest), then global voices
 *  (English first, then every other language). Within a group, natural voices
 *  first, then by name so the order is stable.
 *  @param {{name:string,lang:string,voiceURI?:string,localService?:boolean}[]} voices */
export function groupVoices(voices) {
  const withMeta = (voices ?? []).map((v) => ({ v, q: quality(v), indian: isIndian(v) }));
  const rank = (a, b) => b.q - a.q || String(a.v.name).localeCompare(String(b.v.name));
  const priority = (v) => {
    const l = String(v.lang).replace('_', '-').toLowerCase();
    if (l === 'en-in') return 0; if (l.startsWith('hi')) return 1; return 2;
  };
  const gpriority = (v) => {
    const l = String(v.lang).replace('_', '-').toLowerCase();
    if (l === 'en-gb') return 0; if (l === 'en-us') return 1; if (l.startsWith('en')) return 2; return 3;
  };
  const indian = withMeta.filter((x) => x.indian).sort((a, b) => priority(a.v) - priority(b.v) || rank(a, b)).map((x) => x.v);
  const global = withMeta.filter((x) => !x.indian).sort((a, b) => gpriority(a.v) - gpriority(b.v) || rank(a, b)).map((x) => x.v);
  return { indian, global };
}

/** The voice to use when nothing has been chosen: the best voice for the page's
 *  language, preferring Indian English on an Indian-English page.
 *  @param {{name:string,lang:string}[]} voices @param {string} pageLang e.g. 'en' or 'hi' */
export function defaultVoice(voices, pageLang = 'en') {
  const want = String(pageLang).toLowerCase().slice(0, 2);
  const pool = (voices ?? []).filter((v) => String(v.lang).toLowerCase().startsWith(want));
  const { indian, global } = groupVoices(pool.length ? pool : voices);
  const best = [...pool].sort((a, b) => quality(b) - quality(a))[0];
  return best ?? indian[0] ?? global[0] ?? null;
}

/** A line to hear a voice say, in its own language where there is one we are
 *  confident of, otherwise in English. */
export function sampleFor(v) {
  const p = String(v?.lang ?? 'en').toLowerCase().replace('_', '-').slice(0, 2);
  const s = {
    hi: 'नमस्ते। आपका पाठ ऐसे सुनाई देगा।',
    bn: 'নমস্কার। আপনার পাঠ এভাবে শোনাবে।',
    ta: 'வணக்கம். உங்கள் பாடம் இப்படி ஒலிக்கும்.',
    te: 'నమస్కారం. మీ పాఠం ఇలా వినిపిస్తుంది.',
    mr: 'नमस्कार. तुमचा धडा असा ऐकू येईल.',
    gu: 'નમસ્તે. તમારો પાઠ આ રીતે સંભળાશે.',
    kn: 'ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಪಾಠ ಹೀಗೆ ಕೇಳಿಸುತ್ತದೆ.',
    ml: 'നമസ്കാരം. നിങ്ങളുടെ പാഠം ഇങ്ങനെ കേൾക്കാം.',
    pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ। ਤੁਹਾਡਾ ਪਾਠ ਇਸ ਤਰ੍ਹਾਂ ਸੁਣਾਈ ਦੇਵੇਗਾ।',
  }[p];
  return s ?? 'Hello. This is how your lesson will sound.';
}

export const RATES = [0.75, 0.9, 1, 1.15, 1.3];
