import { useEffect, useState } from 'react';
import { load, summary, hasPassedQuiz, dueCount, type CardDef } from '../lib/progress-store';

export interface LessonMeta {
  slug: string; title: string; minutes: number; module: string;
}
export interface ModuleMeta { id: string; title: string; tagline: string; status: string; }

/** Signed-out/anonymous dashboard: one primary action (Continue), module
 *  progress, quiet stats. All state is local; server sync arrives via /account. */
export default function Dashboard(
  { lessons, modules, cards }: { lessons: LessonMeta[]; modules: ModuleMeta[]; cards: CardDef[] }
) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ xp: 0, level: 1, streak: 0, lessons: 0 });
  const [due, setDue] = useState(0);

  useEffect(() => {
    const update = () => {
      setDone(new Set(Object.keys(load().completions)));
      setStats(summary());
      setDue(dueCount(cards));
    };
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, []);

  const next = lessons.find((l) => !done.has(l.slug));
  const liveModules = modules.filter((m) => m.status === 'live');

  return (
    <div>
      <p style={{ color: 'var(--c-ink-soft)' }}>
        <span style={{ color: 'var(--c-reward)' }}>🔥 {stats.streak}-day streak</span>
        {' · '}⭐ {stats.xp} XP · Level {stats.level}
      </p>

      {next ? (
        <section aria-label="Continue learning" style={{
          background: 'var(--c-surface)', borderRadius: 'var(--r-l)',
          padding: 'var(--sp-6)', marginBlock: 'var(--sp-6)'
        }}>
          <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
            CONTINUE · {next.module.toUpperCase()} · {next.minutes} min
          </p>
          <h2 style={{ margin: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--fs-400)' }}>{next.title}</h2>
          <a className="btn" href={'/learn/' + next.slug}>
            {done.size === 0 ? 'Start your first lesson' : 'Continue lesson'}
          </a>
        </section>
      ) : (
        <section style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)', padding: 'var(--sp-6)', marginBlock: 'var(--sp-6)' }}>
          <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>Everything published so far — complete 🎉</h2>
          <p style={{ marginBottom: 0 }}>New modules ship every sprint. Your streak keeps counting from any review or new lesson.</p>
        </section>
      )}

      <h2 style={{ fontSize: 'var(--fs-300)' }}>Your modules</h2>
      {liveModules.map((m) => {
        const ml = lessons.filter((l) => l.module === m.id);
        const completed = ml.filter((l) => done.has(l.slug)).length;
        const pct = ml.length ? Math.round((completed / ml.length) * 100) : 0;
        return (
          <div key={m.id} style={{ marginBlock: 'var(--sp-4)' }}>
            <p style={{ margin: '0 0 var(--sp-1)' }}>
              <strong>{m.id.toUpperCase()} · {m.title}</strong>
              <span style={{ color: 'var(--c-ink-soft)' }}> — {completed}/{ml.length} lessons</span>
            </p>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
              aria-label={`${m.title} progress`}
              style={{ background: 'var(--c-border)', borderRadius: 999, height: 10, overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: 'var(--c-progress)' }} />
            </div>
            {pct === 100 && (
              hasPassedQuiz(m.id)
                ? <p style={{ margin: 'var(--sp-1) 0 0', color: 'var(--c-progress)', fontSize: 'var(--fs-100)' }}>
                    🏅 Module quiz passed · <a href={'/quiz/' + m.id}>retake</a>
                  </p>
                : <p style={{ margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-100)' }}>
                    Lessons done — <a href={'/quiz/' + m.id}><strong>take the module quiz</strong></a> (+30 XP)
                  </p>
            )}
          </div>
        );
      })}

      {due > 0 && (
        <p style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-m)',
          padding: 'var(--sp-3) var(--sp-4)' }}>
          🗂 Today's review: <strong>{due} card{due === 1 ? '' : 's'} due</strong>
          {' '}· <a href="/review">start (2–5 min)</a>
        </p>
      )}
      <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)', marginTop: 'var(--sp-8)' }}>
        Progress is saved on this device (<a href="/account">sync options</a>).
      </p>
    </div>
  );
}
