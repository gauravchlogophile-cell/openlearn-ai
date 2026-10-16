import { useEffect } from 'react';
import type { Offered } from './LanguagePicker';
import { LANG_KEY } from './LanguagePicker';

/** Translates the menus and footer of a page that is written in English, for a reader who
 *  has chosen another language whose interface strings have been reviewed.
 *
 *  Only the words marked data-i18n change, and each gets its own lang attribute, so a
 *  screen reader switches voice for them and reads the English lesson in English. The page
 *  itself is never relabelled as another language: that would be a lie about the lesson.
 *
 *  Nothing is fetched unless there is a choice to apply. The strings come from
 *  /i18n/<lang>.json, which the build writes only for catalogues that passed review.
 */
export default function ChromeLang({ lang, languages }: { lang: string; languages: Offered[] }) {
  useEffect(() => {
    if (lang !== 'en') return;                      // a translated page was built with its own words
    let alive = true;
    const apply = async () => {
      let code = 'en';
      try { code = localStorage.getItem(LANG_KEY) || 'en'; } catch { /* English */ }
      const chosen = languages.find((l) => l.code === code);
      if (!chosen || !chosen.ui) { restore(); return; }
      try {
        const res = await fetch(`/i18n/${code}.json`);
        if (!res.ok) return;
        const cat = (await res.json()) as Record<string, string>;
        if (!alive) return;
        document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
          const v = cat[el.dataset.i18n!];
          if (!v) return;
          if (el.dataset.en === undefined) el.dataset.en = el.textContent ?? '';
          el.textContent = v; el.lang = chosen.htmlLang;
          if (chosen.dir === 'rtl') el.dir = 'rtl';
        });
        document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
          const v = cat[el.dataset.i18nAria!];
          if (v) el.setAttribute('aria-label', v);
        });
        (window as any).__olUi = { code, strings: cat };
      } catch { /* the page stays in English */ }
    };
    const restore = () => {
      document.querySelectorAll<HTMLElement>('[data-i18n][data-en]').forEach((el) => { el.textContent = el.dataset.en ?? ''; el.removeAttribute('lang'); el.removeAttribute('dir'); });
    };
    void apply();
    const on = () => void apply();
    window.addEventListener('ol:lang', on);
    return () => { alive = false; window.removeEventListener('ol:lang', on); };
  }, [lang, languages]);
  return null;
}
