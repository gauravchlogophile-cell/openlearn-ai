import { useEffect, useRef, useState } from 'react';
import { BADGES } from '../lib/progress-core';
import { badges as earned } from '../lib/progress-store';

/** All criteria public; locked badges shown greyed with how-to (GAM-2/§7.5).
 *  No hidden badges, no manipulation — the catalog IS the UI.
 *
 *  Earned badges float. Each drifts gently on its own beat (a slow, small
 *  movement, the same one Sky uses, removed by reduce motion), and when the page
 *  opens Sky cheers for them. Badges you have not earned sit still. Movement is
 *  how you can tell the two apart at a glance, and the words say it too. */
export default function BadgeGrid({ moduleTotals }: { moduleTotals: Record<string, number> }) {
  const [got, setGot] = useState<Set<string>>(new Set());
  const cheered = useRef(false);
  useEffect(() => {
    const update = () => setGot(new Set(earned(moduleTotals)));
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, []);

  // Sky is pleased when you open the page with something to show for it.
  useEffect(() => {
    if (got.size > 0 && !cheered.current) {
      cheered.current = true;
      window.dispatchEvent(new CustomEvent('sky:cheer', { detail: { kind: 'badge' } }));
    }
  }, [got]);

  return (
    <>
      <div className="note note--ok" role="status" style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
        <img src="/sky/sky-face.webp" alt="" width={44} height={44} style={{ borderRadius: '50%', background: 'var(--c-sky-tint)', border: '2px solid var(--c-sky-line)' }} />
        <p style={{ margin: 0 }}>
          {got.size === 0
            ? 'Sky says: no badges yet. The first one is one lesson away.'
            : `Sky says: you have ${got.size} of ${BADGES.length} badges. ${got.size >= 5 ? 'That is real progress.' : 'A good start.'}`}
        </p>
      </div>
      <ul style={{
        listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-4)',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))'
      }}>
        {BADGES.map((b, n) => {
          const has = got.has(b.id);
          return (
            <li key={b.id} aria-label={b.name + (has ? ', earned' : ', not yet earned')}
              className={has ? 'skyb-badge-float' : undefined}
              style={{
                border: '1px solid ' + (has ? 'var(--c-reward)' : 'var(--c-border)'),
                borderRadius: 'var(--r-m)', padding: 'var(--sp-4)',
                opacity: has ? 1 : 0.65, background: has ? 'var(--c-surface)' : 'transparent',
                ['--d' as any]: `${5 + (n % 4)}s`, ['--delay' as any]: `${(n % 5) * 0.4}s`,
              }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                <span aria-hidden="true">{has ? '🏅' : '🔒'}</span> {b.name}
              </p>
              <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
                {b.desc}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
