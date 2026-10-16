import { useEffect, useRef, useState } from 'react';
import { readAloudEnabled, speechPrefs } from '../lib/progress-store';
import { defaultVoice } from '../lib/voices.js';
import { useVoices, recordingsFor, type Recording } from './useVoices';

/** Read the lesson aloud (design turn 3), in the voice the reader chose.
 *
 *  Two ways to be read to, in this order:
 *
 *   1. A recorded human narration, if one exists for this lesson and the reader
 *      has not turned recordings off. None exists yet; /narration/index.json is
 *      where they are listed when they do (docs/handbook/narration.md).
 *   2. The device's own voice, the one chosen in the accessibility panel under
 *      "Voice" (Indian voices and global voices, natural ones first). The Web
 *      Speech API only: no audio is fetched, no text is sent anywhere, nothing is
 *      recorded, and it works offline once the lesson is cached.
 *
 *  It reads the lesson prose and skips the quiz. Reading the questions and every
 *  option aloud in order would give the answers away by construction, and the
 *  assessment guard would look absurd next to a player that recites the key.
 */
export default function ReadAloud() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [recs, setRecs] = useState<Recording[]>([]);
  const [prefs, setPrefs] = useState(speechPrefs());
  const voices = useVoices();
  const chunks = useRef<string[]>([]);
  const at = useRef(0);

  useEffect(() => {
    const read = () => { setEnabled(readAloudEnabled()); setPrefs(speechPrefs()); };
    read();
    window.addEventListener('ol:progress', read);
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    const slug = location.pathname.replace(/^\/learn\//, '').replace(/\/$/, '');
    recordingsFor(slug).then(setRecs);
    return () => {
      window.removeEventListener('ol:progress', read);
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    };
  }, []);

  function collect(): string[] {
    const article = document.querySelector('.prose');
    if (!article) return [];
    const out: string[] = [];
    for (const el of article.querySelectorAll('h2, h3, p, li')) {
      if (el.closest('section[aria-label="Check your understanding"]')) continue;
      if (el.closest('aside')) continue;
      const t = (el.textContent ?? '').trim();
      if (t.length > 1) out.push(t);
    }
    return out;
  }

  function chosenVoice() {
    const byUri = prefs.voiceURI ? voices.find((v) => v.voiceURI === prefs.voiceURI) : undefined;
    return (byUri ?? defaultVoice(voices as any, document.documentElement.lang || 'en')) as SpeechSynthesisVoice | null;
  }

  function speakFrom(i: number) {
    const synth = window.speechSynthesis;
    if (!synth || i >= chunks.current.length) { setState('idle'); at.current = 0; return; }
    at.current = i;
    const u = new SpeechSynthesisUtterance(chunks.current[i]);
    const v = chosenVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = prefs.rate;
    u.onend = () => {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
      speakFrom(i + 1);
    };
    synth.speak(u);
  }

  function play() {
    chunks.current = collect();
    if (!chunks.current.length) return;
    window.speechSynthesis.cancel();
    setState('playing');
    speakFrom(0);
  }
  function pause() { window.speechSynthesis.pause(); setState('paused'); }
  function resume() { window.speechSynthesis.resume(); setState('playing'); }
  function stop() { window.speechSynthesis.cancel(); at.current = 0; setState('idle'); }

  if (!enabled) return null;

  // A recorded human voice wins when there is one and the reader allows it.
  if (recs.length > 0 && prefs.recorded) {
    return (
      <div className="card" style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <strong style={{ fontFamily: 'var(--font-display)' }}>Listen to this lesson</strong>
        {recs.map((r) => (
          <label key={r.id} style={{ display: 'grid', gap: 4 }}>
            <span>{r.label}</span>
            <audio controls preload="none" src={r.src} style={{ width: '100%' }} />
          </label>
        ))}
        <span style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>Recorded by a person. Turn recordings off in Accessibility to use your device's voice instead.</span>
      </div>
    );
  }

  if (!supported) {
    return (
      <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        Read-aloud needs a browser speech voice, and this one has none. Your device may
        have a built-in screen reader that will read the page instead.
      </p>
    );
  }

  const v = chosenVoice();
  return (
    <div className="card" style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span aria-hidden="true">🔊</span>
      <strong style={{ fontFamily: 'var(--font-display)' }}>Read aloud</strong>
      {state === 'idle' && <button className="btn" onClick={play}>Play lesson</button>}
      {state === 'playing' && <>
        <button className="btn btn--ghost" onClick={pause}>Pause</button>
        <button className="btn btn--ghost" onClick={stop}>Stop</button>
      </>}
      {state === 'paused' && <>
        <button className="btn" onClick={resume}>Resume</button>
        <button className="btn btn--ghost" onClick={stop}>Stop</button>
      </>}
      <span aria-live="polite" style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        {state === 'idle' ? `${v ? `Voice: ${v.name}. ` : ''}Uses your device’s own voice; change it under Accessibility. The questions are not read out.`
          : state === 'playing' ? 'Playing…' : 'Paused'}
      </span>
    </div>
  );
}
