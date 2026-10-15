import { useEffect, useRef, useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { skyAudience, leastPermissive } from '../lib/sky-audience.js';
import { SKY_MODE, SKY_LIMITS } from '../lib/sky-config';
import {
  load, goalMode, srsSnapshot, skyPrefs, setSkyPref, SKY_PREF_DEFAULTS, type SkyPrefs,
} from '../lib/progress-store';
import { companionContext, companionSays, progressFacts, breaksToneRule } from '../lib/sky-buddy.js';

/** Sky — the study buddy, on every page.
 *
 *  Two things share this button and they are deliberately different in kind.
 *
 *    The COMPANION is for everyone and costs nothing. It greets, suggests one
 *    next step with how long it takes, and shows progress. It reads what is
 *    already in this browser and sends nothing anywhere.
 *
 *    The ASSISTANT answers questions from Lrnon's pages. It sends the question
 *    to an outside provider, costs money, and is only offered to the audience
 *    its rollout stage allows. Everyone else sees the row for it, with the
 *    honest reason it is closed, instead of a button that would answer 503.
 *
 *  This component never awards anything. XP, streaks and badges come from
 *  finishing lessons, passing quizzes and reviewing cards, elsewhere. Opening
 *  Sky earns nothing, so there is nothing here to farm. scripts/test-sky-buddy.mjs
 *  holds that line.
 */

type Source = { label: string; href: string };
type Ask =
  | { k: 'idle' }
  | { k: 'working' }
  | { k: 'slow' }
  | { k: 'answer'; text: string; sources: Source[] }
  | { k: 'out_of_scope'; title: string; message: string; handoff: Source[] }
  | { k: 'unavailable'; message: string; diagnostic?: Record<string, string> };

type View = 'home' | 'ask' | 'you' | 'settings';

interface Props { intro: string; disclaimer: string; suggestions: string[]; }

/* Where Sky stays out of the way: the admin console has its own tools, and a
   companion has no business next to an assessment being sat for credit. */
const HIDDEN_ON = [/^\/admin(\/|$)/, /^\/certification(\/|$)/];

/** Whether the optional wave clip may play right now. Every condition is a
 *  reason someone might not want it, so they all have to be absent:
 *    · their device or Lrnon is set to reduce motion
 *    · data-saver is on (the clip is 260 KB and is not downloaded until asked)
 *    · the browser cannot show a transparent video (Safari and iOS browsers) */
function mayPlayClip(): boolean {
  const root = document.documentElement;
  if (root.getAttribute('data-motion') === 'reduce') return false;
  if (root.getAttribute('data-saver') === 'on') return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|CriOS|FxiOS/.test(ua)) return false;
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/.test(ua)) return false;
  return true;
}

