import { useState } from 'react';

/** Share link + one-tap targets.
 *
 *  The link carries no tracker and sets no cookie — it appends a plain
 *  ?from=share marker and nothing else. That is a promise the page makes to
 *  the reader in as many words, so it has to stay true: no per-sharer id, no
 *  fingerprint, nothing that could identify who shared.
 */
export default function ShareTools({ siteUrl, param }: { siteUrl: string; param: string }) {
  const link = `${siteUrl}/?${param}=share`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is blocked in some contexts; the input below is selectable,
      // so there is always a manual route.
      setCopied(false);
    }
  }

  const msg = 'I have been learning AI on Lrnon — it is free, open source, and has no ads.';
  const targets = [
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(msg + ' ' + link)}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}` },
    { name: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}` },
    { name: 'Reddit', href: `https://reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent('Lrnon — free, open-source AI curriculum')}` },
    { name: 'Email', href: `mailto:?subject=${encodeURIComponent('Free AI course')}&body=${encodeURIComponent(msg + '\n\n' + link)}` },
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div>
        <label htmlFor="share-link" style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
          Your share link
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          <input
            id="share-link" readOnly value={link}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              flex: '1 1 260px', padding: 'var(--sp-3)', minHeight: 44,
              border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)',
              background: 'var(--c-surface)', color: 'var(--c-ink)', font: 'inherit',
            }}
          />
          <button type="button" className="btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <p aria-live="polite" style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          {copied ? 'Link copied to your clipboard.' :
            'The link carries no tracker and sets no cookie. It only tells us how many people arrived from shares in total, never who shared.'}
        </p>
      </div>

      <div>
        <h3 style={{ fontSize: 'var(--fs-300)', margin: '0 0 var(--sp-3)' }}>Share it in one tap</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          {targets.map((t) => (
            <a key={t.name} className="btn btn--ghost" href={t.href} target="_blank" rel="noopener noreferrer">
              {t.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
