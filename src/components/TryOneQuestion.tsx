import { useState } from 'react';

/** "Try one question now" — design turn 3.
 *
 *  The strongest idea in that artboard: prove the product before asking for
 *  anything. A visitor answers a real question, gets a real explanation, and
 *  learns something in about eight seconds — all before signup, which the site
 *  does not require anyway.
 *
 *  It is deliberately NOT scored, stored or counted. Nothing about answering
 *  this enters progress, XP or the review queue: it is a demonstration, not an
 *  assessment, and quietly recording a stranger's first tap would contradict
 *  the privacy page on the same visit.
 */

const QUESTION = 'Your phone unlocks by recognising your face. Is that AI deciding, or AI suggesting?';
const OPTIONS = ['Deciding', 'Suggesting'] as const;
const ANSWER = 0;
const EXPLAIN =
  'Face unlock decides on its own — most everyday AI only suggests. ' +
  'Knowing which is which is lesson one.';

export default function TryOneQuestion({ startHref }: { startHref: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === ANSWER;

  return (
    <section className="card" aria-label="Try one question"
      style={{ background: 'var(--c-surface-2)', borderColor: 'var(--c-border-strong)' }}>
      <p style={{ margin: '0 0 var(--sp-3)', display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-300)' }}>
          Try one question now
        </strong>
        <span style={{
          fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)',
          border: '1px solid var(--c-border-strong)', borderRadius: 999, padding: '2px 10px',
        }}>no signup</span>
      </p>

      <p style={{ marginTop: 0 }}>{QUESTION}</p>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        {OPTIONS.map((o, i) => {
          const chosen = picked === i;
          return (
            <button key={o} className={chosen ? 'btn' : 'btn btn--ghost'}
              aria-pressed={chosen} onClick={() => setPicked(i)}>
              {o}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        // Icon plus words, never colour alone.
        <div role="status" style={{ marginTop: 'var(--sp-4)' }}>
          <p style={{ margin: 0, fontWeight: 600, color: right ? 'var(--c-progress)' : 'var(--c-reward)' }}>
            {right ? '✓ Correct.' : '→ Not quite — and that is the interesting bit.'}
          </p>
          <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-soft)' }}>{EXPLAIN}</p>
          <p style={{ margin: 'var(--sp-4) 0 0' }}>
            <a className="btn" href={startHref}>That was lesson one — keep going</a>
          </p>
        </div>
      )}
    </section>
  );
}
