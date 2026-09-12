# 07: Selector runner — `full` path + package scripts

**What to build:** The `full` selector command (the same `scripts/test-integration.mjs` behaviour, but driven through the selector with timing) and the `package.json` entries that wire `test` to the fast path and `test:full` to the full path, per ADR-0004. Back-compat: keep `npm run test:integration` as an alias for any external caller that depends on it today.

**Blocked by:** 06 (Selector runner — fast path).

**Status:** resolved

- [ ] `node scripts/test-selector.mjs full` runs the complete integration path: vitest unit layer, full HTTP suite (`tests/plans-api.test.mjs`), all three Playwright projects (chromium + the `@cross-browser` slice on firefox and webkit), with the same per-phase timing instrumentation as the fast path.
- [ ] `package.json` redefines `test` to invoke `vitest run` then `node scripts/test-selector.mjs fast`.
- [ ] `package.json` adds `test:full` invoking `vitest run` then `node scripts/test-selector.mjs full`.
- [ ] `package.json` keeps `test:integration` (and `test:unit`, `test:coverage`) as aliases of their existing commands so any caller outside the repo still works.
- [ ] A budget warning prints when total exceeds 10 minutes (fast) or 25 minutes (full), naming the slowest phase from the timing output. NOT a hard gate — gates come after two consecutive weeks of stability.
- [ ] End-to-end verification, locally: `npm test` finishes well under the 10-minute budget on an empty-diff run; `npm run test:full` finishes well under 25 minutes; both leave the system clean (no zombie processes).
