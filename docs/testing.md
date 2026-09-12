# Local testing

Run the daily fast verification with:

```powershell
npm.cmd test
```

`npm.cmd test` runs Vitest, the HTTP health smoke suite, and browser specs selected from the changed paths. The selector always includes the `health-smoke` and `browser-core` baseline groups. It reports `[selector] phase=<name> duration_ms=<ms>` for every stage and a final total; 10 minutes is currently a warning budget, not a gate.

Run the complete local regression with:

```powershell
npm.cmd run test:full
```

This runs Vitest, the complete HTTP integration suite, and Chromium, Firefox, and WebKit. Its 25-minute budget is also a warning, not a gate. The integration runner uses a dedicated `cwfitness-test` Prisma local database on isolated ports. It starts that database, applies pending migrations, and stops the server after the run.

`tests/selectors/path-groups.json` is the review surface for what the fast command selects. Add a source trigger and its browser spec to the same group's `match` array; see `tests/selectors/path-groups.schema.md` for the minimal schema. Changes to tests, scripts, test configuration, Prisma, package metadata, Next configuration, CI, or environment files intentionally escalate to a full run.

The runner refuses to start when `http://127.0.0.1:3100` is already serving a Next.js instance, and it kills the whole `next dev` process tree when it finishes. A leftover dev server would otherwise silently receive the test traffic, which shows up as unrelated failures such as missing password-reset emails.

Individual layers can be run with `npm.cmd run test:unit` or `npm.cmd run test:integration`; the latter remains the legacy full integration entry point for external callers.

`npm.cmd run test:coverage` runs the unit layer with V8 coverage over `lib/` and `app/`. Coverage counts only what vitest executes; the HTTP integration runner exercises `app/api/` against a live server and is invisible to it.

Reports written by the `unit-test` skill are archived in `docs/testing-reports/<YYYY-MM-DD>-<topic>.md`; use this location when recording budget observations or test investigations.

The browser layer runs three Playwright projects. `chromium` drives the locally installed Chrome channel and covers the complete flow set: account, Workout Plan, Workout Session, offline recording, history, progress, backup, and privacy. `firefox` and `webkit` only run the tests tagged `@cross-browser`, which are the flows the MVP spec requires on every engine: sign-in, Workout Session recording, and progress viewing. Install those two engines once with:

```powershell
npx playwright install firefox webkit
```

Set `PLAYWRIGHT_CHANNEL` to another installed channel, such as `edge`, to move the `chromium` project off Chrome. The channel does not apply to the other two projects.

The runner starts the dev server with `CWFITNESS_DEV_INDICATOR=off`. The Next.js development indicator renders in a portal at the bottom-left corner, and the authenticated workspace docks its navigation to the bottom of the viewport on small screens, so the indicator sits on top of the "今日" control and swallows the click. Ordinary `next dev` keeps the indicator.

Firefox and WebKit hydrate the auth screen late enough that a click issued as soon as the form is visible lands on a button whose React handler is not attached yet, and the click is dropped without an error. `tests/browser/helpers/workspace.ts` therefore routes every visit through `gotoAuth` / `reloadAuth`, which wait for the session request that `AuthExperience` issues from its mount effect. That request is the hydration signal; without it the failure surfaces much later as a `fill` or `click` timeout on an unrelated element.

`prefers-reduced-transparency` cannot be verified by emulation: Blink does not implement the media feature and Playwright has no option for it. `tests/browser/accessibility-workspace.spec.ts` checks the degradation by coverage instead — every surface that renders a `backdrop-filter` must fall under a `prefers-reduced-transparency` rule. `prefers-contrast` and `prefers-reduced-motion` are emulated normally.

In local development, verification and password-reset emails are appended as JSON lines to `LOCAL_EMAIL_OUTBOX`, which defaults to `.local-mail/outbox.jsonl`. Tests set this to a temporary file so they can open the real verification and reset links without contacting an email provider.
