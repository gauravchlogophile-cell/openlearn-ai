import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** /admin/analytics — what is being read and learned, in counts.
 *
 *  Two kinds of number, kept visibly apart because they come from different
 *  places and mean different things:
 *
 *   READERS   anonymous page counts (see /api/hit). No person can be found in them
 *             and none is claimed: they say how many pages were opened, on what
 *             kind of device, from which country, via which share link.
 *   LEARNERS  counts drawn from accounts and progress that already exist: signups,
 *             sign-ins, who was active, what was finished. These are per account,
 *             shown here only in total. A person's own record is in the user
 *             portal, behind a role.
 *
 *  Every chart has its numbers beside it in a table, and none is colour alone.
 */
type Pt = { day: string; n: number };
type Data = Record<string, any>;

function Bars({ data, label, color = 'var(--c-primary)' }: { data: Pt[]; label: string; color?: string }) {
  if (!data?.length) return <p style={{ color: 'var(--c-ink-soft)', margin: 0 }}>Nothing recorded in this period.</p>;
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <figure style={{ margin: 0 }}>
      <div role="img" aria-label={`${label}: ${data.map((d) => `${d.day} ${d.n}`).join(', ')}`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
        {data.map((d) => <div key={d.day} title={`${d.day}: ${d.n}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(3, (d.n / max) * 100)}%`, background: color, borderRadius: '2px 2px 0 0' }} />)}
      </div>
      <details><summary style={{ cursor: 'pointer', fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Numbers</summary>
        <table style={{ fontSize: 'var(--fs-100)', borderCollapse: 'collapse' }}>
          <tbody>{data.map((d) => <tr key={d.day}><td style={{ paddingRight: 'var(--sp-4)' }}>{d.day}</td><td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.n}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

function Stat({ k, v, hint }: { k: string; v: number | string; hint?: string }) {
  return (
    <div className="card">
      <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>{k}</p>
      <p style={{ margin: 'var(--sp-1) 0', fontSize: 'var(--fs-500)', fontFamily: 'var(--font-display)' }}>{v}</p>
      {hint && <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>{hint}</p>}
    </div>
  );
}

function Ranked({ rows, a, b }: { rows: any[]; a: string; b: string }) {
  if (!rows?.length) return <p style={{ color: 'var(--c-ink-soft)', margin: 0 }}>Nothing recorded in this period.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-100)' }}>
      <tbody>{rows.map((r) => (
        <tr key={r[a]} style={{ borderTop: '1px solid var(--c-border)' }}>
          <td style={{ padding: 'var(--sp-2) 0', wordBreak: 'break-all' }}>{r[a] || '(direct)'}</td>
          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r[b]}</td>
        </tr>))}</tbody>
    </table>
  );
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setD(null); setErr('');
    supabase().rpc('admin_analytics', { p_days: days }).then(({ data, error }) => {
      if (error) setErr(error.message); else setD(data as Data);
    });
  }, [days]);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div role="group" aria-label="Period" style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        {[7, 30, 90, 365].map((n) => (
          <button key={n} type="button" className={n === days ? 'btn' : 'btn btn--ghost'} aria-pressed={n === days} onClick={() => setDays(n)}>{n === 365 ? 'A year' : `${n} days`}</button>
        ))}
      </div>
      {err && <p className="note note--try" role="alert">{err}</p>}
      {!d && !err && <p role="status" style={{ color: 'var(--c-ink-soft)' }}>Loading…</p>}

      {d && (<>
        <section aria-label="Readers">
          <h2 style={{ fontSize: 'var(--fs-400)' }}>Readers <span style={{ fontSize: 'var(--fs-100)', fontWeight: 400, color: 'var(--c-ink-soft)' }}>anonymous page counts</span></h2>
          <p style={{ color: 'var(--c-ink-soft)' }}>
            One count each time a page is opened. No visitor, session or address is recorded, so these cannot say how many
            different people there were, only how many pages were read. Browsers that send Do Not Track are not counted.
          </p>
          <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <Stat k="Pages opened" v={d.views_total} hint={`in the last ${d.days} days`} />
          </div>
          <h3 style={{ fontSize: 'var(--fs-300)' }}>Pages opened per day</h3>
          <Bars data={d.views_by_day} label="Pages opened per day" />
          <div style={{ display: 'grid', gap: 'var(--sp-6)', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 'var(--sp-4)' }}>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Most read</h3><Ranked rows={d.top_pages} a="path" b="n" /></div>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Devices</h3><Ranked rows={d.devices} a="device" b="n" /></div>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Countries</h3><Ranked rows={d.countries} a="country" b="n" /></div>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Arrivals by share link</h3><Ranked rows={d.arrivals_by_share_channel} a="via" b="n" /></div>
          </div>
        </section>

        <section aria-label="Learners">
          <h2 style={{ fontSize: 'var(--fs-400)' }}>Learners <span style={{ fontSize: 'var(--fs-100)', fontWeight: 400, color: 'var(--c-ink-soft)' }}>from accounts and progress</span></h2>
          <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <Stat k="Accounts" v={d.accounts_total} />
            <Stat k="Active, last 7 days" v={d.active_7d} hint={`${d.returning_7d} signed up over a week ago`} />
            <Stat k="Active, last 30 days" v={d.active_30d} />
            <Stat k="Lessons finished" v={d.lessons_completed} hint={`in ${d.days} days`} />
            <Stat k="Module quizzes passed" v={d.quiz_passes} />
            <Stat k="Review sessions" v={d.review_sessions} />
            <Stat k="Sky quick quizzes" v={d.quick_quizzes} />
            <Stat k="On the board" v={d.board_opt_ins} hint="opted in" />
          </div>
          <div style={{ display: 'grid', gap: 'var(--sp-6)', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 'var(--sp-4)' }}>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>New accounts per day</h3><Bars data={d.signups_by_day} label="New accounts per day" color="var(--c-progress)" /></div>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Sign-ins per day</h3><Bars data={d.signins_by_day} label="Sign-ins per day" color="var(--c-reward)" /></div>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Learners active per day</h3><Bars data={d.active_by_day} label="Learners active per day" /></div>
            <div><h3 style={{ fontSize: 'var(--fs-300)' }}>Lessons finished per day</h3><Bars data={d.lessons_by_day} label="Lessons finished per day" color="var(--c-progress)" /></div>
          </div>
          <h3 style={{ fontSize: 'var(--fs-300)' }}>Most finished lessons</h3>
          <Ranked rows={d.lessons_top} a="lesson" b="n" />
        </section>

        <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          Sign-ins start being recorded from the day this was switched on, so earlier days read as empty.
          Nothing on this page can identify a reader, and the learner figures are totals.
        </p>
      </>)}
    </div>
  );
}
