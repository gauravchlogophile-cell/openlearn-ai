import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** /admin/people — the four layers, who holds what, and the functions nobody
 *  holds yet.
 *
 *  The last part is the one that matters. "Others — not staffed" exists so
 *  that a job with no owner sits somewhere visible instead of being quietly
 *  assumed by whoever is nearest. An unstaffed safeguarding escalation is a
 *  fact worth seeing on a screen.
 */

const LAYERS = [
  { role: 'super_admin', name: 'Super Admin', blurb: 'Everything, including deletion, roles, money and policy. Can undo any decision below.' },
  { role: 'admin', name: 'Admin', blurb: 'Owns one surface end to end — publish, edit, moderate. Proposes deletions, never executes them.' },
  { role: 'sub_admin', name: 'Sub-admin', blurb: 'One specialist task, scoped and time-boxed. Access ends automatically when the task does.' },
];

/* Functions Lrnon will need but nobody holds today. Kept as data here rather
   than in the database because an unfilled role has nothing to store — it
   becomes a row the day someone takes it. */
const UNSTAFFED = [
  'Legal & compliance',
  'Grants & reporting to funders',
  'Safeguarding escalation on call',
  'School & district partnerships',
  'Security review & key rotation',
  'Print & offline distribution',
  'Volunteer training & onboarding',
  'Regional language leads',
  'Alumni & mentor network',
  'Press & public queries',
];

type Grant = {
  user_id: string; role: string; function: string | null;
  expires_at: string | null; granted_at: string;
  profiles?: { handle: string | null; display_name: string | null } | null;
};

export default function AdminPeople() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase()
        .from('user_roles')
        .select('user_id, role, function, expires_at, granted_at, profiles(handle, display_name)')
        .order('granted_at', { ascending: true });
      if (error) { setMsg('Could not load roles: ' + error.message); return; }
      setGrants((data ?? []) as any);
    })().catch((e) => setMsg(String(e)));
  }, []);

  const who = (g: Grant) =>
    g.profiles?.display_name ?? g.profiles?.handle ?? g.user_id.slice(0, 8);

  const expired = (g: Grant) => !!g.expires_at && new Date(g.expires_at) < new Date();

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
      {msg && <p className="note note--try" role="status">{msg}</p>}

      <section aria-label="The layers">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>The layers</h2>
        <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          {LAYERS.map((l, i) => {
            const held = grants.filter((g) => g.role === l.role && !expired(g));
            return (
              <div key={l.role} className="card">
                <p style={{ margin: 0, color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
                  Layer {i + 1} · {held.length} {held.length === 1 ? 'person' : 'people'}
                </p>
                <h3 style={{ fontSize: 'var(--fs-300)', margin: 'var(--sp-1) 0 var(--sp-2)' }}>{l.name}</h3>
                <p style={{ margin: 0, color: 'var(--c-ink-soft)' }}>{l.blurb}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Who holds what">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Who holds what</h2>
        {grants.length === 0 ? (
          <div className="note note--try">
            <p style={{ margin: 0 }}>
              No roles are granted. Every privileged function refuses until an owner exists —
              which is the safe state, not a broken one.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Person', 'Layer', 'Function', 'Deletes?', 'Ends'].map((h) => (
                    <th key={h} scope="col" style={{
                      textAlign: 'left', padding: 'var(--sp-3)', fontFamily: 'var(--font-body)',
                      borderBottom: '1px solid var(--c-border)', color: 'var(--c-ink-faint)',
                      fontSize: 'var(--fs-100)', textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.user_id + g.role} style={{ opacity: expired(g) ? 0.5 : 1 }}>
                    <td style={{ padding: 'var(--sp-3)' }}>{who(g)}</td>
                    <td style={{ padding: 'var(--sp-3)' }}>{g.role}</td>
                    <td style={{ padding: 'var(--sp-3)' }}>{g.function ?? '—'}</td>
                    <td style={{ padding: 'var(--sp-3)' }}>
                      {g.role === 'super_admin' ? 'Yes' : g.role === 'admin' ? 'Proposes' : 'No'}
                    </td>
                    <td style={{ padding: 'var(--sp-3)' }}>
                      {g.expires_at
                        ? <span style={{ color: expired(g) ? 'var(--c-alert)' : 'var(--c-ink-soft)' }}>
                            {new Date(g.expires_at).toISOString().slice(0, 10)}{expired(g) ? ' · expired' : ''}
                          </span>
                        : <span style={{ color: 'var(--c-ink-faint)' }}>no end date</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          Expired grants stop counting the moment they lapse — <code>has_role()</code> ignores
          them, so a time-boxed task really does end by itself.
        </p>
      </section>

      <section aria-label="Others, not staffed">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Others — not staffed yet</h2>
        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          Functions Lrnon will need but nobody holds today. They sit here visibly rather than
          being assumed by whoever is nearby. Each becomes an Admin or Sub-admin role the day
          it is filled — and until then it is owner-held by default.
        </p>
        <ul style={{
          listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-2)',
          gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
        }}>
          {UNSTAFFED.map((f) => (
            <li key={f} style={{
              padding: 'var(--sp-3)', border: '1px dashed var(--c-border-strong)',
              borderRadius: 'var(--r-s)', color: 'var(--c-ink-soft)',
            }}>○ {f}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
