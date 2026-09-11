# 11: Complete privacy controls and User Deletion

**What to build:** A User can control minimal telemetry and permanently delete their account with clear consequences and complete data removal.

**Blocked by:** 10 (Implement JSON backup restore)

**Status:** resolved

- [x] Telemetry defaults to page visits, feature-operation categories, synchronization failures, and sanitized errors only.
- [x] Telemetry never contains Workout Plan names, Exercise names, weights, repetitions, durations, training dates, or notes.
- [x] Settings provide a telemetry preference, and disabling it stops new telemetry collection from the client.
- [x] Before User Deletion, the User is prompted to export a backup and sees the affected plan, Exercise, Session, and record counts.
- [x] User Deletion requires a separate explicit confirmation and cannot be completed accidentally.
- [x] A successful deletion removes Workout Plans, Exercises, Workout Sessions, settings, drafts, and telemetry identifiers, and revokes all account Sessions.
- [x] Automated tests cover telemetry redaction and opt-out, deletion cancellation, deletion confirmation, cascade scope, and Session revocation.

## Comments

**2026-09-11 — verification run (`npm test`)**

Covered by "A User controls sanitized telemetry and explicitly deletes every owned record" plus
"Archived plans cannot start workouts and account deletion requires confirmation" in
`tests/plans-api.test.mjs`: telemetry redaction of training data, opt-out halting new collection,
the `GET /api/account` impact summary, unconfirmed deletion returning 400, cascade scope, and
Session revocation returning 401 after `DELETE /api/account`.
