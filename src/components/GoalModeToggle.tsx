import { useEffect, useState } from 'react';
import { goalMode, setGoalMode, type GoalMode } from '../lib/progress-store';

/** Weekly-goal mode (Phase 3 §7.4): for people who can't learn daily.
 *  An accessibility-of-life feature, framed without guilt. */
export default function GoalModeToggle() {
  const [mode, setMode] = useState<GoalMode>('daily');
  useEffect(() => { setMode(goalMode()); }, []);
  function pick(m: GoalMode) { setGoalMode(m); setMode(m); }
  return (
    <fieldset style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-m)', padding: 'var(--sp-4)' }}>
      <legend style={{ fontWeight: 600 }}>Streak goal</legend>
      <label style={{ display: 'block', minHeight: 40 }}>
        <input type="radio" name="goal" checked={mode === 'daily'} onChange={() => pick('daily')} />
        {' '}<strong>Daily</strong> — a streak day is any day you learn (5+ minutes).
      </label>
      <label style={{ display: 'block', minHeight: 40 }}>
        <input type="radio" name="goal" checked={mode === 'weekly'} onChange={() => pick('weekly')} />
        {' '}<strong>Weekly</strong> — life is busy; keep the flame with any learning each week.
      </label>
      <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        Switch anytime. Both modes count the same activity — only the flame's rhythm changes.
      </p>
    </fieldset>
  );
}
