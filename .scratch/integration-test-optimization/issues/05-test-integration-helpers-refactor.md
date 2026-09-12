# 05: Refactor `scripts/test-integration.mjs` helpers

**What to build:** Pull the database setup, server start/stop, port-free assertion, and wait-for-server into a shared helpers module that the existing integration script and the new selector runner both import, without changing the legacy script's runtime behaviour. The reason: ticket 06 needs to spin the same stack up and tear it down, and copy-pasting would re-introduce the zombie `next dev` problem the legacy script already learned to avoid.

**Blocked by:** None (can start immediately; safe independent refactor).

**Status:** resolved

- [ ] Helpers (db start/stop, server start/stop, port-free assert, wait-for-server) extracted into an importable module (e.g. `scripts/test-env.mjs`) without changing public behaviour.
- [ ] Running `node scripts/test-integration.mjs` is observably equivalent before and after the refactor (same env vars, same DB lifecycle, same Windows kill-tree teardown, same 3100 / 51214 / 51215 ports).
- [ ] The Windows kill-tree teardown that prevents the zombie `next dev` grandchild on port 3100 is preserved verbatim — no regressions to the regression test for the zombie-server bug.
- [ ] No change to `package.json` scripts in this ticket; that happens in ticket 07.
- [ ] Reads as a pure refactor: one reviewable diff, no new features, no signature changes that affect callers other than the new helper consumer (ticket 06).
