import { useState } from 'react';

/** Feedback form.
 *
 *  Submitting composes a prefilled email rather than POSTing anywhere. That is
 *  a deliberate choice, not a shortcut: the site is static with no form
 *  endpoint, and the alternatives each cost something real — a third-party form
 *  service means a new processor holding learner messages and a privacy-policy
 *  change, and a Supabase table means an anon-writable endpoint to rate-limit
 *  and moderate. A mailto composes locally, sends nothing anywhere until the
 *  person presses send in their own mail client, and cannot silently fail —
 *  which a POST to a misconfigured endpoint absolutely can.
 *
 *  The trade-off is honest and visible: the email address is shown right next
 *  to the form for anyone who would rather write directly.
 */

const TOPICS = [
  'Something is broken',
  'Content is wrong',
  'Hard to read or use',
  'A complaint',
  'An idea',
  'Just saying thanks',
];

export default function FeedbackForm({ email }: { email: string }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [where, setWhere] = useState('');
  const [from, setFrom] = useState('');
  const [what, setWhat] = useState('');
  const [includeDevice, setIncludeDevice] = useState(false);

  function deviceLine() {
    // Only what helps reproduce a bug: no location, no identifiers, no tracking.
    if (typeof navigator === 'undefined') return '';
    return [
      '',
      '--- device details (you ticked the box) ---',
      'Screen: ' + window.innerWidth + '×' + window.innerHeight,
      'Browser: ' + navigator.userAgent,
      'Language: ' + navigator.language,
    ].join('\n');
  }

  const body = [
    'What is this about: ' + topic,
    where ? 'Which page or lesson: ' + where : null,
    from ? 'Reply to: ' + from : null,
    '',
    what,
    includeDevice ? deviceLine() : '',
  ].filter((l) => l !== null).join('\n');

  const href = `mailto:${email}?subject=${encodeURIComponent('Feedback: ' + topic)}&body=${encodeURIComponent(body)}`;

  const field: React.CSSProperties = {
    width: '100%', padding: 'var(--sp-3)', minHeight: 44,
    border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)',
    background: 'var(--c-surface)', color: 'var(--c-ink)', font: 'inherit',
  };
  const label: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 'var(--sp-2)' };

  return (
    <form className="card" style={{ display: 'grid', gap: 'var(--sp-6)' }} onSubmit={(e) => e.preventDefault()}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={label}>What is this about?</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          {TOPICS.map((t) => {
            const active = topic === t;
            return (
              <label key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
                minHeight: 44, padding: '0 var(--sp-4)', cursor: 'pointer',
                borderRadius: 'var(--r-s)',
                border: '1px solid ' + (active ? 'var(--c-primary)' : 'var(--c-border-strong)'),
                background: active ? 'var(--c-primary-soft)' : 'transparent',
                fontWeight: active ? 600 : 400,
              }}>
                <input type="radio" name="topic" checked={active} onChange={() => setTopic(t)} />
                {t}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label style={label} htmlFor="fb-where">Which page or lesson?</label>
        <input id="fb-where" style={field} value={where} onChange={(e) => setWhere(e.currentTarget.value)}
          placeholder="e.g. E3 · Lesson 1 — What a prompt actually is" />
      </div>

      <div>
        <label style={label} htmlFor="fb-from">Your email <span style={{ fontWeight: 400, color: 'var(--c-ink-soft)' }}>(optional)</span></label>
        <input id="fb-from" type="email" style={field} value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          Only used to reply to you.
        </p>
      </div>

      <div>
        <label style={label} htmlFor="fb-what">What happened?</label>
        <textarea id="fb-what" rows={6} style={{ ...field, minHeight: 140 }}
          value={what} onChange={(e) => setWhat(e.currentTarget.value)} />
        <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          What you were doing, what you expected, and what you saw instead. Screenshots welcome by email.
        </p>
      </div>

      <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', minHeight: 44 }}>
        <input type="checkbox" checked={includeDevice} onChange={(e) => setIncludeDevice(e.currentTarget.checked)} />
        <span>Send my device and browser details, so a bug can be reproduced. No location, no tracking.</span>
      </label>

      <div>
        <a className="btn" href={href} aria-disabled={what.trim() === ''}
          style={what.trim() === '' ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
          Send feedback
        </a>
        <p style={{ margin: 'var(--sp-3) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          This opens your email app with the message filled in, so you can see exactly what
          is sent before it leaves. Nothing is published without asking you first.
        </p>
      </div>
    </form>
  );
}
