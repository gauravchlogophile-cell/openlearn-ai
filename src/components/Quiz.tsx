import { useEffect, useState } from 'react';
import { shuffleOptions } from '../lib/shuffle.js';

export interface QuizItem {
  q: string;
  options: string[];
  answer: number;       // index — fine for PRACTICE quizzes only; graded
  explain: string;      // banks live server-side (FR-CERT-1)
}

/** Practice mini-quiz island — instant feedback, unlimited retries,
 *  no colour-only signalling (icon + text), keyboard-native radios. */
export default function Quiz({ items }: { items: QuizItem[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  /* Option order is randomised per visit, because authored banks are heavily
     position-biased (94% of correct answers sat at index 1). This runs in an
     effect rather than in the initial state because the island is SSR'd:
     shuffling during render would give the server and the client different
     markup and trip a hydration mismatch. Until the effect runs we show the
     authored order, which nobody can act on yet — the radios are inert before
     hydration. */
  const [view, setView] = useState(
    () => items.map((it) => ({ options: it.options, answer: it.answer }))
  );
  useEffect(() => {
    setView(items.map((it) => shuffleOptions(it.options, it.answer)));
    setPicked({});
    setChecked(false);
  }, [items]);

  const correct = view.filter((v, i) => picked[i] === v.answer).length;

  return (
    <section aria-label="Check your understanding" style={{
      background: 'var(--c-surface)', borderRadius: 'var(--r-m)',
      padding: 'var(--sp-6)', marginBlock: 'var(--sp-8)'
    }}>
      <h2 style={{ fontSize: 'var(--fs-300)', marginTop: 0 }}>Check your understanding</h2>
      {items.map((it, i) => (
        <fieldset key={i} style={{ border: 0, padding: 0, marginBlockEnd: 'var(--sp-6)' }}>
          <legend style={{ fontWeight: 600 }}>{i + 1}. {it.q}</legend>
          {(view[i]?.options ?? it.options).map((opt, j) => (
            <label key={j} style={{ display: 'block', padding: 'var(--sp-2) 0', minHeight: 44 }}>
              <input
                type="radio" name={'q' + i} checked={picked[i] === j}
                onChange={() => { setPicked({ ...picked, [i]: j }); setChecked(false); }}
              />{' '}{opt}
            </label>
          ))}
          {checked && picked[i] !== undefined && (
            <p role="status" style={{
              color: picked[i] === view[i].answer ? 'var(--c-progress)' : 'var(--c-alert)',
              fontWeight: 600
            }}>
              {picked[i] === view[i].answer ? '\u2713 Correct. ' : '\u2717 Not quite. '}
              <span style={{ color: 'var(--c-ink)', fontWeight: 400 }}>{it.explain}</span>
            </p>
          )}
        </fieldset>
      ))}
      <button className="btn" onClick={() => setChecked(true)}
        disabled={Object.keys(picked).length < items.length}>
        Check answers
      </button>
      {checked && (
        <p aria-live="polite" style={{ marginBlockEnd: 0 }}>
          You got {correct} of {items.length}. {correct === items.length
            ? 'Nicely done — carry on.' : 'Re-read the section above and try again — retries are free here, always.'}
        </p>
      )}
    </section>
  );
}
