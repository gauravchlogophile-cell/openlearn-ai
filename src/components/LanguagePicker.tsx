import { useEffect, useState } from 'react';

/** The language choice in the header. It appears only when at least one language has
 *  been translated AND reviewed by a person (see src/i18n/locales.js), so it never
 *  offers a language that would turn out to be a machine draft.
 *
 *  Choosing a language does two things:
 *    · if this page has a translation, go to it (the page lists its own versions as
 *      <link rel="alternate" hreflang> in the head, which is also what search engines read)
 *    · otherwise stay put and translate the menus and footer (ChromeLang), and say so,
 *      because the lesson text on this page is English.
 *  The choice is remembered on this device only.
 */
export type Offered = { code: string; htmlLang: string; name: string; native: string; dir: 'ltr' | 'rtl'; ui: boolean; lessons: number };
export const LANG_KEY = 'ol.lang';

export default function LanguagePicker({ lang, languages }: { lang: string; languages: Offered[] }) {
  const [value, setValue] = useState(lang);
  const [note, setNote] = useState('');

  useEffect(() => {
    // On a translated page the page itself decides; on English pages the remembered choice does.
    if (lang !== 'en') { setValue(lang); return; }
    try { const saved = localStorage.getItem(LANG_KEY); if (saved && languages.some((l) => l.code === saved)) setValue(saved); } catch { /* English */ }
  }, [lang, languages]);

  function choose(code: string) {
    setValue(code);
    try { localStorage.setItem(LANG_KEY, code); } catch { /* private mode: it just will not be remembered */ }
    const alt = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')).find((l) => l.dataset.code === code);
    if (alt) { location.href = alt.href; return; }
    window.dispatchEvent(new CustomEvent('ol:lang', { detail: { code } }));
    const chosen = languages.find((l) => l.code === code);
    setNote(code === 'en' ? '' : chosen?.lessons ? `${chosen.native}: lessons that have been translated and checked are in your language. This page is in English.` : '');
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <label htmlFor="lang-picker" className="sr-only">Language</label>
      <select id="lang-picker" value={value} onChange={(e) => choose(e.currentTarget.value)}
        style={{ minHeight: 40, padding: '0 var(--sp-3)', font: 'inherit', border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)', background: 'var(--c-surface)', color: 'var(--c-ink)' }}>
        <option value="en" lang="en">English</option>
        {languages.map((l) => <option key={l.code} value={l.code} lang={l.htmlLang}>{l.native}</option>)}
      </select>
      {note && <span role="status" style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)', maxWidth: '28ch' }}>{note}</span>}
    </span>
  );
}
