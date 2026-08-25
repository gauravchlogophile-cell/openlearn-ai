import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** /admin overview. Every figure here is fetched at runtime under RLS; none of
 *  it is in the shipped HTML. */

type Counts = { goes_in: number; changes: number; stays: number; deletion: number };
const EMPTY: Counts = { goes_in: 0, changes: 0, stays: 0, deletion: 0 };

/* From turn 9a. These are stated on the page rather than only enforced in the
   database, because a delegate needs to know where their authority stops
   before they hit an error, not after. */
const RESERVED = [
  'Deleting content, accounts or data',
  'Granting or revoking Admin',
  'Turning Sky on for everyone',
  'Accepting funding or a partner',
  'Changing policies and privacy terms',
  "Anything touching a learner's identity",
];

export default function AdminOverview() {
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [owners, setOwners] = useState<{ id: string; handle: string | null; display_name: string | null }[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data: open, error } = await supabase()
        .from('decisions').select('kind').is('decided_at', null);
      if (error) { setErr(error.message); return; }
      const c = { ...EMPTY };
      for (const d of open ?? []) c[d.kind as keyof Counts]++;
      setCounts(c);

      // Owners are read through user_roles, so a non-owner admin sees only what
      // RLS lets them — the list degrades rather than erroring.
      const { data: rows } = await supabase()
        .from('user_roles').select('user_id, profiles(id, handle, display_name)')
        .eq('role', 'super_admin');
      setOwners((rows ?? []).map((r: any) => r.profiles).filter(Boolean));
    })().catch((e) => setErr(String(e)));
  }, []);

  const total = counts.goes_in + counts.changes + counts.stays + counts.deletion;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
      <section aria-label="Waiting on a decision">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>
          {total} decision{total === 1 ? '' : 's'} waiting on an owner
        </h2>
        {err && <p className="note note--try" role="status">Could not load the queue: {err}</p>}
        <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          {([
            ['Goes in', counts.goes_in, 'new lessons, partners'],
            ['Changes', counts.changes, 'edits pending review'],
            ['Stays', counts.stays, 'kept after review'],
            ['Deletions', counts.deletion, 'Super Admin only'],
          ] as const).map(([label, n, hint]) => (
            <div key={label} className="card">
              <p style={{ margin: 0, color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>{label}</p>
              <p style={{ margin: 'var(--sp-1) 0', fontSize: 'var(--fs-500)', fontFamily: 'var(--font-display)' }}>{n}</p>
              <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>{hint}</p>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 'var(--sp-4)' }}>
          <a className="btn" href="/admin/decisions">Open the queue</a>
        </p>
      </section>

      <section aria-label="Reserved to Super Admin">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Reserved to Super Admin</h2>
        <p style={{ color: 'var(--c-ink-soft)' }}>Cannot be delegated. Enforced in the database, not just here.</p>
        <ul style={{ paddingInlineStart: 'var(--sp-6)', display: 'grid', gap: 'var(--sp-2)' }}>
          {RESERVED.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section aria-label="Owner accounts">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Owner accounts</h2>
        {owners.length === 0 ? (
          <div className="note note--try">
            <p style={{ marginTop: 0 }}>
              <strong>No owner is set.</strong> Until one exists, no role can be granted and
              no deletion can be approved — every privileged function refuses.
            </p>
            <p style={{ marginBottom: 0, color: 'var(--c-ink-soft)' }}>
              Bootstrapping is deliberately a manual step, done once with the service role.
              See the note at the foot of <code>supabase/migrations/0004_admin_roles.sql</code>.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-2)' }}>
            {owners.map((o) => (
              <li key={o.id} className="card">
                <strong>{o.display_name ?? o.handle ?? o.id.slice(0, 8)}</strong>
                <span style={{ color: 'var(--c-ink-faint)' }}> · full control</span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          No shared logins. Adding another owner needs two existing owners — one proposes,
          a different one confirms.
        </p>
      </section>
    </div>
  );
}
