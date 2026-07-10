import { useMemo, useState } from 'react';
import { passQuiz, hasPassedQuiz } from '../lib/progress-store';
import { XP_MODULE_QUIZ } from '../lib/progress-core';

interface Item { id: string; q: string; options: string[]; answer: number; explain: string; }
interface Props { moduleId: string; title: string; items: Item[]; drawCount: number; passThreshold: number; }

function draw(items: Item[], n: number): Item[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Module quiz: random draw, one question at a time, instant explanations
 *  (formative), 80% pass, unlimited retries with a fresh draw, XP awarded
 *  once. Module quizzes are practice-grade by design; certification item
 *  banks stay server-side (FR-CERT-1) and arrive with accounts. */
export default function ModuleQuiz({ moduleId, title, items, drawCount, passThreshold }: Props) {
  const [round, setRound] = useState(0);
  const drawn = useMemo(() => draw(items, drawCount), [round, items, drawCount]);
  const [idx, setIdx] = useState(-1);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const alreadyPassed = typeof window !== 'undefined' && hasPassedQuiz(moduleId);

  function start() { setIdx(0); setPicked(null); setRevealed(false); setCorrect(0); }
  function check() {
    setRevealed(true);
    if (picked === drawn[idx].answer) setCorrect((c) => c + 1);
  }
  function nextQ() { setPicked(null); setRevealed(false); setIdx((i) => i + 1); }
  function retry() { setRound((r) => r + 1); start(); }

  if (idx === -1) return (
    <section style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)', padding: 'var(--sp-6)' }}>
      <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>{title}</h2>
      <p>{drawCount} questions drawn at random from a larger bank · pass at {Math.round(passThreshold * 100)}%
        · instant explanations · unlimited retries with a fresh draw. First pass earns +{XP_MODULE_QUIZ} XP.</p>
      {alreadyPassed && <p style={{ color: 'var(--c-progress)', fontWeight: 600 }}>
        🏅 You've already passed this quiz. Retake anytime — knowledge fades, retries are free.</p>}
      <button className="btn" onClick={start}>{alreadyPassed ? 'Retake quiz' : 'Start quiz'}</button>
    </section>
  );

  if (idx >= drawn.length) {
    const score = correct / drawn.length;
    const passed = score >= passThreshold;
    if (passed && !hasPassedQuiz(moduleId)) passQuiz(moduleId, score);
    return (
      <section role="status" style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)', padding: 'var(--sp-6)' }}>
        <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>
          {passed ? '🎉 Passed' : 'Not yet — and that\u2019s fine'}: {correct}/{drawn.length}
        </h2>
        {passed ? (
          <p>{alreadyPassed ? 'Still sharp.' : `+${XP_MODULE_QUIZ} XP earned.`} Module {moduleId.toUpperCase()} is
            quiz-complete. On to the next module whenever you're ready.</p>
        ) : (
          <p>You need {Math.ceil(passThreshold * drawn.length)} correct. Re-read the explanations you missed,
            revisit the lessons they point to, and try a fresh draw — retries are unlimited and unpenalised.</p>
        )}
        <button className="btn" onClick={retry}>Try a fresh draw</button>{' '}
        <a className="btn btn--ghost" href="/home">Back to dashboard</a>
      </section>
    );
  }

  const it = drawn[idx];
  return (
    <section aria-label={'Question ' + (idx + 1) + ' of ' + drawn.length}>
      <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        Question {idx + 1} of {drawn.length} · {correct} correct so far
      </p>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 'var(--fs-300)' }}>{it.q}</legend>
        {it.options.map((opt, j) => (
          <label key={j} style={{ display: 'block', padding: 'var(--sp-2) 0', minHeight: 44 }}>
            <input type="radio" name="q" disabled={revealed}
              checked={picked === j} onChange={() => setPicked(j)} />{' '}{opt}
          </label>
        ))}
      </fieldset>
      {!revealed ? (
        <button className="btn" onClick={check} disabled={picked === null}>Check answer</button>
      ) : (
        <div>
          <p role="status" style={{ fontWeight: 600,
            color: picked === it.answer ? 'var(--c-progress)' : 'var(--c-alert)' }}>
            {picked === it.answer ? '✓ Correct. ' : '✗ Not quite. '}
            <span style={{ color: 'var(--c-ink)', fontWeight: 400 }}>{it.explain}</span>
          </p>
          <button className="btn" onClick={nextQ}>
            {idx + 1 < drawn.length ? 'Next question' : 'See results'}
          </button>
        </div>
      )}
    </section>
  );
}
