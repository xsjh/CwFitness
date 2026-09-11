# 08: Complete Workout Plan editing and visual identity

**What to build:** A User can arrange a Workout Plan in the intended order and give it a distinct visual identity that is used consistently across plan selection, plan detail, and Home.

**Blocked by:** 03 (Establish server-authoritative multi-device editing)

**Status:** resolved

- [ ] A User can reorder Workout Days within a Workout Plan.
- [ ] A User can reorder Planned Exercises within a Workout Day.
- [ ] Ordering changes are versioned, persist after refresh, and affect only future Workout Sessions.
- [ ] Historical In-progress and Completed Sessions retain their original exercise order.
- [ ] A Workout Plan can store a low-saturation accent color and a predefined `coverKey`.
- [ ] The accent and cover are visible on plan selection, Workout Plan detail, and Home without runtime-hotlinked media.
- [ ] The visual treatment supports reduced motion, reduced transparency, and high contrast without hiding content.
- [ ] Automated tests cover ordering, snapshot isolation, visual metadata validation, and responsive display.
