import { useEffect, useState } from 'react';
import { markComplete, isComplete } from '../lib/progress-store';
import { XP_LESSON_COMPLETE } from '../lib/progress-core';

/** Lesson completion — awards local XP once (idempotent), then continues.
 *  Single primary action; celebration is one quiet line, earned. */
export default function CompleteButton(
  { slug, hash, nextHref, quizHref }: { slug: string; hash: string; nextHref: string | null; quizHref?: string }
) {
  const [done, setDone] = useState(false);
  const [justEarned, setJustEarned] = useState(false);
  useEffect(() => { setDone(isComplete(slug)); }, [slug]);

  function onComplete() {
    const already = isComplete(slug);
    markComplete(slug, hash);
    setDone(true);
    if (!already) setJustEarned(true);
  }

  return (
    <div>
      {justEarned && (
        <p role="status" style={{ color: 'var(--c-reward)', fontWeight: 600 }}>
          +{XP_LESSON_COMPLETE} XP — saved on this device. Sign in later to keep it everywhere.
        </p>
      )}
      {!done ? (
        <button className="btn" onClick={onComplete}>Mark complete{nextHref ? ' & continue' : ''}</button>
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
    </div>
  );
}
