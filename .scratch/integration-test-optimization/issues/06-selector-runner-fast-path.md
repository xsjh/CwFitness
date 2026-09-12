# 06: Selector runner — `fast` path

**What to build:** A CLI entry point on the selector module that drives the fast path end-to-end: resolves groups, runs vitest, brings up the test stack using the ticket-05 helpers, runs the HTTP smoke subset, runs Playwright with a `--grep` derived from the selected groups' spec-file matches, then tears down. Emits the `[selector] phase=... duration_ms=...` lines on stdout for every phase. This is the workhorse of daily development — landing this ticket makes `npm test` (after ticket 07) actually fast.

**Blocked by:** 03 (Selector resolver tests), 04 (Health-smoke HTTP subset), 05 (Refactor `scripts/test-integration.mjs` helpers).

**Status:** resolved

- [ ] `node scripts/test-selector.mjs fast` runs to completion against a clean workspace (no leftover dev server, no leftover DB process).
- [ ] Each phase (db-start, migrate, server-boot, vitest, http-smoke, browser-chromium, browser-firefox, browser-webkit, teardown) emits a `[selector] phase=<name> duration_ms=<ms>` line plus a final `[selector] total duration_ms=<ms> selected_groups=[...]` line on stdout.
- [ ] When run on a `git diff` that hits any `escalate-full` path, the runner prints `mode=full reason=escalate:<pattern>` and exits non-zero immediately; ticket 07 wires it to actually run the full path.
- [ ] When run with `--force-full`, same behavior as the `escalate-full` hit.
- [ ] Re-running is safe: no zombie `next dev` process left on 3100, no leaked Postgres test container, no stray `--test` Node processes.
- [ ] A header comment block in `scripts/test-selector.mjs` documents the env vars it consumes (`TEST_BASE`, `PLAYWRIGHT_CHANNEL`, plus the existing integration-script vars it inherits) and the exit codes.
- [ ] Manual end-to-end check: edit one file in `app/api/plans/**`, run the runner, observe only plans-related specs and `health-smoke` execute and a `selected_groups=[plans, health-smoke, browser-core]`-style line at the end.
