import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** /admin/decisions — the queue. Oldest first, because the design's rule is
 *  that nothing sits longer than seven days without a nudge, and sorting
 *  newest-first is how a queue quietly becomes a backlog. */

type Decision = {
  id: number; kind: string; title: string; detail: string | null;
  raised_at: string; decided_at: string | null; outcome: string | null;
};

const KINDS: Record<string, { label: string; tone: string }> = {
  goes_in:  { label: 'Goes in',  tone: 'var(--c-progress)' },
  changes:  { label: 'Changes',  tone: 'var(--c-primary)' },
  stays:    { label: 'Stays',    tone: 'var(--c-ink-soft)' },
  deletion: { label: 'Deletion', tone: 'var(--c-alert)' },
};

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function AdminDecisions() {
  const [rows, setRows] = useState<Decision[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const { data, error } = await supabase()
      .from('decisions').select('*').is('decided_at', null)
      .order('raised_at', { ascending: true });
    if (error) { setMsg('Could not load: ' + error.message); return; }
    setRows(data ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function decide(id: number, outcome: 'approved' | 'rejected' | 'deferred') {
    setBusy(id);
    // The database re-checks the caller's role. A non-owner pressing this on a
    // deletion gets an exception, not a deletion — the console cannot grant
    // itself authority it does not have.
    const { error } = await supabase().rpc('decide', { p_decision: id, p_outcome: outcome });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    setMsg('');
    await load();
  }

  const shown = filter === 'all' ? rows : rows.filter((r) => r.kind === filter);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
        {(['all', ...Object.keys(KINDS)]).map((k) => {
          const active = filter === k;
          const n = k === 'all' ? rows.length : rows.filter((r) => r.kind === k).length;
          return (
            <button key={k} className={active ? 'btn' : 'btn btn--ghost'} onClick={() => setFilter(k)}>
              {k === 'all' ? 'All' : KINDS[k].label} ({n})
            </button>
          );
        })}
      </div>

      {msg && <p className="note note--try" role="status">{msg}</p>}

      {shown.length === 0 ? (
        <div className="note note--ok">
          <p style={{ margin: 0 }}>Nothing waiting. An empty queue is the goal, not a bug.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-4)' }}>
          {shown.map((d) => {
            const age = daysSince(d.raised_at);
            const overdue = age >= 7;
            return (
              <li key={d.id} className="card">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, color: KINDS[d.kind]?.tone ?? 'var(--c-ink)' }}>
                    {KINDS[d.kind]?.label ?? d.kind}
                  </span>
                  <strong style={{ fontFamily: 'var(--font-display)' }}>{d.title}</strong>
                  <span style={{
                    marginInlineStart: 'auto', fontSize: 'var(--fs-100)',
                    color: overdue ? 'var(--c-alert)' : 'var(--c-ink-faint)',
                    fontWeight: overdue ? 600 : 400,
                  }}>
                    {age} day{age === 1 ? '' : 's'} waiting{overdue ? ' · overdue' : ''}
                  </span>
                </div>
                {d.detail && <p style={{ color: 'var(--c-ink-soft)', margin: 'var(--sp-2) 0' }}>{d.detail}</p>}
                {d.kind === 'deletion' && (
                  <p style={{ margin: 'var(--sp-2) 0', fontSize: 'var(--fs-100)', color: 'var(--c-alert)' }}>
                    Reserved to Super Admin. An Admin may propose this; only an owner may approve it.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: 'var(--sp-3)' }}>
                  <button className="btn" disabled={busy === d.id} onClick={() => decide(d.id, 'approved')}>Approve</button>
                  <button className="btn btn--ghost" disabled={busy === d.id} onClick={() => decide(d.id, 'rejected')}>Reject</button>
                  <button className="btn btn--ghost" disabled={busy === d.id} onClick={() => decide(d.id, 'deferred')}>Defer</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
