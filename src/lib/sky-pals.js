/** Practice pals: a few labelled, made-up study partners who share Sky's board.
 *
 *  A board with one name on it is not motivating, and Lrnon is small. The owner
 *  asked on 16 October 2026 for entries that change every day so the board is
 *  never empty. Pals do that, with one condition that is not negotiable:
 *
 *    THEY ARE NEVER PRESENTED AS REAL LEARNERS.
 *
 *  Every pal is labelled "Practice pal" wherever it appears, has a name that
 *  cannot be mistaken for a generated learner handle ("Pip the Otter", not
 *  "quiet-fern"), and is counted nowhere: not in any total, not in analytics, not
 *  in the number of people on the board. A learner who joined and found that the
 *  strangers they were racing did not exist, and had not been told, would be right
 *  to distrust every other number on the site. Told plainly, a pal is a
 *  pacemaker: something to run alongside. Not told, it is a lie, and this
 *  project's whole position is that it does not tell those.
 *
 *  Everything is derived from the date, so the same day always shows the same
 *  pals with the same scores at the same hour, on every device, with nothing
 *  stored and nothing to keep in step. Pure functions: no browser, no network.
 */

export const PAL_LABEL = 'Practice pal';
export const PAL_EXPLANATION =
  'Practice pals are made-up study partners, here so the board is never empty. They are not real learners and are not counted anywhere.';

const NAMES = [
  ['Pip', 'Otter'], ['Juno', 'Fox'], ['Ziggy', 'Heron'], ['Mochi', 'Owl'], ['Tiko', 'Gecko'], ['Nova', 'Lynx'],
  ['Bram', 'Badger'], ['Lumi', 'Firefly'], ['Sana', 'Swift'], ['Rafi', 'Robin'], ['Kiki', 'Koala'], ['Orin', 'Ibis'],
  ['Dara', 'Dolphin'], ['Mica', 'Magpie'], ['Teddy', 'Tortoise'], ['Yuki', 'Yak'], ['Asha', 'Antelope'], ['Leo', 'Lemur'],
  ['Neel', 'Newt'], ['Rumi', 'Raven'], ['Coco', 'Crane'], ['Vik', 'Viper'], ['Izzy', 'Iguana'], ['Gus', 'Gull'],
];

/** A small, fast, seedable generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const dayIndex = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);

/** One pal's score for one day, fully elapsed: 14 to 58 points, the range of a
 *  lesson or two and a review. */
function dayTarget(name, iso) {
  return 14 + Math.floor(rng(hash(name + '|' + iso))() * 45);
}

/** How much of a day's target has been earned by a given local hour. Pals "study"
 *  across the waking day, so the board is livelier in the evening than at dawn. */
function fractionOfDay(hour) {
  return Math.min(1, Math.max(0.04, (hour - 5) / 17));
}

/** @param {string} isoDate  YYYY-MM-DD, the viewer's local date
 *  @param {'today'|'week'} scope @param {number} hour  0-23, the viewer's local hour
 *  @param {number} [count] how many pals */
export function palsFor(isoDate, scope, hour, count = 6) {
  const order = [...NAMES.keys()];
  const r = rng(hash('pals|' + isoDate));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const di = dayIndex(isoDate);
  const dow = (new Date(isoDate + 'T00:00:00Z').getUTCDay() + 6) % 7;   // Monday = 0

  return order.slice(0, count).map((k) => {
    const [first, animal] = NAMES[k];
    const name = `${first} the ${animal}`;
    const todayPoints = Math.round(dayTarget(name, isoDate) * fractionOfDay(hour));
    let points = todayPoints;
    if (scope === 'week') {
      for (let back = 1; back <= dow; back++) {
        const d = new Date(Date.parse(isoDate + 'T00:00:00Z') - back * 86400000).toISOString().slice(0, 10);
        points += dayTarget(name, d);
      }
    }
    return {
      pal: true, handle: name, label: PAL_LABEL,
      level: 3 + (hash(name) % 9),
      lessons: scope === 'today' ? Math.round(todayPoints / 10) : Math.round(points / 10),
      reviews: 0, points,
      // Streaks grow by a day each day and fall back to the start now and then,
      // like anyone's.
      streak: 1 + ((hash(name) + di) % 28),
      is_me: false,
    };
  });
}

/** Real rows and pals, ranked together. Pals never displace a real learner from
 *  the list: if there is not room for everyone, pals are dropped first.
 *  @param {object[]} real  rows from sky_board
 *  @param {object[]} pals  from palsFor
 *  @param {number} limit */
export function mergeBoard(real, pals, limit = 10) {
  const byRank = (a, b) => b.points - a.points || String(a.handle).localeCompare(String(b.handle));
  const keepReal = [...real].sort(byRank).slice(0, limit);
  const room = Math.max(0, limit - keepReal.length);
  const keepPals = [...pals].sort(byRank).slice(0, room);
  return [...keepReal, ...keepPals].sort(byRank).map((r, i) => ({ ...r, rank: i + 1 }));
}
