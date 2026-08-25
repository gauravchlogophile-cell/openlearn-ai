import { useEffect, useState } from 'react';
import { load, reviewLog } from '../lib/progress-store';
import { weekSummary, weekNote, SECONDS_PER_CARD } from '../lib/week-core.js';

/** "Your week" — design turn 7, /home.
 *
 *  A real <table>, not a grid of divs. Seven columns of four numbers IS a
 *  table, and a screen-reader user who lands on it needs to hear "Review
 *  cards, Thursday, 20" rather than twenty-eight loose numbers. That is what
 *  scope="col"/scope="row" buys, and it costs nothing visually.
 */
export default function WeekPanel({ lessonMinutes }: { lessonMinutes: Record<string, number> }) {
  const [w, setW] = useState<ReturnType<typeof weekSummary> | null>(null);

  useEffect(() => {
    // localStorage is unavailable during SSR, so the first render is
    // deliberately empty and this fills it in.
    const update = () => setW(weekSummary(load(), reviewLog(), lessonMinutes, new Date()));
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, [lessonMinutes]);

  if (!w) return null;

  const cell: React.CSSProperties = {
    padding: 'var(--sp-2) var(--sp-1)', textAlign: 'center',
    fontVariantNumeric: 'tabular-nums', borderTop: '1px solid var(--c-border)',
  };

  return (
    <section aria-labelledby="week-h" className="card" style={{ marginBlock: 'var(--sp-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <h2 id="week-h" style={{ margin: 0, fontSize: 'var(--fs-400)' }}>Your week</h2>
        {/* The design prints this promise on the panel. It is true in the
            strongest available sense: none of these numbers has ever left the
            device — they are read from localStorage on this machine. */}
        <p style={{ margin: 0, color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
          Only you can see this
        </p>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 'var(--sp-4)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '30rem' }}>
          <caption className="sr-only">
            Your activity for each day this week. A dash means no activity that day.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', fontWeight: 400, fontSize: 'var(--fs-100)',
                color: 'var(--c-ink-faint)', padding: 'var(--sp-2) var(--sp-1)' }}>&nbsp;</th>
              {w.labels.map((d, i) => (
                <th key={d} scope="col" style={{ ...cell, borderTop: 0, fontWeight: 400,
                  fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' }}>
                  {/* Today is marked with weight, not colour alone. */}
                  <span style={w.dates[i] === w.today
                    ? { color: 'var(--c-ink)', fontWeight: 600 } : undefined}>
                    {d}
                  </span>
                  {w.dates[i] === w.today && <span className="sr-only"> (today)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {w.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" style={{ textAlign: 'left', fontWeight: 400,
                  padding: 'var(--sp-2) var(--sp-1)', borderTop: '1px solid var(--c-border)',
                  color: 'var(--c-ink-soft)', whiteSpace: 'nowrap' }}>
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} style={cell}>
                    {v === null
                      ? <span style={{ color: 'var(--c-ink-faint)' }} aria-label="no activity">—</span>
                      : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 'var(--sp-4) 0 0', color: 'var(--c-ink-soft)' }}>{weekNote(w)}</p>

      {w.rows[3].total > 0 && (
        /* Saying "Minutes" without saying where they came from would imply a
           timer this site does not have — and the board copy two panels down
           promises points never come from time spent here. */
        <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
          Minutes are estimated from lesson length and {SECONDS_PER_CARD} seconds per review
          card. Lrnon does not time you.
        </p>
      )}
    </section>
  );
}
