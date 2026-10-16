import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** /admin/users — the user management portal.
 *
 *  Three views over the same people:
 *
 *   USERS      everyone with an account: handle, when they joined and last signed
 *              in, role, level, lessons, recent activity. Click one for the whole
 *              picture: sign-in history, progress, roles, and everything an admin
 *              has ever done to or as them.
 *   SIGN-INS   the latest sign-ins across all users.
 *   ACTIVITY   the audit log: who did what, to whom, why. Append-only; nobody can
 *              edit it, an owner included.
 *
 *  What is held back, deliberately. Email addresses are an owner's to see: an admin
 *  who runs a surface has a reason to know a learner by handle and by how they are
 *  doing, and none to read their address. Progress is shown as counts, never as
 *  anything a learner wrote. Deleting an account is not here; it goes through the
 *  decisions queue so a second owner must agree. Every action below is recorded
 *  with the person who took it.
 */
type User = {
  user_id: string; handle: string; email: string | null; created_at: string; last_sign_in_at: string | null; provider: string | null;
  roles: string[]; xp: number; level: number; lessons: number; last_active: string | null; logins_30d: number; board_opt_in: boolean; suspended: boolean;
};
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const ago = (s?: string | null) => {
  if (!s) return 'never';
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const field: React.CSSProperties = { minHeight: 44, padding: '0 var(--sp-3)', font: 'inherit', border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)', background: 'var(--c-surface)', color: 'var(--c-ink)' };

export default function AdminUsers() {
  const [tab, setTab] = useState<'users' | 'signins' | 'activity'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [owner, setOwner] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [signins, setSignins] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const PAGE = 25;

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase().rpc('admin_users', { p_search: q || null, p_limit: PAGE, p_offset: page * PAGE });
    if (error) { setErr(error.message); return; }
    setErr(''); setUsers((data as User[]) ?? []);
  }, [q, page]);

  useEffect(() => { supabase().rpc('is_owner').then(({ data }) => setOwner(Boolean(data))); }, []);
  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);
  useEffect(() => {
    if (tab === 'signins') supabase().from('login_events').select('at,provider,device,profiles(handle)').order('at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (error) setErr(error.message); else setSignins(data ?? []); });
    if (tab === 'activity') supabase().rpc('admin_activity', { p_limit: 150 })
      .then(({ data, error }) => { if (error) setErr(error.message); else setActivity((data as any[]) ?? []); });
  }, [tab]);

  async function openUser(id: string) {
    setOpen(id); setDetail(null); setOk(''); setReason('');
    const { data, error } = await supabase().rpc('admin_user_detail', { p_user: id });
    if (error) setErr(error.message); else setDetail(data);
  }

  async function act(action: 'suspend' | 'restore' | 'sign_out') {
    if (!open) return;
    setBusy(true); setErr(''); setOk('');
    try {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch('/api/admin-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ user: open, action, reason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.message ?? j.error ?? 'That did not work.'); return; }
      setOk(action === 'suspend' ? 'Suspended. They are signed out everywhere and cannot sign in.' : action === 'restore' ? 'Restored. They can sign in again.' : 'Signed out everywhere.');
      setReason('');
      await openUser(open); await loadUsers();
    } finally { setBusy(false); }
  }

  const tabBtn = (t: typeof tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'btn' : 'btn btn--ghost'} onClick={() => setTab(t)}>{label}</button>
  );
  const th: React.CSSProperties = { textAlign: 'left', padding: 'var(--sp-2) var(--sp-3)', fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)', borderBottom: '1px solid var(--c-border)' };
  const td: React.CSSProperties = { padding: 'var(--sp-2) var(--sp-3)', borderTop: '1px solid var(--c-border)', verticalAlign: 'top' };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <div role="tablist" aria-label="User management" style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        {tabBtn('users', 'Users')}{tabBtn('signins', 'Sign-ins')}{tabBtn('activity', 'Activity log')}
      </div>
      {err && <p className="note note--try" role="alert">{err}</p>}
      {ok && <p className="note note--ok" role="status">{ok}</p>}

      {tab === 'users' && (<>
        <form onSubmit={(e) => { e.preventDefault(); setPage(0); loadUsers(); }} style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <label htmlFor="usr-q" className="sr-only">Search</label>
          <input id="usr-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={owner ? 'Search by handle or email' : 'Search by handle'} style={{ ...field, flex: '1 1 240px' }} />
          <button className="btn" type="submit">Search</button>
        </form>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '46rem' }}>
            <thead><tr>{['Learner', owner ? 'Email' : null, 'Joined', 'Last sign-in', 'Level', 'Lessons', 'Last active', 'Status'].filter(Boolean).map((h) => <th key={h as string} scope="col" style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} style={open === u.user_id ? { background: 'var(--c-surface-2)' } : undefined}>
                  <td style={td}><button type="button" className="btn btn--ghost" style={{ minHeight: 36, padding: '0 var(--sp-3)' }} onClick={() => openUser(u.user_id)} aria-label={`Open ${u.handle}`}><span translate="no">{u.handle}</span></button></td>
                  {owner && <td style={td}>{u.email ?? '—'}</td>}
                  <td style={td}>{ago(u.created_at)}</td>
                  <td style={td}>{ago(u.last_sign_in_at)}</td>
                  <td style={td}>{u.level}</td>
                  <td style={td}>{u.lessons}</td>
                  <td style={td}>{ago(u.last_active)}</td>
                  <td style={td}>{u.suspended ? <strong>Suspended</strong> : u.roles.length ? u.roles.join(', ') : 'Learner'}</td>
                </tr>
              ))}
              {users.length === 0 && <tr><td style={td} colSpan={owner ? 8 : 7}>No one matches.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button type="button" className="btn btn--ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</button>
          <button type="button" className="btn btn--ghost" disabled={users.length < PAGE} onClick={() => setPage((p) => p + 1)}>Older</button>
        </div>

        {open && (
          <section className="card" aria-label="Learner record">
            {!detail ? <p role="status">Loading…</p> : (<>
              <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}><span translate="no">{detail.profile?.handle}</span>{detail.profile?.suspended && <span> · suspended</span>}</h2>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--sp-1) var(--sp-4)' }}>
                <dt>Joined</dt><dd>{fmt(detail.profile?.created_at)}</dd>
                <dt>Last sign-in</dt><dd>{fmt(detail.profile?.last_sign_in_at)} via {detail.profile?.provider ?? 'unknown'}</dd>
                {owner && <><dt>Email</dt><dd>{detail.profile?.email ?? '—'}</dd></>}
                <dt>Time zone</dt><dd>{detail.profile?.timezone} · {detail.profile?.locale} · {detail.profile?.goal_mode} goal</dd>
                <dt>Board</dt><dd>{detail.profile?.board_opt_in ? 'Opted in' : 'Not on the board'}</dd>
                <dt>Roles</dt><dd>{detail.roles?.length ? detail.roles.map((r: any) => r.role + (r.function ? ` (${r.function})` : '')).join(', ') : 'Learner'}</dd>
              </dl>

              <h3 style={{ fontSize: 'var(--fs-300)' }}>Progress</h3>
              <p style={{ margin: 0 }}>Level {detail.progress?.level} · {detail.progress?.xp} points · {detail.progress?.lessons} lessons · {detail.progress?.quiz_passes} module quizzes · {detail.progress?.review_sessions} review sessions · {detail.progress?.streak}-day streak</p>
              <details><summary style={{ cursor: 'pointer' }}>Latest 20 events</summary>
                <ul>{(detail.progress?.recent ?? []).map((e: any, i: number) => <li key={i}>{fmt(e.at)} · {e.reason} · {e.amount > 0 ? '+' : ''}{e.amount} · {e.ref}</li>)}</ul>
              </details>

              <h3 style={{ fontSize: 'var(--fs-300)' }}>Sign-ins</h3>
              {(detail.signins ?? []).length === 0 ? <p style={{ color: 'var(--c-ink-soft)' }}>None recorded yet. Sign-ins are recorded from the day this was switched on.</p> : (
                <ul>{detail.signins.map((s: any, i: number) => <li key={i}>{fmt(s.at)} · {s.provider ?? 'unknown'} · {s.device}</li>)}</ul>)}

              <h3 style={{ fontSize: 'var(--fs-300)' }}>What admins have done to this account</h3>
              {(detail.actions_about ?? []).length === 0 ? <p style={{ color: 'var(--c-ink-soft)' }}>Nothing.</p> : (
                <ul>{detail.actions_about.map((a: any, i: number) => <li key={i}>{fmt(a.at)} · {a.action}{a.reason ? ` · “${a.reason}”` : ''}</li>)}</ul>)}
              {(detail.actions_by ?? []).length > 0 && (<>
                <h3 style={{ fontSize: 'var(--fs-300)' }}>What this person has done as an admin</h3>
                <ul>{detail.actions_by.map((a: any, i: number) => <li key={i}>{fmt(a.at)} · {a.action}{a.reason ? ` · “${a.reason}”` : ''}</li>)}</ul>
              </>)}

              <h3 style={{ fontSize: 'var(--fs-300)' }}>Actions</h3>
              <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Each one is recorded with your name. An owner cannot be suspended here, an admin only by an owner, and deleting an account goes through the <a href="/admin/decisions">decisions queue</a>.</p>
              <label htmlFor="usr-why" style={{ fontWeight: 600 }}>Reason (required to suspend)</label>
              <input id="usr-why" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, width: '100%', marginBottom: 'var(--sp-3)' }} maxLength={300} />
              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                {!detail.profile?.suspended
                  ? <button type="button" className="btn" disabled={busy || reason.trim().length < 5} onClick={() => act('suspend')}>Suspend</button>
                  : <button type="button" className="btn" disabled={busy} onClick={() => act('restore')}>Restore</button>}
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act('sign_out')}>Sign out everywhere</button>
              </div>
            </>)}
          </section>
        )}
      </>)}

      {tab === 'signins' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['When', 'Learner', 'Provider', 'Device'].map((h) => <th key={h} scope="col" style={th}>{h}</th>)}</tr></thead>
            <tbody>{signins.map((s, i) => (
              <tr key={i}><td style={td}>{fmt(s.at)}</td><td style={td}><span translate="no">{s.profiles?.handle ?? '—'}</span></td><td style={td}>{s.provider ?? 'unknown'}</td><td style={td}>{s.device}</td></tr>))}
              {signins.length === 0 && <tr><td style={td} colSpan={4}>No sign-ins recorded yet.</td></tr>}</tbody>
          </table>
          <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>When, provider and kind of device. No address and no browser string is stored. Kept 24 months.</p>
        </div>
      )}

      {tab === 'activity' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '40rem' }}>
            <thead><tr>{['When', 'Who', 'Did', 'To', 'Why / detail'].map((h) => <th key={h} scope="col" style={th}>{h}</th>)}</tr></thead>
            <tbody>{activity.map((a, i) => (
              <tr key={i}><td style={td}>{fmt(a.at)}</td><td style={td}><span translate="no">{a.actor_handle ?? 'system'}</span></td><td style={td}>{a.action}</td><td style={td}><span translate="no">{a.target_handle ?? '—'}</span></td>
                <td style={td}>{a.reason ?? ''} <code style={{ fontSize: 'var(--fs-100)' }}>{a.detail && Object.keys(a.detail).length ? JSON.stringify(a.detail) : ''}</code></td></tr>))}
              {activity.length === 0 && <tr><td style={td} colSpan={5}>Nothing yet.</td></tr>}</tbody>
          </table>
          <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Append-only. Nobody, an owner included, can edit or remove a row.</p>
        </div>
      )}
    </div>
  );
}
