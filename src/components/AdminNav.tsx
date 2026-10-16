import { useEffect, useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { ADMIN_TABS, tabsFor } from '../lib/volunteer-roles.js';

/** The console's tabs, trimmed to what the person signed in may open.
 *
 *  Rendered in full on the server (the console is for staff and is not indexed),
 *  then narrowed once the database has said what this person holds. It is a
 *  convenience: a tab hidden here is still refused by the page and by the database,
 *  and a tab shown here does nothing the role does not already allow.
 */
export default function AdminNav({ here }: { here: string }) {
  const [tabs, setTabs] = useState(ADMIN_TABS);

  useEffect(() => {
    if (!isConfigured) return;
    (async () => {
      try {
        const { data } = await supabase().rpc('my_roles');
        const held = ((data as { role: string }[] | null) ?? []).map((r) => r.role);
        if (held.length > 0) setTabs(tabsFor(held));
      } catch { /* keep the full list: the pages gate themselves */ }
    })();
  }, []);

  return (
    <nav aria-label="Admin sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-8)', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-4)' }}>
      {tabs.map((t) => {
        const current = here === t.href;
        return (
          <a key={t.href} href={t.href} aria-current={current ? 'page' : undefined}
            style={{
              padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--r-s)', textDecoration: 'none',
              ...(current
                ? { background: 'var(--c-primary-soft)', border: '1px solid var(--c-primary-line)', fontWeight: 600 }
                : { border: '1px solid transparent', color: 'var(--c-ink-soft)' }),
            }}>{t.label}</a>
        );
      })}
    </nav>
  );
}
