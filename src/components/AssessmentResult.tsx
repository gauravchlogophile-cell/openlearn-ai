/** 10c · Three results.
 *
 *  Secure, nearly, not yet — one component, because the structure must not
 *  change between them. 10c is explicit that not-yet is "a normal part of
 *  this", and a page that switches to a different, smaller, apologetic layout
 *  when the news is bad tells the learner something the words are trying not
 *  to. Same shape, same weight; what changes is what is offered next.
 *
 *  Two sources, one renderer. A learner reads their own result through
 *  my_result(), which takes no learner argument. An administrator previews a
 *  seeded scenario through fixture_result(), which refuses any attempt that is
 *  not a fixture — so the preview path cannot reach a real learner's band.
 */
import { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { BANDS, TIERS } from '../lib/certification';
import rubric from '../../content/rubrics/e7.json';

type Result = {
  attempt_id: number;
  band: 'not_yet' | 'nearly' | 'secure' | null;
  band_source: 'score' | 'rubric' | null;
  auto_score: number | null;
  auto_max: number | null;
  state: string;
  submitted_at: string | null;
  retake_at: string | null;
  criterion_bands: string[] | null;
  reviewer_notes: string[] | null;
  credential_code: string | null;
  credential_tier: string | null;
  record_code: string | null;
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export default function AssessmentResult({ moduleId }: { moduleId: string }) {
  const [result, setResult] = useState<Result | null | 'none'>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  /* ?preview=<attempt> is read here rather than on the server, because the page
     is prerendered — a value resolved at build time would be identical for
     every visitor. fixture_result() is what makes this safe: it refuses any
     attempt that is not seeded, so a guessed id cannot reach a real result. */
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('preview');
    const n = raw ? Number(raw) : NaN;
    setPreview(Number.isFinite(n) && n > 0 ? n : null);
  }, []);

  useEffect(() => {
    if (!isConfigured) { setResult('none'); return; }
    (async () => {
      const { data, error } = preview
        ? await supabase().rpc('fixture_result', { p_attempt: preview })
        : await supabase().rpc('my_result', { p_module: moduleId });
      if (error) { setError(error.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      setResult(row ?? 'none');
    })();
  }, [moduleId, preview]);

  if (error) return <div className="note note--try">{error}</div>;
  if (result === null) return <p style={{ color: 'var(--c-ink-faint)' }}>Loading…</p>;

  if (result === 'none') {
    return (
      <div className="note note--aim">
        <strong>No attempt to show.</strong>
        <p className="prose" style={{ margin: 'var(--sp-2) 0 0' }}>
          You have not sat this assessment. Nothing is missing and nothing is
          overdue — <a href={`/certification/${moduleId}`}>what the two tiers
          mean</a> is the place to start.
        </p>
      </div>
    );
  }

  /* Still with a reviewer. 10b: "You do not need to keep this page open." */
  if (result.state === 'awaiting_review' && !result.band) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 'var(--fs-400)', marginTop: 0 }}>Submitted {when(result.submitted_at)}</h2>
        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          Auto-marked part: <strong>{result.auto_score} of {result.auto_max}</strong>.
          Your written answer is with a volunteer reviewer. We will email you when
          it is read — you do not need to keep this page open.
        </p>
      </div>
    );
  }

  const band = result.band ?? 'not_yet';
  const pct = result.auto_max ? Math.round((result.auto_score! / result.auto_max) * 100) : null;

  /* An issued certificate that is still queued for a human read. 10b: the
     review can only raise it, and nothing is taken away by an upgrade. */
  const upgradePending = result.state === 'awaiting_review' && Boolean(result.band);

  return (
    <div>
      <div className="card">
        <p style={{
          letterSpacing: '0.1em', textTransform: 'uppercase',
          fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)', margin: '0 0 var(--sp-1)',
        }}>
          {band === 'secure' ? 'Secure' : band === 'nearly' ? 'Nearly' : 'Not yet'}
        </p>

        <h2 style={{ fontSize: 'var(--fs-500)', margin: '0 0 var(--sp-3)', lineHeight: 1.15 }}>
          {band === 'secure'
            ? `Your ${TIERS.certificate.name} for ${moduleId.toUpperCase()} is issued`
            : band === 'nearly'
              ? `Your ${TIERS.record.name} is issued. The Certificate is still yours to earn.`
              : 'Not this time — and that is a normal part of this.'}
        </h2>

        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          {band === 'secure'
            ? (result.band_source === 'rubric'
                ? 'A volunteer read your written answer and judged it secure against the published rubric.'
                : 'Your answers were marked against the published bands.')
            : band === 'nearly'
              ? 'Nothing here expires and nothing is lost. When you want it, come back — you keep the record either way.'
              : 'Nothing is recorded publicly, and no one is told. The feedback below is the useful part.'}
        </p>

        {pct !== null && (
          <p style={{ color: 'var(--c-ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
            Auto-marked: {result.auto_score} of {result.auto_max} ({pct}%)
            {result.band_source === 'score' && ' · banded on score'}
          </p>
        )}

        {upgradePending && (
          <div className="note note--aim" style={{ marginTop: 'var(--sp-4)' }}>
            <strong>A reviewer is still reading your written answer.</strong>
            <p className="prose" style={{ margin: 'var(--sp-2) 0 0' }}>
              Your certificate was issued straight away rather than making you
              wait. If the reviewer bands you higher it is upgraded
              automatically. Nothing is taken away by an upgrade, and nothing is
              downgraded by one.
            </p>
          </div>
        )}

        {band === 'secure' && result.credential_code && (
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <p style={{ margin: 0, color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>Certificate code</p>
            <p style={{
              margin: '2px 0 var(--sp-3)', fontSize: 'var(--fs-400)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.08em',
            }}>{result.credential_code}</p>
            <a className="btn" href={`/certificate/${result.credential_code}`}>View certificate</a>
          </div>
        )}
      </div>

      {/* ------------------------------------------------ what to shore up */}
      {result.criterion_bands && band !== 'secure' && (
        <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
          <h3 style={{ fontSize: 'var(--fs-300)', marginTop: 0 }}>
            {band === 'nearly' ? 'Two things to shore up' : 'What the reviewer saw'}
          </h3>
          <ol style={{ display: 'grid', gap: 'var(--sp-3)', paddingInlineStart: 'var(--sp-5)', margin: 0 }}>
            {result.criterion_bands.map((cb, i) => {
              const crit = rubric.criteria[i];
              if (!crit || cb === 'secure') return null;
              return (
                <li key={crit.id}>
                  <strong>{crit.name}</strong> — {BANDS[cb as keyof typeof BANDS]?.name ?? cb}
                  {result.reviewer_notes?.[i] && (
                    <><br /><span style={{ color: 'var(--c-ink-soft)' }}>{result.reviewer_notes[i]}</span></>
                  )}
                  <br />
                  <a href={`/certification/${moduleId}#rubric`} style={{ fontSize: 'var(--fs-100)' }}>
                    what secure looks like here
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ------------------------------------------------------- what next */}
      {band !== 'secure' && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
            Attempts are unlimited. The 24-hour wait is there so a re-sit means
            something.
            {result.retake_at && new Date(result.retake_at) > new Date()
              ? <> Your next attempt opens <strong>{when(result.retake_at)}</strong>.</>
              : <> You can re-sit now.</>}
          </p>
          <a className="btn btn--ghost" href={`/certification/${moduleId}/assess`}>
            {result.retake_at && new Date(result.retake_at) > new Date()
              ? 'What the assessment involves' : 'Re-sit'}
          </a>
        </div>
      )}

      {result.record_code && (
        <p className="prose" style={{ color: 'var(--c-ink-faint)', marginTop: 'var(--sp-6)' }}>
          Your {TIERS.record.name} for this module is <code>{result.record_code}</code> and is
          unaffected by any of the above. Only you see your unfinished attempts.
        </p>
      )}
    </div>
  );
}
