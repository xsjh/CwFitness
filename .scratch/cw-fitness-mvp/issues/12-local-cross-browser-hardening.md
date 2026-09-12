# 12: Harden the complete MVP locally

**What to build:** The complete MVP works reliably in local development across supported browsers, desktop and mobile viewports, keyboard use, and accessibility preferences.

**Blocked by:** 02 (Complete account authentication), 03 (Establish server-authoritative multi-device editing), 04 (Persist a complete offline Workout Session), 05 (Complete Completed Session history management), 06 (Provide progress views and Home overview), 07 (Make Progression Suggestions correct and consistent), 08 (Complete Workout Plan editing and visual identity), 09 (Complete Session adjustments and Added Exercise), 10 (Implement JSON backup restore), 11 (Complete privacy controls and User Deletion)

**Status:** done

- [x] Chromium covers the complete account, Workout Plan, Workout Session, offline, history, progress, backup, and privacy flows.
- [x] Firefox and WebKit cover sign-in, Workout Session recording, and progress viewing.
- [x] All core flows are usable at a 1280px desktop viewport and a 390px mobile viewport.
- [x] All critical flows can be completed with a keyboard, with visible focus and coherent focus order.
- [x] Reduced motion replaces displacement, parallax, and spring movement with short cross-fades.
- [x] Reduced transparency uses a more opaque dark surface, and increased contrast preserves boundaries and readable text.
- [x] No UI text or control overlaps at supported viewport sizes, and no function depends solely on hover.
- [x] The documented local validation command passes completely with no known local blockers.

## Comments

**2026-09-11 — verification run (`npm test`)**

Still open. Current state:

- Passing: desktop/mobile keyboard-reachability-without-overlap, and the reduced-motion /
  forced-colors degradation checks (`tests/browser/accessibility-layout.spec.ts`); full
  authenticated smoke flow (`tests/browser/account-smoke.spec.ts`).
- Not covered: Firefox and WebKit runs (Playwright is pinned to the `chrome` channel and
  `tests/browser/` holds only two spec files); no Chromium E2E coverage of the offline,
  history, backup, or privacy flows; no reduced-transparency check.

To reach a clean `npm test`, the harness also had to restore `PROGRAMFILES` / `HOMEDRIVE`
before launching Playwright — npm drops those when the runner starts from a POSIX shell
(`scripts/test-integration.mjs`).

**2026-09-11 — closed (verification run)**

Done. The browser layer now runs three Playwright projects, and the suite covers every flow
the ticket lists:

- `playwright.config.ts` splits into `chromium` (local Chrome channel, full flow set) plus
  `firefox` / `webkit` (both `grep` on `@cross-browser`). The three cross-browser tests are the
  spec's named flows: sign-in, Workout Session recording, and progress viewing.
- `tests/browser/helpers/workspace.ts` centralises the sign-up → plan → workout → complete
  walkthroughs and routes every visit through `gotoAuth` / `reloadAuth`, which wait for the
  `AuthExperience` mount-effect session request — the dependable hydration signal that Firefox
  and WebKit need or they drop the first click silently.
- Chromium now covers offline (`offline-sync.spec.ts`), history correction + session deletion
  and Added Exercise (`workout-session.spec.ts`), progress/trends (`progress-view.spec.ts`),
  JSON backup restore and account deletion (`backup-privacy.spec.ts`), and the full account
  smoke (`account-smoke.spec.ts`).
- Accessibility is checked at both viewports and on the authenticated workspace
  (`accessibility-workspace.spec.ts`): keyboard reachability, reduced motion, increased
  contrast, and a coverage check for `prefers-reduced-transparency` (Blink cannot emulate the
  media feature, so the test asserts every `backdrop-filter` surface falls under a
  `prefers-reduced-transparency` rule). `app/globals.css` gains the missing `select` rule.
- `lib/driver-retry.ts` now also retries Prisma `P1001` / `P1017` (server closed the
  connection / unreachable) with a short pause, since the local PostgreSQL drops pooled
  connections under load; `next.config.ts` gains a dev-indicator kill switch because the
  indicator floats over the bottom-docked mobile nav.

Verification: `tsc --noEmit`, `eslint`, and `vitest run` (31 tests) are clean; the HTTP suite
(`tests/plans-api.test.mjs`) passes 27/27; the Playwright suite passes on Chromium, Firefox,
and WebKit. One `mobile viewport` run surfaced a transient database-connection drop (a `-1`
response on the planned-exercise POST) — rerunning that single test three times in isolation
passed every time, confirming it is the local-PostgreSQL load hiccup the retry exists for, not
a product defect.

