/** 10e · Public certificate verification.
 *
 *  Two steps, because the design is firm about why: "most Lrnon learners are
 *  children, and a code alone should not return a child's name to a stranger."
 *
 *  Step one returns status. Step two returns the name, and only to someone who
 *  can already read the initials off the holder's copy — which is what
 *  "checking this against a person in front of you" actually means.
 */
import { useRef, useState } from 'react';
import modulesData from '../../content/modules.json';
import { TIERS } from '../lib/certification';

type Status = {
  found: boolean;
  tier?: 'record' | 'certificate';
  module?: string;
  version?: number;
  issued_at?: string;
  state?: 'valid' | 'superseded' | 'revoked' | 'withdrawn';
  is_fixture?: boolean;
  reason?: string;
};

type Reveal = {
  revealed: boolean;
  display_name?: string;
  band?: string;
  method?: string;
  cooled?: boolean;
  message?: string;
};

const moduleName = (id?: string) =>
  modulesData.modules.find((m) => m.id === id)?.title ?? id ?? '';

/* 10e's four answers, each one a different thing to tell the person holding
   the printout. The wording matters more than the layout here: someone is
   deciding whether to trust a document. */
const STATE_COPY: Record<string, { heading: string; body: string; tone: string }> = {
  valid: {
    heading: 'This certificate is valid',
    body: '',
    tone: 'ok',
  },
  superseded: {
    heading: 'Valid — assessed on an earlier syllabus',
    body: 'Still a genuine certificate. The module has been revised since, so this was assessed against the version shown. The holder has been invited to re-sit free.',
    tone: 'aim',
  },
  revoked: {
    heading: 'This certificate was withdrawn',
    body: 'It should not be relied on. We publish the category of reason, never the detail.',
    tone: 'try',
  },
  withdrawn: {
    heading: 'Withdrawn at the holder’s request',
    body: 'The holder asked for this to be removed. We honour that without asking why, and it implies nothing about their work.',
    tone: 'aim',
  },
};

