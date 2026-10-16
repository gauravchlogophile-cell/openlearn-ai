/** Sky's voice: which device voice it borrows, and the rules around speaking.
 *  Run by `npm test`. Uses made-up voices; nothing here needs a browser. */
import { pickSkyVoice, SKY_VOICE, SKY_SAMPLE } from '../src/lib/sky-voice.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); } };

const v = (name, lang, local = true) => ({ name, lang, localService: local, voiceURI: name });
const device = [
  v('Microsoft David - English (United States)', 'en-US'),
  v('Microsoft Zira - English (United States)', 'en-US'),
  v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  v('Microsoft Neerja Online (Natural) - English (India)', 'en-IN', false),
  v('Microsoft Heera - Hindi (India)', 'hi-IN'),
  v('eSpeak English', 'en'),
];

check('with nothing chosen, Sky takes a natural bright voice, not the first in the list',
  /Neerja|Aria/.test(pickSkyVoice(device, '', 'en')?.name ?? ''));
check('a chosen voice that exists is used', pickSkyVoice(device, 'Microsoft Zira - English (United States)', 'en')?.name.includes('Zira'));
check('a chosen voice that has gone falls back to a good one, not to nothing', Boolean(pickSkyVoice(device, 'Voice That Left', 'en')));
check('a robotic voice is never the pick when a natural one exists', !/eSpeak/.test(pickSkyVoice(device, '', 'en')?.name ?? ''));
check('with no voices at all there is nothing to pick and no crash', pickSkyVoice([], '', 'en') === null && pickSkyVoice(undefined, '', 'en') === null);
check('on a Hindi page Sky takes a Hindi voice', /hi/i.test(pickSkyVoice(device, '', 'hi')?.lang ?? ''));
check('with only robotic voices, one is still returned', Boolean(pickSkyVoice([v('eSpeak English', 'en')], '', 'en')));
check('Sky is a little brighter and quicker than neutral, but not cartoonish', SKY_VOICE.pitch > 1 && SKY_VOICE.pitch <= 1.3 && SKY_VOICE.rate >= 1 && SKY_VOICE.rate <= 1.15);
check('the sample line says who is speaking', /Sky/.test(SKY_SAMPLE));

if (failed) { console.error(`sky-voice: ${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`sky-voice: ${passed} checks passed`);
