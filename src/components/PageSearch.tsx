import { useEffect, useRef, useState } from 'react';

/** "⌕ Search this page — /" from the turn 7 header.
 *
 *  It searches THIS page, not the site. That is what the design labels it, and
 *  it is the honest thing to build: there is no search index, and a box that
 *  says "Search" while only matching one page would be a lie. A site-wide
 *  index is worth building later; pretending to have one now is not.
 *
 *  Implemented over the rendered DOM rather than a content manifest so it
 *  matches what the reader can actually see, including text inside React
 *  islands that never existed at build time.
 */

type Hit = { el: HTMLElement; text: string; heading: string };

/** The nearest preceding heading, so a result reads "Prompting basics — …"
 *  rather than a naked sentence with no idea where it came from. */
function headingFor(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  while (node) {
    let sib: Element | null = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) return (sib.textContent ?? '').trim();
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
    if (node?.tagName === 'BODY') break;
  }
  return '';
}

export default function PageSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /* "/" opens it, the way the header hint promises. Ignored while the reader
     is already typing somewhere, or a slash would never reach the textarea it
     was meant for. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) { setHits([]); setActive(0); return; }

    const main = document.getElementById('main');
    if (!main) return;

    const found: Hit[] = [];
    const seen = new Set<HTMLElement>();
    // Block-level text holders only. Matching every element would return a
    // paragraph, its section, and its container as three separate "results".
    main.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, td, th, dd, dt, blockquote, summary')
      .forEach((el) => {
        if (found.length >= 20) return;
        if (el.closest('[hidden]') || el.classList.contains('sr-only')) return;
        const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
        if (!text || !text.toLowerCase().includes(term)) return;
        // Skip a parent whose match came only from a child already listed.
        if (found.some((h) => el.contains(h.el))) return;
        if (seen.has(el)) return;
        seen.add(el);
        found.push({ el, text, heading: headingFor(el) });
      });

    setHits(found);
    setActive(0);
  }, [q, open]);

  function go(h: Hit) {
    setOpen(false);
    h.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    /* A brief outline rather than a permanent highlight: the reader needs to
       find the line, not to have the page edited underneath them. */
    h.el.style.outline = '2px solid var(--c-primary)';
    h.el.style.outlineOffset = '3px';
    setTimeout(() => { h.el.style.outline = ''; h.el.style.outlineOffset = ''; }, 2200);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]); }
  }

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
          background: 'transparent', border: '1px solid var(--c-border)',
          borderRadius: 999, padding: '6px 10px', cursor: 'pointer',
          color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)', minHeight: 36,
        }}>
        <span aria-hidden="true">⌕</span>
        <span>Search this page</span>
        <kbd aria-hidden="true" style={{
          border: '1px solid var(--c-border)', borderRadius: 4, padding: '0 5px',
          fontSize: '0.75em', color: 'var(--c-ink-faint)',
        }}>/</kbd>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Search this page"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 80, background: 'rgb(0 0 0 / 0.35)',
            display: 'grid', placeItems: 'start center', paddingTop: '12vh',
          }}>
          <div style={{
            width: 'min(38rem, 92vw)', background: 'var(--c-surface)',
            border: '1px solid var(--c-border)', borderRadius: 'var(--r-l)',
            boxShadow: '0 20px 50px rgb(0 0 0 / 0.25)', overflow: 'hidden',
          }}>
            <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey} placeholder="Find on this page…"
              aria-describedby="pagesearch-count"
              style={{
                width: '100%', padding: 'var(--sp-4)', border: 0,
                borderBottom: '1px solid var(--c-border)', background: 'transparent',
                color: 'var(--c-ink)', font: 'inherit', fontSize: 'var(--fs-300)',
              }} />

            <p id="pagesearch-count" role="status" style={{
              margin: 0, padding: 'var(--sp-2) var(--sp-4)', color: 'var(--c-ink-faint)',
              fontSize: 'var(--fs-100)',
            }}>
              {q.trim().length < 2
                ? 'Type at least two letters. This searches the page you are on.'
                : hits.length === 0
                  ? 'Nothing on this page matches.'
                  : `${hits.length}${hits.length === 20 ? '+' : ''} match${hits.length === 1 ? '' : 'es'} · ↑ ↓ to move, Enter to jump`}
            </p>

            {hits.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0,
                maxHeight: '50vh', overflowY: 'auto' }}>
                {hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => go(h)} onMouseEnter={() => setActive(i)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'start', cursor: 'pointer',
                        border: 0, borderTop: '1px solid var(--c-border)', font: 'inherit',
                        padding: 'var(--sp-3) var(--sp-4)', color: 'var(--c-ink)',
                        background: i === active ? 'var(--c-surface-2)' : 'transparent',
                      }}>
                      {h.heading && (
                        <span style={{ display: 'block', fontSize: 'var(--fs-100)',
                          color: 'var(--c-ink-faint)' }}>{h.heading}</span>
                      )}
                      <span style={{ display: 'block', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
