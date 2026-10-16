import { useEffect, useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { ROLE_INFO } from '../lib/volunteer-roles.js';

/** /admin/desk: what the person signed in holds, what it is for, and where to do it.
 *
 *  The page a volunteer lands on. It exists because a role that opened nothing
 *  looked, to the volunteer, exactly like a grant that had failed. Everything here
 *  is read from the database (what they hold, for what, until when) and from
 *  volunteer-roles.js (what each role is for). It grants nothing.
 */
type Held = { role: string; function: string | null; expires_at: string | null };
const REPO = 'https://github.com/gauravchlogophile-cell/openlearn-ai';
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { dateStyle: 'long' }) : 'no end date');

export default function AdminDesk() {
  const [held, setHeld] = useState<Held[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isConfigured) { setHeld([]); return; }
    (async () => {
      const { data, error } = await supabase().rpc('my_roles');
      if (error) { setErr(error.message); return; }
      setHeld((data as Held[]) ?? []);
    })().catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p className="note note--try" role="alert">{err}</p>;
  if (!held) return <p role="status" style={{ color: 'var(--c-ink-soft)' }}>Loading your desk…</p>;
  if (held.length === 0) return <p>You hold no role at the moment. If you expected one, ask the person who gave it: it may have ended.</p>;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <p className="prose" style={{ color: 'var(--c-ink-soft)', margin: 0 }}>
        Thank you for helping. Your role is active, and this page says what it covers. Everything you do here is
        recorded with your name, so that what happened is clear to you and to everyone else.
      </p>
      {held.map((h) => {
        const info = (ROLE_INFO as any)[h.role];
        if (!info) return null;
        return (
          <section key={h.role} className="card" aria-label={info.name}>
            <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>{info.name}</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--sp-1) var(--sp-4)', margin: '0 0 var(--sp-3)' }}>
              <dt>For</dt><dd style={{ margin: 0 }}>{h.function ?? 'the whole of it'}</dd>
              <dt>Ends</dt><dd style={{ margin: 0 }}>{fmt(h.expires_at)}</dd>
            </dl>
            <p style={{ margin: '0 0 var(--sp-3)' }}>{info.short}</p>
            <h3 style={{ fontSize: 'var(--fs-300)' }}>You can</h3>
            <ul>{info.can.map((c: string) => <li key={c}>{c}</li>)}</ul>
            <h3 style={{ fontSize: 'var(--fs-300)' }}>You cannot</h3>
            <ul>{info.cannot.map((c: string) => <li key={c}>{c}</li>)}</ul>
            <p className="note note--aim" style={{ marginBottom: 'var(--sp-3)' }}><strong>Today.</strong> {info.today}</p>
            <p style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', margin: 0 }}>
              {h.role === 'translator' && <a className="btn" href="/admin/translations">Open the translation desk</a>}
              {h.role === 'reviewer' && <a className="btn" href="/admin/certification">Open the review queue</a>}
              {h.role === 'editor' && <a className="btn" href={`${REPO}/issues`}>Open the freshness report</a>}
              <a className="btn btn--ghost" href="/safeguarding">Read the child safety policy first</a>
            </p>
          </section>
        );
      })}
    </div>
  );
}
