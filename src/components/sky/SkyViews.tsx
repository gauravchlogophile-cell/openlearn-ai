import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isConfigured, supabase } from '../../lib/supabase';
import {
  load, sessionCards, gradeAndSave, finishReviewSession, finishQuickQuiz, addGears,
  skyStore, patchSkyStore, type SkyPrefs, type CardDef,
} from '../../lib/progress-store';
import { loadQuiz, loadCards, drawQuick, type BuddyIndex, type QuizItem } from '../../lib/sky-data';
import { BADGES, activityDate } from '../../lib/progress-core.js';
import { companionContext, dailyGoals, formatLeft } from '../../lib/sky-buddy.js';
import { palsFor, mergeBoard, PAL_LABEL, PAL_EXPLANATION } from '../../lib/sky-pals.js';

type Ctx = ReturnType<typeof companionContext>;
export type Cheer = (kind: 'lesson' | 'level' | 'badge' | 'streak' | 'cards' | 'quiz' | 'star') => void;

/* ---------------------------------------------------------------- icons */
export function Icon({ name, size = 20 }: { name: 'flame' | 'star' | 'gear' | 'trophy' | 'bot' | 'check' | 'cross'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
  switch (name) {
    case 'flame': return <svg {...common}><path d="M12.4 1.8c.5 3.6 4.4 5.2 5.1 9.2.7 4.2-1.9 9.2-5.5 9.2s-6.3-3.8-5.2-8c.4-1.5 1.5-2.5 2.2-3.7.9-1.5 1.1-3.5 3.4-6.7z" fill="#e8590c" /><path d="M12 11c.3 2 2.4 2.8 2.7 5 .3 2-1 3.7-2.7 3.7s-3-1.6-2.6-3.5c.2-.9.9-1.5 1.3-2.3.4-.8.5-1.8 1.3-2.9z" fill="#ffd43b" /></svg>;
    case 'star': return <svg {...common}><path d="M12 2.8l2.8 6 6.5.8-4.8 4.5 1.3 6.5L12 17.4l-5.8 3.2 1.3-6.5L2.7 9.6l6.5-.8z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case 'gear': return <svg {...common}><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="3.4" strokeDasharray="2.55 2.55" /><path fill="currentColor" fillRule="evenodd" d="M12 5.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" /></svg>;
    case 'trophy': return <svg {...common}><path d="M7 3h10v5.5a5 5 0 0 1-10 0z" fill="currentColor" /><path d="M7 5H3.5c0 3.4 1.4 5 3.9 5.4M17 5h3.5c0 3.4-1.4 5-3.9 5.4M12 13.5V17M8 21h8M9.5 21v-3h5v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'bot': return <svg {...common}><rect x="4" y="7" width="16" height="12" rx="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="9" cy="13" r="1.6" fill="currentColor" /><circle cx="15" cy="13" r="1.6" fill="currentColor" /><path d="M12 7V4M10 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
    case 'check': return <svg {...common}><path d="M4.5 12.8l5 5 10-11" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'cross': return <svg {...common}><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>;
  }
}

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

/* ---------------------------------------------------------------- HUD */
/** The numbers strip: streak, stars, gears and the level bar. A glance, not a
 *  demand: it is hidden entirely when the person has switched numbers off. */
export function Hud({ ctx, prefs }: { ctx: Ctx; prefs: SkyPrefs }) {
  if (!prefs.numbers) return null;
  const st = skyStore();
  return (
    <div className="skyb-hud" role="group" aria-label="Your numbers">
      <span className="skyb-chip" title={ctx.goalMode === 'weekly' ? 'Weeks in a row' : 'Days in a row'}><Icon name="flame" />{ctx.streakDays}<span className="sr-only"> {ctx.goalMode === 'weekly' ? 'weeks' : 'days'} in a row</span></span>
      <span className="skyb-chip" title="Stars: right answers in Sky's quiz, and bonus stars you caught"><span style={{ color: 'var(--c-reward)' }}><Icon name="star" /></span>{st.stars}<span className="sr-only"> stars</span></span>
      <span className="skyb-chip" title="Gears: cards you knew and topics you opened"><span style={{ color: 'var(--c-primary)' }}><Icon name="gear" /></span>{st.gears}<span className="sr-only"> gears</span></span>
      <span className="skyb-chip skyb-chip--wide" style={{ flex: 1 }}>
        Level {ctx.level}
        <span className="skyb-meter" role="progressbar" aria-label="Progress to the next level" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round((ctx.xpIntoLevel / ctx.xpForLevel) * 100)}><i style={{ width: Math.round((ctx.xpIntoLevel / ctx.xpForLevel) * 100) + '%' }} /></span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- quiz */
const QUIZ_SECONDS = 300;

/** The five-minute quiz. Five questions from one module's bank, a countdown if
 *  the person has not switched it off, an explanation after every answer.
 *
 *  The clock is a pace guide. When it reaches zero Sky says so and the quiz
 *  carries on: nobody is marked down or cut off for reading slowly, and for a
 *  reader with dyslexia or anyone who thinks before answering, a quiz that
 *  stopped at zero would be a different, harder quiz. Turning the timer off
 *  removes it altogether. */
export function QuizView({ index, ctx, prefs, onCheer, onBack }: { index: BuddyIndex; ctx: Ctx; prefs: SkyPrefs; onCheer: Cheer; onBack: () => void }) {
  const modules = index.quizzes;
  const started = modules.filter((m) => index.lessons.some((l) => l.m === m && load().completions[l.s]));
  const [mod, setMod] = useState<string>(ctx.lastModule && modules.includes(ctx.lastModule) ? ctx.lastModule : (started[0] ?? modules[0]));
  const [items, setItems] = useState<ReturnType<typeof drawQuick> | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(QUIZ_SECONDS);
  const [err, setErr] = useState(false);
  const [first, setFirst] = useState(false);
  const alreadyToday = useRef(skyStore().quiz);

  const begin = useCallback(async (m: string) => {
    setErr(false); setItems(null); setI(0); setPicked(null); setRight(0); setDone(false); setLeft(QUIZ_SECONDS);
    try { const b = await loadQuiz(m); setItems(drawQuick(b.items as QuizItem[], 5)); }
    catch { setErr(true); }
  }, []);
  useEffect(() => { begin(mod); }, [mod, begin]);

  // The countdown. A clock that only informs: it never ends the quiz.
  useEffect(() => {
    if (!prefs.timer || done || !items) return;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [prefs.timer, done, items]);

  function answer(n: number) {
    if (!items || picked !== null) return;
    setPicked(n);
    if (n === items[i].answer) setRight((r) => r + 1);
  }
  function next() {
    if (!items) return;
    if (i + 1 < items.length) { setI(i + 1); setPicked(null); return; }
    const correct = right;
    setFirst(!alreadyToday.current);
    finishQuickQuiz(correct);
    setDone(true);
    onCheer('quiz');
  }

  if (err) return <p>That quiz could not be loaded. Check your connection and <button type="button" className="skyb-link" onClick={() => begin(mod)}>try again</button>.</p>;
  if (!items) return <p role="status">Choosing questions…</p>;

  if (done) {
    const stars = right >= 5 ? 3 : right >= 3 ? 2 : right >= 1 ? 1 : 0;
    return (
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <h3 style={{ margin: 0 }}>{right >= 4 ? 'Very good.' : right >= 2 ? 'Nice work.' : 'A good start.'}</h3>
        <p style={{ margin: 0 }}>{right} of {items.length} right. <span aria-label={`${stars} of 3 stars`} style={{ color: 'var(--c-reward)', display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>{[0, 1, 2].map((s) => <span key={s} style={{ opacity: s < stars ? 1 : 0.25 }}><Icon name="star" /></span>)}</span></p>
        <p className="skyb-say" style={{ margin: 0 }}>
          {first ? 'You earned 5 points for today’s first quiz.' : 'You have already earned today’s quiz points. More practice still helps it stick.'} You collected {plural(right, 'star', 'stars')}.
        </p>
        <div className="skyb-two">
          <button type="button" className="skyb-primary" onClick={() => { alreadyToday.current = true; begin(mod); }}>Another round</button>
          <button type="button" className="skyb-row" onClick={onBack} style={{ justifyContent: 'center' }}>Back</button>
        </div>
      </div>
    );
  }

  const q = items[i];
  const over = prefs.timer && left === 0;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div className="skyb-quizbar">
        <label htmlFor="skyb-mod" className="sr-only">Quiz topic</label>
        <select id="skyb-mod" className="skyb-input" value={mod} onChange={(e) => setMod(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
          {modules.map((m) => <option key={m} value={m}>{m.toUpperCase()} {index.modules[m]}</option>)}
        </select>
        {prefs.timer && (
          <span role="timer" aria-label="Time left" className="skyb-chip" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        )}
      </div>
      {over && <p className="skyb-say" role="status" style={{ margin: 0 }}>The five minutes are up. That was only a pace guide. Take the time you need.</p>}
      <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Question {i + 1} of {items.length}</p>
      <h3 style={{ margin: 0, fontSize: 'var(--fs-300)' }}>{q.q}</h3>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }} role="group" aria-label="Answers">
        {q.options.map((o, n) => {
          const state = picked === null ? '' : n === q.answer ? 'right' : n === picked ? 'wrong' : '';
          return (
            <button key={n} type="button" disabled={picked !== null} onClick={() => answer(n)} className={'skyb-opt ' + state}>
              <span>{o}</span>
              {state === 'right' && <span className="skyb-opt-flag"><Icon name="check" /> Right answer</span>}
              {state === 'wrong' && <span className="skyb-opt-flag"><Icon name="cross" /> Your answer</span>}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div aria-live="polite" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <p className="skyb-say" style={{ margin: 0 }}><strong>{picked === q.answer ? 'Yes.' : 'Not quite.'}</strong>{q.why}</p>
          <button type="button" className="skyb-primary" onClick={next} autoFocus>{i + 1 < items.length ? 'Next question' : 'See my result'}</button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- cards */
/** Study cards: up to five due or new cards from lessons already finished, each
 *  graded the same way /review grades them, so this is a real review and counts
 *  as one (5 points once a day, and it keeps a streak). */
export function CardsView({ index, onCheer, onBack }: { index: BuddyIndex; onCheer: Cheer; onBack: () => void }) {
  const [deck, setDeck] = useState<CardDef[] | null>(null);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState(0);
  const [finished, setFinished] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const done = load().completions;
        const mods = [...new Set(index.lessons.filter((l) => done[l.s]).map((l) => l.m))];
        const all: CardDef[] = [];
        for (const m of mods) {
          const { cards } = await loadCards(m);
          for (const c of cards) all.push({ key: c.k, front: c.f, back: c.b, lessonSlug: c.s, lessonTitle: c.t });
        }
        setDeck(sessionCards(all, 5).map((x) => x.def));
      } catch { setErr(true); }
    })();
  }, [index]);

  if (err) return <p>The cards could not be loaded. Check your connection and try again.</p>;
  if (!deck) return <p role="status">Finding your cards…</p>;
  if (deck.length === 0) {
    return (
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <p className="skyb-say" style={{ margin: 0 }}>Nothing is due. Cards appear here a day or more after you finish a lesson, and again as they come due. Finishing a lesson unlocks its cards.</p>
        <a className="skyb-primary" href="/roadmap">Pick a lesson</a>
        <button type="button" className="skyb-row" onClick={onBack} style={{ justifyContent: 'center' }}>Back</button>
      </div>
    );
  }
  if (finished) {
    return (
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <h3 style={{ margin: 0 }}>Cards reviewed.</h3>
        <p className="skyb-say" style={{ margin: 0 }}>You knew {known} of {deck.length}. The others will come round again soon, which is how they stay. Your review for today is recorded.</p>
        <button type="button" className="skyb-row" onClick={onBack} style={{ justifyContent: 'center' }}>Back</button>
      </div>
    );
  }
  const c = deck[i];
  function grade(g: 'again' | 'good') {
    gradeAndSave(c.key, g);
    if (g === 'good') { setKnown((k) => k + 1); addGears(1); }
    setFlip(false);
    if (i + 1 < deck!.length) setI(i + 1);
    else { finishReviewSession(); setFinished(true); onCheer('cards'); }
  }
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Card {i + 1} of {deck.length} · from "{c.lessonTitle}"</p>
      <button type="button" className={'skyb-flip' + (flip ? ' on' : '')} onClick={() => setFlip((f) => !f)} aria-label={flip ? 'Show the question' : 'Show the answer'}>
        <span className="skyb-flip-in">
          <span className="skyb-flip-face">{c.front}</span>
          <span className="skyb-flip-face skyb-flip-back">{c.back}</span>
        </span>
      </button>
      <p style={{ margin: 0, textAlign: 'center', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Tap the card to turn it over</p>
      <div className="skyb-two">
        <button type="button" className="skyb-row" onClick={() => grade('again')} style={{ justifyContent: 'center' }}>Show it again</button>
        <button type="button" className="skyb-primary" onClick={() => grade('good')}>I knew it</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ explore */
export function ExploreView({ index }: { index: BuddyIndex }) {
  const done = load().completions;
  const startedMods = new Set(index.lessons.filter((l) => done[l.s]).map((l) => l.m));
  const fresh = Object.entries(index.modules).filter(([m]) => !startedMods.has(m));
  const [shown] = useState(() => [...fresh].sort(() => Math.random() - 0.5).slice(0, 6));
  const first = (m: string) => index.lessons.find((l) => l.m === m);
  function open(m: string) {
    const st = skyStore() as any;
    const seen: string[] = st.explored ?? [];
    if (!seen.includes(m)) { patchSkyStore({ explored: [...seen, m] } as any); addGears(1); }
  }
  if (shown.length === 0) return <p className="skyb-say" style={{ margin: 0 }}>You have started every module that is live. Reviewing cards is a good use of any spare minutes.</p>;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <p className="skyb-say" style={{ margin: 0 }}>Pick something that sounds interesting. Curiosity counts as studying.</p>
      <ul className="skyb-list">
        {shown.map(([m, title]) => {
          const l = first(m);
          return l ? (
            <li key={m}><a className="skyb-row" href={`/learn/${l.s}`} onClick={() => open(m)}><span>{title}<small>{m.toUpperCase()} · starts with "{l.t}"</small></span><span aria-hidden="true">→</span></a></li>
          ) : null;
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- dailies */
export function DailiesView({ ctx, onBack }: { ctx: Ctx; onBack: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const r = () => force((n) => n + 1);
    window.addEventListener('ol:progress', r);
    return () => window.removeEventListener('ol:progress', r);
  }, []);
  const state = load();
  const today = activityDate(new Date());
  const st = skyStore();
  const goals = dailyGoals(ctx, {
    lesson: state.events.some((e: any) => e.reason === 'lesson_complete' && activityDate(new Date(e.at)) === today),
    cards: state.events.some((e: any) => e.reason === 'review_session' && e.ref === today),
    quiz: st.quiz,
  });
  const chestOpen = (st as any).chest === today;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <h3 style={{ margin: 0, fontSize: 'var(--fs-300)' }}>Today</h3>
      <ul className="skyb-list">
        {goals.goals.map((g: any) => (
          <li key={g.id} className="skyb-row" style={{ cursor: 'default' }}>
            <span style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
              <span aria-hidden="true" style={{ color: g.done ? 'var(--c-progress)' : 'var(--c-ink-soft)' }}><Icon name={g.done ? 'check' : 'star'} /></span>
              {g.label}<span className="sr-only">{g.done ? ' (done)' : ' (not yet)'}</span>
            </span>
            {!g.done && g.href && <a href={g.href}>Go</a>}
          </li>
        ))}
      </ul>
      <p className="skyb-say" style={{ margin: 0 }}>
        {goals.allDone
          ? (chestOpen ? 'All three done, and the chest is open. See you tomorrow.' : 'All three done today. That is a good day.')
          : `${goals.goals.filter((g: any) => g.done).length} of 3 done. Even one counts.`}
      </p>
      {goals.allDone && !chestOpen && (
        <button type="button" className="skyb-primary" onClick={() => { patchSkyStore({ chest: today, stars: skyStore().stars + 3 } as any); window.dispatchEvent(new CustomEvent('sky:cheer', { detail: { kind: 'badge' } })); }}>Open today&rsquo;s chest (3 stars)</button>
      )}
      <h3 style={{ margin: 0, fontSize: 'var(--fs-300)' }}>Milestones</h3>
      <ul className="skyb-list">
        {goals.milestones.map((m: any) => (
          <li key={m.id} className="skyb-row" style={{ cursor: 'default', display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{m.label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.have} / {m.need}</span></span>
            <span className="skyb-meter" role="progressbar" aria-label={m.label} aria-valuemin={0} aria-valuemax={m.need} aria-valuenow={m.have}><i style={{ width: (m.have / m.need) * 100 + '%' }} /></span>
          </li>
        ))}
      </ul>
      <button type="button" className="skyb-row" onClick={onBack} style={{ justifyContent: 'center' }}>Back</button>
    </div>
  );
}

/* ---------------------------------------------------------- the board */
type Row = { rank: number; handle: string; level: number; points: number; streak: number; is_me: boolean; pal?: boolean; lessons?: number; reviews?: number };

/** The board: real learners who chose to be on it, plus practice pals, ranked
 *  together and labelled as what they are. See sky-pals.js for why pals exist and
 *  why they are never passed off as people. */
export function BoardView({ prefs, ctx }: { prefs: SkyPrefs; ctx: Ctx }) {
  const [scope, setScope] = useState<'today' | 'week'>('today');
  const [real, setReal] = useState<Row[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => new Date());
  const latest = useRef(0);

  const refresh = useCallback(async (s: 'today' | 'week') => {
    const ticket = ++latest.current;
    if (!isConfigured) { setSignedIn(false); return; }
    const sb = supabase();
    const { data: { user } } = await sb.auth.getUser();
    if (ticket !== latest.current) return;
    setSignedIn(!!user);
    if (!user) { setReal([]); return; }
    const [{ data: prof }, { data: rows, error }] = await Promise.all([
      sb.from('profiles').select('leaderboard_opt_in').eq('id', user.id).single(),
      sb.rpc('sky_board', { p_scope: s, p_limit: 10 }),
    ]);
    if (ticket !== latest.current) return;
    setOptedIn(prof?.leaderboard_opt_in === true);
    if (error) { setErr('The board could not be loaded just now.'); setReal([]); return; }
    setErr('');
    setReal((rows as Row[]) ?? []);
  }, []);
  useEffect(() => { refresh(scope); setNow(new Date()); }, [scope, refresh]);

  async function toggle(on: boolean) {
    setBusy(true);
    try { const { error } = await supabase().rpc('set_leaderboard_opt_in', { p_on: on }); if (error) throw error; await refresh(scope); }
    catch { setErr('That did not save. Your setting is unchanged.'); }
    finally { setBusy(false); }
  }

  const iso = useMemo(() => new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10), [now]);
  const rows: Row[] = useMemo(
    () => mergeBoard(real, palsFor(iso, scope, now.getHours(), 6), 10) as Row[],
    [real, iso, scope, now],
  );
  const realCount = real.length;
  const pals = rows.filter((r) => r.pal).length;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      {prefs.numbers && (
        <div className="skyb-streakbox">
          <Icon name="flame" size={36} />
          <div>
            <strong style={{ fontSize: 'var(--fs-400)', lineHeight: 1 }}>{ctx.streakDays}</strong>{' '}
            <span>{ctx.goalMode === 'weekly' ? 'week' : 'day'}{ctx.streakDays === 1 ? '' : 's'} in a row</span>
            {ctx.goalMode === 'daily' && ctx.streakDays > 0 && !ctx.doneToday && prefs.streakAlerts && (
              <div style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Keep it going: it ends in {formatLeft(ctx.msLeftToday)}.</div>
            )}
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Board period" className="skyb-tabs">
        {(['today', 'week'] as const).map((s) => (
          <button key={s} role="tab" type="button" aria-selected={scope === s} className={scope === s ? 'on' : ''} onClick={() => setScope(s)}>{s === 'today' ? 'Today' : 'This week'}</button>
        ))}
      </div>

      {err && <p role="alert" style={{ color: 'var(--c-alert)', margin: 0 }}>{err}</p>}

      <ol className="skyb-board" aria-label={scope === 'today' ? 'Today’s board' : 'This week’s board'}>
        {rows.map((r) => (
          <li key={r.handle} className={(r.is_me ? 'me ' : '') + (r.pal ? 'pal' : '')}>
            <span className="skyb-rank">{r.rank === 1 ? <Icon name="trophy" size={18} /> : r.rank}<span className="sr-only">{r.rank === 1 ? 'First place' : `Place ${r.rank}`}</span></span>
            <span style={{ minWidth: 0 }}>
              <span translate="no" style={{ fontWeight: 700 }}>{r.handle}</span>
              {r.is_me && <span className="skyb-tag"> you</span>}
              {r.pal && <span className="skyb-tag skyb-tag--pal"><Icon name="bot" size={14} /> {PAL_LABEL}</span>}
              <small style={{ display: 'block', color: 'var(--c-ink-soft)' }}>Level {r.level}{prefs.numbers && r.streak > 0 ? ` · ${r.streak}-day streak` : ''}</small>
            </span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.points}</strong>
          </li>
        ))}
      </ol>

      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>How the board works</summary>
        <ul style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)', paddingInlineStart: '1.2em', margin: 'var(--sp-2) 0 0', display: 'grid', gap: 4 }}>
          <li>{realCount === 0 ? 'No real learner has joined yet.' : `${plural(realCount, 'real learner is', 'real learners are')} on this board.`} {pals > 0 && PAL_EXPLANATION}</li>
          <li>Real learners appear only if they chose to. Names are generated and cannot be edited, so nobody can publish their own. Only a name, a level and counts show.</li>
          <li>Points come from lessons, quizzes, reviews and a few bonus stars, not from time spent on the site.</li>
          <li>There is no prize. Leaving removes you from every board, past ones too.</li>
        </ul>
      </details>

      {signedIn === false && <p style={{ margin: 0 }}><a className="skyb-primary" href="/account">Sign in to join the board</a></p>}
      {signedIn && !optedIn && (
        <div className="skyb-say" style={{ margin: 0 }}>
          <strong>You are not on the board.</strong>
          Joining shows a generated name, your level and your points to other joined learners. If you are under 18, please ask a parent or guardian first.{' '}
          <a href="/safeguarding">Child safety</a>
          <div style={{ marginTop: 'var(--sp-2)' }}><button type="button" className="skyb-primary" disabled={busy} onClick={() => toggle(true)}>{busy ? 'Joining…' : 'Join the board'}</button></div>
        </div>
      )}
      {signedIn && optedIn && (
        <button type="button" className="skyb-row" disabled={busy} onClick={() => toggle(false)} style={{ justifyContent: 'center' }}>{busy ? 'Leaving…' : 'Leave the board'}</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- badges */
/** Badges, floating. Each one you have earned drifts gently on its own beat, and
 *  when this view opens Sky cheers. Ones you have not earned sit still and say how
 *  they are earned: the criteria are public, so nothing is a surprise to be
 *  chased. The drift is the one slow, small movement Sky is allowed, and it stops
 *  under reduce motion like everything else. */
export function BadgesView({ ctx, onCheer }: { ctx: Ctx; onCheer: Cheer }) {
  const earned = new Set(ctx.badgesEarnedIds as string[]);
  useEffect(() => {
    const seen = new Set(skyStore().seenBadges);
    const fresh = [...earned].filter((b) => !seen.has(b));
    if (fresh.length) { patchSkyStore({ seenBadges: [...earned] }); }
    if (earned.size > 0) onCheer('badge');
  }, []);                                                            // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <p className="skyb-say" style={{ margin: 0 }}>
        {earned.size === 0 ? 'No badges yet. The first one is one lesson away.' : `You have ${plural(earned.size, 'badge', 'badges')}. ${earned.size >= 5 ? 'That is real progress.' : 'A good start.'}`}
      </p>
      <ul className="skyb-badges">
        {BADGES.map((b: any, n: number) => {
          const have = earned.has(b.id);
          return (
            <li key={b.id} className={have ? 'have' : ''} style={{ ['--d' as any]: `${5 + (n % 4)}s`, ['--delay' as any]: `${(n % 5) * 0.4}s` }}>
              <span className="skyb-badge-medal" aria-hidden="true"><Icon name={have ? 'star' : 'gear'} size={22} /></span>
              <span><strong>{b.name}</strong><small style={{ display: 'block', color: 'var(--c-ink-soft)' }}>{b.desc}</small></span>
              <span className="sr-only">{have ? 'Earned' : 'Not yet earned'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
