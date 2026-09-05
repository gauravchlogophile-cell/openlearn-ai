import { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import { SKY_MODE } from '../lib/sky-config';
import { leastPermissive } from '../lib/sky-audience.js';

/** /admin/sky — the master switch, the staged rollout and the kill switch.
 *
 *  The gates are the design's, and three of the four are now COMPUTED from
 *  recorded review rather than asserted. They used to be a literal array with
 *  those three permanently false, which meant they could not become true: no
 *  amount of real review would have moved them. A gate that cannot change is a
 *  decoration on the page rather than a control on the decision — and since
 *  "Everyone" is locked behind all four, the lock was decorative too.
 *
 *  The remaining assertion is gate 2, and it says which tests cover it.
 *
 *  A rollout console that flatters itself is worse than none, which is also why
 *  an unreadable gate reads as unmet: if sky_gate_stats() cannot be reached,
 *  the gates show "not loaded" and stay locked.
 */

type LogRow = { id: number; at: string; mode: string; reason: string | null; kill_switch: boolean };
type SpendRow = { day: string; calls: number; input_tokens: number; output_tokens: number; failures: number };

const MODES = [
  { id: 'off', label: 'Off', blurb: 'Dock button hidden; the route returns 503.' },
  { id: 'staff', label: 'Staff & volunteers', blurb: 'People with an admin or sub-admin role.' },
  { id: 'slice', label: 'A slice of learners', blurb: 'Sticky per account, so nobody flickers in and out.' },
  { id: 'everyone', label: 'Everyone', blurb: 'Needs a second owner to approve.' },
];

type GateStats = {
  reviewed: number; wrong: number; refused_wrongly: number;
  wrong_rate: number | null; reviewers: number;
  first_review: string | null; last_review: string | null;
  refusal_signed_off: boolean; signed_off_at: string | null;
};

const REVIEWS_REQUIRED = 200;
const MAX_WRONG_RATE = 0.02;

/** The gates, computed from what has actually been recorded.
 *
 *  This was a hard-coded array with three of four permanently false. It could
 *  not become true: no amount of real review would have moved it, so the gate
 *  was a decoration on the page rather than a control on the decision it
 *  exists to govern — while "Everyone" stayed locked behind it, which made the
 *  lock decorative too.
 *
 *  Gate 2 is still asserted rather than measured, and says so. It is a property
 *  of the route (an uncited answer becomes the out-of-scope handoff) covered by
 *  tests in scripts/test-sky-provider.mjs, not something review data can show.
 *  Marking it green from a test rather than from a claim would need CI to write
 *  here, which is a bigger change than the gate is worth; naming its source is
 *  the honest middle.
 */
function gatesFrom(s: GateStats | null) {
  const rate = s?.wrong_rate;
  return [
    {
      met: (s?.reviewed ?? 0) >= REVIEWS_REQUIRED,
      label: `${REVIEWS_REQUIRED} staff questions reviewed by hand`,
      value: s ? `${s.reviewed} reviewed by ${s.reviewers}` : 'not loaded',
    },
    {
      met: true,
      label: 'No answer without a source',
      value: 'enforced in code, covered by tests',
    },
    {
      /* Null is not zero. An empty table yields no rate at all, and a rate of
         0% from no reviews would read as "nothing is wrong" when it means
         "nothing is known" — the confusion these gates exist to prevent. */
      met: rate != null && rate < MAX_WRONG_RATE,
      label: `Wrong-answer rate under ${(MAX_WRONG_RATE * 100).toFixed(0)}%`,
      value: rate == null
        ? 'no reviews yet, so no rate'
        : `${(rate * 100).toFixed(1)}% of ${s?.reviewed}`,
    },
    {
      met: s?.refusal_signed_off === true,
      label: 'Refusal wording signed off by a teacher',
      value: s?.signed_off_at
        ? `approved ${s.signed_off_at.slice(0, 10)}`
        : 'no approved decision ref sky:refusal-wording',
    },
  ];
}

type InjResult = {
  id: string; shape: string; verdict: string; problems: string[];
  expect: string; manualReview: boolean; answer: string;
};

/* The case IDs, listed here so the console can loop without first asking the
   Worker what exists. Kept in step with security/injection-corpus.json by a
   check in scripts/test-sky-injection.mjs — a list that silently drifts would
   quietly stop running some of the corpus. */
const INJECTION_CASES = [
  'override-01', 'override-02', 'override-03', 'authority-01',
  'authority-02', 'authority-03', 'editorial-01', 'editorial-02',
  'roleplay-01', 'roleplay-02', 'roleplay-03', 'encoding-01',
  'encoding-02', 'encoding-03', 'encoding-04', 'formatting-01',
  'formatting-02', 'exfiltration-01', 'exfiltration-02', 'exfiltration-03',
  'fence-01', 'fence-02', 'fence-03', 'scope-01',
  'scope-02', 'scope-03', 'scope-04',
];

const VERDICTS = [
  { id: 'good', label: 'Answered well' },
  { id: 'wrong', label: 'Wrong or misleading' },
  { id: 'refused_rightly', label: 'Refused, correctly' },
  { id: 'refused_wrongly', label: 'Refused, but should have answered' },
];

export default function AdminSky() {
  const [log, setLog] = useState<LogRow[]>([]);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [probe, setProbe] = useState<
    { configured: boolean; token: string; status: string; body: string } | null>(null);
  const [stats, setStats] = useState<GateStats | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [inj, setInj] = useState<InjResult[]>([]);

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

    /* The gates. Same PGRST202 tolerance for the same reason: a database
       without 0014 shows gates as "not loaded" rather than as met. Failing
       towards unmet matters here — an unreadable gate must never read as a
       passed one, because "Everyone" is locked behind all four. */
    const gs = await supabase().rpc('sky_gate_stats');
    if (!gs.error) setStats((Array.isArray(gs.data) ? gs.data[0] : gs.data) ?? null);
    else if (gs.error.code !== 'PGRST202') {
      setMsg('Could not load review stats: ' + gs.error.message);
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
  /* Deliberately shares selfTest's request code rather than duplicating it —
     but note selfTest itself still does NOT reuse Sky.tsx's, because a test
     that shares the code under test cannot catch a fault inside it. Here the
     code under test is the ROUTE, and both of these are callers. */
  async function ask(payload: Record<string, unknown>) {
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
        method: 'POST', headers, body: JSON.stringify(payload),
      });
      status = String(res.status);
      const text = await res.text();
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { body = text; }
    } catch (e) {
      body = 'request failed: ' + (e as Error).message;
    }
    return { configured: isConfigured, token: tokenNote, status, body };
  }

  /* Which models will this key actually accept?
     A 404 names the model that does not work and nothing that does, so without
     this the fix is guesswork against a list only the provider can see. */
  async function listModels() {
    setBusy(true); setMsg(''); setOk(''); setProbe(null);
    setProbe(await ask({ probe: 'models' }));
    setBusy(false);
  }

  async function selfTest() {
    setBusy(true); setMsg(''); setOk(''); setProbe(null);
    setProbe(await ask({ q: 'what is a token', page: '/admin/sky' }));
    setBusy(false);
  }

  /* Run the injection corpus, one case per request.
   *
   * The loop lives here rather than in the Worker because twenty-seven
   * sequential model calls in one invocation would sit close to the wall-clock
   * limit, and a probe that times out half way reports nothing about the half
   * it did run. Looping in the browser also means the count moves while it
   * works, which matters when the whole thing takes a minute.
   *
   * Only a case ID is sent. The payloads live in the corpus bundled into the
   * Worker, so no attack text travels from this browser. */
  async function runInjection() {
    setBusy(true); setMsg(''); setOk(''); setProbe(null); setInj([]);
    const out: InjResult[] = [];
    for (const id of INJECTION_CASES) {
      setMsg(`Running ${id} — ${out.length} of ${INJECTION_CASES.length} done`);
      const r = await ask({ probe: 'injection', case: id });
      let parsed: any = {};
      try { parsed = JSON.parse(r.body); } catch { /* keep the raw below */ }
      out.push({
        id,
        shape: parsed.shape ?? '?',
        verdict: parsed.verdict ?? (parsed.error ? `error: ${parsed.error}` : '?'),
        problems: parsed.problems ?? [],
        expect: parsed.expect ?? '',
        manualReview: parsed.manualReview === true,
        answer: parsed.answer ?? r.body,
      });
      setInj([...out]);
    }
    const failed = out.filter((r) => r.verdict === 'FAIL').length;
    const read = out.filter((r) => r.verdict === 'READ').length;
    setMsg('');
    setOk(`${out.length} cases run · ${failed} failed · ${read} need a human read. `
      + 'A pass means these cases did not work against this model today — not '
      + 'that Sky resists injection, and not a reason to widen the stage.');
    setBusy(false);
  }


  /* Record a verdict on the answer currently shown by the self-test.
   *
   *  The sources come from the response, so the review carries provenance —
   *  which is what turns "an answer was wrong" into "this passage caused it".
   *  The question is NOT taken from the response automatically; it is the
   *  reviewer's own, and P3·L8 is explicit that a record of what people asked
   *  an assistant is a second exposure. The self-test asks a fixed question, so
   *  recording it here says nothing about any learner. */
  async function review(verdict: string) {
    setBusy(true); setMsg(''); setOk('');
    let sources: string[] = [];
    try {
      const parsed = JSON.parse(probe?.body ?? '{}');
      sources = (parsed?.sources ?? [])
        .map((s: any) => String(s?.href ?? '')).filter(Boolean).slice(0, 8);
    } catch { /* an unparseable body still deserves a verdict */ }

    const { error } = await supabase().rpc('record_sky_review', {
      p_verdict: verdict,
      p_sources: sources,
      p_question: 'what is a token',
      p_note: reviewNote.trim() || null,
    });
    if (error) setMsg('Could not record the review: ' + error.message);
    else {
      setOk('Review recorded. The gates above are computed from these.');
      setReviewNote('');
      await load();
    }
    setBusy(false);
  }

  const GATES = gatesFrom(stats);
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
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={() => void selfTest()}>
            {busy ? 'Asking…' : 'Run the test'}
          </button>
          {/* Asks the provider which models this key accepts. A 404 names the
              model that does NOT work and nothing that does, which leaves
              correcting SKY_MODEL a guess against a list only the provider can
              see. Reserves no budget and requests no completion. */}
          <button className="btn btn--ghost" disabled={busy}
                  onClick={() => void listModels()}>
            {busy ? 'Asking…' : 'List available models'}
          </button>
          {/* The corpus, against the real model. Costs roughly 27 calls from
              the same daily cap learners use, which is why it is a deliberate
              press and not something that runs on a schedule from here. */}
          <button className="btn btn--ghost" disabled={busy}
                  onClick={() => void runInjection()}>
            {busy ? 'Running…' : `Run the injection corpus (${INJECTION_CASES.length})`}
          </button>
        </div>

        {inj.length > 0 && (
          <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
            <p style={{ margin: '0 0 var(--sp-2)', fontWeight: 600 }}>
              Injection corpus — {inj.length} of {INJECTION_CASES.length}
            </p>
            <p style={{ margin: '0 0 var(--sp-3)', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
              Each row is one attack shape sent through the real prompt assembly to the
              real model. <strong>pass</strong> means that attack did not work today —
              not that Sky resists injection, and not a reason to widen the stage.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-100)' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--c-ink-faint)' }}>
                    <th style={{ padding: '4px 8px' }}>Case</th>
                    <th style={{ padding: '4px 8px' }}>Shape</th>
                    <th style={{ padding: '4px 8px' }}>Result</th>
                    <th style={{ padding: '4px 8px' }}>What was wrong</th>
                  </tr>
                </thead>
                <tbody>
                  {inj.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace' }}>{r.id}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--c-ink-soft)' }}>{r.shape}</td>
                      <td style={{
                        padding: '4px 8px', fontWeight: 600,
                        color: r.verdict === 'FAIL' ? 'var(--c-alert)'
                             : r.verdict === 'pass' ? 'var(--c-progress)'
                             : 'var(--c-ink-soft)',
                      }}>{r.verdict}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--c-ink-soft)' }}>
                        {r.problems.length ? r.problems.join('; ')
                          : r.manualReview ? `read it yourself: ${r.expect}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

            {/* The review control sits here, attached to an answer you are
                looking at, because a verdict recorded away from the thing it
                judges is a verdict about a memory. The gates above count
                these. */}
            <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
              <p style={{ margin: '0 0 var(--sp-2)', fontWeight: 600 }}>Was that answer right?</p>
              <p style={{ margin: '0 0 var(--sp-3)', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
                Recorded against the sources shown above, so a wrong answer can be traced
                to the passage that caused it. Nothing here is visible to learners.
              </p>
              <label style={{ display: 'block', marginBottom: 'var(--sp-3)' }}>
                <span style={{ display: 'block', fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>
                  Note (optional)
                </span>
                <input
                  type="text" value={reviewNote} maxLength={2000}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="What was wrong with it, or what it got right"
                  style={{ width: '100%', maxWidth: '48ch', padding: 'var(--sp-2)' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                {VERDICTS.map((v) => (
                  <button key={v.id} className="btn btn--ghost" disabled={busy}
                    onClick={() => void review(v.id)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
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
