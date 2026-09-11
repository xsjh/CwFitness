# 08: Complete Workout Plan editing and visual identity

**What to build:** A User can arrange a Workout Plan in the intended order and give it a distinct visual identity that is used consistently across plan selection, plan detail, and Home.

**Blocked by:** 03 (Establish server-authoritative multi-device editing)

**Status:** resolved

- [x] A User can reorder Workout Days within a Workout Plan.
- [x] A User can reorder Planned Exercises within a Workout Day.
- [x] Ordering changes are versioned, persist after refresh, and affect only future Workout Sessions.
- [x] Historical In-progress and Completed Sessions retain their original exercise order.
- [x] A Workout Plan can store a low-saturation accent color and a predefined `coverKey`.
- [x] The accent and cover are visible on plan selection, Workout Plan detail, and Home without runtime-hotlinked media.
- [x] The visual treatment supports reduced motion, reduced transparency, and high contrast without hiding content.
- [ ] Automated tests cover ordering, snapshot isolation, visual metadata validation, and responsive display.

## Comments

**2026-09-11 — verification run (`npm test`)**

Behavior boxes above are backed by the passing suite: Workout Day ordering/versioning
(`tests/plans-api.test.mjs` → "Workout Day ordering is versioned and persists through plan reads"),
Session snapshot isolation ("Session Exercise order can be changed and replayed idempotently"),
and reduced motion / forced colors display (`tests/browser/accessibility-layout.spec.ts`).

The last box stays open. Ordering, snapshot isolation, and responsive display are automated, but:

- Planned Exercise reordering (`PUT /api/plans/[planId]/days/[dayId]/exercises/order`) has no automated test.
- Visual metadata validation (`accent` / `coverKey` allowlists in `app/api/plans/[planId]/route.ts`) has no automated test.

Close this box once those two paths have coverage.
