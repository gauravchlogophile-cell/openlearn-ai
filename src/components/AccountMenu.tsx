import { useEffect, useRef, useState } from 'react';
import { useViewportClamp } from '../lib/use-viewport-clamp';
import { isConfigured, supabase } from '../lib/supabase';
import { summary } from '../lib/progress-store';

/** The avatar chip at the end of the header — design turn 7, "qf quiet-fern ▾".
 *
 *  The design draws the chip but never draws the menu open, so its contents
 *  are composed from what the site actually has: the two learning surfaces the
 *  turn-7 nav has no room for (Review, Badges), the account, and reading
 *  preferences. Nothing is invented that does not already exist as a page.
 *
 *  It also carries the streak and XP that ProgressChip used to show in the
 *  header. Turn 7 replaces that chip with this avatar and moves level and
 *  streak onto /home's greeting line — but /home is not the only page, so the
 *  numbers live on inside the menu rather than being dropped.
 */
export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [stats, setStats] = useState({ xp: 0, level: 1, streak: 0, lessons: 0 });

  /* Whether to offer the maintainer console.
   *
   *  /admin is linked from nowhere on purpose — it is not a learner surface and
   *  putting it in the footer would advertise it to everyone. But "linked from
   *  nowhere" left the people who DO hold a role with no route to it either:
   *  the gate's sign-in button lands on /account, and from there the console is
   *  unreachable without remembering the URL. That is not security, it is a
   *  dead end.
   *
   *  So the entry appears here, and only for someone the database says holds a
   *  role. Checked lazily on first open rather than on mount: this chip renders
   *  on every page for every visitor, and two RPCs per page load to decide
   *  whether to show one menu item nobody else can use is not a trade worth
   *  making. */
  const [isStaff, setIsStaff] = useState(false);
  const staffChecked = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  /* Same anchoring hazard as the accessibility panel: right-aligned to a
     trigger that does not stay near the right edge once the nav wraps. */
  useViewportClamp(menu, open);

  /** Asks the database what this person is, once per page. Never the client:
   *  a menu item is cosmetic, and the console behind it is gated again by
   *  AdminGate and again by every function it calls. */
  async function checkStaff() {
    if (staffChecked.current || !isConfigured) return;
    staffChecked.current = true;
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return;
      const [{ data: owner }, { data: admin }] = await Promise.all([
        supabase().rpc('is_owner'),
        supabase().rpc('has_role', { wanted: 'admin' }),
      ]);
      setIsStaff(Boolean(owner) || Boolean(admin));
    } catch { /* a menu that cannot decide simply does not offer the entry */ }
  }

  useEffect(() => {
    const update = () => setStats(summary());
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    (async () => {
      const sb = supabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || !alive) return;
      setSignedIn(true);
      const { data } = await sb.from('profiles').select('handle').eq('id', user.id).single();
      if (alive && data?.handle) setHandle(data.handle);
    })();
    return () => { alive = false; };
  }, []);

  /* Escape closes and returns focus to the trigger; a click outside closes
     without moving focus. Both are what a menu button is expected to do, and
     neither happens for free. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  async function signOut() {
    try { await supabase().auth.signOut(); } finally { location.href = '/'; }
  }

  const initials = handle ? handle.split('-').map((p) => p[0]).slice(0, 2).join('') : '··';

  const item: React.CSSProperties = {
    display: 'block', padding: 'var(--sp-2) var(--sp-4)', color: 'var(--c-ink)',
    textDecoration: 'none', whiteSpace: 'nowrap',
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button ref={trigger} type="button" onClick={() => { setOpen((o) => !o); void checkStaff(); }}
        aria-expanded={open} aria-haspopup="menu"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
          background: 'transparent', border: '1px solid var(--c-border)',
          borderRadius: 999, padding: '4px 10px 4px 4px', cursor: 'pointer',
          color: 'var(--c-ink)', minHeight: 36,
        }}>
        <span aria-hidden="true" style={{
          width: 26, height: 26, borderRadius: 999, background: 'var(--c-surface-2)',
          display: 'grid', placeItems: 'center', fontSize: '0.7rem', color: 'var(--c-ink-soft)',
        }}>{initials}</span>
        {/* The handle is generated, never typed, so it must not be machine
            translated into a phrase — same reason the wordmark carries this. */}
        <span translate="no" className="notranslate" style={{ fontSize: 'var(--fs-100)' }}>
          {handle ?? 'Account'}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--c-ink-faint)' }}>▾</span>
      </button>

      {open && (
        <div ref={menu} role="menu" style={{
          position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', zIndex: 60,
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-m)', boxShadow: '0 10px 30px rgb(0 0 0 / 0.12)',
          minWidth: '13rem',
          // Without this a 13rem minimum overflows a 320px phone on its own,
          // before any anchoring question arises.
          maxWidth: 'calc(100vw - var(--sp-4))',
          paddingBlock: 'var(--sp-2)',
        }}>
          <p style={{ margin: 0, padding: 'var(--sp-1) var(--sp-4) var(--sp-3)',
            color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)',
            borderBottom: '1px solid var(--c-border)' }}>
            Level {stats.level} · {stats.xp} XP
            {stats.streak > 0 && <> · {stats.streak}-day streak</>}
          </p>
          <a role="menuitem" style={item} href="/review">Daily review</a>
          <a role="menuitem" style={item} href="/achievements">Badges</a>
          <a role="menuitem" style={item} href="/account">Your account</a>
          <a role="menuitem" style={item} href="/reading">Reading preferences</a>
          {isStaff && (
            <a role="menuitem" href="/admin"
              style={{ ...item, borderTop: '1px solid var(--c-border)',
                marginTop: 'var(--sp-2)', paddingTop: 'var(--sp-3)' }}>
              Admin
            </a>
          )}
          {signedIn && (
            <button role="menuitem" type="button" onClick={signOut}
              style={{ ...item, width: '100%', textAlign: 'start', background: 'transparent',
                border: 0, borderTop: '1px solid var(--c-border)', marginTop: 'var(--sp-2)',
                paddingTop: 'var(--sp-3)', cursor: 'pointer', font: 'inherit' }}>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