export default function SkyBuddy({ intro, disclaimer, suggestions }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('home');
  const [hidden, setHidden] = useState(false);
  const [prefs, setPrefs] = useState<SkyPrefs>({ ...SKY_PREF_DEFAULTS });
  const [index, setIndex] = useState<any>(null);
  const [tick, setTick] = useState(0);                      // bumps when progress changes
  const [nudgeGone, setNudgeGone] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mayAsk, setMayAsk] = useState(false);

  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<Ask>({ k: 'idle' });

  const fabRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const slowTimer = useRef<number | undefined>(undefined);

  /* ---- where we are, and what the reader has chosen ------------------ */
  useEffect(() => {
    setHidden(HIDDEN_ON.some((re) => re.test(location.pathname)));
    setPrefs(skyPrefs());
    try { setNudgeGone(sessionStorage.getItem('skyb.nudge') === 'gone'); } catch { /* private mode */ }
    const again = () => { setPrefs(skyPrefs()); setTick((t) => t + 1); };
    window.addEventListener('ol:progress', again);
    return () => window.removeEventListener('ol:progress', again);
  }, []);

  /* ---- the lesson index: small, fetched once the page is idle ---------- */
  useEffect(() => {
    let alive = true;
    const go = async () => {
      try {
        const r = await fetch('/buddy-index.json');
        if (r.ok && alive) setIndex(await r.json());
      } catch { /* offline or not built: Sky still greets, it just has less to say */ }
    };
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
        /* The route decides on the STRICTER of the deployed ceiling and the
           rollout row, so this must too. sky_rollout_log is admin-only by RLS:
           the read works for staff and returns nothing for a learner, which is
           the safe direction — a learner is only ever admitted by 'everyone'. */
        let recorded: string | null = null;
        const { data: row } = await supabase()
          .from('sky_rollout_log').select('mode').order('at', { ascending: false }).limit(1);
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
  }, [open, view]);

  /* ---- what Sky says: derived from real progress, never invented ------- */
  const ctx = index ? companionContext(index, load(), srsSnapshot(), new Date(), goalMode()) : null;
  void tick;
  const says = ctx ? companionSays(ctx, { numbers: prefs.numbers }) : null;
  if (import.meta.env.DEV && says) {
    const bad = breaksToneRule([says.hello, says.say, says.why, says.step?.label].join(' '));
    if (bad) console.error(`Sky said something that breaks the tone rule ("${bad}"):`, says);
  }
  const facts = ctx ? progressFacts(ctx) : null;

  if (hidden) return null;

  /* ---- actions ----------------------------------------------------- */
  function close() {
    setOpen(false);
    setView('home');
    stopSpeaking();
    setAsk({ k: 'idle' });
    setQ('');
    fabRef.current?.focus();
  }

  function dismissNudge() {
    setNudgeGone(true);
    try { sessionStorage.setItem('skyb.nudge', 'gone'); } catch { /* fine */ }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    if (speaking) { stopSpeaking(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = document.documentElement.lang || 'en';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }
  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function wave() {
    const v = clipRef.current;
    if (!v || playing || !mayPlayClip()) return;
    if (!v.getAttribute('src')) v.setAttribute('src', '/sky/sky-wave.webm');     // downloaded only now
    setPlaying(true);
    const done = () => { setPlaying(false); v.removeEventListener('ended', done); };
    v.addEventListener('ended', done);
    v.currentTime = 0;
    v.play().catch(done);
  }

  async function sendQuestion(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ('');
    setAsk({ k: 'working' });
    slowTimer.current = window.setTimeout(() => setAsk((s) => (s.k === 'working' ? { k: 'slow' } : s)), 6000);
    try {
      /* The access token identifies the asker so the route can apply the
         rollout stage. It is NOT trusted here: the route hands it to PostgREST,
         which verifies the signature before any role check runs. */
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
      if (data.verdict === 'out_of_scope') {
        setAsk({ k: 'out_of_scope', title: data.title, message: data.message, handoff: data.handoff ?? [] });
      } else if (res.ok && data.answer) {
        setAsk({ k: 'answer', text: data.answer, sources: data.sources ?? [] });
      } else {
        setAsk({ k: 'unavailable', message: data.message ?? 'Sky is unavailable right now.', diagnostic: data.diagnostic });
      }
    } catch {
      window.clearTimeout(slowTimer.current);
      setAsk({ k: 'unavailable', message: 'Sky could not be reached. Your connection may be offline.' });
    }
  }

  const showNudge = !open && prefs.nudges && !nudgeGone && says && says.step && ctx;
  const sub: Record<View, string> = {
    home: 'Your study buddy', ask: 'Ask a question', you: 'Your progress', settings: 'How Sky behaves',
  };

  return (
    <div className={'skyb' + (open ? ' skyb--open' : '')}>
      {showNudge && says && (
        <div className="skyb-nudge-wrap" style={{ position: 'relative' }}>
          <button type="button" className="skyb-nudge" onClick={() => setOpen(true)}>
            <strong>{says.step!.label}</strong>
            {says.why && <span style={{ display: 'block', color: 'var(--c-ink-soft)' }}>{says.why}</span>}
          </button>
          <button type="button" className="skyb-x" onClick={dismissNudge} aria-label="Dismiss this suggestion">✕</button>
        </div>
      )}

      {open && (
        <div role="dialog" aria-label="Sky, your study buddy" aria-modal="false" className="skyb-panel">
          <div className="skyb-head">
            {view !== 'home' && (
              <button type="button" className="skyb-iconbtn" onClick={() => setView('home')} aria-label="Back to Sky's menu">←</button>
            )}
            <span className="skyb-av" aria-hidden="true"><img src="/sky/sky-face.webp" alt="" width="48" height="48" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 ref={headRef} tabIndex={-1}>Sky</h2>
              <p>{sub[view]}</p>
            </div>
            <button type="button" className="skyb-iconbtn" onClick={close} aria-label="Close Sky">✕</button>
          </div>

          <div className="skyb-body" aria-live="polite">
            {/* ------------------------------------------------ home */}
            {view === 'home' && (
              <>
                <div className={'skyb-hero' + (playing ? ' is-playing' : '')}>
                  <button type="button" onClick={wave} aria-label="Make Sky wave hello"
                    title="Tap Sky to wave">
                    <img src="/sky/sky.webp" alt="Sky, a friendly green owl-shaped robot with big round eyes, waving."
                      width="112" height="112" className="skyb-float" />
                    <video ref={clipRef} muted playsInline preload="none" aria-hidden="true" />
                  </button>
                  <p className="skyb-say" style={{ flex: "1 1 200px" }}>
                    {says ? (<><strong>{says.hello}</strong>{says.say}</>) : (<>{intro.split('.')[0]}.</>)}
                  </p>
                </div>

                {says?.step && (
                  <div>
                    <a className="skyb-primary" href={says.step.href}>{says.step.label}</a>
                    {says.why && <p className="skyb-why">{says.why}</p>}
                  </div>
                )}

                {says && 'speechSynthesis' in window && (
                  <button type="button" className="skyb-row" onClick={() => speak(`${says.hello}. ${says.say}`)} aria-pressed={speaking}>
                    <span>{speaking ? 'Stop reading aloud' : 'Read this aloud'}<small>Uses your device's own voice.</small></span>
                  </button>
                )}

                <ul className="skyb-list">
                  {ctx && ctx.due > 0 && (
                    <li><a className="skyb-row" href="/review"><span>Review cards<small>{ctx.due} ready</small></span><span aria-hidden="true">→</span></a></li>
                  )}
                  {ctx?.quizModule && (
                    <li><a className="skyb-row" href={`/quiz/${ctx.quizModule}`}><span>Quiz me<small>{ctx.quizModuleTitle}. No stakes, retry freely.</small></span><span aria-hidden="true">→</span></a></li>
                  )}
                  <li>
                    {mayAsk ? (
                      <button type="button" className="skyb-row" onClick={() => setView('ask')}>
                        <span>Ask Sky a question<small>Answers come from Lrnon's own pages.</small></span><span aria-hidden="true">→</span>
                      </button>
                    ) : (
                      <div className="skyb-row" aria-disabled="true">
                        <span>Ask Sky a question<small>Not open to everyone yet. It is being checked by the Lrnon team first. For now, search the page or <a href="/feedback">ask a person</a>.</small></span>
                      </div>
                    )}
                  </li>
                  <li><button type="button" className="skyb-row" onClick={() => setView('you')}><span>My progress<small>Lessons, streak, level, badges</small></span><span aria-hidden="true">→</span></button></li>
                  <li><button type="button" className="skyb-row" onClick={() => setView('settings')}><span>Sky settings<small>Nudges, numbers, size</small></span><span aria-hidden="true">→</span></button></li>
                </ul>
              </>
            )}

            {/* ------------------------------------------------ progress */}
            {view === 'you' && (
              <>
                {facts ? (
                  <>
                    <dl className="skyb-facts">
                      {facts.rows
                        .filter((r) => prefs.numbers || r.k === 'Lessons finished' || r.k === 'Badges')
                        .map((r) => (<div key={r.k} style={{ display: 'contents' }}><dt>{r.k}</dt><dd>{r.v}</dd></div>))}
                    </dl>
                    {prefs.numbers && (
                      <div>
                        <div className="skyb-meter" role="progressbar" aria-label="Progress towards the next level"
                          aria-valuemin={0} aria-valuemax={100} aria-valuenow={facts.levelPercent}><i style={{ width: facts.levelPercent + '%' }} /></div>
                      </div>
                    )}
                    {facts.nextBadge && (
                      <p className="skyb-say"><strong>Next badge: {facts.nextBadge.name}</strong>{facts.nextBadge.desc}</p>
                    )}
                    <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>{facts.note}</p>
                    <ul className="skyb-list">
                      <li><a className="skyb-row" href="/home"><span>Your dashboard</span><span aria-hidden="true">→</span></a></li>
                      <li><a className="skyb-row" href="/achievements"><span>All badges</span><span aria-hidden="true">→</span></a></li>
                    </ul>
                  </>
                ) : <p>Loading…</p>}
              </>
            )}

            {/* ------------------------------------------------ settings */}
            {view === 'settings' && (
              <>
                {([
                  ['nudges', 'Suggestions', 'Sky offers a next step when a page opens. Off means Sky waits until you open it.'],
                  ['numbers', 'Streaks and levels', 'Show day counts and levels. Turn this off if counters feel like pressure.'],
                  ['small', 'Small Sky', 'Show Sky as a small round button without its name.'],
                ] as [keyof SkyPrefs, string, string][]).map(([key, label, hint]) => (
                  <div className="skyb-switch" key={key}>
                    <p>{label}<small>{hint}</small></p>
                    <button type="button" className="skyb-toggle" aria-pressed={prefs[key]}
                      aria-label={`${label}: ${prefs[key] ? 'on' : 'off'}`}
                      onClick={() => { setSkyPref(key, !prefs[key]); setPrefs(skyPrefs()); }}>{prefs[key] ? 'On' : 'Off'}</button>
                  </div>
                ))}
                <p style={{ margin: 0, color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
                  Movement follows your device and the Accessibility button at the top of every page.
                  Sky never flashes, glows or plays sound.
                </p>
                <ul className="skyb-list">
                  <li><a className="skyb-row" href="/reading"><span>Reading and accessibility settings</span><span aria-hidden="true">→</span></a></li>
                </ul>
              </>
            )}

            {/* ------------------------------------------------ ask */}
            {view === 'ask' && (
              <>
                {ask.k === 'idle' && (
                  <>
                    <p className="skyb-say">{intro}</p>
                    <p style={{ margin: 0, fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Try one</p>
                    <ul className="skyb-list">
                      {suggestions.map((s) => (
                        <li key={s}><button type="button" className="skyb-row" onClick={() => sendQuestion(s)}>{s}</button></li>
                      ))}
                    </ul>
                  </>
                )}
                {(ask.k === 'working' || ask.k === 'slow') && (
                  <p style={{ margin: 0, color: 'var(--c-ink-soft)' }}>
                    {ask.k === 'working' ? 'Reading Lrnon…' : 'Taking longer than usual. Still working. You can keep reading.'}
                  </p>
                )}
                {ask.k === 'answer' && (
                  <>
                    <p className="skyb-say" style={{ whiteSpace: 'pre-wrap' }}>{ask.text}</p>
                    {ask.sources.length > 0 && (
                      <>
                        <p style={{ margin: 0, fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Read from</p>
                        <ul style={{ margin: 0, paddingInlineStart: 'var(--sp-6)' }}>
                          {ask.sources.map((s) => <li key={s.href}><a href={s.href}>{s.label}</a></li>)}
                        </ul>
                      </>
                    )}
                  </>
                )}
                {ask.k === 'out_of_scope' && (
                  <div className="note note--try">
                    <p style={{ marginTop: 0, fontWeight: 700 }}>{ask.title}</p>
                    <p style={{ color: 'var(--c-ink-soft)' }}>{ask.message}</p>
                    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                      {ask.handoff.map((h) => <a key={h.href} className="skyb-row" href={h.href}>{h.label}</a>)}
                    </div>
                    <p style={{ fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)', marginBottom: 0 }}>
                      Handing off copies only this question, not the rest of your chat.
                    </p>
                  </div>
                )}
                {ask.k === 'unavailable' && (
                  <div className="note note--aim">
                    <p style={{ marginTop: 0 }}>{ask.message}</p>
                    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                      <a className="skyb-row" href="/roadmap">Browse the roadmap</a>
                      <a className="skyb-row" href="/feedback">Ask a person</a>
                    </div>
                    {ask.diagnostic && (
                      <details style={{ marginTop: 'var(--sp-3)' }}>
                        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)' }}>Technical detail</summary>
                        <dl style={{ margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-100)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--c-ink-soft)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px var(--sp-3)' }}>
                          {Object.entries(ask.diagnostic).map(([k, v]) => (
                            <div key={k} style={{ display: 'contents' }}><dt style={{ color: 'var(--c-ink-soft)' }}>{k}</dt><dd style={{ margin: 0, wordBreak: 'break-word' }}>{String(v)}</dd></div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {view === 'ask' && (
            <>
              <form onSubmit={(e) => { e.preventDefault(); sendQuestion(q); }}
                style={{ display: 'flex', gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)' }}>
                <label htmlFor="skyb-q" className="sr-only">Ask about this page</label>
                <input id="skyb-q" ref={inputRef} className="skyb-input" value={q} maxLength={500}
                  onChange={(e) => setQ(e.currentTarget.value)} placeholder="Ask about this page…" />
                <button type="submit" className="skyb-iconbtn" disabled={!q.trim()} aria-label="Send question">↑</button>
              </form>
              <p className="skyb-foot">{disclaimer}</p>
            </>
          )}
        </div>
      )}

      <button ref={fabRef} type="button" className={'skyb-fab' + (prefs.small ? ' skyb-fab--small' : '')}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open} aria-label={open ? 'Close Sky, your study buddy' : 'Open Sky, your study buddy'}>
        <span className="skyb-av"><img src="/sky/sky-face.webp" alt="" width="48" height="48" /></span>
        {!prefs.small && <span>Sky</span>}
      </button>
    </div>
  );
}
