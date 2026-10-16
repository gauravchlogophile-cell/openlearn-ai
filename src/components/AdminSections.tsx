import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** /admin/sections — one switch per community section.
 *
 *  Open and closed in one click, for an admin or an owner. Three things are not
 *  one click, on purpose:
 *
 *   · marking a section BUILT or UNBUILT. That is a statement about what exists,
 *     so it stays with an owner. A section that is "planned" has nothing behind
 *     it, and the Community page promises nobody will click into an empty room.
 *   · opening a section that carries learner-written text (Ask Doubts, rooms,
 *     members) while the child-safety conditions do not hold. The database
 *     refuses, and says why; this page shows the refusal rather than hiding it.
 *   · opening anything from "planned". Nothing is built there.
 *
 *  Closing is always allowed, and "Close every forum" closes all the
 *  learner-writing sections at once for an incident.
 */
type Row = { key: string; label: string; group_name: string; needs_safeguarding: boolean; state: 'planned' | 'closed' | 'open'; updated_at: string };
type Eff = { key: string; state: string };

const WORDS = { planned: 'Planned: nothing built yet', closed: 'Closed', open: 'Open' } as const;

export default function AdminSections() {
  const [rows, setRows] = useState<Row[]>([]);
  const [eff, setEff] = useState<Record<string, string>>({});
  const [owner, setOwner] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: r }, { data: e }, { data: o }, { data: ro }] = await Promise.all([
      sb.from('site_sections').select('key,label,group_name,needs_safeguarding,state,updated_at').order('group_name').order('label'),
      sb.rpc('section_states'),
      sb.rpc('is_owner'),
      sb.rpc('rooms_open'),
    ]);
    setRows((r as Row[]) ?? []);
    setEff(Object.fromEntries(((e as Eff[]) ?? []).map((x) => [x.key, x.state])));
    setOwner(Boolean(o)); setRoomsOpen(Boolean(ro));
  }, []);
  useEffect(() => { load().catch((x) => setErr(String(x))); }, [load]);

  async function set(key: string, state: Row['state'], label: string) {
    setBusy(key); setErr(''); setOk('');
    const { error } = await supabase().rpc('set_section_state', { p_key: key, p_state: state, p_reason: 'Changed from /admin/sections.' });
    setBusy('');
    if (error) { setErr(error.message.replace(/^set_section_state:\s*/, '')); return; }
    setOk(`${label} is now ${state === 'planned' ? 'marked as not built' : state}.`);
    await load();
  }

  async function closeAll() {
    if (!confirm('Close every section that carries learner-written text? Anything already closed stays closed. You can reopen each one afterwards.')) return;
    setBusy('all'); setErr(''); setOk('');
    const { data, error } = await supabase().rpc('close_all_forums', { p_reason: 'Closed from /admin/sections.' });
    setBusy('');
    if (error) { setErr(error.message); return; }
    setOk(`${data ?? 0} section${data === 1 ? '' : 's'} closed.`);
    await load();
  }

  const groups = [...new Set(rows.map((r) => r.group_name))];
  const pill = (s: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px var(--sp-3)', borderRadius: 999, fontSize: 'var(--fs-100)', fontWeight: 700,
    border: '1px solid ' + (s === 'open' ? 'var(--c-progress)' : 'var(--c-border-strong)'),
    background: s === 'open' ? 'var(--c-progress-soft)' : 'transparent', color: 'var(--c-ink)',
  });

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      {err && <p className="note note--try" role="alert">{err}</p>}
      {ok && <p className="note note--ok" role="status">{ok}</p>}

      <div className="note note--aim">
        <p style={{ margin: 0 }}>
          <strong>Child-safety gate for learner-written sections:</strong>{' '}
          {roomsOpen === null ? 'checking…' : roomsOpen
            ? 'the conditions hold. Ask Doubts, rooms and members can be opened.'
            : 'the conditions do not hold yet (a named safeguarding owner and deputy, with rooms switched on). Those three cannot be opened from here until they do.'}
        </p>
      </div>

      <p>
        <button type="button" className="btn btn--ghost" disabled={busy === 'all'} onClick={closeAll}>Close every forum now</button>
        <span style={{ marginInlineStart: 'var(--sp-3)', color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>
          For an incident. Closes every section that carries learner-written text. It cannot open anything.
        </span>
      </p>

      {groups.map((g) => (
        <section key={g} aria-label={g}>
          <h2 style={{ fontSize: 'var(--fs-300)' }}>{g}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--sp-2)' }}>
            {rows.filter((r) => r.group_name === g).map((r) => {
              const shown = eff[r.key] ?? r.state;
              const mismatch = shown !== r.state;
              return (
                <li key={r.key} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{r.label}</strong>{' '}
                    <span style={pill(shown)}>{WORDS[shown as keyof typeof WORDS] ?? shown}</span>
                    {r.needs_safeguarding && <span style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}> · carries learner writing</span>}
                    {mismatch && <div style={{ color: 'var(--c-alert)', fontSize: 'var(--fs-100)' }}>Stored as open, but showing closed to learners because the child-safety conditions do not hold.</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    {r.state === 'closed' && <button type="button" className="btn" disabled={busy === r.key} onClick={() => set(r.key, 'open', r.label)}>Open</button>}
                    {r.state === 'open' && <button type="button" className="btn btn--ghost" disabled={busy === r.key} onClick={() => set(r.key, 'closed', r.label)}>Close</button>}
                    {r.state === 'planned' && owner && <button type="button" className="btn btn--ghost" disabled={busy === r.key} onClick={() => set(r.key, 'closed', r.label)}>Mark as built (closed)</button>}
                    {r.state === 'planned' && !owner && <span style={{ color: 'var(--c-ink-soft)', fontSize: 'var(--fs-100)' }}>An owner marks it built first</span>}
                    {r.state !== 'planned' && owner && <button type="button" className="btn btn--ghost" disabled={busy === r.key} onClick={() => set(r.key, 'planned', r.label)}>Mark as not built</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
