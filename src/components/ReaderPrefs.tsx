import { useEffect, useState } from 'react';
import {
  readerPrefs, setReaderPref, applyReaderPrefs, defaultReaderPrefs,
  type ReaderPrefs as Prefs, type ReaderPrefName,
} from '../lib/progress-store';

/** Reading controls. Every option here is a device-side display preference —
 *  nothing is sent anywhere, and nothing needs an account.
 *
 *  The theme control is three-state on purpose. A two-state light/dark toggle
 *  strands everyone who wants the site to follow their operating system, which
 *  on a phone usually means following a schedule.
 */

interface Group {
  name: ReaderPrefName;
  legend: string;
  hint: string;
  options: { value: string; label: string }[];
}

const GROUPS: Group[] = [
  {
    name: 'theme', legend: 'Theme', hint: 'System follows your device, including its day/night schedule.',
    options: [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
  {
    name: 'textsize', legend: 'Text size', hint: 'Scales the whole page — headings, buttons and spacing together, not just body text.',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'large', label: 'Large' },
      { value: 'xlarge', label: 'Largest' },
    ],
  },
  {
    name: 'leading', legend: 'Line spacing', hint: 'Looser lines help some readers track along a line without losing their place.',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'tight', label: 'Tight' },
      { value: 'loose', label: 'Loose' },
    ],
  },
  {
    name: 'width', legend: 'Line length', hint: 'Narrow keeps lines short, which is easier to read; wide fits more on screen.',
    options: [
      { value: 'normal', label: 'Narrow' },
      { value: 'wide', label: 'Wide' },
    ],
  },
  {
    name: 'contrast', legend: 'Contrast', hint: 'Darker text and firmer borders, with the soft background washes removed.',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
    ],
  },
  {
    name: 'font', legend: 'Typeface', hint: 'The reading face uses wider letter shapes and looser spacing. It costs no download — the font is already on your device.',
    options: [
      { value: 'default', label: 'Default' },
      { value: 'readable', label: 'Reading face' },
    ],
  },
  {
    name: 'saver', legend: 'Data saver', hint: 'Skips decorative images. Lessons keep every word — only ornament is dropped.',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
    ],
  },
];

export default function ReaderPrefsPanel() {
  // Server-render the defaults; read the real values after mount. Reading
  // localStorage during render would disagree with the SSR markup and trip a
  // hydration mismatch — the inline script in Base.astro has already applied
  // the saved attributes to <html> by this point, so nothing visibly changes.
  const [prefs, setPrefs] = useState<Prefs>(defaultReaderPrefs);

  useEffect(() => { setPrefs(readerPrefs()); }, []);

  function pick(name: ReaderPrefName, value: string) {
    setReaderPref(name, value);
    setPrefs(readerPrefs());
  }

  function reset() {
    const d = defaultReaderPrefs();
    (Object.keys(d) as ReaderPrefName[]).forEach((k) => setReaderPref(k, d[k]));
    applyReaderPrefs(d);
    setPrefs(d);
  }

  return (
    <section aria-label="Reading preferences">
      <p style={{ color: 'var(--c-ink-soft)' }}>
        These change how pages look on this device only. They are stored here, never sent
        anywhere, and they work whether or not you have an account.
      </p>

      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {GROUPS.map((g) => (
          <fieldset key={g.name} className="card" style={{ border: '1px solid var(--c-border)' }}>
            <legend style={{ fontWeight: 600, padding: '0 var(--sp-2)' }}>{g.legend}</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
              {g.options.map((o) => {
                const active = prefs[g.name] === o.value;
                return (
                  <label
                    key={o.value}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
                      minHeight: 44, padding: '0 var(--sp-4)', cursor: 'pointer',
                      borderRadius: 'var(--r-s)',
                      border: '1px solid ' + (active ? 'var(--c-primary)' : 'var(--c-border-strong)'),
                      background: active ? 'var(--c-primary-soft)' : 'transparent',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <input
                      type="radio" name={'pref-' + g.name} value={o.value} checked={active}
                      onChange={() => pick(g.name, o.value)}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
            <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
              {g.hint}
            </p>
          </fieldset>
        ))}
      </div>

      <p style={{ marginTop: 'var(--sp-6)' }}>
        <button className="btn btn--ghost" onClick={reset}>Reset to defaults</button>
      </p>
    </section>
  );
}
