import { useEffect } from 'react';
import { isConfigured, supabase } from '../lib/supabase';

/** The two quiet counters, and nothing else.
 *
 *  1. A page count. One request per page opened, carrying the path, a device
 *     class and (if the visitor arrived from a share link) the channel. No cookie,
 *     no id, no IP address read and no User-Agent sent: see /api/hit. It is not
 *     sent at all if the browser says Do Not Track or Global Privacy Control, and
 *     it is never sent from the admin console.
 *
 *  2. A sign-in record, for signed-in people only: when, by which provider, from
 *     what kind of device. It is what the admin's user portal shows, and what a
 *     person can read about themselves. See record_login in migration 0017.
 *
 *  Both fail silently. A counter must never be the reason a page does not work.
 */
function deviceClass(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
}

export default function Telemetry() {
  useEffect(() => {
    const path = location.pathname;
    if (/^\/admin(\/|$)/.test(path)) return;

    const dnt = navigator.doNotTrack === '1' || (navigator as any).globalPrivacyControl === true;

    if (!dnt && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      try {
        const via = new URLSearchParams(location.search).get('from') ?? '';
        const body = JSON.stringify({ path, device: deviceClass(), via });
        if (!navigator.sendBeacon?.('/api/hit', new Blob([body], { type: 'application/json' }))) {
          fetch('/api/hit', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
        }
      } catch { /* never break a page for a counter */ }
    }

    if (!isConfigured) return;
    let sub: { unsubscribe: () => void } | undefined;
    const record = async () => {
      try {
        if (sessionStorage.getItem('ol.login.recorded')) return;
        sessionStorage.setItem('ol.login.recorded', '1');
        await supabase().rpc('record_login', { p_device: deviceClass() });
      } catch { /* silent */ }
    };
    (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        if (data.session) record();
        const { data: s } = supabase().auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN') { try { sessionStorage.removeItem('ol.login.recorded'); } catch { /* */ } record(); } });
        sub = s.subscription;
      } catch { /* silent */ }
    })();
    return () => sub?.unsubscribe();
  }, []);
  return null;
}
