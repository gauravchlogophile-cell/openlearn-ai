import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SKY_MODE } from '../lib/sky-config';

/** /admin/sky — the master switch, the staged rollout and the kill switch.
 *
 *  The gates below are the design's, and they are shown as unmet because they
 *  are unmet: Sky has never been enabled, so nothing has been reviewed. A
 *  rollout console that flatters itself is worse than none — the point of
 *  printing the gates is that "Everyone" stays unreachable until they are
 *  genuinely green.
 */

type LogRow = { id: number; at: string; mode: string; reason: string | null; kill_switch: boolean };

const MODES = [
  { id: 'off', label: 'Off', blurb: 'Dock button hidden; the route returns 503.' },
  { id: 'staff', label: 'Staff & volunteers', blurb: 'People with an admin or sub-admin role.' },
  { id: 'slice', label: 'A slice of learners', blurb: 'Sticky per account, so nobody flickers in and out.' },
  { id: 'everyone', label: 'Everyone', blurb: 'Needs a second owner to approve.' },
];

const GATES = [
  { met: false, label: '200 staff questions reviewed by hand', value: '0' },
  { met: true,  label: 'No answer without a source', value: 'enforced in code' },
  { met: false, label: 'Wrong-answer rate under 2%', value: 'not measured' },
  { met: false, label: 'Refusal wording signed off by a teacher', value: 'pending' },
];

export default function AdminSky() {
  const [log, setLog] = useState<LogRow[]>([]);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase()
      .from('sky_rollout_log').select('*').order('at', { ascending: false }).limit(20);
    if (error) { setMsg('Could not load the log: ' + error.message); return; }
    setLog(data ?? []);
  }
  useEffect(() => { void load(); }, []);

  /* Success used to be silent: msg was set to '' and the only visible change
     was the "current" marker moving. Pressing the kill switch while Sky was
     already off therefore produced NO feedback of any kind, which reads as a
     dead button — and the rollout log shows exactly that, three presses inside
     three seconds. The RPC had worked all three times.

     So every outcome now says something, and the log is stamped so the row
     that proves it can be pointed at. */
  async function setMode(mode: string, kill = false) {
    setBusy(true); setMsg(''); setOk('');
    const { error } = await supabase().rpc('set_sky_mode', {
      p_mode: mode, p_reason: kill ? 'kill switch' : null, p_kill: kill,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    const label = MODES.find((m) => m.id === mode)?.label ?? mode;
    setOk(kill
      ? 'Kill switch recorded. Sky is off, and the change is in the log below.'
      : `Recorded: ${label}. The change is in the log below.`
        + (mode !== 'off' ? ' Sky still will not reach anyone while the hard'
            + ' switch in sky-config.ts is off — see the note above.' : ''));
    await load();
  }

  const allGatesGreen = GATES.every((g) => g.met);
  const current = log[0]?.mode ?? 'off';

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
      {msg && <p className="note note--try" role="status">{msg}</p>}
      {ok && <p className="note note--ok" role="status">{ok}</p>}

      <section aria-label="Current state">
        <div className="note note--aim">
          <p style={{ marginTop: 0 }}>
            <strong>
              In effect right now: {SKY_MODE === 'off'
                ? 'Off — nobody can reach Sky'
                : MODES.find((m) => m.id === SKY_MODE)?.label ?? SKY_MODE}
            </strong>
          </p>
          <p style={{ margin: 'var(--sp-1) 0 var(--sp-2)', color: 'var(--c-ink-soft)' }}>
            Set on this console: <strong>{MODES.find((m) => m.id === current)?.label ?? current}</strong>
            {SKY_MODE === 'off' && current !== 'off' && (
              <> — recorded, but not in effect. The two are allowed to disagree,
              and this shows you both: a console reporting the database value as
              the live state would be telling you Sky is on when no learner can
              reach it.</>
            )}
          </p>
          <p style={{ marginBottom: 0, color: 'var(--c-ink-soft)' }}>
            The build also ships a hard <code>SKY_MODE</code> in <code>src/lib/sky-config.ts</code>.
            While that is <code>'off'</code> the dock button is not rendered at all and{' '}
            <code>/api/sky</code> returns 503 regardless of what is set here — so this console
            cannot switch Sky on by itself. That belt-and-braces is deliberate.
          </p>
        </div>
      </section>

      <section aria-label="Who sees Sky">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Who sees Sky</h2>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {MODES.map((m) => {
            const locked = m.id === 'everyone' && !allGatesGreen;
            return (
              <div key={m.id} className="card" style={{ opacity: locked ? 0.6 : 1 }}>
                <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontFamily: 'var(--font-display)' }}>{m.label}</strong>
                  {current === m.id && <span style={{ color: 'var(--c-progress)', fontSize: 'var(--fs-100)' }}>current</span>}
                  <button
                    className="btn btn--ghost" disabled={busy || locked || current === m.id}
                    style={{ marginInlineStart: 'auto' }}
                    onClick={() => setMode(m.id)}
                  >
                    {locked ? 'Locked' : 'Set'}
                  </button>
                </div>
                <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-soft)' }}>{m.blurb}</p>
                {locked && (
                  <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-alert)', fontSize: 'var(--fs-100)' }}>
                    Stays disabled until every gate below is green. Sky reaching learners is a
                    decision, not a default.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Kill switch">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Kill switch</h2>
        <p style={{ color: 'var(--c-ink-soft)' }}>
          One click, no approval needed. Widening Sky needs an owner; turning it off needs
          nobody — a kill switch that requires sign-off is not a kill switch.
        </p>
        <button className="btn" disabled={busy}
          style={{ background: 'var(--c-alert)' }}
          onClick={() => setMode('off', true)}>
          Turn Sky off now
        </button>
      </section>

      <section aria-label="Gates before the next stage">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Gates before the next stage</h2>
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-2)' }}>
          {GATES.map((g) => (
            <li key={g.label} className="card" style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline' }}>
              <span aria-hidden="true" style={{ color: g.met ? 'var(--c-progress)' : 'var(--c-ink-faint)' }}>
                {g.met ? '✓' : '○'}
              </span>
              <span>{g.label}</span>
              <span style={{ marginInlineStart: 'auto', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
                {g.value}{g.met ? '' : ' · not met'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Change log">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Change log</h2>
        <p style={{ color: 'var(--c-ink-soft)' }}>Every flip, with who and why. Not editable by anyone.</p>
        {log.length === 0 ? (
          <p style={{ color: 'var(--c-ink-faint)' }}>Sky has never been switched on, so there is nothing logged.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-2)' }}>
            {log.map((r) => (
              <li key={r.id} className="card" style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                <time dateTime={r.at} style={{ color: 'var(--c-ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}
                </time>
                <strong>{r.mode}</strong>
                {r.kill_switch && <span style={{ color: 'var(--c-alert)' }}>kill switch</span>}
                {r.reason && <span style={{ color: 'var(--c-ink-soft)' }}>{r.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
