# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/delivery/server/push.ts:97` This change moves the self-sync's skip rule into `skipReason()` (shared number first, then an unreadable state.json) and describes it as 'the sync's own rule'. The push path (`pushSpecclaw` in push.ts) still has its own copy of that rule: the dupe check at line 97 and the `r.unreadable` check at line 103. The two copies behave the same today, but nothing makes them stay that way. If someone changes `skipReason`, for example by adding a skip condition, the push path won't get the change, and `onBoard()` will then describe only the self-sync. Fix: have push.ts derive its skip from `skipReason` too, keeping its own codes. Or limit the `onBoard` docstring to the self-sync. No scenario where the two give different results exists yet, so this is minor. (round 2) <!-- fp:95b0989cd74d -->
