---
name: unit-test
description: Write and run unit tests against existing code, then produce a test report. Use when the user asks to add unit tests to a file, module, or feature, raise unit test coverage, run the unit tests, or produce a test report (补单测 / 加测试 / 提覆盖率 / 跑单测 / 测试报告). For test-first work on behavior that does not exist yet, use the `tdd` skill instead.
---

# Unit testing existing code

The loop is: pick a target → agree the seam → write tests → drive them green → report. Every run ends with a report file, including runs where the target already had tests.

Read `CONTEXT.md` first. Test names and fixture values must use the project's domain vocabulary — Workout Session, Exercise Achievement Rate, Skipped Set — so a test reads like a line from the spec rather than like the source file.

## Steps

1. **Pick the target.** A file, module, or behavior the user named is the target. When they named nothing, take the highest-value uncovered surface in this order: pure domain logic in `lib/`, route handlers in `app/api/`, client state and components in `app/`.
   _Done when_ the target is one named file plus the behaviors under test, written down.

2. **Agree the seam.** A seam is the public boundary the test observes: an exported function's return value, a handler's HTTP response, a component's rendered behavior. List the seams and the cases per seam before writing any test. Confirm the list with the user when you picked the target yourself; when they named it, go straight through.
   _Done when_ every test you are about to write maps to a seam on that list.

3. **Write the tests.** One file per target at `tests/<topic>.test.ts` (`.tsx` when it renders) — that matches the vitest include globs. Use `describe` per exported unit and `it` naming the behavior, not the function name. Every expected value comes from an independent source: a literal, a spec example, a value worked out by hand.
   _Done when_ the `describe`/`it` names read as specifications and no expectation recomputes what the implementation computes.

4. **Drive them green.** Run the unit layer with `npx vitest run`; while iterating on one file, `npx vitest run tests/<topic>.test.ts` is the tight loop. A red test is either a defect or a wrong expectation — say which one it is out loud before changing anything, and never hand off a red run.
   _Done when_ the unit layer exits 0.

5. **Report.** Run `npx vitest run --coverage`, then write the report to `docs/testing-reports/<YYYY-MM-DD>-<topic>.md` using the format below, and give the same table in your reply. Coverage counts only what vitest executes: `app/api/` is largely exercised by the HTTP integration suite against a live server, so read its number as a floor rather than a verdict.
   _Done when_ the report file exists and its numbers match the run you just did.

## Report format

```markdown
# <Topic> unit tests — <YYYY-MM-DD>

**Command:** `npx vitest run`
**Result:** <n> passed, <n> failed

| Target | Cases | Passed | Failed |
| --- | --- | --- | --- |
| `lib/<file>.ts` | 5 | 5 | 0 |

## Covered

- <behavior, stated in domain terms>

## Not covered

- <behavior> — <why a unit test cannot pin it>

## Coverage

| File | Lines | Branches |
| --- | --- | --- |
| `lib/<file>.ts` | 92% | 80% |
```

## Where tests live

- `tests/<topic>.test.ts(x)` — this skill's output.
- `tests/browser/` — Playwright specs, out of scope here.
- `tests/helpers/` — shared fixtures and fakes.

## Test quality

The bar lives in the `tdd` skill: read behavior through public interfaces, keep expected values independent of the code under test, mock at the boundary rather than inside it. The `tdd` skill owns the full reference — consult it instead of restating it here.

## Environment notes

- `npm run <script>` exits 1 with no output from the agent's Bash tool on this machine; `npx vitest run` works. The npm script names in `package.json` (`test:unit`, `test:coverage`) are the human-facing equivalents and are what `docs/testing.md` documents.
