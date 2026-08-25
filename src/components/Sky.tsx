import { useEffect, useRef, useState } from 'react';

/** Sky — the dock button and panel.
 *
 *  Holds no key, no model name and no system prompt. It posts a question and
 *  the current path to /api/sky on this same origin, and renders what comes
 *  back. Every answer carries the pages it came from; when the server says the
 *  question is out of scope, this offers a human instead of dressing the
 *  refusal up as an answer.
 */

type Source = { label: string; href: string };
type State =
  | { k: 'idle' }
  | { k: 'working' }
  | { k: 'slow' }
  | { k: 'answer'; text: string; sources: Source[] }
  | { k: 'out_of_scope'; title: string; message: string; handoff: Source[] }
  | { k: 'unavailable'; message: string };

interface Props {
  intro: string;
  disclaimer: string;
  suggestions: string[];
}

export default function Sky({ intro, disclaimer, suggestions }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ k: 'idle' });
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const slowTimer = useRef<number | undefined>(undefined);

  // Escape closes; focus moves into the panel on open. Keyboard reachable and
  // screen-reader labelled are requirements from the design, not extras.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // "Chat clears on close unless you save it" — so closing discards it.
  function close() {
    setOpen(false);
    setState({ k: 'idle' });
    setQ('');
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ('');
    setState({ k: 'working' });
    slowTimer.current = window.setTimeout(() => {
      setState((s) => (s.k === 'working' ? { k: 'slow' } : s));
    }, 6000);

    try {
      const res = await fetch('/api/sky', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: text, page: location.pathname }),
      });
      const data = await res.json();
      window.clearTimeout(slowTimer.current);

      if (data.verdict === 'out_of_scope') {
        setState({ k: 'out_of_scope', title: data.title, message: data.message, handoff: data.handoff ?? [] });
      } else if (res.ok && data.answer) {
        setState({ k: 'answer', text: data.answer, sources: data.sources ?? [] });
      } else {
        setState({ k: 'unavailable', message: data.message ?? 'Sky is unavailable right now.' });
      }
    } catch {
      window.clearTimeout(slowTimer.current);
      setState({ k: 'unavailable', message: 'Sky could not be reached. Your connection may be offline.' });
    }
  }

  const card: React.CSSProperties = {
    position: 'fixed', right: 'var(--sp-4)', bottom: 'var(--sp-4)', zIndex: 40,
    width: 'min(396px, calc(100vw - var(--sp-8)))',
    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-l)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    display: 'flex', flexDirection: 'column', maxHeight: 'min(70vh, 640px)',
  };

  if (!open) {
    return (
      <button
        className="btn"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        style={{ position: 'fixed', right: 'var(--sp-4)', bottom: 'var(--sp-4)', zIndex: 40, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}
      >
        Ask Sky
      </button>
    );
  }

  return (
    <div ref={panelRef} style={card} role="dialog" aria-label="Sky, the site assistant" aria-modal="false">
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)',
        borderBottom: '1px solid var(--c-border)',
      }}>
        <span>
          <strong>Sky</strong>
          <span style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}> · reading Lrnon only</span>
        </span>
        <button className="btn btn--ghost" onClick={close} aria-label="Close Sky"
          style={{ minHeight: 36, minWidth: 36, padding: '0 var(--sp-3)' }}>✕</button>
      </header>

      <div style={{ padding: 'var(--sp-4)', overflowY: 'auto', flex: 1 }} aria-live="polite">
        {state.k === 'idle' && (
          <>
            <p style={{ marginTop: 0, color: 'var(--c-ink-soft)' }}>{intro}</p>
            <p style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)', margin: '0 0 var(--sp-2)' }}>Try one</p>
            <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              {suggestions.map((s) => (
                <button key={s} className="btn btn--ghost" onClick={() => ask(s)}
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}>{s}</button>
              ))}
            </div>
          </>
        )}

        {(state.k === 'working' || state.k === 'slow') && (
          <p style={{ color: 'var(--c-ink-soft)' }}>
            {state.k === 'working' ? 'Reading Lrnon…' : 'Taking longer than usual. Still working — you can keep reading.'}
          </p>
        )}

        {state.k === 'answer' && (
          <>
            <p style={{ marginTop: 0 }}>{state.text}</p>
            {state.sources.length > 0 && (
              <>
                <p style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)', marginBottom: 'var(--sp-2)' }}>Read from</p>
                <ul style={{ margin: 0, paddingInlineStart: 'var(--sp-6)' }}>
                  {state.sources.map((s) => <li key={s.href}><a href={s.href}>{s.label}</a></li>)}
                </ul>
              </>
            )}
          </>
        )}

        {state.k === 'out_of_scope' && (
          <div className="note note--try">
            <p style={{ marginTop: 0, fontWeight: 600 }}>{state.title}</p>
            <p style={{ color: 'var(--c-ink-soft)' }}>{state.message}</p>
            <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              {state.handoff.map((h) => (
                <a key={h.href} className="btn btn--ghost" href={h.href}>{h.label}</a>
              ))}
            </div>
            <p style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)', marginBottom: 0 }}>
              Handing off copies only this question, not the rest of your chat.
            </p>
          </div>
        )}

        {state.k === 'unavailable' && (
          <div className="note note--aim">
            <p style={{ marginTop: 0 }}>{state.message}</p>
            <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              <a className="btn btn--ghost" href="/roadmap">Browse the roadmap</a>
              <a className="btn btn--ghost" href="/feedback">Ask a person</a>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(q); }}
        style={{ display: 'flex', gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)' }}
      >
        <label htmlFor="sky-q" style={{ position: 'absolute', left: -9999 }}>Ask about this page</label>
        <input
          id="sky-q" ref={inputRef} value={q} onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="Ask about this page…" maxLength={500}
          style={{
            flex: 1, minHeight: 44, padding: 'var(--sp-2) var(--sp-3)', font: 'inherit',
            border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)',
            background: 'var(--c-bg)', color: 'var(--c-ink)',
          }}
        />
        <button className="btn" type="submit" disabled={!q.trim()} aria-label="Send question">↑</button>
      </form>

      <p style={{ margin: 0, padding: '0 var(--sp-4) var(--sp-3)', fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' }}>
        {disclaimer}
      </p>
    </div>
  );
}
