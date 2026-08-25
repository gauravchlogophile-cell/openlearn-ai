import { useEffect, useState } from 'react';
import { markComplete, isComplete, hasAttemptedQuiz } from '../lib/progress-store';
import { XP_LESSON_COMPLETE } from '../lib/progress-core';

/** Lesson completion — awards local XP once (idempotent), then continues.
 *  Single primary action; celebration is one quiet line, earned.
 *
 *  Completion now requires having answered the lesson's questions at least
 *  once. Previously a click was enough, which made a tick in the module rail
 *  mean "I scrolled past this" rather than "I engaged with this" — and the
 *  rail is the learner's own record of what they know.
 *
 *  It is an ATTEMPT that unlocks it, not a correct answer. The inline quizzes
 *  are formative: getting one wrong and reading why is the teaching. Gating on
 *  correctness would push people to guess until the button turned on, which
 *  teaches exactly the opposite of E1·L7.
 *
 *  "Skip for now" is untouched. A learner may always move on; they simply do
 *  not collect a tick for a lesson they did not answer.
 */
export default function CompleteButton(
  { slug, hash, nextHref, quizHref }: { slug: string; hash: string; nextHref: string | null; quizHref?: string }
) {
  const [done, setDone] = useState(false);
  const [attempted, setAttempted] = useState(true);   // assume true until read, so nothing flashes as locked
  const [justEarned, setJustEarned] = useState(false);

  useEffect(() => {
    /* A lesson with no inline quiz has no way to ever record an attempt, so
       gating on one would make it permanently uncompletable — no tick, no XP,
       and the module could never reach 100%, which would also block the
       module-complete reward. Every lesson has a quiz today, but E4 onward is
       being written now and nothing enforces that they must.

       The quiz island renders section[aria-label="Check your understanding"],
       which is in the prerendered HTML and therefore present before this
       effect runs. Absent quiz, nothing to attempt, so nothing to gate on. */
    const read = () => {
      const hasQuiz = !!document.querySelector('section[aria-label="Check your understanding"]');
      setDone(isComplete(slug));
      setAttempted(!hasQuiz || hasAttemptedQuiz(slug));
    };
    read();
    // The quiz island dispatches this when answers are checked, so the button
    // unlocks in place rather than needing a reload.
    window.addEventListener('ol:progress', read);
    return () => window.removeEventListener('ol:progress', read);
  }, [slug]);

  function onComplete() {
    const already = isComplete(slug);
    markComplete(slug, hash);
    setDone(true);
    if (!already) setJustEarned(true);
  }

  const locked = !done && !attempted;

  return (
    <div>
      {justEarned && (
        <p role="status" style={{ color: 'var(--c-reward)', fontWeight: 600 }}>
          +{XP_LESSON_COMPLETE} XP — saved on this device. Sign in later to keep it everywhere.
        </p>
      )}

      {!done ? (
        <button className="btn" onClick={onComplete} disabled={locked}
          style={locked ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
          Mark complete{nextHref ? ' & continue' : ''}
        </button>
      ) : nextHref ? (
        <a className="btn" href={nextHref}>Continue to next lesson →</a>
      ) : quizHref ? (
        <a className="btn" href={quizHref}>Module complete — take the quiz 🏁</a>
      ) : (
        <a className="btn" href="/home">Module complete 🎉 Back to dashboard</a>
      )}

      {!done && nextHref && (
        <a className="btn btn--ghost" href={nextHref} style={{ marginInlineStart: 'var(--sp-3)' }}>
          Skip for now
        </a>
      )}

      {/* Say why it is locked. A disabled button with no explanation is the
          single most annoying thing an interface can do. */}
      {locked && (
        <p role="status" style={{ margin: 'var(--sp-3) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          Answer the questions above first — right or wrong, both count. You can still skip
          ahead or go back; you just won't collect this lesson yet.
        </p>
      )}
    </div>
  );
}
