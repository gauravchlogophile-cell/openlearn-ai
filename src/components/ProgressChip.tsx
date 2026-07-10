import { useEffect, useState } from 'react';
import { summary } from '../lib/progress-store';

/** Header chip: streak flame + XP. Quiet, informative, never nagging. */
export default function ProgressChip() {
  const [s, setS] = useState({ xp: 0, level: 1, streak: 0, lessons: 0, mode: 'daily' });
  useEffect(() => {
    const update = () => setS(summary());
    update();
    window.addEventListener('ol:progress', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('ol:progress', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  if (s.lessons === 0) return null;
  return (
    <span aria-label={`Streak ${s.streak} ${s.mode === 'weekly' ? 'weeks' : 'days'}, ${s.xp} XP, level ${s.level}`}
      style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)', marginInlineEnd: 'var(--sp-4)' }}>
      <span style={{ color: 'var(--c-reward)' }}>🔥 {s.streak}{s.mode === 'weekly' ? ' wk' : ''}</span>
      {' · '}⭐ {s.xp} XP · Lv {s.level}
    </span>
  );
}
