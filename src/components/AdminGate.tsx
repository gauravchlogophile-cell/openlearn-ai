import { useEffect, useState, type ReactNode } from 'react';
import { isConfigured, supabase } from '../lib/supabase';

/** Gate for every /admin page.
 *
 *  Read this before assuming it is the security boundary — it is not.
 *
 *  The site is output:'static', so /admin is a publicly fetchable HTML file.
 *  Anyone can read the markup. That is acceptable ONLY because the markup
 *  contains no data: every number, name and row on these pages is fetched at
 *  runtime from Supabase, where row-level security decides what the caller may
 *  see. The real boundary is the database, and the privileged actions are
 *  definer functions that re-check the caller's role themselves — `decide()`
 *  raises on a non-owner attempting a deletion whatever the console believes.
 *
 *  So this component is a courtesy, not a lock: it stops a signed-out learner
 *  seeing an empty admin skeleton and wondering what they broke. Removing it
 *  in devtools reveals nothing and grants nothing.
 */

type Role = { owner: boolean; admin: boolean } | null;

export default function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'anon' | 'denied' | 'ok'>('checking');
  const [role, setRole] = useState<Role>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) { setState('denied'); return; }
    (async () => {
      const { data } = await supabase().auth.getUser();
      if (!data.user) { setState('anon'); return; }
      setSignedInAs(data.user.email ?? null);
      // Ask the database, never the client, what this person is allowed to be.
      const [{ data: owner }, { data: admin }] = await Promise.all([
        supabase().rpc('is_owner'),
        supabase().rpc('has_role', { wanted: 'admin' }),
      ]);
      setRole({ owner: !!owner, admin: !!admin });
      setState(owner || admin ? 'ok' : 'denied');
    })().catch(() => setState('denied'));
  }, []);

  if (state === 'checking') {
    return <p style={{ color: 'var(--c-ink-soft)' }} role="status">Checking your access…</p>;
  }

  if (state === 'anon') {
    return (
      <div className="note note--aim">
        <p style={{ marginTop: 0 }}>You need to be signed in to see this.</p>
        {/* Carries where to come back to. Without it, signing in from here
            landed on /account — and since /admin is linked from nowhere, that
            was a dead end for the one person entitled to be here. */}
        <a className="btn" href="/account?next=/admin">Sign in</a>
        <p style={{ marginBottom: 0, marginTop: 'var(--sp-3)',
          color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          Sign in with the account that holds the role. Holding the inbox is not
          the same as holding the role, so if you have more than one account,
          it is worth checking which one you are using.
        </p>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="note note--aim">
        <p style={{ marginTop: 0 }}>
          This area is for people who maintain Lrnon. There is nothing here for a learner,
          and nothing you are missing.
        </p>
        {signedInAs && (
          <p style={{ color: 'var(--c-ink-soft)' }}>
            You are signed in as <strong>{signedInAs}</strong>, which holds no
            admin role. If you maintain Lrnon and have more than one account,
            this is usually the wrong one — holding the shared inbox is not the
            same as holding the role.
          </p>
        )}
        <a className="btn" href="/home">Back to learning</a>
        {signedInAs && (
          <a className="btn btn--ghost" style={{ marginInlineStart: 'var(--sp-2)' }}
            href="/account?next=/admin">Switch account</a>
        )}
      </div>
    );
  }

  return (
    <>
      <p style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
        Signed in as <strong>{role?.owner ? 'Super Admin' : 'Admin'}</strong>
        {!role?.owner && ' — deletions, role changes, funding and policy are reserved to an owner.'}
      </p>
      {children}
    </>
  );
}
