# 08: Docs update for the new test commands

**What to build:** Documentation updates so a new contributor (or future me) knows which command runs what, where the path-group manifest lives, where the per-phase timings surface, and how to extend the selection when adding a new group. After this lands, `npm test` and `npm run test:full` are documented in the same place as today, and the manifest is discoverable from the contributor entry points.

**Blocked by:** 07 (Selector runner — full path + package scripts).

**Status:** resolved

- [ ] `docs/testing.md` (or the equivalent contributor doc) updated to describe the new `npm test` (fast) and `npm run test:full` (full) semantics, the location of the path-group manifest, the per-phase `[selector] phase=... duration_ms=...` output, and the 10/25-minute budgets as warnings (not gates).
- [ ] `AGENTS.md` mentions the manifest as the review surface for "what does `npm test` actually run for me?" and notes that the budgets are warnings today.
- [ ] The manifest file itself (or its sibling doc) carries a schema comment showing the minimum shape, so a future contributor can add a group by editing one file.
- [ ] Existing test-report guidance (`docs/testing-reports/<YYYY-MM-DD>-<topic>.md`) is referenced from the new section so the budget-watch and report-writing workflows tie together.
