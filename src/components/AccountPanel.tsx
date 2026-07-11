import { useEffect, useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { syncNow } from '../lib/sync';
import { summary } from '../lib/progress-store';

/** Account & sync surface. Honest about modes:
 *  - No backend configured → explains local-only storage, no fake buttons.
 *  - Configured, signed out → OAuth + email sign-in.
 *  - Signed in → sync status + sign out. */
export default function AccountPanel() {
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [msg, setMsg] = useState('');
  const s = summary();

  useEffect(() => {
    if (!isConfigured) return;
    supabase().auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) void doSync();   // auto pull+push on load if already signed in
    });
    const { data: sub } = supabase().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void doSync();   // auto pull+push right after sign-in
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <div>
        <p>Your progress — {s.lessons} lesson{s.lessons === 1 ? '' : 's'}, {s.xp} XP,
        a {s.streak}-day streak — is stored <strong>on this device only</strong> right now.</p>
        <p>Accounts and cross-device sync switch on when this deployment is connected to
        its database. Nothing will be lost: your local progress merges in automatically
        the first time you sign in.</p>
      </div>
    );
  }

  async function oauth(provider: 'google' | 'github') {
    await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + '/account' } });
  }
  async function magicLink() {
    const { error } = await supabase().auth.signInWithOtp({ email });
    setMsg(error ? 'Could not send the link: ' + error.message : 'Check your email for a sign-in link.');
  }
  async function doSync() {
    const r = await syncNow();
    setMsg('pushed' in r ? `Synced: ${r.pulled} pulled, ${r.pushed} pushed.` : `Sync skipped: ${r.skipped}`);
  }
  async function signOut() {
    await supabase().auth.signOut(); setUser(null);
  }

  return user ? (
    <div>
      <p>Signed in as <strong>{user.email}</strong>.</p>
      <button className="btn" onClick={doSync}>Sync progress now</button>{' '}
      <button className="btn btn--ghost" onClick={signOut}>Sign out</button>
      {msg && <p role="status">{msg}</p>}
    </div>
  ) : (
    <div>
      <p>Sign in to keep your progress on every device. Your local
      {' '}{s.xp} XP merges in — nothing is lost.</p>
      <p>
        <button className="btn" onClick={() => oauth('google')}>Continue with Google</button>{' '}
        <button className="btn" onClick={() => oauth('github')}>Continue with GitHub</button>
      </p>
      <p>
        <label htmlFor="email">Or email a sign-in link:</label><br />
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 'var(--sp-2)', minHeight: 44, borderRadius: 'var(--r-s)',
                   border: '1px solid var(--c-border)', marginBlock: 'var(--sp-2)' }} />
        {' '}<button className="btn btn--ghost" onClick={magicLink} disabled={!email.includes('@')}>
          Send link
        </button>
      </p>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
