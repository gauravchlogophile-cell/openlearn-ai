import { useCallback, useEffect, useRef, useState } from 'react';
import { isConfigured, supabase, signedInHint } from '../lib/supabase';
import { skyAudience, leastPermissive } from '../lib/sky-audience.js';
import { SKY_MODE, SKY_LIMITS } from '../lib/sky-config';
import {
  load, goalMode, srsSnapshot, skyPrefs, setSkyPref, SKY_PREF_DEFAULTS, skyStore, patchSkyStore, type SkyPrefs,
} from '../lib/progress-store';
import { companionContext, companionSays, progressFacts, dailyBoost, STREAK_MILESTONES, breaksToneRule } from '../lib/sky-buddy.js';
import { effectiveFx, cheerPlan, pickCheer, playChime, skyChirp, unlockAudio, motionAllowed, FX_LIMITS } from '../lib/sky-fx.js';
import { speakAsSky, stopSky, SKY_SAMPLE } from '../lib/sky-voice.js';
import { groupVoices, labelFor } from '../lib/voices.js';
import { useVoices } from './useVoices';
import { loadIndex, type BuddyIndex } from '../lib/sky-data';
import { useDrag } from './sky/useDrag';
import SkyStage, { type StageHandle } from './sky/SkyStage';
import { Hud, QuizView, CardsView, ExploreView, DailiesView, BoardView, BadgesView, type Cheer } from './sky/SkyViews';

/** Sky — the study buddy, on every page.
 *
 *  Two things share this button and they are deliberately different in kind.
 *
 *    The COMPANION is for everyone and costs nothing. It greets, suggests one
 *    next step with how long it takes, runs a quick quiz and a card review, shows
 *    the daily goals, the badges and the board, and cheers when you finish
 *    something. It reads what is already in this browser. Apart from the opt-in
 *    board it sends nothing anywhere.
 *
 *    The ASSISTANT answers questions from Lrnon's pages. It sends the question to
 *    an outside provider, costs money, and is only offered to the audience its
 *    rollout stage allows. Everyone else sees the row for it, with the honest
 *    reason it is closed, instead of a button that would answer 503.
 *
 *  Opening Sky earns nothing. Points come from learning, in progress-core; the
 *  views here call the same functions the lesson and review pages call, for the
 *  same few events, with the same once-a-day limits. scripts/test-sky-buddy.mjs
 *  holds the lines.
 */

type Source = { label: string; href: string };
type Ask =
  | { k: 'idle' } | { k: 'working' } | { k: 'slow' }
  | { k: 'answer'; text: string; sources: Source[] }
  | { k: 'out_of_scope'; title: string; message: string; handoff: Source[] }
  | { k: 'unavailable'; message: string; diagnostic?: Record<string, string> };

type View = 'home' | 'ask' | 'you' | 'quiz' | 'cards' | 'explore' | 'dailies' | 'board' | 'badges' | 'settings';
interface Props { intro: string; disclaimer: string; suggestions: string[]; }

const HIDDEN_ON = [/^\/admin(\/|$)/, /^\/certification(\/|$)/];

