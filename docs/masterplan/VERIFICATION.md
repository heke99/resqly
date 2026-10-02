# Current evidence — 2026-10-02

This branch was reconstructed from baseline main after the previous transient
workspace disappeared. Earlier unpublished code/test evidence is unavailable.

Current read-only evidence:

- GitHub metadata confirms public `heke99/resqly`, user push/admin permission.
- Remote main remains `25840ee268e1e32e4ad5cf3a560128ac19d01f48`.
- Hardening/readiness branches have no commits ahead of main.
- Supabase project is healthy, PostgreSQL 17.6; migration history is empty.
- Live legacy accept RPC grants remain anonymous/authenticated: open blocker.
- Original masterplan materialized successfully and copied verbatim.
- `pnpm install --frozen-lockfile` passed (Node 24.19.0, pnpm 11.25.0).

Source, unit, real PostgreSQL, browser, native and integration gates will be
recorded against each new candidate. No current phase is claimed complete.
