/** "Reward moment — no confetti, no noise" (design turn 3).
 *
 *  The frame's own title is the brief. It reads:
 *
 *    Module E1 complete — Eight lessons, +80 XP, and a new badge.
 *    Your streak is at seven days.
 *
 *  Four facts in two sentences, and nothing that moves. No confetti, no
 *  sound, no modal that has to be dismissed. The site's gamification policy
 *  and its accessibility posture point the same way: an animation somebody
 *  cannot turn off is a barrier, and a celebration louder than the
 *  achievement teaches learners to distrust the next one.
 *
 *  Everything shown is derived from what actually happened. If no badge was
 *  earned the clause is absent rather than softened, and if the streak is one
 *  day it says one day.
 */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** The design spells small numbers out ("Eight lessons", "seven days"), which
 *  reads as a sentence rather than a scoreboard. Past twenty it uses digits,
 *  because "thirty-seven" in prose is worse than "37". */
export function spell(n: number): string {
  return n >= 0 && n <= 20 ? WORDS[n] : String(n);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RewardMoment(
  { moduleId, lessons, xp, newBadges, streak }:
  { moduleId: string; lessons: number; xp: number; newBadges: string[]; streak: number }
) {
  const badgeClause = newBadges.length === 0 ? ''
    : newBadges.length === 1 ? ', and a new badge'
    : `, and ${spell(newBadges.length)} new badges`;

  return (
    <section role="status" className="note note--ok" style={{ marginBlock: 'var(--sp-6)' }}>
      <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>
        Module {moduleId.toUpperCase()} complete
      </h2>

      <p style={{ fontSize: 'var(--fs-300)', marginBottom: 'var(--sp-2)' }}>
        {cap(spell(lessons))} lesson{lessons === 1 ? '' : 's'}, +{xp} XP{badgeClause}.
        {streak > 0 && <> Your streak is at {spell(streak)} day{streak === 1 ? '' : 's'}.</>}
      </p>

      {newBadges.length > 0 && (
        <p style={{ margin: '0 0 var(--sp-4)', color: 'var(--c-ink-soft)' }}>
          {newBadges.join(' · ')} — <a href="/achievements">see all badges</a>
        </p>
      )}

      <p style={{ marginBottom: 0, display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        <a className="btn" href="/home">Back to your dashboard</a>
        <a className="btn btn--ghost" href="/review">Review today's cards</a>
      </p>
    </section>
  );
}
