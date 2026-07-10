import { useState } from 'react';

interface Case {
  id: string; title: string; task: string;
  prompt: string; promptWeak?: string;
  output: string; outputWeak?: string;
  notes: string[];
}

/** Prompt Sandbox — CANNED MODE (Phase 4 §3 Mode 1).
 *  Curated recorded runs with annotations; before/after pairs where the
 *  contrast teaches. Mode is always visible; live modes arrive with backend. */
export default function Sandbox({ cases }: { cases: Case[] }) {
  const [caseId, setCaseId] = useState(cases[0].id);
  const [variant, setVariant] = useState<'strong' | 'weak'>('strong');
  const [ran, setRan] = useState(false);
  const c = cases.find((x) => x.id === caseId)!;
  const hasWeak = Boolean(c.promptWeak && c.outputWeak);
  const prompt = variant === 'weak' && c.promptWeak ? c.promptWeak : c.prompt;
  const output = variant === 'weak' && c.outputWeak ? c.outputWeak : c.output;

  return (
    <div>
      <p aria-label="Sandbox mode" style={{ display: 'inline-block', background: 'var(--c-surface)',
        border: '1px solid var(--c-border)', borderRadius: 999, padding: '4px 14px',
        fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>
        Mode: <strong>Canned</strong> — curated example runs · live models arrive with accounts
      </p>

      <label htmlFor="case" style={{ display: 'block', fontWeight: 600, marginTop: 'var(--sp-6)' }}>
        Pick an example run
      </label>
      <select id="case" value={caseId}
        onChange={(e) => { setCaseId(e.target.value); setVariant('strong'); setRan(false); }}
        style={{ padding: 'var(--sp-2)', minHeight: 44, borderRadius: 'var(--r-s)',
          border: '1px solid var(--c-border)', maxWidth: '100%', marginBlock: 'var(--sp-2)' }}>
        {cases.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>
      <p style={{ color: 'var(--c-ink-soft)', marginTop: 0 }}>{c.task}</p>

      {hasWeak && (
        <p role="group" aria-label="Prompt variant" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className={variant === 'weak' ? 'btn' : 'btn btn--ghost'}
            aria-pressed={variant === 'weak'}
            onClick={() => { setVariant('weak'); setRan(false); }}>Vague prompt</button>
          <button className={variant === 'strong' ? 'btn' : 'btn btn--ghost'}
            aria-pressed={variant === 'strong'}
            onClick={() => { setVariant('strong'); setRan(false); }}>Structured prompt</button>
        </p>
      )}

      <h2 style={{ fontSize: 'var(--fs-200)' }}>Prompt</h2>
      <pre style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-m)',
        padding: 'var(--sp-4)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{prompt}</pre>

      {!ran ? (
        <button className="btn" onClick={() => setRan(true)}>Run (show recorded output)</button>
      ) : (
        <div>
          <h2 style={{ fontSize: 'var(--fs-200)' }}>Recorded output</h2>
          <pre style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-m)',
            padding: 'var(--sp-4)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            borderInlineStart: '3px solid var(--c-progress)' }}>{output}</pre>
          <h2 style={{ fontSize: 'var(--fs-200)' }}>Why this works</h2>
          <ul>
            {c.notes.map((n, i) => <li key={i} style={{ marginBlock: 'var(--sp-2)' }}>{n}</li>)}
          </ul>
          {hasWeak && variant === 'strong' && (
            <p style={{ color: 'var(--c-ink-soft)' }}>
              Tip: flip to the <em>vague prompt</em> above and run it — the contrast is the lesson.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
