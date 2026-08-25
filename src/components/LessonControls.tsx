import { useEffect, useState } from 'react';
import {
  readerPrefs, setReaderPref, type ReaderPrefs,
} from '../lib/progress-store';
import { summary } from '../lib/progress-store';

/** The lesson header controls from design turn 2: `A− A A+`, a theme toggle,
 *  and the streak chip.
 *
 *  These duplicate settings that also live on /reading, deliberately. Text size
 *  is wanted at the moment reading gets hard — mid-lesson — and sending someone
 *  to a settings page to fix that means they lose their place. Both write the
 *  same stored preference, so the two never disagree.
 */

const SIZES: ReaderPrefs['textsize'][] = ['normal', 'large', 'xlarge'];

export default function LessonControls() {
  const [prefs, setPrefs] = useState<ReaderPrefs | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const read = () => { setPrefs(readerPrefs()); setStreak(summary().streak); };
    read();
    window.addEventListener('ol:progress', read);
    return () => window.removeEventListener('ol:progress', read);
  }, []);

  // Render nothing until the stored values are known, rather than flashing the
  // defaults and correcting them a frame later.
  if (!prefs) return null;

  const sizeIdx = SIZES.indexOf(prefs.textsize as any);
  const step = (by: number) => {
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, sizeIdx + by))];
    setReaderPref('textsize', next);
    setPrefs(readerPrefs());
  };

  const cycleTheme = () => {
    const order = ['system', 'light', 'dark'] as const;
    const next = order[(order.indexOf(prefs.theme as any) + 1) % order.length];
    setReaderPref('theme', next);
    setPrefs(readerPrefs());
  };

  const btn: React.CSSProperties = {
    minHeight: 36, minWidth: 36, padding: '0 var(--sp-2)',
    border: '1px solid var(--c-border-strong)', borderRadius: 'var(--r-s)',
    background: 'transparent', color: 'var(--c-ink)', font: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <div role="group" aria-label="Text size" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
        <button type="button" style={btn} onClick={() => step(-1)}
          disabled={sizeIdx <= 0} aria-label="Smaller text">A−</button>
        <span aria-live="polite" style={{ alignSelf: 'center', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
          {prefs.textsize === 'normal' ? 'A' : prefs.textsize === 'large' ? 'A+' : 'A++'}
        </span>
        <button type="button" style={btn} onClick={() => step(1)}
          disabled={sizeIdx >= SIZES.length - 1} aria-label="Larger text">A+</button>
      </div>

      <button type="button" style={btn} onClick={cycleTheme}
        aria-label={`Theme: ${prefs.theme}. Change theme`}>
        ◑ {prefs.theme === 'system' ? 'Auto' : prefs.theme === 'light' ? 'Light' : 'Dark'}
      </button>

      {streak > 0 && (
        <span style={{ color: 'var(--c-reward)', fontSize: 'var(--fs-100)', fontWeight: 600 }}>
          🔥 {streak}-day streak
        </span>
      )}
    </div>
  );
}
