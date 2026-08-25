import { useEffect, useRef, useState } from 'react';
import { readAloudEnabled } from '../lib/progress-store';

/** Read the lesson aloud, using the device's own voice (design turn 3).
 *
 *  Web Speech API only — no audio is fetched, no text is sent anywhere, and
 *  nothing is recorded. The synthesiser is already on the device, which is why
 *  this costs nothing to run and works offline once the lesson is cached.
 *
 *  It reads the lesson prose and skips the quiz. Reading the questions and
 *  every option aloud in order would give the answers away by construction,
 *  and the assessment guard would look absurd next to a player that recites
 *  the answer key.
 */
export default function ReadAloud() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const chunks = useRef<string[]>([]);
  const at = useRef(0);

  useEffect(() => {
    const read = () => setEnabled(readAloudEnabled());
    read();
    window.addEventListener('ol:progress', read);
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    // Speech keeps going after navigation in some browsers; stop on unmount.
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
      // Skip anything inside the quiz island, and skip the tool cards, which
      // are reference tables rather than prose.
      if (el.closest('section[aria-label="Check your understanding"]')) continue;
      if (el.closest('aside')) continue;
      const t = (el.textContent ?? '').trim();
      if (t.length > 1) out.push(t);
    }
    return out;
  }

  function speakFrom(i: number) {
    const synth = window.speechSynthesis;
    if (!synth || i >= chunks.current.length) { setState('idle'); at.current = 0; return; }
    at.current = i;
    const u = new SpeechSynthesisUtterance(chunks.current[i]);
    u.rate = 1;
    u.onend = () => {
      // Only advance if we are still meant to be playing — pause/stop cancel.
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

  if (!supported) {
    return (
      <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        Read-aloud needs a browser speech voice, and this one has none. Your device may
        have a built-in screen reader that will read the page instead.
      </p>
    );
  }

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
      <span aria-live="polite" style={{ color: 'var(--c-ink-faint)', fontSize: 'var(--fs-100)' }}>
        {state === 'idle' ? 'Uses your device’s own voice. The questions are not read out.'
          : state === 'playing' ? 'Playing…' : 'Paused'}
      </span>
    </div>
  );
}
