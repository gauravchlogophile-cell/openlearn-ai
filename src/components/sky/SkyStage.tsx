import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { clipKind, motionAllowed } from '../../lib/sky-fx.js';

/** Sky and, on request, Sky's welcome clip.
 *
 *  A still picture of Sky, with the ten-second clip laid over it while it plays.
 *  The clip is Sky waving, smiling, spreading its wings and finishing with a burst
 *  of light; it is measured at under two percent change in brightness from one
 *  frame to the next and has no flash in it, and it has no sound.
 *
 *  Two files, because browsers disagree about transparent video:
 *    WebM (VP9 with alpha)   Chrome, Edge, Firefox, Android
 *    animated WebP           Safari, and every browser on an iPhone or iPad
 *  \`clipKind\` picks one; anything unsure gets the WebP.
 *
 *  Nothing is downloaded until the clip is asked for, so a data-saver setting or
 *  a slow connection never pays for it.
 *
 *  Anyone can stop it at any moment: a ten-second animation that starts by itself
 *  must have a way to stop (WCAG 2.2.2), and it is a button with words on it, not
 *  an icon. */
export interface StageHandle { play: () => void; stop: () => void; }

interface Props {
  /** Start the clip as soon as it is allowed to. */
  autoplay?: boolean;
  /** Called with true when the clip starts and false when it ends or is stopped. */
  onPlaying?: (playing: boolean) => void;
  width?: number;
  height?: number;
  label?: string;
  floating?: boolean;
}

const CLIP_MS = 10200;

const SkyStage = forwardRef<StageHandle, Props>(function SkyStage(
  { autoplay = false, onPlaying, width = 320, height = 351, label, floating = true }, ref,
) {
  const [playing, setPlaying] = useState(false);
  const [kind, setKind] = useState<'webm' | 'webp'>('webm');
  const [run, setRun] = useState(0);                 // bumps to restart the WebP
  const video = useRef<HTMLVideoElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { setKind(clipKind(navigator.userAgent)); }, []);

  const finish = useCallback(() => {
    window.clearTimeout(timer.current);
    setPlaying(false); onPlaying?.(false);
    video.current?.pause();
  }, [onPlaying]);

  const play = useCallback(() => {
    if (playing) return;
    setPlaying(true); onPlaying?.(true);
    if (kind === 'webm') {
      const v = video.current; if (!v) return;
      if (!v.getAttribute('src')) v.setAttribute('src', '/sky/sky-intro.webm');
      v.currentTime = 0;
      v.play().catch(finish);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(finish, CLIP_MS);          // belt and braces if 'ended' never fires
    } else {
      setRun((n) => n + 1);                                          // a new src restarts the animation
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(finish, CLIP_MS);
    }
  }, [kind, playing, finish, onPlaying]);

  useImperativeHandle(ref, () => ({ play, stop: finish }), [play, finish]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Autoplay: only when motion is allowed, data-saver is off, the tab is visible,
  // and once a browser session so a returning visitor is not greeted every time.
  useEffect(() => {
    if (!autoplay) return;
    const root = document.documentElement;
    if (!motionAllowed(root, matchMedia)) return;
    if (root.getAttribute('data-saver') === 'on') return;
    if (document.visibilityState !== 'visible') return;
    try { if (sessionStorage.getItem('skyb.welcomed')) return; sessionStorage.setItem('skyb.welcomed', '1'); } catch { /* private mode: play it */ }
    const t = window.setTimeout(play, 600);
    return () => window.clearTimeout(t);
  }, [autoplay, kind]);                                              // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={'skyb-stage' + (playing ? ' is-playing' : '')} style={{ width: '100%', maxWidth: width }}>
      <span className="skyb-halo" aria-hidden="true" />
      <img className={floating && !playing ? 'skyb-float' : undefined} src="/sky/sky.webp" width={width} height={height}
        alt={label ?? 'Sky, a friendly green owl-shaped robot with big round eyes, waving.'} fetchPriority="high" />
      {kind === 'webm' ? (
        <video ref={video} muted playsInline preload="none" aria-hidden="true" onEnded={finish} />
      ) : (
        playing && <img className="skyb-clip-img" src={`/sky/sky-intro.webp?r=${run}`} alt="" aria-hidden="true" />
      )}
    </div>
  );
});

export default SkyStage;
