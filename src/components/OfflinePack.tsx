import { useEffect, useState } from 'react';

/** "Make available offline" — fetches a module's lesson pages plus their
 *  hashed assets into a named cache (Phase 4 §5 offline packs).
 *  Honest states, visible progress, removable. */
export default function OfflinePack({ moduleId, urls }: { moduleId: string; urls: string[] }) {
  const cacheName = 'ol-pack-' + moduleId;
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'unsupported' | 'error'>('idle');
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!('caches' in window) || !('serviceWorker' in navigator)) { setState('unsupported'); return; }
    caches.has(cacheName).then((has) => setState(has ? 'saved' : 'idle'));
  }, [cacheName]);

  async function save() {
    try {
      setState('saving'); setPct(0);
      const cache = await caches.open(cacheName);
      const assetSet = new Set<string>();
      for (let i = 0; i < urls.length; i++) {
        const res = await fetch(urls[i]);
        await cache.put(urls[i], res.clone());
        const html = await res.text();
        for (const m of html.matchAll(/\/_astro\/[A-Za-z0-9._-]+\.(?:js|css)/g)) assetSet.add(m[0]);
        setPct(Math.round(((i + 1) / (urls.length + 1)) * 80));
      }
      const assets = [...assetSet];
      for (let i = 0; i < assets.length; i++) {
        const res = await fetch(assets[i]);
        await cache.put(assets[i], res);
        setPct(80 + Math.round(((i + 1) / assets.length) * 20));
      }
      setState('saved');
    } catch { setState('error'); }
  }

  async function remove() {
    await caches.delete(cacheName);
    setState('idle');
  }

  if (state === 'unsupported') return null;
  if (state === 'saved') return (
    <span style={{ fontSize: 'var(--fs-100)', color: 'var(--c-progress)' }}>
      ✓ Available offline{' '}
      <button onClick={remove} className="btn btn--ghost"
        style={{ minHeight: 32, padding: '2px 10px', fontSize: 'var(--fs-100)' }}>Remove</button>
    </span>
  );
  if (state === 'saving') return (
    <span role="status" style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>
      Saving… {pct}%
    </span>
  );
  return (
    <button onClick={save} className="btn btn--ghost"
      style={{ minHeight: 36, padding: '4px 12px', fontSize: 'var(--fs-100)' }}>
      {state === 'error' ? 'Retry offline save' : 'Make available offline'}
    </button>
  );
}
