import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminOverview from './AdminOverview';
import AdminDesk from './AdminDesk';

/** /admin: the overview for an owner or an admin, the volunteer's own desk for
 *  everyone else. A volunteer is not shown figures their role cannot read. */
export default function AdminHome() {
  const [mode, setMode] = useState<'wait' | 'overview' | 'desk'>('wait');
  useEffect(() => {
    (async () => {
      const [{ data: owner }, { data: admin }] = await Promise.all([supabase().rpc('is_owner'), supabase().rpc('has_role', { wanted: 'admin' })]);
      setMode(owner || admin ? 'overview' : 'desk');
    })().catch(() => setMode('desk'));
  }, []);
  if (mode === 'wait') return <p role="status" style={{ color: 'var(--c-ink-soft)' }}>Loading…</p>;
  return mode === 'overview' ? <AdminOverview /> : <AdminDesk />;
}
