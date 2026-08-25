import { useEffect, useState, type ReactNode } from 'react';
import { isConfigured, supabase } from '../lib/supabase';

/** The gate in front of every learner-to-learner surface.
 *
 *  It asks the DATABASE whether rooms are open, and the database only says yes
 *  when a flag is set AND a named safeguarding owner and deputy both exist. So
 *  this is not a display toggle: with the gate shut, the row-level policies
 *  return nothing to anybody, and submit_post raises. Removing this component
 *  in devtools would reveal an empty page and an error, not a room.
 *
 *  While closed it shows what the space will be and exactly what is missing.
 *  The design's rule for the community page — nobody should ever click into an
 *  empty room — applies here most of all.
 */

/* Mirrors the seven conditions on /safeguarding. Six are properties of the
   schema and hold now; the seventh is a person. */
const CONDITIONS: { met: boolean; label: string }[] = [
  { met: false, label: 'A named person responsible for safeguarding, with a deputy' },
  { met: true,  label: 'Posts are moderated before they are visible — nothing publishes itself' },
  { met: true,  label: 'No private messaging, ever — there is no table that could carry one' },
  { met: true,  label: 'No profile field that identifies a child — display names are generated' },
  { met: true,  label: 'One-click reporting that works without an account' },
  { met: true,  label: 'A written escalation route, with urgent reports hiding a post immediately' },
  { met: true,  label: 'Published retention rules, enforced by a purge rather than a promise' },
];

export default function RoomsGate({ title, blurb, children }:
  { title: string; blurb: string; children?: ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isConfigured) { setOpen(false); return; }
    supabase().rpc('rooms_open')
      .then(({ data }) => setOpen(data === true))
      .catch(() => setOpen(false));
  }, []);

  if (open === null) {
    return <p role="status" style={{ color: 'var(--c-ink-soft)' }}>Checking…</p>;
  }

  if (open) return <>{children}</>;

  const met = CONDITIONS.filter((c) => c.met).length;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div className="note note--aim">
        <p style={{ marginTop: 0 }}>
          <strong>{title} is not open yet — and that is deliberate.</strong>
        </p>
        <p style={{ color: 'var(--c-ink-soft)', marginBottom: 0 }}>{blurb}</p>
      </div>

      <section aria-label="Conditions before opening">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>
          What has to be true first
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)', letterSpacing: 0 }}>
            {' · '}{met} of {CONDITIONS.length} in place
          </span>
        </h2>
        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          These are not aspirations. Six of them are built into the database and hold right
          now — the seventh is a person, and no amount of code substitutes for someone
          reading what children post.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-2)' }}>
          {CONDITIONS.map((c) => (
            <li key={c.label} className="card" style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline' }}>
              {/* Icon and words, never colour alone. */}
              <span aria-hidden="true" style={{ color: c.met ? 'var(--c-progress)' : 'var(--c-alert)' }}>
                {c.met ? '✓' : '○'}
              </span>
              <span>
                {c.label}
                {!c.met && <strong style={{ color: 'var(--c-alert)' }}> — still needed</strong>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="note note--try">
        <p style={{ marginTop: 0 }}>
          The missing piece is a volunteer, not a feature. A room nobody is watching is
          worse than no room.
        </p>
        <p style={{ marginBottom: 0, display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <a className="btn" href="/volunteer">See volunteer roles</a>
          <a className="btn btn--ghost" href="/safeguarding">Read the child safety policy</a>
        </p>
      </div>
    </div>
  );
}
