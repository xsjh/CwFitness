# 09: Complete Session adjustments and Added Exercise

**What to build:** While performing a Workout Session, a User can adapt the exercise order and scope to the real workout, and may preserve an extra Exercise in the future Workout Day.

**Blocked by:** 03 (Establish server-authoritative multi-device editing), 04 (Persist a complete offline Workout Session), 06 (Provide progress views and Home overview)

**Status:** resolved

- [x] A User can reorder Session Exercises without changing the Workout Day.
- [x] A User can skip an entire Session Exercise so all of its target sets count as zero without adding it to the Removed Exercise count.
- [x] Removing an entire Session Exercise excludes it from that Session's Exercise Achievement Rate without altering the Workout Day.
- [x] Added Exercise requires complete targets before insertion, and its targets remain locked after insertion.
- [x] When adding an Exercise, the User can choose to save it to the current Workout Day; the default is on, while the current Session always retains the Added Exercise snapshot.
- [x] An Added Exercise contributes to historical trends immediately.
- [x] An Added Exercise begins contributing to Progression Suggestions only after it exists as a Planned Exercise in the Workout Plan.
- [x] Session reordering, skipping, removal, and saving are replay-safe through offline synchronization.
- [x] Automated tests cover all adjustment actions, plan isolation, historical contribution, and progression eligibility.

## Comments

**2026-09-11 — verification run (`npm test`)**

Backed by `tests/plans-api.test.mjs`: session reordering + idempotent replay
("Session Exercise order can be changed and replayed idempotently"), removal and
incomplete-target rejection plus Added Exercise recording
("User records sets and receives per-Exercise achievement without removed Exercises"),
plan isolation, and progression eligibility gated on Planned Exercise membership.

Two paths are implemented but not directly asserted by an automated test:
the whole-Exercise skip route (`/api/workout-sessions/[sessionId]/exercises/[sessionExerciseId]/skip`)
and `saveToWorkoutDay: false`. They are covered indirectly through completion-skip and default-save flows.
