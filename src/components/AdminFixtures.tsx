/** Test fixtures — seed and delete, from the admin portal.
 *
 *  Two buttons that write to the database, one of which deletes credentials.
 *  So the safety is not in this component: seed_test_fixtures() and
 *  delete_test_fixtures() are owner-only and the deleter walks the
 *  test_fixtures registry rather than matching a pattern. This page cannot
 *  delete a real learner's certificate even if every guard here were removed,
 *  which is the property worth having.
 *
 *  What this page owes the person using it is honesty about what is about to
 *  happen, and a result they can check afterwards.
 */
import { useEffect, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';

type Row = { scenario_id: string; row_count: number; codes: string[]; labels: string[] };
type SeedRow = { scenario_id: string; summary: string; cred_code: string | null };
type Attempt = { attempt_id: number; module_id: string; scenario: string; band: string | null; state: string };

export default function AdminFixtures() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [seeded, setSeeded] = useState<SeedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  async function refresh() {
    if (!isConfigured) return;
    const { data, error } = await supabase().rpc('list_test_fixtures');
    if (error) { setError(error.message); return; }
    setRows((data ?? []) as Row[]);

    /* The attempt ids behind each scenario, so the result page can be opened
       on a seeded band. There is no way to sign in as a fixture learner —
       they have no password, deliberately — so without this the three results
       of 10c could be created and never looked at. */
    const att = await supabase().rpc('fixture_attempts');
    if (!att.error) setAttempts((att.data ?? []) as Attempt[]);
  }

  useEffect(() => { void refresh(); }, []);

  async function seed() {
    setBusy('seed'); setError(null); setSeeded(null);
    const { data, error } = await supabase().rpc('seed_test_fixtures');
    setBusy(null);
    if (error) { setError(error.message); return; }
    setSeeded((data ?? []) as SeedRow[]);
    await refresh();
  }

  async function remove(scenario: string | null) {
    setBusy(scenario ?? 'all'); setError(null);
    const { data, error } = await supabase()
      .rpc('delete_test_fixtures', { p_scenario: scenario });
    setBusy(null); setConfirming(null);
    if (error) { setError(error.message); return; }

    const res = Array.isArray(data) ? data[0] : data;
    /* Surfaced rather than swallowed. A non-zero skip count means the registry
       pointed at a row that is not marked as a fixture — which should be
       impossible, and is exactly the situation someone needs to be told about
       rather than have quietly hidden behind a success message. */
    if (res?.skipped_not_fixture > 0) {
      setError(
        `${res.skipped_not_fixture} row(s) were listed as fixtures but are not ` +
        `marked as test data, so they were left alone. This should not happen — ` +
        `do not delete them by hand; check what created them first.`);
    }
    setSeeded(null);
    await refresh();
  }

  if (!isConfigured) {
    return (
      <div className="note note--aim">
        <strong>No database configured here.</strong>
        <p className="prose" style={{ margin: 'var(--sp-2) 0 0' }}>
          Fixtures live in the database, so this panel needs
          <code> PUBLIC_SUPABASE_URL</code> and a signed-in owner.
        </p>
      </div>
    );
  }

  const total = rows?.reduce((n, r) => n + r.row_count, 0) ?? 0;

  return (
    <div>
      <div className="note note--aim">
        <strong>What these are.</strong>
        <p className="prose" style={{ margin: 'var(--sp-2) 0 0' }}>
          One learner and one credential for each scenario turn 10 describes —
          every band, every credential state, both verification edge cases. They
          are real rows in this database, created through the same functions a
          learner would use where that is possible. Every one is marked as test
          data and says so on the public verification page and on the printed
          certificate.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', margin: 'var(--sp-6) 0' }}>
        <button className="btn" onClick={() => void seed()} disabled={busy !== null}>
          {busy === 'seed' ? 'Seeding…' : total > 0 ? 'Re-seed (replaces all)' : 'Seed test entries'}
        </button>
        {total > 0 && (
          confirming === 'all'
            ? (
              <>
                <button className="btn" onClick={() => void remove(null)} disabled={busy !== null}
                  style={{ background: 'var(--c-reward)' }}>
                  {busy === 'all' ? 'Deleting…' : `Yes — delete all ${total} rows`}
                </button>
                <button className="btn btn--ghost" onClick={() => setConfirming(null)}>Cancel</button>
              </>
            )
            : <button className="btn btn--ghost" onClick={() => setConfirming('all')} disabled={busy !== null}>
                Delete all test entries
              </button>
        )}
      </div>

      {error && <div className="note note--try" style={{ marginBottom: 'var(--sp-4)' }}>{error}</div>}

      {seeded && (
        <div className="note note--ok" style={{ marginBottom: 'var(--sp-6)' }}>
          <strong>Seeded {seeded.length} scenarios.</strong>
          <ul style={{ margin: 'var(--sp-2) 0 0', paddingInlineStart: 'var(--sp-5)' }}>
            {seeded.map((s) => (
              <li key={s.scenario_id} style={{ marginBottom: 'var(--sp-1)' }}>
                <strong>{s.scenario_id}</strong> — {s.summary}
                {s.cred_code && <> · <a href={`/certificate/${s.cred_code}`}>
                  <code>{s.cred_code}</code></a></>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows === null && <p style={{ color: 'var(--c-ink-faint)' }}>Loading…</p>}

      {rows?.length === 0 && (
        <p className="prose" style={{ color: 'var(--c-ink-soft)' }}>
          No test entries in the database. Seeding creates about ninety rows
          across fifteen scenarios; deleting removes exactly those and nothing
          else.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--c-border-strong)' }}>
                <th style={{ padding: 'var(--sp-2)' }}>Scenario</th>
                <th style={{ padding: 'var(--sp-2)' }}>Rows</th>
                <th style={{ padding: 'var(--sp-2)' }}>Codes to try on /v</th>
                <th style={{ padding: 'var(--sp-2)' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.scenario_id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: 'var(--sp-2)' }}><code>{r.scenario_id}</code></td>
                  <td style={{ padding: 'var(--sp-2)', fontVariantNumeric: 'tabular-nums' }}>{r.row_count}</td>
                  <td style={{ padding: 'var(--sp-2)' }}>
                    {r.codes.map((c) => (
                      <div key={c}>
                        <a href={`/certificate/${c}`}><code>{c}</code></a>{' · '}
                        <a href="/v" style={{ fontSize: 'var(--fs-100)' }}>verify</a>
                      </div>
                    ))}
                    {attempts.filter((a) => a.scenario === r.scenario_id).map((a) => (
                      <div key={a.attempt_id} style={{ fontSize: 'var(--fs-100)' }}>
                        <a href={`/certification/${a.module_id}/result?preview=${a.attempt_id}`}>
                          see the result page ({a.band ?? a.state})
                        </a>
                      </div>
                    ))}
                    {r.codes.length === 0 && attempts.filter((a) => a.scenario === r.scenario_id).length === 0 && (
                      <span style={{ color: 'var(--c-ink-faint)' }}>— nothing to open</span>
                    )}
                  </td>
                  <td style={{ padding: 'var(--sp-2)', textAlign: 'right' }}>
                    {confirming === r.scenario_id ? (
                      <>
                        <button className="btn" style={{ background: 'var(--c-reward)' }}
                          onClick={() => void remove(r.scenario_id)} disabled={busy !== null}>
                          {busy === r.scenario_id ? 'Deleting…' : 'Confirm'}
                        </button>{' '}
                        <button className="btn btn--ghost" onClick={() => setConfirming(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn--ghost" onClick={() => setConfirming(r.scenario_id)}
                        disabled={busy !== null}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="prose" style={{ color: 'var(--c-ink-soft)', marginTop: 'var(--sp-6)' }}>
        Deleting walks a registry of the rows the seeder created. It does not
        match on an email domain, a name, or a date — every one of those would
        eventually match a real learner, and a heuristic that deletes
        certificates is not worth having. A row that was never registered is not
        reachable from here.
      </p>
    </div>
  );
}
