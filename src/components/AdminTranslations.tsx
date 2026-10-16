import { useEffect, useState } from 'react';

/** /admin/translations: where each language stands, and what is waiting for a person.
 *
 *  Reads /i18n/status.json, which the build writes from the repository. It holds counts
 *  and file names and no translated text, so nothing here publishes anything. Review
 *  itself happens on the file (the link opens it on GitHub), because a reviewer's name on a
 *  translation is a commit the project can see, not a flag in a database.
 */
type LessonRow = { id: string; file: string; state: string; why: string; reviewedBy: string; reviewedOn: string };
type Lang = { name: string; native: string; ui: { live: boolean; status: string; why: string; reviewedBy: string; reviewedOn: string }; counts: { reviewed: number; draft: number; stale: number; orphan: number }; lessons: LessonRow[] };
type Status = { totalLessons: number; languages: Record<string, Lang> };
const REPO = 'https://github.com/gauravchlogophile-cell/openlearn-ai';

export default function AdminTranslations() {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/i18n/status.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('The status file is missing. It is written by the build.'))))
      .then(setSt)
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <p className="note note--try" role="alert">{err}</p>;
  if (!st) return <p role="status" style={{ color: 'var(--c-ink-soft)' }}>Loading…</p>;

  const th = { textAlign: 'left' as const, padding: 'var(--sp-2) var(--sp-3)', fontSize: 'var(--fs-100)', color: 'var(--c-ink-soft)', borderBottom: '1px solid var(--c-border)' };
  const td = { padding: 'var(--sp-2) var(--sp-3)', borderTop: '1px solid var(--c-border)', verticalAlign: 'top' as const };
  const waiting = Object.entries(st.languages).flatMap(([code, l]) => l.lessons.filter((x) => x.state !== 'reviewed').map((x) => ({ code, l, x })));

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div className="note note--aim">
        <p style={{ margin: 0 }}><strong>The rule.</strong> Nothing machine-translated goes live until a person has read it, and the person is named on it.
          A translation whose English has changed since it was checked comes off the site by itself.</p>
      </div>

      <section aria-label="Languages">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Where each language stands</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '40rem' }}>
            <thead><tr>{['Language', 'Menus', 'Live', 'Draft', 'Out of date', `of ${st.totalLessons} lessons`].map((h) => <th key={h} scope="col" style={th}>{h}</th>)}</tr></thead>
            <tbody>{Object.entries(st.languages).map(([code, l]) => (
              <tr key={code}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400 }}><span translate="no">{l.native}</span> <span style={{ color: 'var(--c-ink-soft)' }}>({l.name})</span></th>
                <td style={td}>{l.ui.live ? `Live, checked by ${l.ui.reviewedBy}` : l.ui.why}</td>
                <td style={td}>{l.counts.reviewed}</td>
                <td style={td}>{l.counts.draft}</td>
                <td style={td}>{l.counts.stale}</td>
                <td style={td}>{Math.round((l.counts.reviewed / Math.max(1, st.totalLessons)) * 100)}% live</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>

      <section aria-label="Waiting for a reviewer">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>Waiting for a person</h2>
        {waiting.length === 0 ? <p style={{ color: 'var(--c-ink-soft)' }}>Nothing is waiting.</p> : (
          <ul style={{ display: 'grid', gap: 'var(--sp-2)', padding: 0, listStyle: 'none' }}>
            {waiting.map(({ l, x }) => (
              <li key={x.file} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>{l.name}</strong>: {x.id.replace(/^[a-z]+\//, '')}<br /><span style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>{x.why}</span></span>
                <span style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  <a className="btn" href={`${REPO}/blob/main/${x.file}`}>Open the draft</a>
                  <a className="btn btn--ghost" href={`${REPO}/blob/main/content/${x.id}.mdx`}>Open the English</a>
                </span>
              </li>))}
          </ul>
        )}
      </section>

      <section aria-label="How to review">
        <h2 style={{ fontSize: 'var(--fs-400)' }}>How to review a lesson</h2>
        <ol style={{ display: 'grid', gap: 'var(--sp-2)', paddingInlineStart: 'var(--sp-6)' }}>
          <li>Open the draft and the English side by side.</li>
          <li>Read every line. Fix anything that says something slightly different. <strong>Check every number, date and tool name</strong>: they are the facts the lesson rests on. Keep tool names, commands and code exactly as in English.</li>
          <li>Check the quiz: each question must still have the same right answer, in the same position.</li>
          <li>When it is right, change <code>status: draft</code> to <code>status: reviewed</code>, add your name as <code>reviewedBy</code> and today as <code>reviewedOn</code>, and send it in. The project checks the structure automatically and an owner merges it.</li>
          <li>It goes live on the next build, under your name. If the English changes later, it comes off the site until it has been checked again.</li>
        </ol>
        <p style={{ color: 'var(--c-ink-soft)' }}>An owner can sign a file from the command line once they have read it: <code>node scripts/build-i18n.mjs review {'<file>'} "Name"</code>. The full process is in <code>docs/handbook/translation-workflow.md</code>.</p>
      </section>
    </div>
  );
}
