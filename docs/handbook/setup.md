# Local setup

1. Install Node 20+ (`.nvmrc`) and (for DB work) the Supabase CLI + Docker.
2. `make dev` — installs deps and starts the Astro dev server on :4321.
3. Database: `supabase start`, then `supabase db reset` to apply migrations
   and `supabase test db` for the pgTAP RLS suite.
4. Before any PR: `make validate` (CI runs the same script).

Target: this whole page works in under 30 minutes on a fresh machine
(NFR-MAINT-1). If it didn't for you, that's a bug — please open an issue
with the "onboarding" label.
