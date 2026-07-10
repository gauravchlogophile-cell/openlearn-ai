import { useEffect, useState } from 'react';
import { sessionCards, gradeAndSave, finishReviewSession, type CardDef } from '../lib/progress-store';
import { previewIntervals, newCard, XP_REVIEW_SESSION } from '../lib/progress-core';

/** Daily review — SM-2 session, ≤30 cards, four grades with interval
 *  previews. One quiet XP award per day; sessions count as streak days. */
export default function ReviewSession({ allCards }: { allCards: CardDef[] }) {
  const [queue, setQueue] = useState<ReturnType<typeof sessionCards>>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => { setQueue(sessionCards(allCards)); setReady(true); }, [allCards]);

  if (!ready) return <p>Loading your cards…</p>;

  if (queue.length === 0) return (
    <section style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)', padding: 'var(--sp-6)' }}>
      <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>Nothing due right now 🎉</h2>
      <p>Cards join your deck as you complete lessons, then resurface on a
      schedule that stretches as you remember them. Come back tomorrow —
      or <a href="/home">learn something new</a> and today's cards will follow.</p>
    </section>
  );

  if (i >= queue.length) {
    finishReviewSession();
    return (
      <section role="status" style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)', padding: 'var(--sp-6)' }}>
        <h2 style={{ marginTop: 0, fontSize: 'var(--fs-400)' }}>Session complete 🎉</h2>
        <p>{reviewed} card{reviewed === 1 ? '' : 's'} reviewed. First session of the day
        earns +{XP_REVIEW_SESSION} XP and counts toward your streak. The cards you found
        hard will return sooner; the easy ones will stay away longer — that's the system working.</p>
        <a className="btn" href="/home">Back to dashboard</a>
      </section>
    );
  }

  const item = queue[i];
  const card = item.state ?? newCard(new Date());
  const p = previewIntervals(card, new Date());

  function grade(g: 'again' | 'hard' | 'good' | 'easy') {
    gradeAndSave(item.def.key, g);
    setReviewed((r) => r + 1);
    setFlipped(false);
    setI((x) => x + 1);
  }

  return (
    <section aria-label={'Card ' + (i + 1) + ' of ' + queue.length}>
      <p style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
        Card {i + 1} of {queue.length}{item.isNew ? ' · new' : ''} ·
        from <a href={'/learn/' + item.def.lessonSlug}>{item.def.lessonTitle}</a>
      </p>
      <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-l)',
        padding: 'var(--sp-8) var(--sp-6)', minHeight: 140 }}>
        <p style={{ fontSize: 'var(--fs-300)', fontWeight: 600, margin: 0 }}>{item.def.front}</p>
        {flipped && (
          <p style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)',
            paddingTop: 'var(--sp-4)' }}>{item.def.back}</p>
        )}
      </div>
      {!flipped ? (
        <button className="btn" style={{ marginTop: 'var(--sp-4)' }}
          onClick={() => setFlipped(true)}>Show answer</button>
      ) : (
        <div role="group" aria-label="How well did you remember?"
          style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: 'var(--sp-4)' }}>
          <button className="btn btn--ghost" onClick={() => grade('again')}>
            Again <small>({p.again})</small></button>
          <button className="btn btn--ghost" onClick={() => grade('hard')}>
            Hard <small>({p.hard})</small></button>
          <button className="btn" onClick={() => grade('good')}>
            Good <small>({p.good})</small></button>
          <button className="btn btn--ghost" onClick={() => grade('easy')}>
            Easy <small>({p.easy})</small></button>
        </div>
      )}
    </section>
  );
}
