import { useEffect, useState } from 'react';

/** The voices this device offers, as they arrive. Chrome and Edge load their list
 *  after the page does and announce it with 'voiceschanged'; Safari and Firefox
 *  have it at once. Returns [] where there is no speech synthesis at all. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const read = () => setVoices(synth.getVoices());
    read();
    synth.addEventListener?.('voiceschanged', read);
    return () => synth.removeEventListener?.('voiceschanged', read);
  }, []);
  return voices;
}

export type Recording = { id: string; label: string; lang: string; src: string };

/** Recorded human narration, if any exists for this lesson. Reads
 *  /narration/index.json, which maps a lesson slug to its recordings. The file is
 *  absent until somebody records a lesson, and an absent file is not an error. */
export async function recordingsFor(slug: string): Promise<Recording[]> {
  try {
    const r = await fetch('/narration/index.json');
    if (!r.ok) return [];
    const idx = await r.json();
    return Array.isArray(idx?.[slug]) ? idx[slug] : [];
  } catch { return []; }
}
