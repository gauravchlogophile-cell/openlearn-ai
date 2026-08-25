import { useEffect, useState } from 'react';
import { load, summary, hasPassedQuiz, dueCount, type CardDef } from '../lib/progress-store';
import { XP_LESSON_COMPLETE } from '../lib/progress-core.js';
import { greeting } from '../lib/week-core.js';
import { isConfigured, supabase } from '../lib/supabase';
import WeekPanel from './WeekPanel';
import Board, { BoardExplainer } from './Board';

export interface LessonMeta {
  slug: string; title: string; minutes: number; module: string;
}
export interface ModuleMeta { id: string; title: string; tagline: string; status: string; }

/** /home — design turn 7, "Home — daily board & usage".
 *
 *  Order follows the design: greeting, your week, the board, continue, how the
 *  board works, what is coming. Everything above the board is local-only and
 *  works signed out; the board is the one part that needs an account, and it
 *  says so rather than disappearing.
 */

/** "two days ago". Rounded to days because the panel is about habit, and an
 *  exact "41 hours ago" is precision nobody asked for. */
function relativeDay(iso: string, now: Date): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export default function Dashboard(
  { lessons, modules, cards }: { lessons: LessonMeta[]; modules: ModuleMeta[]; cards: CardDef[] }
) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ xp: 0, level: 1, streak: 0, lessons: 0 });
  const [due, setDue] = useState(0);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const now = new Date();

  const lessonMinutes = Object.fromEntries(lessons.map((l) => [l.slug, l.minutes]));

  useEffect(() => {
    const update = () => {
      const state = load();
      setDone(new Set(Object.keys(state.completions)));
      setStats(summary());
      setDue(dueCount(cards));
      const events = state.events ?? [];
      setLastAt(events.length ? events[events.length - 1].at : null);
    };
    update();
    window.addEventListener('ol:progress', update);
    return () => window.removeEventListener('ol:progress', update);
  }, []);

  /* The greeting uses the generated handle when there is one. Signed out it is
     just "Good evening" — inventing a name for an anonymous reader would be
     a small lie on the first line of the page. */
  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    (async () => {
      const sb = supabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || !alive) return;
      const { data } = await sb.from('profiles').select('handle').eq('id', user.id).single();
      if (alive && data?.handle) setHandle(data.handle);
    })();
    return () => { alive = false; };
  }, []);

  const next = lessons.find((l) => !done.has(l.slug));
  const liveModules = modules.filter((m) => m.status === 'live');

  /* "next level in 3 lessons". The curve is level = floor(sqrt(xp/25)) + 1, so
     level n+1 begins at 25n². Shown in lessons rather than XP because "40 XP"
     means nothing until you already know what a lesson is worth. */
  const nextLevelXp = 25 * stats.level * stats.level;
  const lessonsToLevel = Math.max(1, Math.ceil((nextLevelXp - stats.xp) / XP_LESSON_COMPLETE));

  return (
    <div>
      <h1 style={{ fontSize: 'var(--fs-500)', margin: '0 0 var(--sp-2)' }}>
        {greeting(now)}{handle && <>, <span translate="no">{handle}</span></>}
      </h1>
      <p style={{ color: 'var(--c-ink-soft)', marginTop: 0 }}>
        Level {stats.level}
        {stats.streak > 0 && <> · {stats.streak}-day streak</>}
        {' · '}next level in {lessonsToLevel} lesson{lessonsToLevel === 1 ? '' : 's'}
      </p>

      <WeekPanel lessonMinutes={lessonMinutes} />

      <Board />

      {next ? (
        <section aria-label="Continue learning" className="card" style={{ marginBlock: 'var(--sp-6)' }}>
          <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)',
            textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Pick up where you left off
          </p>
          <h2 style={{ margin: 'var(--sp-2) 0 var(--sp-1)', fontSize: 'var(--fs-400)' }}>{next.title}</h2>
          <p style={{ margin: '0 0 var(--sp-4)', color: 'var(--c-ink-soft)' }}>
            {next.module.toUpperCase()} · about {next.minutes} min
            {/* Only claimed when there is an event to base it on. */}
            {lastAt && <> · you were last here {relativeDay(lastAt, now)}</>}
          </p>
          <a className="btn" href={'/learn/' + next.slug}>
            {done.size === 0 ? 'Start your first lesson' : 'Continue'}
          </a>
        </section>
      ) : (
        <section className="card" style={{ marginBlock: 'var(--sp-6)' }}>
          <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>Everything published so far — complete 🎉</h2>
          <p style={{ marginBottom: 0 }}>New modules ship every sprint. Your streak keeps counting from any review or new lesson.</p>
        </section>
      )}

      {due > 0 && (
        <p className="note note--try" style={{ marginBlock: 'var(--sp-6)' }}>
          🗂 Today's review: <strong>{due} card{due === 1 ? '' : 's'} due</strong>
          {' '}· <a href="/review">start (2–5 min)</a>
        </p>
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

      <BoardExplainer />

      {/* Design turn 7 ends the page with this, marked "Coming soon" and
          "Not built yet". Naming it while saying plainly that it does not
          exist is the same rule /community follows — nobody should click into
          an empty room. */}
      <section aria-labelledby="latest-h" style={{ marginBlock: 'var(--sp-6)' }}>
        <h2 id="latest-h" style={{ fontSize: 'var(--fs-300)' }}>
          Latest in AI
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: 0,
            fontSize: 'var(--fs-100)', color: 'var(--c-ink-faint)' }}>{' · '}Coming soon</span>
        </h2>
        <p style={{ color: 'var(--c-ink-soft)' }}>
          A short weekly digest of industry news that actually changes what you should
          learn — not a feed. Not built yet.
        </p>
      </section>

      <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)', marginTop: 'var(--sp-8)' }}>
        Progress is saved on this device (<a href="/account">sync options</a>).
      </p>
    </div>
  );
}
