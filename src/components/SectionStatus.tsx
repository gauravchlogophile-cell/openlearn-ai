import { useEffect, useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';

/** The status pill on /community, read from the same switches an admin flips at
 *  /admin/sections. The page is static, so the server-rendered word is the
 *  fallback ("Planned"); this only ever replaces it with what the database says,
 *  and says nothing new if the database cannot be reached.
 *
 *  A section is "Open" here only when the database reports it open, which for a
 *  section carrying learner writing already includes the child-safety gate. */
const WORDS: Record<string, string> = { planned: 'Planned', closed: 'Closed for now', open: 'Open' };

export default function SectionStatus({ keys, fallback = 'Planned' }: { keys: string[]; fallback?: string }) {
  const [word, setWord] = useState(fallback);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase().rpc('section_states');
        const mine = ((data as { key: string; state: string }[]) ?? []).filter((x) => keys.includes(x.key));
        if (!alive || mine.length === 0) return;
        const anyOpen = mine.some((x) => x.state === 'open');
        const allPlanned = mine.every((x) => x.state === 'planned');
        setOpen(anyOpen);
        setWord(anyOpen ? WORDS.open : allPlanned ? WORDS.planned : WORDS.closed);
      } catch { /* keep the fallback */ }
    })();
    return () => { alive = false; };
  }, [keys.join(',')]);

  return (
    <span style={{
      fontSize: 'var(--fs-100)', letterSpacing: '0.08em', textTransform: 'uppercase',
      color: open ? 'var(--c-ink)' : 'var(--c-ink-faint)',
      border: '1px solid ' + (open ? 'var(--c-progress)' : 'var(--c-border-strong)'),
      background: open ? 'var(--c-progress-soft)' : 'transparent',
      borderRadius: 999, padding: '2px 10px',
    }}>{open ? '● ' : ''}{word}</span>
  );
}
