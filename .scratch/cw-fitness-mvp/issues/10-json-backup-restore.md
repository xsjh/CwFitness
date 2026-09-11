# 10: Implement JSON backup restore

**What to build:** A User can export a complete versioned backup of their CwFitness data and later restore it as an account-wide replacement without risking a partial import.

**Blocked by:** 03 (Establish server-authoritative multi-device editing), 05 (Complete Completed Session history management), 08 (Complete Workout Plan editing and visual identity), 09 (Complete Session adjustments and Added Exercise)

**Status:** resolved

- [x] Export contains every Workout Plan, Workout Day, Planned Exercise, Exercise, Workout Session, set result, setting, and stable identifier owned by the User.
- [x] Export includes `schemaVersion` and `exportedAt`, but excludes passwords, Session cookies, telemetry events, and media payloads.
- [x] Import validates schema version, structure, references, ownership, and numeric constraints before changing data.
- [x] Import shows a summary of data that will be replaced and requires explicit confirmation.
- [x] Import replaces the User's data in one database transaction; any failure leaves the previous data unchanged.
- [x] A successful import invalidates stale caches and causes other devices to reload the restored state.
- [x] Automated tests cover round-trip fidelity, malformed versions, broken references, failed transactions, and cache invalidation.

## Comments

**2026-09-11 — verification run (`npm test`)**

Covered end to end by "A User previews and restores a complete versioned JSON backup without
partial imports" in `tests/plans-api.test.mjs`: round-trip fidelity, `schemaVersion`/`exportedAt`,
password exclusion, preview summary, malformed version rejection, broken-reference rejection with
existing data untouched, and the `dataVersion` bump that makes other devices reload.
