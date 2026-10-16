import { useEffect, useRef, useState } from 'react';
import SkyStage, { type StageHandle } from './sky/SkyStage';
import { bonusStarsLeft, catchBonusStar } from '../lib/progress-store';

/** Sky, large, on the introduction page.
 *
 *  Waves its welcome clip when the page opens (once a browser session, and only
 *  if the device and Lrnon allow motion), with a button that says what it does
 *  to stop it or play it again. Around it, a few floating shapes that can be
 *  caught: each is a bonus star worth two points, three a day, which Sky cheers.
 *
 *  A bonus star is a reward for noticing, not for learning, so it counts towards
 *  points but never keeps a streak alive (progress-core's LEARNING_REASONS).
 *  Three a day is the whole supply: a game that can be farmed is a game that
 *  stops meaning anything.
 */
export default function SkyHero() {
  const stage = useRef<StageHandle>(null);
  const [playing, setPlaying] = useState(false);
  const [left, setLeft] = useState(3);
  const [caught, setCaught] = useState<string[]>([]);

  useEffect(() => {
    const read = () => setLeft(bonusStarsLeft());
    read();
    window.addEventListener('ol:progress', read);
    return () => window.removeEventListener('ol:progress', read);
  }, []);

  function catchOne(id: string) {
    if (!catchBonusStar()) return;
    setCaught((c) => [...c, id]);
    window.dispatchEvent(new CustomEvent('sky:cheer', { detail: { kind: 'star' } }));
  }

  const shapes: { id: string; icon: string; label: string; style: React.CSSProperties }[] = [
    { id: 'a', icon: 'star', label: 'Catch a bonus star', style: { left: '2%', top: '14%' } },
    { id: 'b', icon: 'gear', label: 'Catch a bonus gear', style: { right: '2%', top: '8%' } },
    { id: 'c', icon: 'spark', label: 'Catch a bonus spark', style: { right: '0', bottom: '28%' } },
  ];

  return (
    <figure data-decorative style={{ margin: 0, justifySelf: 'center', textAlign: 'center', maxWidth: 320, position: 'relative', width: '100%' }}>
      <SkyStage ref={stage} autoplay onPlaying={setPlaying} />

      {left > 0 && shapes.map((s, i) => (
        !caught.includes(s.id) && i < left && (
          <button key={s.id} type="button" className="skyb-holo" style={s.style} onClick={() => catchOne(s.id)} aria-label={`${s.label}: two points`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#sky-i-${s.icon}`} /></svg>
          </button>
        )
      ))}

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="sky-i-star" viewBox="0 0 24 24"><path d="M12 2.8l2.8 6 6.5.8-4.8 4.5 1.3 6.5L12 17.4l-5.8 3.2 1.3-6.5L2.7 9.6l6.5-.8z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></symbol>
        <symbol id="sky-i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="3.4" strokeDasharray="2.55 2.55" /><path fill="currentColor" fillRule="evenodd" d="M12 5.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" /></symbol>
        <symbol id="sky-i-spark" viewBox="0 0 24 24"><path d="M12 1.5l2.3 8.2 8.2 2.3-8.2 2.3L12 22.5l-2.3-8.2L1.5 12l8.2-2.3z" fill="currentColor" /></symbol>
      </svg>

      <figcaption style={{ marginTop: 'var(--sp-2)', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        <p style={{ margin: '0 0 var(--sp-2)' }}>
          Meet <strong>Sky</strong>, your study buddy. Find Sky at the bottom right of any page, and drag Sky wherever suits you.
        </p>
        <button type="button" className="btn btn--ghost" style={{ minHeight: 44 }} onClick={() => (playing ? stage.current?.stop() : stage.current?.play())}>
          {playing ? 'Stop the animation' : 'Play Sky’s welcome'}
        </button>
        <p style={{ margin: 'var(--sp-2) 0 0' }} aria-live="polite">
          {left > 0 ? `Catch the floating shapes: ${left} bonus star${left === 1 ? '' : 's'} left today.` : 'You have caught today’s bonus stars. More tomorrow.'}
        </p>
      </figcaption>
    </figure>
  );
}
