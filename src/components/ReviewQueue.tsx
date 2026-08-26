/** 10f · The reviewer's queue and the banding form.
 *
 *  "Rubric — one answer, four criteria. The reviewer bands each criterion.
 *   Three or four secure gives secure; two gives nearly."
 *
 *  The single most important property of this screen is what it does NOT show:
 *  "Reviewers never see the learner's name while banding. It is attached after
 *  the decision." That is not enforced here — review_queue() does not select a
 *  name at all, so there is no name in the data this component receives and no
 *  amount of editing this file could reveal one. The comment is here so the
 *  next person to add a column knows why they must not.
 *
 *  The note requirement is enforced twice, and deliberately so. The client
 *  disables the button, which is a courtesy; record_review() raises, which is
 *  the actual rule. Feedback the learner can act on is the entire value of a
 *  human read, and a reviewer at the end of a long session is exactly who would
 *  skip it.
 */
import { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import rubric from '../../content/rubrics/e7.json';

type Item = {
  attempt_id: number;
  module_id: string;
  answer: string;
  auto_score: number | null;
  auto_max: number | null;
  waiting_since: string;
};

type Bands = ('not_yet' | 'nearly' | 'secure')[];

const BAND_LABEL = { secure: 'Secure', nearly: 'Nearly', not_yet: 'Not yet' } as const;

/** 10f's rule, computed live so the reviewer sees the consequence of each
 *  click before committing to it. Mirrors record_review() exactly; the server
 *  recomputes it and the server's answer is the one that counts. */
function outcome(bands: Bands): 'secure' | 'nearly' | 'not_yet' {
  const secure = bands.filter((b) => b === 'secure').length;
  return secure >= 3 ? 'secure' : secure === 2 ? 'nearly' : 'not_yet';
}

export default function ReviewQueue() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [bands, setBands] = useState<Bands>(['not_yet', 'not_yet', 'not_yet', 'not_yet']);
  const [notes, setNotes] = useState<string[]>(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function refresh() {
    if (!isConfigured) { setItems([]); return; }
    const { data, error } = await supabase().rpc('review_queue');
    if (error) { setError(error.message); return; }
    setItems((data ?? []) as Item[]);
  }
  useEffect(() => { void refresh(); }, []);

  const current = items?.[0];
  const band = outcome(bands);

  /* Every criterion below secure needs a note. Same condition the server
     enforces — stated here so the reviewer learns it from the form rather than
     from a rejection. */
  const missingNote = bands.some((b, i) => b !== 'secure' && notes[i].trim() === '');

  async function submit() {
    if (!current) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase().rpc('record_review', {
      p_attempt: current.attempt_id, p_bands: bands, p_notes: notes,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(typeof data === 'string' ? data : band);
    setBands(['not_yet', 'not_yet', 'not_yet', 'not_yet']);
    setNotes(['', '', '', '']);
    await refresh();
  }

  if (!isConfigured) {
    return (
      <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
        Banding needs the database. With fixtures seeded, two answers wait here.
      </p>
    );
  }

  if (items === null) return <p style={{ color: 'var(--c-ink-faint)' }}>Loading…</p>;

  return (
    <div>
      {error && <div className="note note--try" style={{ marginBottom: 'var(--sp-4)' }}>{error}</div>}
      {done && (
        <div className="note note--ok" style={{ marginBottom: 'var(--sp-4)' }}>
          Banded as <strong>{BAND_LABEL[done as keyof typeof BAND_LABEL] ?? done}</strong>.
          {done !== 'not_yet' && ' The certificate is issued or upgraded; a review never lowers an issued band.'}
        </div>
      )}

      {items.length === 0 ? (
        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          Nothing waiting. Answers arrive here only once an assessment is open —
          seed the test entries above to see the queue with something in it.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
            {items.length} waiting · oldest first · you are reading{' '}
            {current!.module_id.toUpperCase()}, submitted{' '}
            {new Date(current!.waiting_since).toLocaleDateString()}
          </p>

          <blockquote className="prose" style={{
            borderInlineStart: '3px solid var(--c-border-strong)',
            paddingInlineStart: 'var(--sp-4)', margin: 'var(--sp-4) 0',
          }}>
            {current!.answer}
          </blockquote>

          <p style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
            Auto-marked part: {current!.auto_score} of {current!.auto_max}. You are
            banding the written answer only — and you are not shown who wrote it.
          </p>

          <div style={{ display: 'grid', gap: 'var(--sp-4)', marginTop: 'var(--sp-6)' }}>
            {rubric.criteria.map((c, i) => (
              <div key={c.id} className="card">
                <strong>{c.name}</strong>
                <p className="prose" style={{ margin: 'var(--sp-1) 0 var(--sp-2)', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-200)' }}>
                  Secure: {c.secure}
                </p>
                <div role="radiogroup" aria-label={c.name}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                  {(['secure', 'nearly', 'not_yet'] as const).map((b) => (
                    <label key={b} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '999px', cursor: 'pointer',
                      border: `1px solid ${bands[i] === b ? 'var(--c-primary)' : 'var(--c-border)'}`,
                      background: bands[i] === b ? 'var(--c-primary-soft)' : 'transparent',
                    }}>
                      <input type="radio" name={`crit-${i}`} checked={bands[i] === b}
                        onChange={() => setBands(bands.map((x, j) => (j === i ? b : x)) as Bands)} />
                      {BAND_LABEL[b]}
                    </label>
                  ))}
                </div>

                {bands[i] !== 'secure' && (
                  <div style={{ marginTop: 'var(--sp-3)' }}>
                    <label htmlFor={`note-${i}`} style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' }}>
                      Required — what would make this secure? The learner reads this.
                    </label>
                    <textarea id={`note-${i}`} rows={2} value={notes[i]}
                      onChange={(e) => setNotes(notes.map((x, j) => (j === i ? e.target.value : x)))}
                      style={{
                        width: '100%', padding: 'var(--sp-2)', marginTop: '4px',
                        border: '1px solid var(--c-border-strong)', borderRadius: '8px',
                        background: 'var(--c-surface)', color: 'var(--c-ink)',
                      }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
            <strong>Result: {BAND_LABEL[band]}</strong>
            <p className="prose" style={{ margin: 'var(--sp-1) 0 var(--sp-3)', color: 'var(--c-ink-soft)' }}>
              {rubric.banding.rule}
            </p>
            <button className="btn" onClick={() => void submit()} disabled={busy || missingNote}>
              {busy ? 'Recording…' : band === 'not_yet' ? 'Record — no certificate issues' : 'Issue certificate'}
            </button>
            {missingNote && (
              <p style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)', marginTop: 'var(--sp-2)' }}>
                Every criterion below secure needs a note before this can be recorded.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
