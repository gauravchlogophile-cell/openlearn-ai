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
  /* Each one-tap target carries its own marker (?from=x, ?from=whatsapp …), so
     the arrivals count can say which channel people came through. It is still one
     word, still no per-person id, still no cookie. */
  const via = (channel: string) => `${siteUrl}/?${param}=${channel}`;
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

  const msg = 'I have been learning AI on Lrnon — it is free, open source, and nobody has to pay to use it.';
  const targets = [
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(msg + ' ' + via('whatsapp'))}` },
    /* X, which was Twitter. The intent URL still lives on twitter.com and both
       domains answer it; x.com/intent/post is the newer spelling but twitter.com
       also works in the apps people actually tap it from. */
    { name: 'X (Twitter)', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(via('x'))}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(via('linkedin'))}` },
    { name: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(via('telegram'))}&text=${encodeURIComponent(msg)}` },
    { name: 'Reddit', href: `https://reddit.com/submit?url=${encodeURIComponent(via('reddit'))}&title=${encodeURIComponent('Lrnon — free, open-source AI curriculum')}` },
    { name: 'Email', href: `mailto:?subject=${encodeURIComponent('Free AI course')}&body=${encodeURIComponent(msg + '\n\n' + via('email'))}` },
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
