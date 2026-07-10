import { useEffect, useState } from 'react';
import { load } from '../lib/progress-store';
import type { LessonMeta, ModuleMeta } from './Dashboard';
import OfflinePack from './OfflinePack';

interface TrackMeta { id: string; title: string; tagline: string; }

/** Skill tree — semantic list baseline (a11y-first, Phase 5 §3.3).
 *  SSR renders full structure with 0% state; hydration adds real progress. */
export default function Roadmap(
  { tracks, modules, lessons }: { tracks: TrackMeta[]; modules: ModuleMeta[]; lessons: LessonMeta[] }
) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'map'>('list');
  useEffect(() => {
    const update = () => setDone(new Set(Object.keys(load().completions)));
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, []);

  const maxLen = Math.max(...tracks.map((t) => modules.filter((m) => m.track === t.id).length));

  function nodeState(m: ModuleMeta) {
    if (m.status !== 'live') return { label: 'Coming soon', color: 'var(--c-border)', pct: 0 };
    const ml = lessons.filter((l) => l.module === m.id);
    const completed = ml.filter((l) => done.has(l.slug)).length;
    const pct = ml.length ? Math.round((completed / ml.length) * 100) : 0;
    if (pct === 100) return { label: 'Complete', color: 'var(--c-progress)', pct };
    if (pct > 0) return { label: pct + '% done', color: 'var(--c-reward)', pct };
    return { label: 'Available', color: 'var(--c-primary)', pct };
  }

  return (
    <div>
      <p role="group" aria-label="Roadmap view" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button className={view === 'list' ? 'btn' : 'btn btn--ghost'}
          aria-pressed={view === 'list'} onClick={() => setView('list')}>List view</button>
        <button className={view === 'map' ? 'btn' : 'btn btn--ghost'}
          aria-pressed={view === 'map'} onClick={() => setView('map')}>Map view</button>
      </p>

      {view === 'map' && (
        <svg viewBox={'0 0 ' + (tracks.length * 220) + ' ' + (maxLen * 92 + 60)}
          role="group" aria-label="Roadmap map view: same modules as the list view"
          style={{ width: '100%', height: 'auto', marginBlock: 'var(--sp-6)' }}>
          {tracks.map((t, ti) => {
            const mods = modules.filter((m) => m.track === t.id);
            const x = ti * 220 + 110;
            return (
              <g key={t.id}>
                <text x={x} y={28} textAnchor="middle" fontSize={16} fontWeight={700}
                  fill="var(--c-ink)">{t.title}</text>
                {mods.length > 1 && (
                  <line x1={x} y1={60} x2={x} y2={60 + (mods.length - 1) * 92}
                    stroke="var(--c-border)" strokeWidth={3} />
                )}
                {mods.map((m, mi) => {
                  const s = nodeState(m);
                  const y = 60 + mi * 92;
                  const first = lessons.find((l) => l.module === m.id);
                  const node = (
                    <g>
                      <circle cx={x} cy={y} r={20}
                        fill={s.pct === 100 ? s.color : 'var(--c-bg)'}
                        stroke={s.color} strokeWidth={4} />
                      {s.pct > 0 && s.pct < 100 && (
                        <text x={x} y={y + 4} textAnchor="middle" fontSize={10}
                          fill="var(--c-ink)">{s.pct}%</text>
                      )}
                      <text x={x} y={y + 40} textAnchor="middle" fontSize={12}
                        fill="var(--c-ink-soft)">{m.id.toUpperCase()}</text>
                    </g>
                  );
                  return m.status === 'live' && first ? (
                    <a key={m.id} href={'/learn/' + first.slug}
                      aria-label={m.id.toUpperCase() + ' · ' + m.title + ' — ' + s.label}>
                      {node}
                    </a>
                  ) : (
                    <g key={m.id} aria-label={m.id.toUpperCase() + ' · ' + m.title + ' — coming soon'}>
                      {node}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      {view === 'list' && tracks.map((t) => (
        <section key={t.id} aria-label={t.title + ' track'} style={{ marginBlock: 'var(--sp-8)' }}>
          <h2 style={{ fontSize: 'var(--fs-400)', marginBottom: 'var(--sp-1)' }}>{t.title}</h2>
          <p style={{ color: 'var(--c-ink-soft)', marginTop: 0 }}>{t.tagline}</p>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {modules.filter((m) => m.track === t.id).map((m) => {
              const s = nodeState(m);
              const live = m.status === 'live';
              const firstLesson = lessons.find((l) => l.module === m.id);
              return (
                <li key={m.id} style={{
                  display: 'flex', gap: 'var(--sp-4)', alignItems: 'center',
                  padding: 'var(--sp-3) 0', borderInlineStart: '3px solid ' + s.color,
                  paddingInlineStart: 'var(--sp-4)', marginBlock: 'var(--sp-2)'
                }}>
                  <span aria-hidden="true" style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    background: s.pct === 100 ? s.color : 'var(--c-bg)',
                    border: '3px solid ' + s.color
                  }} />
                  <span style={{ flex: 1 }}>
                    <strong>{m.id.toUpperCase()} · {m.title}</strong>
                    <br /><span style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
                      {m.tagline} — <em>{s.label}</em>
                    </span>
                  </span>
                  {live && firstLesson && (
                    <span style={{ flexShrink: 0, display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <OfflinePack moduleId={m.id}
                        urls={lessons.filter((l) => l.module === m.id).map((l) => '/learn/' + l.slug)} />
                      <a className="btn btn--ghost" href={'/learn/' + firstLesson.slug}>Open</a>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