export default function VerifyCertificate() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [initials, setInitials] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* Guards a slow response being overtaken by a faster later one — the same
     request-id pattern the daily board needed. Here it would show one
     certificate's status under another's code, which on this page is worse
     than a stale render: someone would be told a document is valid on the
     strength of a different document.

     A ref, not state. State is captured at render, so a counter read from the
     closure is always the value from before the click and every response looks
     current — the guard would be there and do nothing. */
  const seq = useRef(0);

  async function post(payload: Record<string, string>, mine: number) {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return { stale: mine !== seq.current, res, body };
  }

  async function check() {
    const mine = ++seq.current;
    setBusy(true); setFailed(null); setReveal(null); setStatus(null);
    try {
      const { stale, body } = await post({ code }, mine);
      if (stale) return;
      if (body?.error) { setFailed(body.message ?? 'Verification is unavailable right now.'); return; }
      setStatus(body as Status);
    } catch {
      setFailed('Could not reach the verification service.');
    } finally {
      setBusy(false);
    }
  }

  async function doReveal() {
    const mine = ++seq.current;
    setBusy(true);
    try {
      const { stale, body } = await post({ code, initials }, mine);
      if (stale) return;
      setReveal(body as Reveal);
    } catch {
      setFailed('Could not reach the verification service.');
    } finally {
      setBusy(false);
    }
  }

  const label = { fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' } as const;
  const row = { display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)',
                padding: 'var(--sp-2) 0', borderBottom: '1px solid var(--c-border)' } as const;

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); check(); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px' }}>
          <label htmlFor="cert-code" style={label}>Certificate code</label>
          <input
            id="cert-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFG-HJK"
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%', padding: 'var(--sp-3)', fontSize: 'var(--fs-300)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: '1px solid var(--c-border-strong)', borderRadius: '8px',
              background: 'var(--c-surface)', color: 'var(--c-ink)',
            }}
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !code}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      <p style={{ ...label, marginTop: 'var(--sp-2)' }}>
        No account needed. Codes never contain 0, O, 1, I or L — if you are
        reading one off a photocopy, those are probably D, Q, 7, J or 4.
      </p>

      {failed && <div className="note note--try" style={{ marginTop: 'var(--sp-4)' }}>{failed}</div>}

      {/* ------------------------------------------------ no such code */}
      {status && !status.found && (
        <div className="note note--aim" style={{ marginTop: 'var(--sp-6)' }}>
          <strong>We have no record of this code.</strong>
          <p className="prose" style={{ margin: 'var(--sp-2) 0 0' }}>
            Check for a mistyped 0 and O, or ask the holder to resend the link.
            We do not say whether a code ever existed.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ status, no name */}
      {status?.found && (
        <div className="card" style={{ marginTop: 'var(--sp-6)' }}>
          {/* Loudest thing on the card, and above the verdict rather than
              below it. Fixtures live in the same database as real credentials,
              so a seeded certificate that verified identically to a genuine one
              would be a forgery we manufactured ourselves. */}
          {status.is_fixture && (
            <p style={{
              margin: '0 0 var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)',
              border: '2px solid var(--c-reward)', borderRadius: 'var(--r-m)',
              background: 'var(--c-reward-soft)', fontWeight: 600,
            }}>
              Test record — not a real certificate. This was created by Lrnon to
              check that this page works, and no person is described by it.
            </p>
          )}
          <h2 style={{ fontSize: 'var(--fs-400)', margin: '0 0 var(--sp-3)' }}>
            {STATE_COPY[status.state ?? 'valid']?.heading ?? 'Found'}
          </h2>
          {STATE_COPY[status.state ?? 'valid']?.body && (
            <p className="prose" style={{ color: 'var(--c-ink-soft)', marginTop: 0 }}>
              {STATE_COPY[status.state ?? 'valid'].body}
            </p>
          )}

          <div style={{ marginTop: 'var(--sp-3)' }}>
            <div style={row}><span style={label}>Module</span>
              <span>{moduleName(status.module)}{status.version ? `, v${status.version}` : ''}</span></div>
            <div style={row}><span style={label}>Issued</span>
              <span>{status.issued_at ? new Date(status.issued_at).toLocaleDateString(undefined,
                { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span></div>
            <div style={row}><span style={label}>Tier</span>
              <span>{status.tier === 'certificate' ? TIERS.certificate.name : TIERS.record.name}</span></div>
            <div style={row}><span style={label}>Holder</span>
              <span style={{ color: 'var(--c-ink-faint)' }}>
                {reveal?.revealed ? reveal.display_name : 'Not shown'}
              </span></div>
            {reveal?.revealed && (
              <>
                <div style={row}><span style={label}>Band</span><span>{reveal.band}</span></div>
                <div style={row}><span style={label}>Assessed by</span><span>{reveal.method}</span></div>
              </>
            )}
          </div>

          {/* --------------------------------------- reveal, gated on initials */}
          {!reveal?.revealed && status.tier === 'certificate' && (
            <div style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)' }}>
              <strong>Checking this against a person in front of you</strong>
              <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
                Enter the initials of the name on their copy. If they match, we
                show the full name, the band and the assessment method. We do
                this because most Lrnon learners are children, and a code alone
                should not return a child's name to a stranger.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); doReveal(); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'flex-end' }}>
                <div style={{ flex: '0 1 180px' }}>
                  <label htmlFor="cert-initials" style={label}>Initials</label>
                  <input
                    id="cert-initials"
                    value={initials}
                    onChange={(e) => setInitials(e.target.value.toUpperCase())}
                    placeholder="e.g. A R K"
                    autoComplete="off"
                    style={{
                      width: '100%', padding: 'var(--sp-2) var(--sp-3)',
                      textTransform: 'uppercase', letterSpacing: '0.12em',
                      border: '1px solid var(--c-border-strong)', borderRadius: '8px',
                      background: 'var(--c-surface)', color: 'var(--c-ink)',
                    }}
                  />
                </div>
                <button className="btn btn--ghost" type="submit" disabled={busy || !initials}>
                  Reveal name
                </button>
              </form>

              {reveal && !reveal.revealed && (
                <p className="note note--try" style={{ marginTop: 'var(--sp-3)' }}>
                  {reveal.cooled
                    ? 'Too many tries on this code. It is locked for an hour.'
                    : 'Those initials do not match. Two more tries before this code is locked for an hour.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
