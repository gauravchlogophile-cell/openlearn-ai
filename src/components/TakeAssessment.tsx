/** 10b · Taking the assessment.
 *
 *  Sectioned, saved as you go, open book, one written answer at the end.
 *
 *  Two modes, and the difference is the whole point of the dry run:
 *
 *    live    start_attempt() opens an attempt, submitting bands it. Refused
 *            while the gate is shut — by the function, not by this component.
 *    dry run nothing is written. No attempt, no score kept, no credential
 *            possible. It exists so this form can be exercised while
 *            certification is closed; the alternative would be opening
 *            certification for a convenience, which is the one thing that
 *            must not happen.
 *
 *  The dry run says so on every screen it renders. A practice run someone
 *  mistook for the real thing would be worse than having no practice run.
 */
import { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { shuffleOptions } from '../lib/shuffle.js';
import bank from '../../content/assessments/e7.json';
import rubric from '../../content/rubrics/e7.json';

type Item = { id: string; section: number; q: string; options: string[]; answer: number; explain: string };

const ITEMS = bank.items as Item[];
const MINUTES = 45;

export default function TakeAssessment({ moduleId }: { moduleId: string }) {
  /* Read here, not on the server: this page is prerendered, so anything decided
     at build time would be identical for every visitor. Nothing is gated on it
     either — a dry run writes nothing, so there is nothing for a guessed query
     parameter to reach. */
  const [dryRun, setDryRun] = useState(false);
  useEffect(() => {
    setDryRun(new URLSearchParams(window.location.search).get('dry') === '1');
  }, []);

  const [attempt, setAttempt] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [section, setSection] = useState(1);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [written, setWritten] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MINUTES * 60);

  /* Options are shuffled once, when the attempt starts, and held for its whole
     length — never recomputed per render, or they would reorder under someone's
     cursor between two clicks.

     This is not optional for this bank. Sixteen of its twenty correct answers
     were authored at index 1, so a learner who always picked the middle option
     would score 80% and clear "secure" without reading a word. That is exactly
     the failure src/lib/shuffle.js was written for, and it is why authored
     order is allowed to be uneven: the fix lives at display time. */
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!started || outcome) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started, outcome]);

  const clock = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const sectionItems = items.filter((i) => i.section === section);
  const answered = sectionItems.filter((i) => picks[i.id] !== undefined).length;

  function shuffleAll() {
    setItems(ITEMS.map((it) => ({ ...it, ...shuffleOptions(it.options, it.answer) })));
  }

  async function begin() {
    setError(null);
    if (dryRun) { shuffleAll(); setStarted(true); return; }
    if (!isConfigured) { setError('This needs the database.'); return; }
    setBusy(true);
    const { data, error } = await supabase().rpc('start_attempt', { p_module: moduleId });
    setBusy(false);
    /* While the gate is shut this always refuses, and the refusal names why.
       Shown rather than swallowed: it is the honest state of the feature. */
    if (error) { setError(error.message); return; }
    setAttempt(data as number);
    shuffleAll();
    setStarted(true);
  }

  /* Scored against the SHUFFLED answer index — the one the learner actually
     clicked. Comparing against the authored index would mark almost everyone
     wrong, silently. */
  function score() {
    let n = 0;
    for (const i of items) if (picks[i.id] === i.answer) n++;
    return n;
  }

  async function submit() {
    const s = score();
    if (dryRun) {
      const pct = (s / ITEMS.length) * 100;
      setOutcome(pct >= 80 ? 'secure' : pct >= 60 ? 'nearly' : 'not_yet');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase().rpc('submit_attempt', {
      p_attempt: attempt, p_score: s, p_max: ITEMS.length, p_written: written,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setOutcome(String(data));
  }

  // --------------------------------------------------------------- finished
  if (outcome) {
    const s = score();
    return (
      <div>
        {dryRun && <DryRunBanner />}
        <div className="card">
          <h2 style={{ fontSize: 'var(--fs-400)', marginTop: 0 }}>
            {dryRun ? 'Dry run finished — nothing was recorded' : 'Submitted'}
          </h2>
          <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
            Auto-marked: <strong>{s} of {items.length}</strong>
            {' '}({Math.round((s / items.length) * 100)}%).
            {outcome === 'awaiting_review'
              ? ' Your written answer is with a volunteer reviewer. We will email you when it is read — you do not need to keep this page open.'
              : dryRun
                ? ` On these answers the auto-marked half would band you "${outcome.replace('_', ' ')}".`
                : ''}
          </p>
          {!dryRun && (
            <a className="btn" href={`/certification/${moduleId}/result`}>See your result</a>
          )}
        </div>

        {/* Every explanation, afterwards. The lesson quizzes do this and the
            reasoning carries: getting one wrong and finding out why is the part
            that teaches. Withholding it would make the assessment a filter
            rather than a piece of learning, which is not what this site is. */}
        <h3 style={{ fontSize: 'var(--fs-300)', marginTop: 'var(--sp-8)' }}>What each one was testing</h3>
        <div style={{ display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
          {items.map((i) => {
            const right = picks[i.id] === i.answer;
            return (
              <div key={i.id} className="card">
                <p style={{ margin: '0 0 var(--sp-2)' }}>
                  <span aria-hidden="true">{right ? '✓' : '✗'}</span>{' '}
                  <span className="sr-only">{right ? 'Correct. ' : 'Incorrect. '}</span>
                  {i.q}
                </p>
                <p className="prose" style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-200)' }}>
                  {i.explain}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ not started
  if (!started) {
    return (
      <div>
        {dryRun && <DryRunBanner />}
        {error && (
          <div className="note note--try" style={{ marginBottom: 'var(--sp-4)' }}>
            <strong>Not open.</strong>
            <p className="prose" style={{ margin: 'var(--sp-2) 0 0' }}>{error}</p>
          </div>
        )}
        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          Two auto-marked sections of ten, then one written answer read by a
          person. Open book — {MINUTES} minutes. Saved as you go, so a dropped
          connection is not a wrong answer.
        </p>
        <button className="btn" onClick={() => void begin()} disabled={busy}>
          {busy ? 'Starting…' : dryRun ? 'Start the dry run' : 'Start the assessment'}
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ in progress
  const onWritten = section === 3;

  return (
    <div>
      {dryRun && <DryRunBanner />}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)',
      }}>
        <span style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
          {onWritten ? 'Section 3 — the written answer' : `Section ${section} of 3 — auto-marked`}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--fs-300)' }}
          aria-label={`${Math.floor(secondsLeft / 60)} minutes remaining`}>{clock}</span>
      </div>

      {!onWritten && (
        <>
          {sectionItems.map((item, n) => (
            <fieldset key={item.id} className="card"
              style={{ marginBottom: 'var(--sp-4)', border: '1px solid var(--c-border)' }}>
              <legend style={{ padding: '0 var(--sp-2)', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
                Question {n + 1} of {sectionItems.length}
              </legend>
              <p style={{ marginTop: 0 }}>{item.q}</p>
              <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                {item.options.map((opt, k) => (
                  <label key={k} style={{
                    display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start',
                    padding: 'var(--sp-2)', borderRadius: 'var(--r-m)', cursor: 'pointer',
                    border: `1px solid ${picks[item.id] === k ? 'var(--c-primary)' : 'var(--c-border)'}`,
                    background: picks[item.id] === k ? 'var(--c-primary-soft)' : 'transparent',
                  }}>
                    <input type="radio" name={item.id} checked={picks[item.id] === k}
                      onChange={() => setPicks({ ...picks, [item.id]: k })} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {section > 1 && (
              <button className="btn btn--ghost" onClick={() => setSection(section - 1)}>Back</button>
            )}
            <button className="btn" onClick={() => setSection(section + 1)}>
              {section === 2 ? 'On to the written answer' : 'Next section'}
            </button>
            <span style={{ alignSelf: 'center', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
              {answered} of {sectionItems.length} answered — you can come back
            </span>
          </div>
        </>
      )}

      {onWritten && (
        <>
          <div className="card">
            <p style={{ marginTop: 0 }}>{rubric.task.prompt}</p>
            <textarea value={written} onChange={(e) => setWritten(e.target.value)} rows={10}
              aria-label="Your written answer"
              style={{
                width: '100%', padding: 'var(--sp-3)', lineHeight: 1.6,
                border: '1px solid var(--c-border-strong)', borderRadius: '8px',
                background: 'var(--c-surface)', color: 'var(--c-ink)',
              }} />
            <p style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
              {written.trim() ? written.trim().split(/\s+/).length : 0} words · aim for {rubric.task.words}
            </p>
            <p className="prose" style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-200)' }}>
              <strong>What the reviewer looks for.</strong> {rubric.task.guidance}
            </p>
          </div>

          {error && <div className="note note--try" style={{ marginTop: 'var(--sp-4)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', marginTop: 'var(--sp-4)' }}>
            <button className="btn btn--ghost" onClick={() => setSection(2)}>Back</button>
            <button className="btn" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Submitting…' : dryRun ? 'Finish the dry run' : 'Submit for review'}
            </button>
          </div>
          <p style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)', marginTop: 'var(--sp-2)' }}>
            Prefer to talk? You can ask for an oral check instead of writing —
            writing fluently is not what is being assessed, and for some people
            it is a barrier that has nothing to do with the skill.
          </p>
        </>
      )}
    </div>
  );
}

function DryRunBanner() {
  return (
    <p style={{
      margin: '0 0 var(--sp-4)', padding: 'var(--sp-3)',
      border: '2px solid var(--c-reward)', borderRadius: 'var(--r-m)',
      background: 'var(--c-reward-soft)', fontWeight: 600,
    }}>
      Dry run — nothing is recorded. No attempt is opened, no score is kept, and
      no certificate can result. This exists so the form can be checked while
      certification is closed.
    </p>
  );
}
