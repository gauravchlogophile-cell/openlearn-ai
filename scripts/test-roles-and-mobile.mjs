/** Three things the owner reported on 16 October 2026, kept from coming back.
 *
 *   1. A volunteer given a role must be able to open something. Every volunteer role
 *      has a page it opens, every console tab is gated by a role that exists, and the
 *      gate and the nav agree.
 *   2. Sky's panel must open ON SCREEN on a phone. The phone rules must beat the
 *      desktop placement rules (specificity), which is what made Sky vanish on iPhone.
 *   3. Sky must be draggable by finger as well as by mouse, and its panel must not be
 *      wider than the screen.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { VOLUNTEER_ROLES, ROLE_INFO, ADMIN_TABS, tabsFor, mayOpen } from '../src/lib/volunteer-roles.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); } };

/* ---- 1. roles ---- */
const migration = read('supabase/migrations/0018_volunteer_desk.sql');
for (const r of VOLUNTEER_ROLES) {
  check(`${r}: is allowed by the database constraint`, new RegExp(`'${r}'`).test(migration.split('check (role in')[1] ?? ''));
  check(`${r}: has words for what it is for`, Boolean(ROLE_INFO[r]?.name && ROLE_INFO[r].can?.length && ROLE_INFO[r].cannot?.length && ROLE_INFO[r].today));
  check(`${r}: opens at least the desk`, tabsFor([r]).some((t) => t.href === '/admin/desk'));
}
check('a translator sees the translation desk and no admin tabs', (() => { const t = tabsFor(['translator']).map((x) => x.href); return t.includes('/admin/translations') && !t.includes('/admin/users') && !t.includes('/admin/people'); })());
check('a reviewer sees certification and not users', (() => { const t = tabsFor(['reviewer']).map((x) => x.href); return t.includes('/admin/certification') && !t.includes('/admin/users'); })());
check('an admin and an owner see every tab', tabsFor(['admin']).length === ADMIN_TABS.length && tabsFor(['super_admin']).length === ADMIN_TABS.length);
check('someone holding no role sees nothing', tabsFor([]).length === 0);
check('the gate: an editor may not open the users page, may open the desk', !mayOpen(['editor'], 'admin') && mayOpen(['editor'], 'staff'));
check('the gate: a reviewer may open certification only through its allow list', mayOpen(['reviewer'], ['reviewer']) && !mayOpen(['moderator'], ['reviewer']));
check('every console page names who may open it', ['index', 'desk', 'decisions', 'people', 'users', 'sections', 'analytics', 'sky', 'certification']
  .every((p) => /<AdminGate client:load/.test(read(`src/pages/admin/${p}.astro`))));
check('every tab points at a page that exists', ADMIN_TABS.every((t) => { try { read(t.href === '/admin' ? 'src/pages/admin/index.astro' : `src/pages${t.href}.astro`); return true; } catch { return false; } }));
check('an admin may give only the four volunteer roles, with an end date and a purpose',
  /p_role not in \('reviewer','moderator','editor','translator'\)/.test(migration) && /interval '366 days'/.test(migration) && /btrim\(p_function\)/.test(migration));
check('nobody can give a role to themselves', /p_user = v_actor/.test(migration));
check('the user portal can assign and end volunteer roles', /grant_volunteer_role/.test(read('src/components/AdminUsers.tsx')) && /revoke_volunteer_role/.test(read('src/components/AdminUsers.tsx')));

/* ---- 2. Sky on a phone ---- */
const css = read('src/styles/sky.css');
const phone = css.slice(css.indexOf('@media (max-width: 820px)'));
const block = phone.slice(0, phone.indexOf('\n}\n') + 3);
check('the phone sheet rule names every class the desktop placement uses, so it wins',
  ['.skyb .skyb-panel', '.skyb--r .skyb-panel', '.skyb--l .skyb-panel', '.skyb--low .skyb-panel', '.skyb--high .skyb-panel'].every((s) => block.includes(s)));
check('the phone sheet is pinned to the bottom edge', /inset:\s*auto 0 0 0/.test(block));
check('the sheet respects the iPhone safe area and the moving toolbar', /safe-area-inset-bottom/.test(css) && /86dvh/.test(css));
check('the panel body cannot be stretched wider than the panel', /\.skyb-body\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css) && /overflow-x:\s*hidden/.test(css));
check('the panel can never be wider than the screen', /width:\s*min\(404px,\s*calc\(100vw/.test(css));

/* ---- 3. dragging ---- */
const drag = read('src/components/sky/useDrag.ts');
check('dragging listens for fingers (touch events) and for the mouse (pointer events)', /touchstart/.test(drag) && /touchmove/.test(drag) && /pointerdown/.test(drag));
check('the touch move is not passive, so the page does not scroll under the finger', /touchmove', onTouchMove, \{ passive: false \}/.test(drag));
check('a drag does not rely on pointer capture', !/setPointerCapture/.test(drag.replace(/\/\*[\s\S]*?\*\//g, '')));
check('the click after a drag is ignored by time, so it cannot swallow a later tap', /CLICK_QUIET_MS/.test(drag));
check('the button cannot be selected as text while dragging', /user-select:\s*none/.test(css));

if (failed) { console.error(`roles-and-mobile: ${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`roles-and-mobile: ${passed} checks passed`);
