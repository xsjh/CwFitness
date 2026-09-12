# 03: Selector resolver tests

**What to build:** Automated coverage for the resolver module so future edits to selection logic cannot silently widen selection (miss escalation) or silently narrow it (skip a group) without failing the unit layer.

**Blocked by:** 02 (Selector resolver module).

**Status:** resolved

- [ ] Test file (vitest unit or `node --test`) lives at `tests/test-selector.test.ts` or `tests/test-selector.test.mjs`, matching the project's existing test convention.
- [ ] Covers all five spec cases as named tests: fixed-fixture selection, `escalate-full` hit, empty changes, corrupted manifest, `--force-full`.
- [ ] Each test constructs an in-memory manifest fixture (no temp files, no real filesystem) so the resolver is exercised in isolation.
- [ ] Tests run via the project's existing unit entry point (`npx vitest run`) and pass without flake.
- [ ] Failing assertion message names the input shape and the expected `mode`/`reason` so a future regression is debuggable from the test name alone.

## Answer

Added the five specified in-memory resolver cases to the Vitest unit layer.
