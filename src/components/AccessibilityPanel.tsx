import { useEffect, useRef, useState } from 'react';
import { useViewportClamp } from '../lib/use-viewport-clamp';
import {
  readerPrefs, setReaderPref, defaultReaderPrefs, applyReaderPrefs,
  readAloudEnabled, setReadAloud,
  type ReaderPrefs, type ReaderPrefName,
} from '../lib/progress-store';

/** The accessibility panel from design turn 3: one button in the header,
 *  everything inside.
 *
 *  /reading still exists and is the same settings — a page can be linked to,
 *  bookmarked and read at leisure. But the moment someone needs bigger text is
 *  the moment they are struggling to read THIS page, and sending them away to
 *  a settings page to fix it loses their place. Both write the same stored
 *  preference, so they can never disagree.
 */

interface Group {
  name: ReaderPrefName;
  legend: string;
  options: { value: string; label: string }[];
}

const GROUPS: Group[] = [
  { name: 'textsize', legend: 'Text size', options: [
    { value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }, { value: 'xlarge', label: 'Largest' }] },
  { name: 'leading', legend: 'Line spacing', options: [
    { value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Comfortable' }, { value: 'loose', label: 'Loose' }] },
  { name: 'width', legend: 'Reading width', options: [
    { value: 'normal', label: 'Narrow' }, { value: 'wide', label: 'Wide' }] },
  { name: 'theme', legend: 'Theme', options: [
    { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] },
  { name: 'contrast', legend: 'High contrast', options: [
    { value: 'normal', label: 'Off' }, { value: 'high', label: 'On' }] },
  { name: 'font', legend: 'Dyslexia-friendly font', options: [
    { value: 'default', label: 'Off' }, { value: 'readable', label: 'On' }] },
  { name: 'saver', legend: 'Data-saver', options: [
    { value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
  { name: 'motion', legend: 'Reduce motion', options: [
    { value: 'system', label: 'Follow device' }, { value: 'reduce', label: 'Reduce' }] },
];

const HINT: Partial<Record<ReaderPrefName, string>> = {
  contrast: 'Stronger text and borders.',
  font: 'Wider letter shapes. Uses a font already on your device, so it costs no download.',
  saver: 'Skip diagrams on slow networks.',
  motion: 'Your device setting is honoured already; this overrides it here.',
};

export default function AccessibilityPanel() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<ReaderPrefs | null>(null);
  const [aloud, setAloud] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  /* Right-aligned to the trigger, which puts it off-screen once the nav wraps
     and the trigger is no longer near the right edge. Measured at -213px on a
     390px iPhone viewport. */
  useViewportClamp(panelRef, open);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const read = () => { setPrefs(readerPrefs()); setAloud(readAloudEnabled()); };
    read();
    window.addEventListener('ol:progress', read);
    return () => window.removeEventListener('ol:progress', read);
  }, []);

  // Escape closes and returns focus to the button that opened it, so a
  // keyboard user is not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [open]);

  function pick(name: ReaderPrefName, value: string) {
    setReaderPref(name, value);
    setPrefs(readerPrefs());
  }

  function reset() {
    const d = defaultReaderPrefs();
    (Object.keys(d) as ReaderPrefName[]).forEach((k) => setReaderPref(k, d[k]));
    applyReaderPrefs(d);
    setReadAloud(false);
    setPrefs(d);
    setAloud(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="dialog"
        aria-label="Reading and accessibility settings"
        style={{
          minHeight: 40, minWidth: 40, padding: '0 var(--sp-3)', font: 'inherit', cursor: 'pointer',
          border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)',
          background: open ? 'var(--c-primary-soft)' : 'transparent', color: 'var(--c-ink)',
        }}>
        <span aria-hidden="true">◍</span> <span>Accessibility</span>
      </button>

      {open && prefs && (
        <div ref={panelRef} role="dialog" aria-label="Reading settings"
          style={{
            position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + var(--sp-2))', zIndex: 50,
            width: 'min(360px, calc(100vw - var(--sp-8)))', maxHeight: '70vh', overflowY: 'auto',
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-m)', padding: 'var(--sp-4)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          }}>
          <p style={{ margin: '0 0 var(--sp-3)' }}>
            <strong style={{ fontFamily: 'var(--font-display)' }}>Reading settings</strong><br />
            <span style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
              Saved on this device. No account needed.
            </span>
          </p>

          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            {GROUPS.map((g) => (
              <fieldset key={g.name} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 600, fontSize: 'var(--fs-100)', padding: 0 }}>{g.legend}</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)' }}>
                  {g.options.map((o) => {
                    const active = prefs[g.name] === o.value;
                    return (
                      <button key={o.value} type="button" onClick={() => pick(g.name, o.value)}
                        aria-pressed={active}
                        style={{
                          minHeight: 40, padding: '0 var(--sp-3)', font: 'inherit', cursor: 'pointer',
                          borderRadius: 'var(--r-s)',
                          border: '1px solid ' + (active ? 'var(--c-primary)' : 'var(--c-border-strong)'),
                          background: active ? 'var(--c-primary-soft)' : 'transparent',
                          color: 'var(--c-ink)', fontWeight: active ? 600 : 400,
                        }}>{o.label}</button>
                    );
                  })}
                </div>
                {HINT[g.name] && (
                  <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
                    {HINT[g.name]}
                  </p>
                )}
              </fieldset>
            ))}

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: 'var(--fs-100)', padding: 0 }}>Read lessons aloud</legend>
              <div style={{ display: 'flex', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)' }}>
                {[['Off', false], ['On', true]].map(([label, on]) => {
                  const active = aloud === on;
                  return (
                    <button key={String(label)} type="button" aria-pressed={active}
                      onClick={() => { setReadAloud(on as boolean); setAloud(on as boolean); }}
                      style={{
                        minHeight: 40, padding: '0 var(--sp-3)', font: 'inherit', cursor: 'pointer',
                        borderRadius: 'var(--r-s)',
                        border: '1px solid ' + (active ? 'var(--c-primary)' : 'var(--c-border-strong)'),
                        background: active ? 'var(--c-primary-soft)' : 'transparent',
                        color: 'var(--c-ink)', fontWeight: active ? 600 : 400,
                      }}>{label as string}</button>
                  );
                })}
              </div>
              <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
                Uses your device’s own voice — nothing is downloaded or sent anywhere.
                A player appears on each lesson. Questions are not read out.
              </p>
            </fieldset>
          </div>

          <p style={{ marginTop: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--ghost" onClick={reset}>Reset</button>
            <a className="btn btn--ghost" href="/reading">Open as a page</a>
          </p>
        </div>
      )}
    </div>
  );
}
