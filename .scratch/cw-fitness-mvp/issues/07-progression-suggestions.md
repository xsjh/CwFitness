# 07: Make Progression Suggestions correct and consistent

**What to build:** A User sees a trustworthy Progression Suggestion when the same Planned Exercise has genuinely repeated success, and the suggestion appears consistently wherever that Exercise is reviewed.

**Blocked by:** 06 (Provide progress views and Home overview)

**Status:** resolved

- [x] A suggestion appears only when the same Planned Exercise in one Workout Plan reaches 100% in three consecutive Completed Sessions with identical targets.
- [x] At least two of those three sessions must include Exercise Excess.
- [x] A change to weight, set count, repetitions, or duration resets the consecutive streak, including when the target later changes back.
- [x] Weighted repetitions suggest adding weight; Bodyweight repetitions suggest adding repetitions.
- [x] Bodyweight duration suggests adding duration; Weighted duration suggests adding weight or duration.
- [x] The suggestion appears consistently in Home, Workout Plan detail, and the Exercise trend.
- [x] The suggestion remains until the corresponding Planned Exercise target changes and has no apply, dismiss, notification, or automatic plan-change action.
- [x] Automated tests cover all four Exercise Type combinations, two-of-three excess, target reset, persistence, and display surfaces.

## Answer

Session snapshots now retain their source Planned Exercise identity. Progression Suggestions inspect only the latest three Completed Sessions for that identity, require matching current targets, 100% Exercise Achievement Rate, and Exercise Excess in at least two sessions. The HTTP suite verifies target-reset behavior and all four resistance/target combinations; suggestions are informational and are rendered in Home, Workout Plan detail, and the Exercise trend.
