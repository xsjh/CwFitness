# 12: Harden the complete MVP locally

**What to build:** The complete MVP works reliably in local development across supported browsers, desktop and mobile viewports, keyboard use, and accessibility preferences.

**Blocked by:** 02 (Complete account authentication), 03 (Establish server-authoritative multi-device editing), 04 (Persist a complete offline Workout Session), 05 (Complete Completed Session history management), 06 (Provide progress views and Home overview), 07 (Make Progression Suggestions correct and consistent), 08 (Complete Workout Plan editing and visual identity), 09 (Complete Session adjustments and Added Exercise), 10 (Implement JSON backup restore), 11 (Complete privacy controls and User Deletion)

**Status:** ready-for-agent

- [ ] Chromium covers the complete account, Workout Plan, Workout Session, offline, history, progress, backup, and privacy flows.
- [ ] Firefox and WebKit cover sign-in, Workout Session recording, and progress viewing.
- [ ] All core flows are usable at a 1280px desktop viewport and a 390px mobile viewport.
- [ ] All critical flows can be completed with a keyboard, with visible focus and coherent focus order.
- [ ] Reduced motion replaces displacement, parallax, and spring movement with short cross-fades.
- [ ] Reduced transparency uses a more opaque dark surface, and increased contrast preserves boundaries and readable text.
- [ ] No UI text or control overlaps at supported viewport sizes, and no function depends solely on hover.
- [ ] The documented local validation command passes completely with no known local blockers.

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

