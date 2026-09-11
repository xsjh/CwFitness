# 09: Complete Session adjustments and Added Exercise

**What to build:** While performing a Workout Session, a User can adapt the exercise order and scope to the real workout, and may preserve an extra Exercise in the future Workout Day.

**Blocked by:** 03 (Establish server-authoritative multi-device editing), 04 (Persist a complete offline Workout Session), 06 (Provide progress views and Home overview)

**Status:** resolved

- [ ] A User can reorder Session Exercises without changing the Workout Day.
- [ ] A User can skip an entire Session Exercise so all of its target sets count as zero without adding it to the Removed Exercise count.
- [ ] Removing an entire Session Exercise excludes it from that Session's Exercise Achievement Rate without altering the Workout Day.
- [ ] Added Exercise requires complete targets before insertion, and its targets remain locked after insertion.
- [ ] When adding an Exercise, the User can choose to save it to the current Workout Day; the default is on, while the current Session always retains the Added Exercise snapshot.
- [ ] An Added Exercise contributes to historical trends immediately.
- [ ] An Added Exercise begins contributing to Progression Suggestions only after it exists as a Planned Exercise in the Workout Plan.
- [ ] Session reordering, skipping, removal, and saving are replay-safe through offline synchronization.
- [ ] Automated tests cover all adjustment actions, plan isolation, historical contribution, and progression eligibility.
