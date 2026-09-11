# 11: Complete privacy controls and User Deletion

**What to build:** A User can control minimal telemetry and permanently delete their account with clear consequences and complete data removal.

**Blocked by:** 10 (Implement JSON backup restore)

**Status:** resolved

- [ ] Telemetry defaults to page visits, feature-operation categories, synchronization failures, and sanitized errors only.
- [ ] Telemetry never contains Workout Plan names, Exercise names, weights, repetitions, durations, training dates, or notes.
- [ ] Settings provide a telemetry preference, and disabling it stops new telemetry collection from the client.
- [ ] Before User Deletion, the User is prompted to export a backup and sees the affected plan, Exercise, Session, and record counts.
- [ ] User Deletion requires a separate explicit confirmation and cannot be completed accidentally.
- [ ] A successful deletion removes Workout Plans, Exercises, Workout Sessions, settings, drafts, and telemetry identifiers, and revokes all account Sessions.
- [ ] Automated tests cover telemetry redaction and opt-out, deletion cancellation, deletion confirmation, cascade scope, and Session revocation.
