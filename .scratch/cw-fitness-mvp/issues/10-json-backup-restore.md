# 10: Implement JSON backup restore

**What to build:** A User can export a complete versioned backup of their CwFitness data and later restore it as an account-wide replacement without risking a partial import.

**Blocked by:** 03 (Establish server-authoritative multi-device editing), 05 (Complete Completed Session history management), 08 (Complete Workout Plan editing and visual identity), 09 (Complete Session adjustments and Added Exercise)

**Status:** resolved

- [ ] Export contains every Workout Plan, Workout Day, Planned Exercise, Exercise, Workout Session, set result, setting, and stable identifier owned by the User.
- [ ] Export includes `schemaVersion` and `exportedAt`, but excludes passwords, Session cookies, telemetry events, and media payloads.
- [ ] Import validates schema version, structure, references, ownership, and numeric constraints before changing data.
- [ ] Import shows a summary of data that will be replaced and requires explicit confirmation.
- [ ] Import replaces the User's data in one database transaction; any failure leaves the previous data unchanged.
- [ ] A successful import invalidates stale caches and causes other devices to reload the restored state.
- [ ] Automated tests cover round-trip fidelity, malformed versions, broken references, failed transactions, and cache invalidation.
