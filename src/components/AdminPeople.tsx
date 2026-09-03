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

const lbl = { fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' } as const;
const fieldStyle = {
  padding: 'var(--sp-2) var(--sp-3)', border: '1px solid var(--c-border-strong)',
  borderRadius: '8px', background: 'var(--c-surface)', color: 'var(--c-ink)',
  font: 'inherit', width: '100%',
} as const;

export default function AdminPeople() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState(false);

  /* The grant form. This page was read-only until now, which meant the one
     thing a Super Admin most needs to do — hand a surface to someone — could
     only be done by opening a SQL console. The functions existed; nothing
     called them. */
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [fn, setFn] = useState('');
  const [days, setDays] = useState('90');

  async function load() {
    const { data, error } = await supabase()
      .from('user_roles')
      .select('user_id, role, function, expires_at, granted_at, profiles(handle, display_name)')
      .order('granted_at', { ascending: true });
    if (error) { setMsg('Could not load roles: ' + error.message); return; }
    setGrants((data ?? []) as any);
  }

  useEffect(() => {
    (async () => {
      const { data: isOwner } = await supabase().rpc('is_owner');
      setOwner(Boolean(isOwner));
      await load();
    })().catch((e) => setMsg(String(e)));
  }, []);

  /** Grant a role. Everything that could go wrong is reported rather than
   *  swallowed — the previous version of this page reported nothing because it
   *  did nothing. */
  async function grant() {
    setBusy(true); setMsg(''); setOk('');
    try {
      const { data: uid, error: lookupErr } = await supabase()
        .rpc('user_id_for_email', { p_email: email.trim().toLowerCase() });
      if (lookupErr) { setMsg('Lookup failed: ' + lookupErr.message); return; }
      if (!uid) {
        setMsg(`No account for ${email.trim()}. They must sign in to Lrnon once `
             + `before a role can be attached — a grant hangs off their profile, `
             + `which does not exist until they do.`);
        return;
      }
      const { error } = await supabase().rpc('grant_role', {
        p_user: uid,
        p_role: role,
        p_function: fn.trim() || null,
        p_expires: days.trim() ? new Date(Date.now() + Number(days) * 864e5).toISOString() : null,
        p_reason: `Granted from /admin/people.`,
      });
      if (error) { setMsg(error.message); return; }
      setOk(`${email.trim()} now holds ${role}${fn.trim() ? ' for ' + fn.trim() : ''}.`);
      setEmail(''); setFn('');
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(userId: string, r: string) {
    setBusy(true); setMsg(''); setOk('');
    const { error } = await supabase().rpc('revoke_role', {
      p_user: userId, p_role: r, p_reason: 'Revoked from /admin/people.',
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setOk(`Revoked ${r}.`);
    await load();
  }

  const who = (g: Grant) =>
    g.profiles?.display_name ?? g.profiles?.handle ?? g.user_id.slice(0, 8);

  const expired = (g: Grant) => !!g.expires_at && new Date(g.expires_at) < new Date();

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
      {msg && <p className="note note--try" role="status">{msg}</p>}
      {ok && <p className="note note--ok" role="status">{ok}</p>}

      {owner && (
        <section aria-label="Grant a role">
          <h2 style={{ fontSize: 'var(--fs-400)' }}>Hand a surface to someone</h2>
          <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
            They need a Lrnon account first — a grant hangs off their profile,
            which does not exist until they have signed in once. Naming the
            surface is required for Admin and Sub-admin: the model says a grant
            covers <em>one thing</em>, never "all admin", so that what someone
            may do is legible to them and to everyone else.
          </p>

          <div className="card" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'grid', gap: 'var(--sp-3)', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={lbl}>Their email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)}
                  type="email" placeholder="them@example.com" style={fieldStyle} />
              </label>

              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={lbl}>Layer</span>
                <select value={role} onChange={(e) => setRole(e.target.value)} style={fieldStyle}>
                  <option value="admin">Admin — owns one surface</option>
                  <option value="sub_admin">Sub-admin — one task, time-boxed</option>
                  <option value="reviewer">Reviewer — bands assessments</option>
                  <option value="moderator">Moderator</option>
                  <option value="editor">Editor</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={lbl}>
                  Surface it covers{role === 'admin' || role === 'sub_admin' ? ' (required)' : ''}
                </span>
                <input value={fn} onChange={(e) => setFn(e.target.value)}
                  placeholder="Website operations & correspondence" style={fieldStyle} />
              </label>

              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={lbl}>Ends after (days, blank = never)</span>
                <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" placeholder="90" style={fieldStyle} />
              </label>
            </div>

            <div>
              <button className="btn" disabled={busy || !email.includes('@')
                || ((role === 'admin' || role === 'sub_admin') && !fn.trim())}
                onClick={() => void grant()}>
                {busy ? 'Granting…' : 'Grant'}
              </button>
              <p style={{ ...lbl, marginTop: 'var(--sp-2)', marginBottom: 0 }}>
                Super Admin cannot be granted here. Adding an owner needs a
                proposal that a <em>different</em> owner confirms — a single
                owner must not be able to mint another.
              </p>
            </div>
          </div>
        </section>
      )}

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
                  {['Person', 'Layer', 'Function', 'Deletes?', 'Ends', ''].map((h) => (
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
                    <td style={{ padding: 'var(--sp-3)', textAlign: 'right' }}>
                      {/* Offered for every row including the last owner's.
                          revoke_role() refuses to remove the final super_admin,
                          so the guard lives where it cannot be bypassed and the
                          button does not need to second-guess it — the refusal
                          arrives as a message rather than a missing control. */}
                      {owner && (
                        <button className="btn btn--ghost" disabled={busy}
                          onClick={() => void revoke(g.user_id, g.role)}>
                          Revoke
                        </button>
                      )}
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
