# Who holds what, and how to hand work over

Recorded because the answer lives in a database table nobody can read casually,
and because the point of the role model is that Lrnon's operations can be handed
to someone else without the site changing.

The model itself is not described here — it is defined in
`supabase/migrations/0004_admin_roles.sql` and is not changed by this document.
This is the operating record: who currently holds what, and the exact steps to
onboard someone.

## The addresses

| | |
|---|---|
| `lrnon.org@gmail.com` | **Everything published, and everything an admin answers.** Footer, feedback, volunteering, funding, community waitlists, and child-safety reports on `/safeguarding`. It is the only address printed anywhere on the site. |
| `+91 81782 31945` | Public number, shown as "Call or WhatsApp. Please keep to reasonable hours, IST." |
| `gaurav.ch.logophile@gmail.com` | **The super-admin account.** Not a contact route, not printed on the site, and not a constant in `src/lib/site-config.ts`. |

One published address is the thing that makes handover possible. An admin
volunteer can be given the inbox and cover operations without a single page
changing — and, more importantly, without a learner's report following a person
who has since moved on.

## The four layers

Straight from `0004`, unchanged:

| Role | What it is |
|---|---|
| `super_admin` | Owner. Everything, including deletion, roles, money and policy. |
| `admin` | Owns one surface end to end. **Proposes** deletions, never executes them. |
| `sub_admin` | One specialist task, scoped to a named function and time-boxed. |
| `reviewer` · `moderator` · `editor` | Narrow grants that predate the four layers and still work. |
| volunteer | Not a row at all. No admin surface, so no grant. |

Two rules in the code that matter more than they look:

- **An admin proposes deletions; only an owner executes them.** Certificate
  revocation is the sharpest case — `propose_revocation()` raises a Delete in
  the owners' queue and can do nothing else, and `execute_revocation()` refuses
  until the 30-day hold has run *and* the holder has been notified.
- **A single owner cannot mint another owner.** `grant_role()` refuses
  `super_admin` outright; it goes through `propose_owner()` and a *different*
  owner calling `confirm_owner()`. And `revoke_role()` will not remove the last
  owner, so the project cannot lock itself out.

## Current holders

| Account | Role | Function | Expires |
|---|---|---|---|
| `gaurav.ch.logophile@gmail.com` | `super_admin` | — | never |

Bootstrapped by direct insert on 2026-08-26, because `propose_owner` and
`confirm_owner` both require an existing owner and the first one therefore
cannot be created through the application. Recorded in `admin_audit` as
`bootstrap_owner` with that reason.

**There is only one owner.** Until there is a second, the two-owner rule cannot
actually run: no new owner can be confirmed, because confirmation must come from
someone other than the proposer. That is the correct failure — it means the
safeguard is real rather than decorative — but it is worth knowing before you
need it.

## Onboarding an admin

Done by the super admin, signed in, from the SQL editor or `/admin/people`.
Every grant is audited automatically.

```sql
select public.grant_role(
  p_user     => (select id from auth.users where email = 'them@example.com'),
  p_role     => 'admin',
  p_function => 'Curriculum & lessons',   -- required; never "all admin"
  p_expires  => now() + interval '90 days',
  p_reason   => 'Covering lesson review while the founder is away.'
);
```

`p_function` is not optional for `admin` or `sub_admin` — the function raises
without it. The design's line is that a grant names *the surface it covers*,
never "all admin", so that what someone can do is legible to them and to
everyone else.

`p_expires` is data, not a calendar reminder: `has_role()` ignores an expired
grant, so access ends on its own. Ninety days renewable is the default the
design suggests. Pass `null` only for a standing role.

To hand it back:

```sql
select public.revoke_role(
  (select id from auth.users where email = 'them@example.com'),
  'admin',
  'Cover period ended.'
);
```

## Before an admin starts

- They need their own account on the site. Grants attach to a `profiles` row,
  which exists only after signup.
- Give them the `lrnon.org@gmail.com` inbox, not a forward. The site tells
  people a person reads it and that child-safety reports are treated ahead of
  everything else; a forwarding rule that quietly breaks makes that untrue
  without anyone noticing.
- Point them at `/safeguarding` first. It is the shortest statement of what
  Lrnon will and will not ship, and it is a constraint on their decisions, not
  background reading.
- Certification, rooms and Sky are all switched off and none of them opens by
  granting a role. `certification_open()` needs two named reviewers who have
  agreed on twenty sample answers; `rooms_open()` needs a named safeguarding
  owner and a deputy. An owner is a person with authority, not a bypass.
