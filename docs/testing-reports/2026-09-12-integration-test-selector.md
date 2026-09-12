# Integration test selector

- `node node_modules/vitest/vitest.mjs run`: passed, 9 files and 36 tests.
- `npm.cmd run typecheck`: passed.
- `node scripts/test-selector.mjs fast --force-full`: returned the expected full-selection exit code (2).
- `node scripts/test-selector.mjs full`: passed. Full HTTP coverage, 24 Chromium tests, 3 Firefox tests, and 3 WebKit tests completed; total selector time was 260,310 ms when exercising the Prisma shutdown race.
- Prisma's local `dev` command can retain its state lock for about 30 seconds after shutdown. `startDatabase` retries up to three times in that bounded window; the fourth start succeeded in the reproduction loop.
