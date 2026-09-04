import { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { SKY_MODE } from '../lib/sky-config';
import { leastPermissive } from '../lib/sky-audience.js';

/** /admin/sky — the master switch, the staged rollout and the kill switch.
 *
 *  The gates below are the design's, and they are shown as unmet because they
 *  are unmet: Sky has never been enabled, so nothing has been reviewed. A
 *  rollout console that flatters itself is worse than none — the point of
 *  printing the gates is that "Everyone" stays unreachable until they are
 *  genuinely green.
 */

type LogRow = { id: number; at: string; mode: string; reason: string | null; kill_switch: boolean };
type SpendRow = { day: string; calls: number; input_tokens: number; output_tokens: number; failures: number };

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
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [probe, setProbe] = useState<
    { configured: boolean; token: string; status: string; body: string } | null>(null);

  async function load() {
    const { data, error } = await supabase()
      .from('sky_rollout_log').select('*').order('at', { ascending: false }).limit(20);
    if (error) { setMsg('Could not load the log: ' + error.message); return; }
    setLog(data ?? []);

    /* The last seven days of real provider calls. A ceiling nobody can see is
       not much of a control, and this is where an unexpected bill becomes
       visible before it appears on an invoice.

       PGRST202 means migration 0013 has not been applied to this database yet,
       which is a different thing from an error and should not be shouted
       about — the table below simply stays empty. */
    const sp = await supabase().rpc('sky_spend_summary');
    if (!sp.error) setSpend((sp.data ?? []) as SpendRow[]);
    else if (sp.error.code !== 'PGRST202') {
      setMsg('Could not load spend: ' + sp.error.message);
    }
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
    /* Says what is actually in effect rather than assuming the ceiling is
       'off'. It said "Sky still will not reach anyone while the hard switch is
       off" regardless of what the hard switch was — true when written, false
       the moment the ceiling moved to staff, and the kind of sentence an
       operator reasonably believes. */
    const nowLive = leastPermissive(SKY_MODE, mode);
    setOk(kill
      ? 'Kill switch recorded. Sky is off for everyone, immediately.'
      : `Recorded: ${label}. In effect: `
        + `${MODES.find((m) => m.id === nowLive)?.label ?? nowLive}.`
        + (nowLive !== mode
            ? ` The deployed ceiling is ${MODES.find((m) => m.id === SKY_MODE)?.label ?? SKY_MODE},`
              + ' so it holds this narrower than you set it.'
            : ''));
    await load();
  }

  /** The whole client path, run for real, reported verbatim.
   *
   *  Deliberately does NOT reuse Sky.tsx's request code — this must be able to
   *  tell you that Sky.tsx is the broken part, which it cannot do if it shares
   *  the same lines. It builds the request from scratch, the way the browser
   *  would, and hides nothing that comes back. */
  async function selfTest() {
    setBusy(true); setMsg(''); setOk(''); setProbe(null);
    let token: string | null = null;
    let tokenNote = 'not configured';
    try {
      if (isConfigured) {
        const { data } = await supabase().auth.getSession();
        token = data.session?.access_token ?? null;
        tokenNote = token
          ? `present (${token.length} chars, expires ${
              data.session?.expires_at
                ? new Date(data.session.expires_at * 1000).toISOString().slice(0, 16).replace('T', ' ')
                : 'unknown'})`
          : 'NONE — the browser holds no session, so the route sees an anonymous request';
      }
    } catch (e) { tokenNote = 'lookup threw: ' + (e as Error).message; }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;

    let status = '(no response)';
    let body = '';
    try {
      const res = await fetch('/api/sky', {
        method: 'POST', headers,
        body: JSON.stringify({ q: 'what is a token', page: '/admin/sky' }),
      });
      status = String(res.status);
      const text = await res.text();
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { body = text; }
    } catch (e) {
      body = 'request failed: ' + (e as Error).message;
    }

    setProbe({ configured: isConfigured, token: tokenNote, status, body });
    setBusy(false);
  }

  const allGatesGreen = GATES.every((g) => g.met);
  const current = log[0]?.mode ?? 'off';
  /* What a visitor actually experiences: the stricter of the deployed ceiling
     and the recorded stage. The route computes it the same way, so this console
     cannot report a state the site is not in. */
  const effective = leastPermissive(SKY_MODE, current);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
      {msg && <p className="note note--try" role="status">{msg}</p>}
      {ok && <p className="note note--ok" role="status">{ok}</p>}

      <section aria-label="Current state">
        <div className="note note--aim">
          <p style={{ marginTop: 0 }}>
            <strong>
              In effect right now: {effective === 'off'
                ? 'Off — nobody can reach Sky'
                : MODES.find((m) => m.id === effective)?.label ?? effective}
            </strong>
          </p>
          <p style={{ margin: 'var(--sp-1) 0 var(--sp-2)', color: 'var(--c-ink-soft)' }}>
            Deployed ceiling <strong>{MODES.find((m) => m.id === SKY_MODE)?.label ?? SKY_MODE}</strong>
            {' · '}set on this console <strong>{MODES.find((m) => m.id === current)?.label ?? current}</strong>.
            {' '}The stricter of the two applies. The ceiling needs a deploy to
            raise; this console can always narrow, which is what makes the kill
            switch below worth having.
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

      {/* A button, because the equivalent needed a console paste and Chrome
          blocks those by default. Runs the real request from this browser with
          this session and shows everything that comes back — which is the one
          measurement nobody could take remotely. */}
      <section aria-label="Self-test">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Ask Sky a test question</h2>
        <p style={{ color: 'var(--c-ink-soft)' }}>
          Sends a real question through the real route with your session, and
          prints the raw answer. If Sky refuses, the reason it gives here is the
          actual reason — not a guess from the outside.
        </p>
        <button className="btn" disabled={busy} onClick={() => void selfTest()}>
          {busy ? 'Asking…' : 'Run the test'}
        </button>

        {probe && (
          <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
            <dl style={{
              margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr',
              gap: '4px var(--sp-4)', fontSize: 'var(--fs-200)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              <dt style={{ color: 'var(--c-ink-faint)' }}>database configured</dt>
              <dd style={{ margin: 0 }}>{String(probe.configured)}</dd>
              <dt style={{ color: 'var(--c-ink-faint)' }}>session token</dt>
              <dd style={{ margin: 0 }}>{probe.token}</dd>
              <dt style={{ color: 'var(--c-ink-faint)' }}>HTTP status</dt>
              <dd style={{ margin: 0 }}>{probe.status}</dd>
            </dl>
            <p style={{ margin: 'var(--sp-3) 0 var(--sp-1)', fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' }}>
              Raw response
            </p>
            <pre style={{
              margin: 0, padding: 'var(--sp-3)', overflowX: 'auto',
              background: 'var(--c-surface-2)', borderRadius: 'var(--r-m)',
              fontSize: 'var(--fs-100)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{probe.body}</pre>
          </div>
        )}
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

      <section aria-label="Spend">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>What Sky has cost</h2>
        <p style={{ color: 'var(--c-ink-soft)' }}>
          The daily ceiling is enforced in the database, not here — the check
          and the increment happen in one statement under a row lock, so a
          burst of requests cannot all pass it at once. A refused call never
          reaches the provider, which is the only moment refusing is free.
        </p>
        {spend.length === 0 ? (
          <p style={{ color: 'var(--c-ink-faint)' }}>
            No provider calls in the last seven days. Sky has never spent anything.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--c-border)' }}>
                  {['Day', 'Calls', 'In', 'Out', 'Failed'].map((h) => (
                    <th key={h} style={{ padding: 'var(--sp-2)', color: 'var(--c-ink-faint)',
                      fontSize: 'var(--fs-100)', textTransform: 'uppercase',
                      letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spend.map((r) => (
                  <tr key={r.day} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: 'var(--sp-2)' }}>{r.day}</td>
                    <td style={{ padding: 'var(--sp-2)', fontVariantNumeric: 'tabular-nums' }}>{r.calls}</td>
                    <td style={{ padding: 'var(--sp-2)', fontVariantNumeric: 'tabular-nums' }}>{r.input_tokens}</td>
                    <td style={{ padding: 'var(--sp-2)', fontVariantNumeric: 'tabular-nums' }}>{r.output_tokens}</td>
                    <td style={{ padding: 'var(--sp-2)', fontVariantNumeric: 'tabular-nums',
                      color: r.failures > 0 ? 'var(--c-alert)' : 'inherit' }}>{r.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
