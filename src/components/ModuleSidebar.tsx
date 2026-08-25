import { useEffect, useState } from 'react';
import { isComplete } from '../lib/progress-store';
import OfflinePack from './OfflinePack';

/** The module rail beside a lesson (design turn 2).
 *
 *  Two things it fixes beyond looking like the mockup:
 *
 *  A learner could previously only move forward, back, or all the way out to
 *  the roadmap. Seeing the whole module — and which parts of it are already
 *  done — is what makes a lesson feel like part of something rather than a
 *  page you landed on.
 *
 *  And it finally gives OfflinePack somewhere to live. That component was
 *  written in Sprint 8, has three working states, and was imported by nothing:
 *  the offline packs the README advertises could not actually be created from
 *  anywhere in the UI.
 */

interface Item { slug: string; title: string; order: number }

export default function ModuleSidebar({
  moduleId, moduleTitle, lessons, current,
}: { moduleId: string; moduleTitle: string; lessons: Item[]; current: string }) {
  // Completion lives in localStorage, so it is read after mount. Rendering the
  // list server-side first means the rail is useful without JS and simply
  // gains its ticks a moment later.
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const l of lessons) map[l.slug] = isComplete(l.slug);
    setDone(map);
    const refresh = () => {
      const m: Record<string, boolean> = {};
      for (const l of lessons) m[l.slug] = isComplete(l.slug);
      setDone(m);
    };
    window.addEventListener('ol:progress', refresh);
    return () => window.removeEventListener('ol:progress', refresh);
  }, [lessons]);

  const completed = lessons.filter((l) => done[l.slug]).length;

  return (
    <nav aria-label={`Module ${moduleId.toUpperCase()} lessons`}
      style={{ display: 'grid', gap: 'var(--sp-4)', alignContent: 'start' }}>
      <div>
        <p style={{ margin: 0, color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Module {moduleId.toUpperCase()} · {lessons.length} lessons
        </p>
        <p style={{ margin: 'var(--sp-1) 0 0', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {moduleTitle}
        </p>
        <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          {completed}/{lessons.length}
        </p>
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-1)' }}>
        {lessons.map((l) => {
          const here = l.slug === current;
          const finished = done[l.slug];
          return (
            <li key={l.slug}>
              <a href={'/learn/' + l.slug}
                aria-current={here ? 'page' : undefined}
                style={{
                  display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline',
                  padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-s)',
                  textDecoration: 'none', minHeight: 40,
                  background: here ? 'var(--c-primary-soft)' : 'transparent',
                  border: '1px solid ' + (here ? 'var(--c-primary-line)' : 'transparent'),
                  color: here ? 'var(--c-ink)' : 'var(--c-ink-soft)',
                  fontWeight: here ? 600 : 400,
                }}>
                {/* The tick carries a label rather than colour alone. */}
                <span aria-hidden="true" style={{
                  minWidth: '1.4em', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: finished ? 'var(--c-progress)' : 'var(--c-ink-faint)',
                }}>
                  {finished ? '✓' : l.order}
                </span>
                <span>
                  {l.title}
                  {finished && <span className="sr-only"> — completed</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ol>

      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
        <OfflinePack moduleId={moduleId} urls={lessons.map((l) => '/learn/' + l.slug + '/')} />
      </div>
    </nav>
  );
}
