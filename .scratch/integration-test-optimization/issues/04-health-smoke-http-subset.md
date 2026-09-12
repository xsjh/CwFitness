# 04: Health-smoke HTTP subset

**What to build:** A small HTTP integration file that drives the cheapest core flows against the real `next dev` + Postgres stack. Used by the fast runner as `health-smoke` and independently runnable for triage when someone wants to verify the stack without booting the full suite.

**Blocked by:** 01 (Path-group manifest, so the smoke group can register it).

**Status:** resolved

- [ ] File lives at `tests/smoke-api.test.mjs` (or equivalent) and runs under `node --test`.
- [ ] Covers, at minimum: one register-and-login cycle, `GET /api/plans` returning 401 when unauthorized, listing plans for an authenticated user, and returning an empty list for a fresh user.
- [ ] Bootstraps (or reuses from `scripts/test-integration.mjs`) the same Postgres + `next dev` setup the existing HTTP suite uses, so smoke and full both speak to the same env shape.
- [ ] Listed in the manifest's `health-smoke` group's `match` glob so it always runs on `fast`.
- [ ] Independently runnable as `node --test tests/smoke-api.test.mjs` against a live test server for triage.
