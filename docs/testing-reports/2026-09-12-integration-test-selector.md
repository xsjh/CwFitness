# Integration test selector

- `node node_modules/vitest/vitest.mjs run`: passed, 9 files and 36 tests.
- `npm.cmd run typecheck`: passed.
- `node scripts/test-selector.mjs fast --force-full`: returned the expected full-selection exit code (2).
- Full selector verification was attempted twice. Prisma's local `dev` subcommand could not start because its dynamic CLI cache requires registry access and then reported an existing cache lock. No application, HTTP, or Playwright phase ran; retry after clearing the Prisma temporary CLI lock in the local developer environment.
