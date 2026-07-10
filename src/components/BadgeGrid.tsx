import { useEffect, useState } from 'react';
import { BADGES } from '../lib/progress-core';
import { badges as earned } from '../lib/progress-store';

/** All criteria public; locked badges shown greyed with how-to (GAM-2/§7.5).
 *  No hidden badges, no manipulation — the catalog IS the UI. */
export default function BadgeGrid({ moduleTotals }: { moduleTotals: Record<string, number> }) {
  const [got, setGot] = useState<Set<string>>(new Set());
  useEffect(() => {
    const update = () => setGot(new Set(earned(moduleTotals)));
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, []);

  return (
    <ul style={{
      listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-4)',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))'
    }}>
      {BADGES.map((b) => {
        const has = got.has(b.id);
        return (
          <li key={b.id} aria-label={b.name + (has ? ', earned' : ', not yet earned')} style={{
            border: '1px solid ' + (has ? 'var(--c-reward)' : 'var(--c-border)'),
            borderRadius: 'var(--r-m)', padding: 'var(--sp-4)',
            opacity: has ? 1 : 0.65, background: has ? 'var(--c-surface)' : 'transparent'
          }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {has ? '🏅' : '🔒'} {b.name}
            </p>
            <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
              {b.desc}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
