import { useEffect, useMemo, useState } from 'react';
import { passQuiz, hasPassedQuiz, badges, summary, load } from '../lib/progress-store';
import { XP_MODULE_QUIZ, XP_LESSON_COMPLETE, BADGES } from '../lib/progress-core';
import { drawAndShuffle } from '../lib/shuffle.js';
import RewardMoment from './RewardMoment';

interface Item { id: string; q: string; options: string[]; answer: number; explain: string; }
interface Props {
  moduleId: string; title: string; items: Item[]; drawCount: number; passThreshold: number;
  /** Every lesson slug in this module, so the reward moment can say whether
   *  passing the quiz actually COMPLETED the module or merely passed a quiz
   *  with lessons still unread. */
  moduleLessons: string[];
}

type Reward = { lessons: number; xp: number; newBadges: string[]; streak: number };

/* Draw order was already random; option order was not, and the banks put 96%
   of correct answers at index 1. drawAndShuffle randomises both. Safe to do in
   the useMemo below because the start screen renders first — no question is on
   screen at hydration, so there is no SSR/client mismatch to worry about. */

/** Module quiz: random draw, one question at a time, instant explanations
 *  (formative), 80% pass, unlimited retries with a fresh draw, XP awarded
 *  once. Module quizzes are practice-grade by design; certification item
 *  banks stay server-side (FR-CERT-1) and arrive with accounts. */
export default function ModuleQuiz({ moduleId, title, items, drawCount, passThreshold, moduleLessons }: Props) {
  const [round, setRound] = useState(0);
  const drawn = useMemo(() => drawAndShuffle(items, drawCount), [round, items, drawCount]);
  const [idx, setIdx] = useState(-1);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [reward, setReward] = useState<Reward | null>(null);
  /* Captured ONCE, at mount. Read fresh on every render it flips to true the
     moment the pass is awarded, so a learner passing for the first time was
     told "Still sharp" — the message for someone who had passed before —
     instead of "+30 XP earned". */
  const [alreadyPassed] = useState(() => typeof window !== 'undefined' && hasPassedQuiz(moduleId));

  const finished = idx >= drawn.length && idx > -1;
  const score = drawn.length ? correct / drawn.length : 0;
  const passed = finished && score >= passThreshold;

  /* Awarding XP used to happen inline during render. That worked, but a
     write in a render body runs again on every re-render and is exactly the
     kind of thing React's strict mode is designed to catch — and it left no
     way to see which badges were new, because the award had already landed
     by the time anything could look. Doing it in an effect gives a clean
     before/after. */
  useEffect(() => {
    if (!passed) return;
    const totals = { [moduleId]: moduleLessons.length };
    const before = new Set(badges(totals));

    if (!hasPassedQuiz(moduleId)) passQuiz(moduleId, score);

    const done = load().completions;
    const readCount = moduleLessons.filter((s) => done[s]).length;
    // The reward moment claims the MODULE is complete. Only say so when it is.
    if (readCount < moduleLessons.length) return;

    const gained = badges(totals).filter((b) => !before.has(b));
    setReward({
      lessons: moduleLessons.length,
      xp: moduleLessons.length * XP_LESSON_COMPLETE + XP_MODULE_QUIZ,
      newBadges: gained.map((id) => BADGES.find((b: { id: string; name: string }) => b.id === id)?.name ?? id),
      streak: summary().streak,
    });
  }, [passed, moduleId, score, moduleLessons]);

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

  if (finished) {
    return (
      <>
      {/* The reward moment sits ABOVE the score, because "Module E1 complete"
          is the news and "9/10" is the detail. It appears only when the whole
          module is done — passing the quiz with lessons still unread gets the
          ordinary result panel, which is the truth. */}
      {reward && (
        <RewardMoment moduleId={moduleId} lessons={reward.lessons} xp={reward.xp}
          newBadges={reward.newBadges} streak={reward.streak} />
      )}
      <section role="status" style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)', padding: 'var(--sp-6)' }}>
        <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>
          {/* The party popper is gone on purpose: turn 3's frame is titled "Reward
            moment — no confetti, no noise", and when a module is finished the
            panel above carries the celebration in words instead. */}
          {passed ? 'Passed' : 'Not yet — and that\u2019s fine'}: {correct}/{drawn.length}
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
      </>
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
