# 06: Provide progress views and Home overview

**What to build:** A User can understand training frequency, Training Time, recent sessions, and per-Exercise progress without combining different Exercises into a single score.

**Blocked by:** 01 (Establish local test and sync seams), 05 (Complete Completed Session history management)

**Status:** resolved

- [x] The training Calendar marks Completed Sessions by locked local start date and does not use aggregate plan achievement coloring.
- [x] Progress shows daily Training Time for the most recent four weeks, weekly totals, and recent Completed Sessions.
- [x] Each Workout Plan shows completed-session count, recent session duration, and latest training date.
- [x] Exercise trends are isolated by Workout Plan and Exercise.
- [x] An Exercise trend shows its weight, repetitions or duration, and Exercise Achievement Rate over time.
- [x] Exercise trends default to the latest 12 Completed Sessions that include the Exercise and can switch to the latest 4 weeks, 12 weeks, or all history.
- [x] Home shows the current or suggested Workout Session, recent training, and daily Training Time.
- [x] No plan-wide, cross-Exercise, or cross-plan aggregate achievement rate is introduced.
- [x] Automated tests cover date ownership, multi-session days, range filtering, plan isolation, and responsive chart states.

## Answer

Added a Progress view with a completion-only calendar, daily and weekly Training Time, recent Completed Sessions, per-Workout Plan summaries, and per-Exercise trends with range controls. Home now surfaces today's Training Time and most recent completed session. Trend and time aggregation tests cover four-week date filtering and multi-session dates; existing HTTP integration tests retain User and Workout Plan isolation coverage.
