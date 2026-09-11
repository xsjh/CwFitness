# Local testing

Run the complete local verification with:

```powershell
npm.cmd test
```

The command runs domain unit tests, component tests, IndexedDB state tests, HTTP integration tests, and a Chrome browser smoke test. The integration runner uses a dedicated `cwfitness-test` Prisma local database on isolated ports. It starts that database, applies pending migrations, and stops the server after the run.

Individual layers can be run with `npm.cmd run test:unit` or `npm.cmd run test:integration`.

`npm.cmd run test:coverage` runs the unit layer with V8 coverage over `lib/` and `app/`. Coverage counts only what vitest executes; the HTTP integration runner exercises `app/api/` against a live server and is invisible to it.

Reports written by the `unit-test` skill are archived in `docs/testing-reports/`.

Playwright uses the locally installed Chrome channel by default. Set `PLAYWRIGHT_CHANNEL` to another installed channel, such as `edge`, when needed.

In local development, verification and password-reset emails are appended as JSON lines to `LOCAL_EMAIL_OUTBOX`, which defaults to `.local-mail/outbox.jsonl`. Tests set this to a temporary file so they can open the real verification and reset links without contacting an email provider.
