# lib/weights.ts unit tests — 2026-09-11

**Command:** `npx vitest run --coverage`
**Result:** 23 passed, 0 failed (7 files)

| Target | Cases | Passed | Failed |
| --- | --- | --- | --- |
| `lib/weights.ts` | 9 | 9 | 0 |

## Covered

- A Weight Unit of kilograms converts to grams at 1 000 g/kg.
- A Weight Unit of pounds converts using the international pound (453.59237 g), rounded to the nearest whole gram.
- Weight values that are zero, negative, non-finite, or not numbers are rejected rather than converted, so bad client input cannot become a stored weight.
- An unknown Weight Unit is rejected.
- `weightFromGrams` restores a stored weight to the unit it was entered in: exactly for kilograms, and within one gram for pounds, which is what "switching units converts displayed values without changing their meaning" requires.

## Not covered

- The API layer that validates and stores a Weight Unit — exercised by the HTTP integration suite against a live server, not by a unit test.
- Switching the display unit across an existing plan's values — a whole-flow behavior owned by the component and integration layers.
- Sub-gram precision is deliberately not pinned; the domain stores whole grams, so any finer expectation would over-specify.

## Coverage

| File | Lines | Branches | Functions | Statements |
| --- | --- | --- | --- | --- |
| `lib/weights.ts` | 100% | 100% | 100% | 100% |

Whole-project unit coverage after this run: 15.67% lines across `lib/` and `app/` (the HTTP integration suite covers `app/api/` and is invisible to this number).