export default function SkyBuddy({ intro, disclaimer, suggestions }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('home');
  const [hidden, setHidden] = useState(false);
  const [prefs, setPrefs] = useState<SkyPrefs>({ ...SKY_PREF_DEFAULTS });
  const [index, setIndex] = useState<BuddyIndex | null>(null);
  const [tick, setTick] = useState(0);
  const [nudgeGone, setNudgeGone] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mayAsk, setMayAsk] = useState(false);
  const [reduce, setReduce] = useState(true);       // assume calm until the page says otherwise
  const [cheer, setCheer] = useState<{ id: number; text: string } | null>(null);
  const [fxRun, setFxRun] = useState<{ id: number; glow: boolean; flashes: number } | null>(null);
  const [boost, setBoost] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<Ask>({ k: 'idle' });
  const [playing, setPlaying] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stage = useRef<StageHandle>(null);
  const slowTimer = useRef<number | undefined>(undefined);
  const snap = useRef<{ xp: number; level: number; badges: number; streak: number; lessons: number } | null>(null);

  const voices = useVoices();
  const commitPos = useCallback((p: SkyPrefs['pos']) => { setSkyPref('pos', p); }, []);
  const drag = useDrag(boxRef, fabRef, prefs.pos, commitPos, !hidden);

  /* ---- let sound start: the browser needs one touch first (see sky-fx.js) ---- */
  useEffect(() => { unlockAudio(); }, []);

  /* ---- where we are, and what the reader has chosen ------------------ */
  useEffect(() => {
    setHidden(HIDDEN_ON.some((re) => re.test(location.pathname)));
    setPrefs(skyPrefs());
    try { setNudgeGone(sessionStorage.getItem('skyb.nudge') === 'gone'); } catch { /* private mode */ }
    const calc = () => setReduce(!motionAllowed(document.documentElement, matchMedia));
    calc();
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener?.('change', calc);
    const again = () => { setPrefs(skyPrefs()); setTick((t) => t + 1); calc(); };
    window.addEventListener('ol:progress', again);
    return () => { window.removeEventListener('ol:progress', again); mq.removeEventListener?.('change', calc); };
  }, []);

  const fx = effectiveFx(prefs.fx, { reduceMotion: reduce });

  /* ---- the lesson index: small, fetched once the page is idle ---------- */
  useEffect(() => {
    let alive = true;
    const go = async () => { try { const i = await loadIndex(); if (alive) setIndex(i); } catch { /* offline: Sky still greets */ } };
    const w = window as any;
    const h = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500);
    return () => { alive = false; w.cancelIdleCallback ? w.cancelIdleCallback(h) : clearTimeout(h); };
  }, []);

  /* ---- may this viewer use the ASSISTANT? ---------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (SKY_MODE === 'everyone') { if (alive) setMayAsk(true); return; }
      if (SKY_MODE === 'off' || !isConfigured) return;
      /* Most visitors are not signed in. Asking the database anything on every page
         for them (the rollout log, three role checks) cost a second of network
         for an answer that cannot be "yes": the staff and slice audiences both
         need a person. So the cheap local check comes first. */
      if (!signedInHint() && !skyAudience(SKY_MODE, { userId: null, isStaff: false }, SKY_LIMITS.slicePercent).allowed) return;
      try {
        const { data } = await supabase().auth.getUser();
        const id = data.user?.id ?? null;
        let isStaff = false;
        if (id) {
          const [{ data: o }, { data: a }, { data: s }] = await Promise.all([
            supabase().rpc('is_owner'),
            supabase().rpc('has_role', { wanted: 'admin' }),
            supabase().rpc('has_role', { wanted: 'sub_admin' }),
          ]);
          isStaff = Boolean(o) || Boolean(a) || Boolean(s);
        }
        let recorded: string | null = null;
        const { data: row } = await supabase().from('sky_rollout_log').select('mode').order('at', { ascending: false }).limit(1);
        if (Array.isArray(row) && row[0]?.mode) recorded = row[0].mode as string;
        const live = leastPermissive(SKY_MODE, recorded);
        const v = skyAudience(live, { userId: id, isStaff }, SKY_LIMITS.slicePercent);
        if (alive) setMayAsk(v.allowed);
      } catch { /* stays closed, which is the safe direction */ }
    })();
    return () => { alive = false; };
  }, []);

  /* ---- Escape closes; focus moves in on open and back out on close ----- */
  useEffect(() => {
    if (!open) return;
    (view === 'ask' ? inputRef.current : headRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, view]);                                              // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- what Sky says: derived from real progress, never invented ------- */
  const ctx = index ? companionContext(index, load(), srsSnapshot(), new Date(), goalMode()) : null;
  void tick;
  const says = ctx ? companionSays(ctx, { numbers: prefs.numbers, streakAlerts: prefs.streakAlerts }) : null;
  if (import.meta.env.DEV && says) {
    const bad = breaksToneRule([says.hello, says.say, says.why, says.step?.label].join(' '));
    if (bad) console.error(`Sky said something that breaks the tone rule ("${bad}"):`, says);
  }
  const facts = ctx ? progressFacts(ctx) : null;

  /* ---- cheers: glow, a brief flash, a chime, and a line of words ------ */
  const doCheer: Cheer = useCallback((kind) => {
    const plan = cheerPlan(kind, fx, prefs.sound);
    const id = Date.now();
    setCheer({ id, text: pickCheer(kind, id) });
    setNudgeGone(false);
    if (plan.glow || plan.flashes) setFxRun({ id, glow: plan.glow, flashes: plan.flashes });
    /* Sound: when Sky may speak, it says the line in its own voice, opened by its chirp;
       when it may not (voice off, nothing to speak with, or a lesson is being read
       aloud), the chime stands in. Never both at once, which would be a din. */
    if (prefs.voice) {
      void speakAsSky(pickCheer(kind, id), { voices, chosen: prefs.voiceName, id: String(kind), chirp: prefs.sound ? skyChirp : undefined })
        .then((said) => { if (!said && prefs.sound) playChime(kind); });
    } else if (plan.chime) playChime(kind);
    window.setTimeout(() => setFxRun((r) => (r && r.id === id ? null : r)), FX_LIMITS.flashMs * Math.max(1, plan.flashes) + 400);
  }, [fx, prefs.sound, prefs.voice, prefs.voiceName, voices]);

  useEffect(() => {
    const on = (e: Event) => doCheer(((e as CustomEvent).detail?.kind ?? 'star') as any);
    window.addEventListener('sky:cheer', on);
    return () => window.removeEventListener('sky:cheer', on);
  }, [doCheer]);

  /* Cheer when something real happened: a lesson finished, a level reached, a
     badge earned, a streak milestone. A big jump at once (a sync from another
     device) is not an event to cheer, so it is skipped. */
  useEffect(() => {
    if (!ctx) return;
    const now = { xp: ctx.xp, level: ctx.level, badges: ctx.badgesEarned, streak: ctx.streakDays, lessons: ctx.lessonsDone };
    const was = snap.current;
    snap.current = now;
    if (!was) return;
    if (now.lessons - was.lessons > 1 || now.xp - was.xp > 120) return;
    if (now.level > was.level) doCheer('level');
    else if (now.badges > was.badges) doCheer('badge');
    else if (now.streak > was.streak && STREAK_MILESTONES.includes(now.streak)) doCheer('streak');
    else if (now.lessons > was.lessons) doCheer('lesson');
  }, [ctx?.xp, ctx?.level, ctx?.badgesEarned, ctx?.streakDays, ctx?.lessonsDone]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden) return null;

  /* ---- actions ----------------------------------------------------- */
  function openPanel(v: View = 'home') {
    setView(v); setOpen(true);
    const day = new Date().toISOString().slice(0, 10);
    if (skyStore().boost !== day) {            // the daily boost: once a day, earns nothing
      patchSkyStore({ boost: day });
      setBoost(dailyBoost(day));
      doCheer('open' as any);
    }
  }
  function close() { setOpen(false); setView('home'); stopSpeaking(); setAsk({ k: 'idle' }); setQ(''); setBoost(null); fabRef.current?.focus(); }
  function dismissNudge() { setNudgeGone(true); setCheer(null); try { sessionStorage.setItem('skyb.nudge', 'gone'); } catch { /* fine */ } }

  /** Read a message aloud in Sky's voice. Asked for, so it may replace what is playing. */
  function speak(text: string) {
    if (speaking) { stopSpeaking(); return; }
    setSpeaking(true);
    void speakAsSky(text, { voices, chosen: prefs.voiceName, lang: document.documentElement.lang || 'en', force: true, chirp: prefs.sound ? skyChirp : undefined, onend: () => setSpeaking(false) })
      .then((said) => { if (!said) setSpeaking(false); });
  }
  function stopSpeaking() { stopSky(); setSpeaking(false); }
  const soundOn = prefs.sound || prefs.voice;
  function toggleSound() {
    const next = !soundOn;
    setSkyPref('sound', next); setSkyPref('voice', next); setPrefs(skyPrefs());
    if (next) { unlockAudio(); window.setTimeout(skyChirp, 60); } else stopSpeaking();
  }
  function hearSky() { stopSpeaking(); speak(SKY_SAMPLE); }

  async function sendQuestion(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ(''); setAsk({ k: 'working' });
    slowTimer.current = window.setTimeout(() => setAsk((s) => (s.k === 'working' ? { k: 'slow' } : s)), 6000);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (isConfigured) {
        try {
          const { data } = await supabase().auth.getSession();
          const token = data.session?.access_token;
          if (token) headers.authorization = `Bearer ${token}`;
        } catch { /* anonymous is a valid state, not an error */ }
      }
      const res = await fetch('/api/sky', { method: 'POST', headers, body: JSON.stringify({ q: text, page: location.pathname }) });
      const data = await res.json();
      window.clearTimeout(slowTimer.current);
      if (data.verdict === 'out_of_scope') setAsk({ k: 'out_of_scope', title: data.title, message: data.message, handoff: data.handoff ?? [] });
      else if (res.ok && data.answer) setAsk({ k: 'answer', text: data.answer, sources: data.sources ?? [] });
      else setAsk({ k: 'unavailable', message: data.message ?? 'Sky is unavailable right now.', diagnostic: data.diagnostic });
    } catch {
      window.clearTimeout(slowTimer.current);
      setAsk({ k: 'unavailable', message: 'Sky could not be reached. Your connection may be offline.' });
    }
  }

  /* ---- layout: which side the panel opens towards ---------------------- */
  const right = (drag.pos?.x ?? 1) > 0.5;
  const low = (drag.pos?.y ?? 1) > 0.4;
  const showNudge = !open && (cheer || (prefs.nudges && !nudgeGone && says && says.step && ctx));
  const title: Record<View, string> = {
    home: 'Your study buddy', ask: 'Ask a question', you: 'Your progress', quiz: '5-minute quiz', cards: 'Study cards',
    explore: 'Explore a new topic', dailies: 'Dailies and milestones', board: 'Streak and board', badges: 'Your badges', settings: 'How Sky behaves',
  };
  const back = () => setView('home');
  const row = (label: string, hint: string, v: View) => (
    <li><button type="button" className="skyb-row" onClick={() => setView(v)}><span>{label}<small>{hint}</small></span><span aria-hidden="true">→</span></button></li>
  );

  return (
    <div ref={boxRef} className={['skyb', open ? 'skyb--open' : '', right ? 'skyb--r' : 'skyb--l', low ? 'skyb--low' : 'skyb--high', drag.dragging ? 'is-dragging' : ''].join(' ')}
      style={drag.style()} data-fx={fx}>

      {showNudge && (
        <div className="skyb-nudge-wrap">
          <button type="button" className="skyb-nudge" onClick={() => openPanel('home')}>
            {cheer ? <strong>{cheer.text}</strong> : (<><strong>{says!.step!.label}</strong>{says!.why && <span style={{ display: 'block', color: 'var(--c-ink-soft)' }}>{says!.why}</span>}</>)}
          </button>
          <button type="button" className="skyb-x" onClick={dismissNudge} aria-label="Dismiss this message">✕</button>
        </div>
      )}

      {open && (
        <div role="dialog" aria-label="Sky, your study buddy" aria-modal="false" className="skyb-panel">
          <div className="skyb-head">
            {view !== 'home' && <button type="button" className="skyb-iconbtn" onClick={back} aria-label="Back to Sky's menu">←</button>}
            <span className="skyb-av" aria-hidden="true"><img src="/sky/sky-face-sm.webp" alt="" width="48" height="48" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 ref={headRef} tabIndex={-1}>Sky</h2>
              <p>{title[view]}</p>
            </div>
            <button type="button" className="skyb-iconbtn" onClick={toggleSound} aria-pressed={soundOn}
              aria-label={soundOn ? 'Sky sound is on. Turn it off.' : 'Sky sound is off. Turn it on.'}>
              <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
            </button>
            <button type="button" className="skyb-iconbtn" onClick={close} aria-label="Close Sky">✕</button>
          </div>

          <div className="skyb-body" aria-live="polite">
            {ctx && view !== 'settings' && view !== 'ask' && <Hud ctx={ctx} prefs={prefs} />}

            {/* ------------------------------------------------ home */}
            {view === 'home' && (
              <>
                {boost && <p className="skyb-say" style={{ margin: 0 }}><strong>Today&apos;s boost</strong>{boost}</p>}
                <div className={'skyb-hero' + (playing ? ' is-playing' : '')}>
                  <button type="button" onClick={() => (playing ? stage.current?.stop() : stage.current?.play())}
                    aria-label={playing ? 'Stop Sky\'s animation' : 'Play Sky\'s welcome animation'} className="skyb-herobtn">
                    <SkyStage ref={stage} onPlaying={setPlaying} width={112} height={123} label="Sky, a friendly green owl-shaped robot, waving." floating={false} />
                  </button>
                  <p className="skyb-say" style={{ flex: '1 1 200px', margin: 0 }}>
                    {says ? (<><strong>{says.hello}</strong>{says.say}</>) : (<>{intro.split('.')[0]}.</>)}
                  </p>
                </div>

                {says?.step && (
                  <div>
                    <a className="skyb-primary" href={says.step.href}>{says.step.label}</a>
                    {says.why && <p className="skyb-why">{says.why}</p>}
                  </div>
                )}

                <div className="skyb-chips" role="group" aria-label="Quick choices">
                  <button type="button" className="skyb-choice" onClick={() => setView('quiz')}>Quiz Me! <span aria-hidden="true">📝</span></button>
                  <button type="button" className="skyb-choice" onClick={() => setView('cards')}>Study Cards <span aria-hidden="true">🃏</span></button>
                  <button type="button" className="skyb-choice" onClick={() => setView('explore')}>Explore New Topic <span aria-hidden="true">🚀</span></button>
                </div>

                {says && 'speechSynthesis' in window && (
                  <button type="button" className="skyb-row" onClick={() => speak(`${says.hello}. ${says.say}`)} aria-pressed={speaking}>
                    <span>{speaking ? 'Stop' : 'Hear Sky say this'}<small>In Sky&apos;s voice. You can choose it in Sky settings.</small></span>
                  </button>
                )}

                <ul className="skyb-list">
                  {row('Start 5-Minute Quiz', 'Five questions, with a pace guide you can turn off', 'quiz')}
                  {row('Streak Status & Leaderboard', ctx && prefs.numbers ? `${ctx.streakDays}-day streak · Level ${ctx.level}` : 'Your streak and the optional board', 'board')}
                  <li>
                    {mayAsk ? (
                      <button type="button" className="skyb-row" onClick={() => setView('ask')}>
                        <span>Ask a Question<small>Answers come from Lrnon&apos;s own pages.</small></span><span aria-hidden="true">→</span>
                      </button>
                    ) : (
                      <div className="skyb-row" aria-disabled="true">
                        <span>Ask a Question<small>Not open to everyone yet. It is being checked by the Lrnon team first. For now, search the page or <a href="/feedback">ask a person</a>.</small></span>
                      </div>
                    )}
                  </li>
                  {row('Dailies & Milestones', 'Today\'s goals and the next milestones', 'dailies')}
                  {row('My badges', ctx ? `${ctx.badgesEarned} of ${ctx.badgesTotal} earned` : 'Floating, when earned', 'badges')}
                  {row('My progress', 'Lessons, streak, level', 'you')}
                  {row('Sky settings', 'Reactions, sound, timer, moving Sky', 'settings')}
                </ul>
              </>
            )}

            {view === 'quiz' && (index && ctx ? <QuizView index={index} ctx={ctx} prefs={prefs} onCheer={doCheer} onBack={back} /> : <p role="status">Loading…</p>)}
            {view === 'cards' && (index ? <CardsView index={index} onCheer={doCheer} onBack={back} /> : <p role="status">Loading…</p>)}
            {view === 'explore' && (index ? <ExploreView index={index} /> : <p role="status">Loading…</p>)}
            {view === 'dailies' && (ctx ? <DailiesView ctx={ctx} onBack={back} /> : <p role="status">Loading…</p>)}
            {view === 'board' && (ctx ? <BoardView prefs={prefs} ctx={ctx} /> : <p role="status">Loading…</p>)}
            {view === 'badges' && (ctx ? <BadgesView ctx={ctx} onCheer={doCheer} /> : <p role="status">Loading…</p>)}

            {/* ------------------------------------------------ progress */}
            {view === 'you' && (facts ? (
              <>
                <dl className="skyb-facts">
                  {facts.rows.filter((r: any) => prefs.numbers || r.k === 'Lessons finished' || r.k === 'Badges')
                    .map((r: any) => (<div key={r.k} style={{ display: 'contents' }}><dt>{r.k}</dt><dd>{r.v}</dd></div>))}
                </dl>
                {facts.nextBadge && <p className="skyb-say" style={{ margin: 0 }}><strong>Next badge: {facts.nextBadge.name}</strong>{facts.nextBadge.desc}</p>}
                <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>{facts.note}</p>
                <ul className="skyb-list">
                  <li><a className="skyb-row" href="/home"><span>Your dashboard</span><span aria-hidden="true">→</span></a></li>
                  <li><a className="skyb-row" href="/achievements"><span>All badges</span><span aria-hidden="true">→</span></a></li>
                </ul>
              </>
            ) : <p role="status">Loading…</p>)}

            {/* ------------------------------------------------ settings */}
            {view === 'settings' && (
              <>
                {([
                  ['nudges', 'Suggestions', 'Sky offers a next step when a page opens. Off means Sky waits until you open it.'],
                  ['numbers', 'Streaks and levels', 'Show day counts and levels. Off hides every number, and streak alerts with them.'],
                  ['streakAlerts', 'Streak alerts', 'Say when a streak is about to end or has ended.'],
                  ['timer', 'Quiz timer', 'A five-minute pace guide on the quick quiz. It never cuts you off.'],
                  ['sound', 'Sounds', 'A short soft chime and Sky\'s chirp when something good happens. On an iPhone the silent switch on the side also silences Sky.'],
                  ['voice', 'Sky speaks', 'Sky says its cheers aloud, in its own voice. It never talks over a lesson being read aloud.'],
                  ['small', 'Small Sky', 'Show Sky as a small round button without its name.'],
                ] as [keyof SkyPrefs, string, string][]).map(([key, label, hint]) => (
                  <div className="skyb-switch" key={key}>
                    <p>{label}<small>{hint}</small></p>
                    <button type="button" className="skyb-toggle" aria-pressed={prefs[key] as boolean}
                      aria-label={`${label}: ${prefs[key] ? 'on' : 'off'}`}
                      onClick={() => { setSkyPref(key as any, !prefs[key] as any); setPrefs(skyPrefs()); }}>{prefs[key] ? 'On' : 'Off'}</button>
                  </div>
                ))}

                <fieldset className="skyb-fieldset">
                  <legend>Sky&apos;s reactions</legend>
                  {([
                    ['calm', 'Calm', 'Nothing moves or lights up.'],
                    ['gentle', 'Gentle', 'A soft glow for a moment when you finish something. No flashing.'],
                    ['lively', 'Lively', 'The glow, plus one or two brief, soft flashes of Sky\'s button. Please do not choose this if flashing lights bother you.'],
                  ] as [SkyPrefs['fx'], string, string][]).map(([v, label, hint]) => (
                    <label key={v} className="skyb-radio">
                      <input type="radio" name="skyfx" checked={prefs.fx === v} onChange={() => { setSkyPref('fx', v); setPrefs(skyPrefs()); }} />
                      <span><strong>{label}</strong><small>{hint}</small></span>
                    </label>
                  ))}
                  {reduce && <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Your device or Lrnon is set to reduce motion, so Sky stays calm whatever you choose here.</p>}
                </fieldset>

                <fieldset className="skyb-fieldset">
                  <legend>Sky&apos;s voice</legend>
                  <label htmlFor="skyb-voice">Which voice Sky borrows from your device</label>
                  {(() => { const g = groupVoices(voices); return (
                    <select id="skyb-voice" className="skyb-input" value={prefs.voiceName} onChange={(e) => { setSkyPref('voiceName', e.currentTarget.value); setPrefs(skyPrefs()); }}>
                      <option value="">Sky chooses (recommended)</option>
                      {g.indian.length > 0 && <optgroup label="Indian voices">{g.indian.map((v) => <option key={v.voiceURI} value={v.name}>{labelFor(v)}</option>)}</optgroup>}
                      {g.global.length > 0 && <optgroup label="Global voices">{g.global.map((v) => <option key={v.voiceURI} value={v.name}>{labelFor(v)}</option>)}</optgroup>}
                    </select>); })()}
                  <button type="button" className="skyb-row" onClick={hearSky} style={{ justifyContent: 'center' }}>{speaking ? 'Stop' : 'Hear Sky'}</button>
                  <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
                    Sky tunes the voice a little brighter and opens with its chirp, so it sounds like Sky. A recorded voice for Sky is planned; until then it borrows one of yours.
                  </p>
                </fieldset>

                <fieldset className="skyb-fieldset">
                  <legend>Move Sky</legend>
                  <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Drag Sky&apos;s button anywhere, or press Shift and an arrow key while it has focus, or pick a corner.</p>
                  <div className="skyb-corners">
                    <button type="button" className="skyb-row" onClick={() => drag.toCorner('tl')}>Top left</button>
                    <button type="button" className="skyb-row" onClick={() => drag.toCorner('tr')}>Top right</button>
                    <button type="button" className="skyb-row" onClick={() => drag.toCorner('bl')}>Bottom left</button>
                    <button type="button" className="skyb-row" onClick={() => drag.toCorner('br')}>Bottom right</button>
                  </div>
                  <button type="button" className="skyb-row" onClick={drag.reset} style={{ justifyContent: 'center' }}>Put Sky back</button>
                </fieldset>

                <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
                  Movement also follows your device and the Accessibility button at the top of every page. Sky never asks for money.
                </p>
                <ul className="skyb-list"><li><a className="skyb-row" href="/reading"><span>Reading and accessibility settings</span><span aria-hidden="true">→</span></a></li></ul>
              </>
            )}

            {/* ------------------------------------------------ ask */}
            {view === 'ask' && (
              <>
                {ask.k === 'idle' && (<>
                  <p className="skyb-say" style={{ margin: 0 }}>{intro}</p>
                  <p style={{ margin: 0, fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Try one</p>
                  <ul className="skyb-list">{suggestions.map((s) => (<li key={s}><button type="button" className="skyb-row" onClick={() => sendQuestion(s)}>{s}</button></li>))}</ul>
                </>)}
                {(ask.k === 'working' || ask.k === 'slow') && <p style={{ margin: 0, color: 'var(--c-ink-soft)' }}>{ask.k === 'working' ? 'Reading Lrnon…' : 'Taking longer than usual. Still working. You can keep reading.'}</p>}
                {ask.k === 'answer' && (<>
                  <p className="skyb-say" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ask.text}</p>
                  {ask.sources.length > 0 && (<>
                    <p style={{ margin: 0, fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Read from</p>
                    <ul style={{ margin: 0, paddingInlineStart: 'var(--sp-6)' }}>{ask.sources.map((s) => <li key={s.href}><a href={s.href}>{s.label}</a></li>)}</ul>
                  </>)}
                </>)}
                {ask.k === 'out_of_scope' && (
                  <div className="note note--try">
                    <p style={{ marginTop: 0, fontWeight: 700 }}>{ask.title}</p>
                    <p style={{ color: 'var(--c-ink-soft)' }}>{ask.message}</p>
                    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>{ask.handoff.map((h) => <a key={h.href} className="skyb-row" href={h.href}>{h.label}</a>)}</div>
                    <p style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)', marginBottom: 0 }}>Handing off copies only this question, not the rest of your chat.</p>
                  </div>
                )}
                {ask.k === 'unavailable' && (
                  <div className="note note--aim">
                    <p style={{ marginTop: 0 }}>{ask.message}</p>
                    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}><a className="skyb-row" href="/roadmap">Browse the roadmap</a><a className="skyb-row" href="/feedback">Ask a person</a></div>
                    {ask.diagnostic && (
                      <details style={{ marginTop: 'var(--sp-3)' }}>
                        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Technical detail</summary>
                        <dl style={{ margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-100)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--c-ink-soft)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px var(--sp-3)' }}>
                          {Object.entries(ask.diagnostic).map(([k, v]) => (<div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd style={{ margin: 0, wordBreak: 'break-word' }}>{String(v)}</dd></div>))}
                        </dl>
                      </details>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {view === 'ask' && (<>
            <form onSubmit={(e) => { e.preventDefault(); sendQuestion(q); }} style={{ display: 'flex', gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)' }}>
              <label htmlFor="skyb-q" className="sr-only">Ask about this page</label>
              <input id="skyb-q" ref={inputRef} className="skyb-input" value={q} maxLength={500} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Ask about this page…" />
              <button type="submit" className="skyb-iconbtn" disabled={!q.trim()} aria-label="Send question">↑</button>
            </form>
            <p className="skyb-foot">{disclaimer}</p>
          </>)}
        </div>
      )}

      <button ref={fabRef} type="button"
        className={'skyb-fab' + (prefs.small ? ' skyb-fab--small' : '') + (fxRun?.glow ? ' is-glowing' : '') + (fxRun && fxRun.flashes > 0 ? ' is-flashing' : '')}
        {...drag.handlers}
        onClick={() => { if (drag.justDragged()) return; if (open) close(); else openPanel('home'); }}
        aria-expanded={open}
        aria-label={open ? 'Close Sky, your study buddy' : 'Open Sky, your study buddy. Drag, or press Shift and an arrow key, to move it.'}>
        <span className="skyb-av"><img src="/sky/sky-face-sm.webp" alt="" width="48" height="48" draggable={false} /></span>
        {!prefs.small && <span>Sky</span>}
      </button>
    </div>
  );
}
