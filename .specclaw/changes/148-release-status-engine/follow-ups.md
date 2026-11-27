# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/delivery/server/release-tracking.ts:100` `serves()` writes a second copy of the rule that maps an environment to the category it completes. It decides with JS `String(e.name).toLowerCase() === c` and `is_prod`, while `categoryEnv()` (line 20) decides in SQL with `lower(name) = category` and `is_prod`. The strand guard and the completion lookup are the same rule, so build both from one source: have `strandsReleases` check `categoryEnv` for each category before and after the change, or derive `categoryEnv`'s matching from `serves`. (round 1) <!-- fp:265660f7eb4a class:other -->
- [minor B12] `modules/delivery/module.ts:122` `delivery.release-off-track` fires on every change to `overdue`, including `create` and `update`. It has no `except`, and the `ReleaseStatusChanged` payload has no `by`, so a PM who sets a target that has already passed gets an urgent "is now Off track" notice about their own write. The other owner rules skip the actor's own action with `except: "by"`. Add `by` to the payload and `except: "by"` to the rule. (round 1) <!-- fp:68f2f997deee class:other -->
